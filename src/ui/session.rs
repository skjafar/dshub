use crate::{
    commands,
    model::*,
    poll,
    runtime::{AppHandle, Event},
    types::*,
};
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

#[derive(Debug, Clone)]
pub enum Action {
    Scan,
    /// Address, port, UDP.
    Connect(String, u16, bool),
    /// Address, port, UDP, attempts, delay between attempts (ms).
    AutoConnect(String, u16, bool, u32, u64),
    /// Handled out of band: it cancels whatever the actor is doing.
    Disconnect,
    Control,
    Read(Space, u16, String),
    Write(Space, u16, i32),
    Command(u16, i32),
    Subscriptions(BTreeSet<(Space, u16, String, u64)>),
    LogSettings(LogSettings),
}
impl Action {
    /// Device traffic queued before a Disconnect belongs to the old connection.
    fn targets_connection(&self) -> bool {
        matches!(
            self,
            Self::Control | Self::Read(..) | Self::Write(..) | Self::Command(..)
        )
    }
}
/// Where a picked file's contents should go once the dialog completes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ImportTarget {
    Profile,
    CommandMap { pane: String },
    Map { pane: String, space: Space },
}
type Imports = Arc<Mutex<Vec<(ImportTarget, Result<String, String>)>>>;
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutcomeStatus {
    Sending,
    Confirmed,
    Refused,
    Unknown,
}
#[derive(Debug, Clone)]
pub struct WriteOutcome {
    pub sent_at: f64,
    pub status: OutcomeStatus,
}
impl WriteOutcome {
    pub fn label(&self) -> &'static str {
        match self.status {
            OutcomeStatus::Sending => "Sending…",
            OutcomeStatus::Confirmed => "Confirmed",
            OutcomeStatus::Refused => "Refused",
            OutcomeStatus::Unknown => "No acknowledgement; outcome unknown",
        }
    }
}
/// A transient message shown over the workspace and kept in the Activity log.
#[derive(Debug, Clone)]
pub struct Toast {
    pub role: Role,
    pub text: String,
    pub created: f64,
    /// Identical messages in a row collapse into one with a count.
    pub count: usize,
}
impl Toast {
    /// How long the toast stays, in ms; errors stay until dismissed.
    pub fn lifetime(&self) -> Option<f64> {
        match self.role {
            Role::Error => None,
            Role::Warn => Some(8000.),
            _ => Some(4000.),
        }
    }
}
pub struct Session {
    pub _runtime: tokio::runtime::Runtime,
    pub app: AppHandle,
    pub tx: mpsc::UnboundedSender<Action>,
    cancel: mpsc::UnboundedSender<()>,
    imports: Imports,
    received_imports: Vec<(ImportTarget, Result<String, String>)>,
    pub connection: Option<DeviceConnection>,
    pub devices: Vec<DiscoveredDevice>,
    pub scanning: bool,
    pub busy: bool,
    pub readings: BTreeMap<(Space, u16), RegisterData>,
    pub histories: BTreeMap<(Space, u16), VecDeque<[f64; 2]>>,
    pub logs: VecDeque<LogEntry>,
    /// A warning for the operator; becomes a toast at the end of the frame.
    pub notice: String,
    pub toasts: Vec<Toast>,
    pub selection: Option<(Space, Entry)>,
    pub interests: BTreeSet<(Space, u16, String, u64)>,
    pub last_interests: BTreeSet<(Space, u16, String, u64)>,
    /// Addresses whose history a visible plot wants this frame.
    history_wanted: BTreeSet<(Space, u16)>,
    /// Last frame's `history_wanted`, which incoming readings are recorded for.
    history_keys: BTreeSet<(Space, u16)>,
    pub command_responses: BTreeMap<u16, CommandResponse>,
    pub confirm: Option<(String, Action)>,
    pub writes: BTreeMap<(Space, u16), WriteOutcome>,
    pub commands: BTreeMap<u16, WriteOutcome>,
}
impl Default for Session {
    fn default() -> Self {
        Self::new()
    }
}
impl Session {
    pub fn new() -> Self {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("Tokio runtime");
        let app = AppHandle::new();
        let (tx, mut rx) = mpsc::unbounded_channel::<Action>();
        let (cancel, mut cancelled) = mpsc::unbounded_channel::<()>();
        let a = app.clone();
        runtime.spawn(async move {
            let mut subscriptions: BTreeMap<(Space, u16), (u64, String, u64)> = BTreeMap::new();
            // Actions that survived a Disconnect, still in submission order.
            let mut backlog: VecDeque<Action> = VecDeque::new();
            loop {
                let action = match backlog.pop_front() {
                    Some(action) => action,
                    None => tokio::select! {
                        biased;
                        Some(()) = cancelled.recv() => {
                            disconnect(&a, &mut rx, &mut backlog).await;
                            continue;
                        }
                        action = rx.recv() => match action {
                            Some(action) => action,
                            None => break,
                        },
                    },
                };
                let result = match action {
                    Action::Disconnect => {
                        disconnect(&a, &mut rx, &mut backlog).await;
                        Ok(())
                    }
                    Action::Subscriptions(wanted) => {
                        // Not cancellable: it must keep `subscriptions` in step
                        // with the backend's registry.
                        update_subscriptions(&a, &mut subscriptions, wanted).await;
                        Ok(())
                    }
                    action => tokio::select! {
                        // Connecting, retrying, rate limiting and a full request
                        // queue can each take seconds; Disconnect must not wait
                        // behind them.
                        biased;
                        Some(()) = cancelled.recv() => {
                            disconnect(&a, &mut rx, &mut backlog).await;
                            Ok(())
                        }
                        result = run(&a, action) => result,
                    },
                };
                if let Err(error) = result {
                    a.emit(Event::Error(error));
                }
            }
            let _ = commands::disconnect_device(a.state()).await;
        });
        Self {
            _runtime: runtime,
            app,
            tx,
            cancel,
            imports: Default::default(),
            received_imports: vec![],
            connection: None,
            devices: vec![],
            scanning: false,
            busy: false,
            readings: BTreeMap::new(),
            histories: BTreeMap::new(),
            logs: VecDeque::new(),
            notice: String::new(),
            toasts: vec![],
            selection: None,
            interests: BTreeSet::new(),
            last_interests: BTreeSet::new(),
            history_wanted: BTreeSet::new(),
            history_keys: BTreeSet::new(),
            command_responses: BTreeMap::new(),
            confirm: None,
            writes: BTreeMap::new(),
            commands: BTreeMap::new(),
        }
    }
    /// Resolves the user's address to an endpoint. An explicit `host:port` wins;
    /// otherwise a discovered Device at that address supplies the port it
    /// reported for the chosen transport, then the protocol default applies.
    pub fn endpoint(&self, address: &str, udp: bool) -> Result<(String, u16), String> {
        let address = address.trim();
        if address.is_empty() {
            return Err("Enter a device address".into());
        }
        if let Ok(socket) = address.parse::<std::net::SocketAddr>() {
            if socket.port() == 0 {
                return Err(format!("Invalid port in {address}"));
            }
            return Ok((socket.ip().to_string(), socket.port()));
        }
        if let Some((host, port)) = address.rsplit_once(':') {
            if !host.contains(':') {
                let port = port
                    .parse::<u16>()
                    .ok()
                    .filter(|p| *p != 0)
                    .ok_or_else(|| format!("Invalid port in {address}"))?;
                return Ok((host.to_string(), port));
            }
        }
        let reported = self
            .devices
            .iter()
            .find(|d| d.ip_address == address)
            .map(|d| if udp { d.udp_port } else { d.tcp_port })
            .filter(|p| *p != 0);
        let default = if udp {
            DEFAULT_UDP_PORT
        } else {
            DEFAULT_TCP_PORT
        };
        Ok((address.to_string(), reported.unwrap_or(default)))
    }
    pub fn connect_to(&mut self, address: &str, udp: bool) {
        match self.endpoint(address, udp) {
            Ok((host, port)) => self.send(Action::Connect(host, port, udp)),
            Err(e) => self.notice = e,
        }
    }
    pub fn auto_connect(&mut self, address: &str, udp: bool, attempts: u32, delay: u64) {
        match self.endpoint(address, udp) {
            Ok((host, port)) => self.send(Action::AutoConnect(host, port, udp, attempts, delay)),
            Err(e) => self.notice = e,
        }
    }
    pub fn send(&mut self, action: Action) {
        if matches!(action, Action::Write(..) | Action::Command(..)) && !self.controlled() {
            self.notice =
                "Take Control on this connection before writing or sending commands".into();
            return;
        }
        match &action {
            Action::Write(space, address, _) => {
                self.writes.insert(
                    (*space, *address),
                    WriteOutcome {
                        sent_at: crate::communicator::now_ms(),
                        status: OutcomeStatus::Sending,
                    },
                );
            }
            Action::Command(code, _) => {
                self.commands.insert(
                    *code,
                    WriteOutcome {
                        sent_at: crate::communicator::now_ms(),
                        status: OutcomeStatus::Sending,
                    },
                );
            }
            Action::Disconnect => {
                self.confirm = None;
                self.connection = None;
                self.busy = false;
                self.writes.clear();
                self.commands.clear();
                if let Err(e) = self.cancel.send(()) {
                    self.notice = e.to_string();
                }
                return;
            }
            Action::Scan => {
                self.scanning = true;
                self.devices.clear();
            }
            Action::Connect(..) | Action::AutoConnect(..) => {
                self.busy = true;
                self.confirm = None;
                self.connection = None;
                self.writes.clear();
                self.commands.clear();
                self.readings.clear();
                self.histories.clear();
            }
            _ => {}
        }
        if let Err(e) = self.tx.send(action) {
            self.notice = e.to_string();
        }
    }
    /// Whether a write or command still awaits its acknowledgement.
    pub fn awaiting_outcome(&self) -> bool {
        self.writes
            .values()
            .chain(self.commands.values())
            .any(|o| o.status == OutcomeStatus::Sending)
    }
    pub fn connected(&self) -> bool {
        self.connection
            .as_ref()
            .is_some_and(|c| c.connected && !c.reconnecting)
    }
    pub fn controlled(&self) -> bool {
        self.connection.as_ref().is_some_and(|c| {
            c.connected
                && c.control_state
                    == if c.interface_type == InterfaceType::Tcp {
                        1
                    } else {
                        2
                    }
        })
    }
    pub fn interest(&mut self, b: &Binding, p: &Profile, ms: u64) {
        if b.matches(p) {
            self.interests
                .insert((b.space, b.address, b.name.clone(), ms.max(50)));
        }
    }
    /// Shows a message over the workspace and records it in the Activity log.
    pub fn toast(&mut self, role: Role, text: impl Into<String>) {
        let text = text.into();
        let now = crate::communicator::now_ms();
        self.logs.push_back(LogEntry {
            level: match role {
                Role::Error => LogLevel::Error,
                Role::Warn => LogLevel::Warning,
                Role::Ok => LogLevel::Success,
                _ => LogLevel::Info,
            },
            category: LogCategory::Connection,
            message: text.clone(),
            timestamp: now,
            packet_data: None,
        });
        if let Some(last) = self
            .toasts
            .last_mut()
            .filter(|t| t.text == text && t.role == role)
        {
            last.count += 1;
            last.created = now;
            return;
        }
        self.toasts.push(Toast {
            role,
            text,
            created: now,
            count: 1,
        });
        // Keep the stack short; the Activity log holds the full history.
        if self.toasts.len() > 5 {
            self.toasts.remove(0);
        }
    }
    /// Turns a pending notice into a warning toast.
    fn flush_notice(&mut self) {
        if !self.notice.is_empty() {
            let text = std::mem::take(&mut self.notice);
            self.toast(Role::Warn, text);
        }
    }
    /// Asks for `b`'s readings to be kept as a plot history.
    pub fn want_history(&mut self, b: &Binding) {
        self.history_wanted.insert((b.space, b.address));
    }
    /// Ends a frame: sends changed subscriptions and drops histories nothing plots.
    pub fn sync(&mut self) {
        self.flush_notice();
        if self.interests != self.last_interests {
            self.send(Action::Subscriptions(self.interests.clone()));
            self.last_interests = self.interests.clone();
        }
        self.history_keys = std::mem::take(&mut self.history_wanted);
        let keys = &self.history_keys;
        self.histories.retain(|k, _| keys.contains(k));
    }
    pub fn read(&mut self, s: Space, e: &Entry) {
        self.send(Action::Read(s, e.address, e.name.clone()));
    }
    pub fn write(&mut self, s: Space, e: &Entry, text: &str, confirm: bool) {
        if !self.connected() {
            self.notice = "Connect to a device first".into();
            return;
        }
        if !e.writable || s == Space::SysRegister {
            self.notice = "This entry is read-only".into();
            return;
        }
        match e.encode(text) {
            Ok(value) => self.write_raw(s, e, value, text, confirm),
            Err(e) => self.notice = e,
        }
    }
    pub fn write_raw(&mut self, s: Space, e: &Entry, value: i32, text: &str, confirm: bool) {
        if !e.writable || s == Space::SysRegister || !self.connected() {
            self.notice = "Entry cannot be written in the current state".into();
            return;
        }
        let action = Action::Write(s, e.address, value);
        if confirm {
            self.confirm = Some((format!("Write {text} to {}?", e.name), action));
        } else {
            self.send(action);
        }
    }
    pub fn write_formatted(
        &mut self,
        s: Space,
        e: &Entry,
        text: &str,
        format: DisplayFormat,
        confirm: bool,
    ) {
        match format.encode(e, text) {
            Ok(raw) => self.write_raw(s, e, raw, text, confirm),
            Err(error) => self.notice = error,
        }
    }

