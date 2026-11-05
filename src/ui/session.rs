use crate::{commands, model::*, poll, runtime::AppHandle, types::*};
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use tokio::sync::mpsc;

#[derive(Debug, Clone)]
pub enum Action {
    Scan,
    Connect(String, bool),
    AutoConnect(String, bool, u32, u64),
    Disconnect,
    Control,
    Read(Space, u16, String),
    Write(Space, u16, i32),
    Command(u16, i32),
    Subscriptions(BTreeSet<(Space, u16, String, u64)>),
    LogSettings(LogSettings),
}
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
    pub expected: i32,
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
pub struct Session {
    pub _runtime: tokio::runtime::Runtime,
    pub app: AppHandle,
    pub tx: mpsc::UnboundedSender<Action>,
    pub connection: Option<DeviceConnection>,
    pub devices: Vec<DiscoveredDevice>,
    pub scanning: bool,
    pub busy: bool,
    pub readings: BTreeMap<(Space, u16), RegisterData>,
    pub histories: BTreeMap<(Space, u16), VecDeque<[f64; 2]>>,
    pub logs: VecDeque<LogEntry>,
    pub notice: String,
    pub selection: Option<(Space, Entry)>,
    pub interests: BTreeSet<(Space, u16, String, u64)>,
    pub last_interests: BTreeSet<(Space, u16, String, u64)>,
    pub paused: bool,
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
        let a = app.clone();
        runtime.spawn(async move {
            let mut subscriptions: BTreeMap<(Space, u16), (u64, String, u64)> = BTreeMap::new();
            while let Some(action) = rx.recv().await {
                let state = a.state();
                let result = match action {
                    Action::Scan => commands::start_scan(a.clone(), state).await,
                    Action::Connect(ip, udp) => {
                        let result = connect(&a, ip, udp).await;
                        let _ = a.emit("busy", false);
                        result
                    }
                    Action::AutoConnect(ip, udp, retries, delay) => {
                        let mut result = Err("No connection attempts requested".into());
                        for attempt in 0..retries.max(1) {
                            result = connect(&a, ip.clone(), udp).await;
                            if result.is_ok() {
                                break;
                            }
                            if attempt + 1 < retries {
                                tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
                            }
                        }
                        let _ = a.emit("busy", false);
                        result
                    }
                    Action::Disconnect => {
                        let r = commands::disconnect_device(state).await;
                        let _ = a.emit("disconnected", ());
                        r
                    }
                    Action::Control => commands::take_control(state).await,
                    Action::Read(s, address, name) => match s {
                        Space::Register => commands::read_register(address, name, state).await,
                        Space::Parameter => commands::read_parameter(address, name, state).await,
                        Space::SysRegister => {
                            commands::read_system_register(address, name, state).await
                        }
                    },
                    Action::Write(s, address, value) => match s {
                        Space::Register => commands::write_register(address, value, state).await,
                        Space::Parameter => commands::write_parameter(address, value, state).await,
                        Space::SysRegister => Err("System registers are read-only".into()),
                    },
                    Action::Command(code, value) => {
                        commands::send_sys_command(code, value, state).await
                    }
                    Action::LogSettings(settings) => {
                        commands::update_log_settings(settings, state).await
                    }
                    Action::Subscriptions(wanted) => {
                        let mut desired: BTreeMap<(Space, u16), (String, u64)> = BTreeMap::new();
                        for (s, address, name, ms) in wanted {
                            desired
                                .entry((s, address))
                                .and_modify(|v| v.1 = v.1.min(ms))
                                .or_insert((name, ms));
                        }
                        let old: Vec<_> = subscriptions
                            .iter()
                            .filter(|(k, (_, name, ms))| {
                                desired.get(k) != Some(&(name.clone(), *ms))
                            })
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
                            if let Ok(id) = poll::subscribe_address(
                                source,
                                address,
                                name.clone(),
                                ms,
                                a.clone(),
                                state,
                            )
                            .await
                            {
                                subscriptions.insert((s, address), (id, name, ms));
                            }
                        }
                        Ok(())
                    }
                };
                if let Err(error) = result {
                    let _ = a.emit("error", error);
                }
            }
            let _ = commands::disconnect_device(a.state()).await;
        });
        Self {
            _runtime: runtime,
            app,
            tx,
            connection: None,
            devices: vec![],
            scanning: false,
            busy: false,
            readings: BTreeMap::new(),
            histories: BTreeMap::new(),
            logs: VecDeque::new(),
            notice: String::new(),
            selection: None,
            interests: BTreeSet::new(),
            last_interests: BTreeSet::new(),
            paused: false,
            command_responses: BTreeMap::new(),
            confirm: None,
            writes: BTreeMap::new(),
            commands: BTreeMap::new(),
        }
    }
    pub fn send(&mut self, action: Action) {
        if matches!(action, Action::Write(..) | Action::Command(..)) && !self.controlled() {
            self.notice =
                "Take Control on this connection before writing or sending commands".into();
            return;
        }
        match &action {
            Action::Write(space, address, value) => {
                self.writes.insert(
                    (*space, *address),
                    WriteOutcome {
                        sent_at: crate::communicator::now_ms(),
                        expected: *value,
                        status: OutcomeStatus::Sending,
                    },
                );
            }
            Action::Command(code, value) => {
                self.commands.insert(
                    *code,
                    WriteOutcome {
                        sent_at: crate::communicator::now_ms(),
                        expected: *value,
                        status: OutcomeStatus::Sending,
                    },
                );
            }
            Action::Disconnect => {
                self.confirm = None;
                self.connection = None;
                self.writes.clear();
                self.commands.clear();
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
    pub fn sync(&mut self) {
        if self.interests != self.last_interests {
            self.send(Action::Subscriptions(self.interests.clone()));
            self.last_interests = self.interests.clone();
        }
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
        for event in self.app.drain() {
            match event.name.as_str() {
                "deviceDiscovered" => {
                    if let Ok(d) = serde_json::from_value::<DiscoveredDevice>(event.payload) {
                        if !self.devices.iter().any(|x| x.ip_address == d.ip_address) {
                            self.devices.push(d);
                        }
                    }
                }
                "scanComplete" => self.scanning = false,
                "connectionStatus" => {
                    if let Ok(c) = serde_json::from_value::<DeviceConnection>(event.payload) {
                        if !c.connected {
                            self.confirm = None;
                            for outcome in
                                self.writes.values_mut().chain(self.commands.values_mut())
                            {
                                if outcome.status == OutcomeStatus::Sending {
                                    outcome.status = OutcomeStatus::Unknown;
                                }
                            }
                            self.readings.clear();
                        }
                        self.connection = Some(c);
                    }
                }
                "disconnected" => {
                    self.connection = None;
                    self.readings.clear();
                }
                "busy" => self.busy = false,
                "error" => {
                    self.busy = false;
                    self.notice = event.payload.as_str().unwrap_or("Unknown error").into();
                }
                "logEntry" => {
                    if let Ok(l) = serde_json::from_value(event.payload) {
                        self.logs.push_back(l);
                    }
                }
                "commandResponse" => {
                    if let Ok(response) = serde_json::from_value::<CommandResponse>(event.payload) {
                        self.notice = format!(
                            "Command {}: {} (status {})",
                            response.command,
                            if response.valid {
                                "acknowledged"
                            } else {
                                "refused"
                            },
                            response.status
                        );
                        if let Some(outcome) = self.commands.get_mut(&response.command) {
                            outcome.status = if response.valid {
                                OutcomeStatus::Confirmed
                            } else {
                                OutcomeStatus::Refused
                            };
                        }
                        self.command_responses.insert(response.command, response);
                    }
                }
                "registerUpdate" | "parameterUpdate" | "sysRegisterUpdate" => {
                    if let Ok(r) = serde_json::from_value::<RegisterData>(event.payload) {
                        let s = match event.name.as_str() {
                            "parameterUpdate" => Space::Parameter,
                            "sysRegisterUpdate" => Space::SysRegister,
                            _ => Space::Register,
                        };
                        if let Some(outcome) = self.writes.get_mut(&(s, r.address)) {
                            if outcome.status == OutcomeStatus::Sending
                                && r.timestamp >= outcome.sent_at
                            {
                                if !r.valid {
                                    outcome.status = OutcomeStatus::Refused;
                                } else if r.value == outcome.expected {
                                    outcome.status = OutcomeStatus::Confirmed;
                                }
                            }
                        }
                        if s == Space::SysRegister && r.address == 2 && r.valid {
                            if let Some(c) = &mut self.connection {
                                c.control_state = r.value as u32;
                            }
                        }
                        if r.valid && !self.paused {
                            if let Some(e) =
                                p.entries(s).into_iter().find(|e| e.address == r.address)
                            {
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
                }
                _ => {}
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
    }
    pub fn export(&self, content: String, name: &str, ext: &str) {
        let name = name.to_string();
        let ext = ext.to_string();
        let app = self.app.clone();
        std::thread::spawn(move || {
            if let Some(path) = rfd::FileDialog::new()
                .set_file_name(&name)
                .add_filter(&ext, &[ext.as_str()])
                .save_file()
            {
                if let Err(e) = std::fs::write(path, content) {
                    let _ = app.emit("error", e.to_string());
                }
            }
        });
    }
    pub fn raw_read(&mut self, s: Space, address: u16) {
        self.send(Action::Read(s, address, format!("{}_{address}", s.title())));
    }
}

async fn connect(app: &AppHandle, ip: String, udp: bool) -> Result<(), String> {
    tokio::time::timeout(
        std::time::Duration::from_secs(5),
        commands::connect_device(
            ip,
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