    pub fn command(&mut self, code: u16, value: i32, confirm: bool) {
        if !self.controlled() {
            self.notice = "Take Control before sending commands".into();
            return;
        }
        let a = Action::Command(code, value);
        if confirm {
            self.confirm = Some((format!("Send command {code} with value {value}?"), a));
        } else {
            self.send(a);
        }
    }
    pub fn drain(&mut self, p: &Profile, prefs: &Preferences) {
        self.flush_notice();
        for event in self.app.drain() {
            match event {
                Event::DeviceDiscovered(d) => {
                    if !self.devices.iter().any(|x| x.ip_address == d.ip_address) {
                        self.devices.push(d);
                    }
                }
                Event::ScanComplete => self.scanning = false,
                Event::ConnectionStatus(c) => {
                    if !c.connected {
                        self.confirm = None;
                        for outcome in self.writes.values_mut().chain(self.commands.values_mut()) {
                            if outcome.status == OutcomeStatus::Sending {
                                outcome.status = OutcomeStatus::Unknown;
                            }
                        }
                        self.readings.clear();
                    } else if self.connection.as_ref().is_some_and(|old| old.reconnecting) {
                        self.toast(
                            Role::Info,
                            "Connection restored. Take Control again before writing or sending commands.",
                        );
                    }
                    self.connection = Some(c);
                }
                Event::Disconnected => {
                    self.connection = None;
                    self.readings.clear();
                }
                Event::Idle => self.busy = false,
                Event::Error(error) => {
                    self.busy = false;
                    self.toast(Role::Error, error);
                }
                Event::Log(l) => self.logs.push_back(l),
                Event::CommandResponse(response) => {
                    if response.valid {
                        self.toast(
                            Role::Ok,
                            format!("Command {} acknowledged", response.command),
                        );
                    } else {
                        self.toast(
                            Role::Error,
                            format!(
                                "Command {} refused (status {})",
                                response.command, response.status
                            ),
                        );
                    }
                    if let Some(outcome) = self.commands.get_mut(&response.command) {
                        outcome.status = if response.valid {
                            OutcomeStatus::Confirmed
                        } else {
                            OutcomeStatus::Refused
                        };
                    }
                    self.command_responses.insert(response.command, response);
                }
                Event::WriteAck(ack) => {
                    let s = match ack.command {
                        CMD_WRITE_REGISTER => Space::Register,
                        CMD_WRITE_PARAMETER => Space::Parameter,
                        _ => Space::SysRegister,
                    };
                    if let Some(outcome) = self.writes.get_mut(&(s, ack.address)) {
                        if outcome.status == OutcomeStatus::Sending
                            && ack.timestamp >= outcome.sent_at
                        {
                            outcome.status = if ack.valid {
                                OutcomeStatus::Confirmed
                            } else {
                                OutcomeStatus::Refused
                            };
                        }
                    }
                    // Read the value back so every view shows what the Device
                    // now holds; the acknowledgement itself is not a reading.
                    if ack.valid && s != Space::SysRegister {
                        if let Some(e) = p.entry_at(s, ack.address) {
                            self.send(Action::Read(s, e.address, e.name));
                        }
                    }
                }
                Event::Register(r) => self.reading(Space::Register, r, p, prefs),
                Event::Parameter(r) => self.reading(Space::Parameter, r, p, prefs),
                Event::SysRegister(r) => self.reading(Space::SysRegister, r, p, prefs),
            }
        }
        let now = crate::communicator::now_ms();
        for outcome in self.writes.values_mut().chain(self.commands.values_mut()) {
            if outcome.status == OutcomeStatus::Sending && now - outcome.sent_at > 5000. {
                outcome.status = OutcomeStatus::Unknown;
            }
        }
        while self.logs.len() > prefs.log_settings.max_log_count as usize {
            self.logs.pop_front();
        }
        let mut imports = self.imports.lock().unwrap_or_else(|e| e.into_inner());
        self.received_imports.append(&mut imports);
    }
    fn reading(&mut self, s: Space, r: RegisterData, p: &Profile, prefs: &Preferences) {
        if s == Space::SysRegister && r.address == CONTROL_INTERFACE && r.valid {
            let held = self.controlled();
            if let Some(c) = &mut self.connection {
                c.control_state = r.value as u32;
            }
            if held && !self.controlled() {
                self.toast(
                    Role::Warn,
                    format!(
                        "Control was taken by {}. Writes and commands are disabled until you take it back.",
                        control_interface_name(r.value)
                    ),
                );
            }
        }
        // Only addresses something plots keep a history; everything else needs
        // just the latest value.
        if r.valid && self.history_keys.contains(&(s, r.address)) {
            if let Some(e) = p.entry_at(s, r.address) {
                let value = e.decode(r.value);
                if value.is_finite() {
                    let h = self.histories.entry((s, r.address)).or_default();
                    h.push_back([r.timestamp / 1000., value]);
                    while h.len() > prefs.max_points {
                        h.pop_front();
                    }
                }
            }
        }
        self.readings.insert((s, r.address), r);
    }
    /// Takes a completed file pick for `target`, if one has arrived.
    pub fn take_import(&mut self, target: &ImportTarget) -> Option<Result<String, String>> {
        let i = self
            .received_imports
            .iter()
            .position(|(t, _)| t == target)?;
        Some(self.received_imports.remove(i).1)
    }
    /// Opens a native file picker without blocking the interface; the contents
    /// arrive through [`Session::take_import`].
    pub fn pick_file(&self, target: ImportTarget, filter: &str, extensions: &[&str]) {
        let dialog = rfd::AsyncFileDialog::new().add_filter(filter, extensions);
        let imports = self.imports.clone();
        let app = self.app.clone();
        self._runtime.spawn(async move {
            if let Some(file) = dialog.pick_file().await {
                let text = tokio::fs::read_to_string(file.path())
                    .await
                    .map_err(|e| e.to_string());
                imports
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .push((target, text));
                app.notify();
            }
        });
    }
    pub fn export(&self, content: String, name: &str, ext: &str) {
        // The async dialog runs on the platform's required thread (the main
        // thread on macOS) without blocking the interface.
        let dialog = rfd::AsyncFileDialog::new()
            .set_file_name(name)
            .add_filter(ext, &[ext]);
        let app = self.app.clone();
        self._runtime.spawn(async move {
            if let Some(file) = dialog.save_file().await {
                if let Err(e) = tokio::fs::write(file.path(), content).await {
                    app.emit(Event::Error(e.to_string()));
                }
            }
        });
    }
    pub fn raw_read(&mut self, s: Space, address: u16) {
        self.send(Action::Read(s, address, format!("{}_{address}", s.title())));
    }
}

const CONTROL_INTERFACE: u16 = 2;

/// PROTOCOL.md, Control Interface Values.
pub fn control_interface_name(value: i32) -> &'static str {
    match value {
        0 => "no interface",
        1 => "a TCP datastream client",
        2 => "a UDP datastream client",
        101 => "the TCP command line",
        102 => "USB",
        _ => "another interface",
    }
}

async fn run(a: &AppHandle, action: Action) -> Result<(), String> {
    let state = a.state();
    match action {
        Action::Scan => commands::start_scan(a.clone(), state).await,
        Action::Connect(ip, port, udp) => {
            let result = connect(a, ip, port, udp).await;
            a.emit(Event::Idle);
            result
        }
        Action::AutoConnect(ip, port, udp, retries, delay) => {
            let mut result = Err("No connection attempts requested".into());
            for attempt in 0..retries.max(1) {
                result = connect(a, ip.clone(), port, udp).await;
                if result.is_ok() {
                    break;
                }
                if attempt + 1 < retries {
                    tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
                }
            }
            a.emit(Event::Idle);
            result
        }
        Action::Control => commands::take_control(state).await,
        Action::Read(s, address, name) => match s {
            Space::Register => commands::read_register(address, name, state).await,
            Space::Parameter => commands::read_parameter(address, name, state).await,
            Space::SysRegister => commands::read_system_register(address, name, state).await,
        },
        Action::Write(s, address, value) => match s {
            Space::Register => commands::write_register(address, value, state).await,
            Space::Parameter => commands::write_parameter(address, value, state).await,
            Space::SysRegister => Err("System registers are read-only".into()),
        },
        Action::Command(code, value) => commands::send_sys_command(code, value, state).await,
        Action::LogSettings(settings) => commands::update_log_settings(settings, state).await,
        Action::Disconnect | Action::Subscriptions(_) => Ok(()),
    }
}

/// Disconnects, then drops device traffic that was queued for the connection
/// that no longer exists. Everything else keeps its order in `backlog`.
async fn disconnect(
    a: &AppHandle,
    rx: &mut mpsc::UnboundedReceiver<Action>,
    backlog: &mut VecDeque<Action>,
) {
    let _ = commands::disconnect_device(a.state()).await;
    a.emit(Event::Idle);
    a.emit(Event::Disconnected);
    while let Ok(action) = rx.try_recv() {
        backlog.push_back(action);
    }
    backlog.retain(|action| !action.targets_connection());
}

async fn update_subscriptions(
    a: &AppHandle,
    subscriptions: &mut BTreeMap<(Space, u16), (u64, String, u64)>,
    wanted: BTreeSet<(Space, u16, String, u64)>,
) {
    let state = a.state();
    let mut desired: BTreeMap<(Space, u16), (String, u64)> = BTreeMap::new();
    for (s, address, name, ms) in wanted {
        desired
            .entry((s, address))
            .and_modify(|v| v.1 = v.1.min(ms))
            .or_insert((name, ms));
    }
    let old: Vec<_> = subscriptions
        .iter()
        .filter(|(k, (_, name, ms))| desired.get(k) != Some(&(name.clone(), *ms)))
        .map(|(k, v)| (*k, v.0))
        .collect();
    for (key, id) in old {
        let _ = poll::unsubscribe_address(id, a.clone(), state).await;
        subscriptions.remove(&key);
    }
    for ((s, address), (name, ms)) in desired {
        if subscriptions.contains_key(&(s, address)) {
            continue;
        }
        let source = match s {
            Space::Register => poll::DataSource::Register,
            Space::Parameter => poll::DataSource::Parameter,
            Space::SysRegister => poll::DataSource::SysRegister,
        };
        if let Ok(id) =
            poll::subscribe_address(source, address, name.clone(), ms, a.clone(), state).await
        {
            subscriptions.insert((s, address), (id, name, ms));
        }
    }
}

async fn connect(app: &AppHandle, ip: String, port: u16, udp: bool) -> Result<(), String> {
    tokio::time::timeout(
        std::time::Duration::from_secs(5),
        commands::connect_device(
            ip,
            port,
            if udp {
                InterfaceType::Udp
            } else {
                InterfaceType::Tcp
            },
            None,
            app.clone(),
            app.state(),
        ),
    )
    .await
    .map_err(|_| "Connection timed out".to_string())?
}
