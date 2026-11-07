//! Persistent domain state shared by every native viewport.
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Space {
    Register,
    Parameter,
    SysRegister,
}
impl Space {
    pub const ALL: [Self; 3] = [Self::Register, Self::Parameter, Self::SysRegister];
    pub fn title(self) -> &'static str {
        match self {
            Self::Register => "Registers",
            Self::Parameter => "Parameters",
            Self::SysRegister => "System Registers",
        }
    }
    pub fn command(self) -> u16 {
        match self {
            Self::Register => 1,
            Self::Parameter => 3,
            Self::SysRegister => 6,
        }
    }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum DisplayFormat {
    #[default]
    Decimal,
    Hexadecimal,
    Binary,
}
impl DisplayFormat {
    pub const ALL: [Self; 3] = [Self::Decimal, Self::Hexadecimal, Self::Binary];
    pub fn title(self) -> &'static str {
        match self {
            Self::Decimal => "Decimal",
            Self::Hexadecimal => "Hexadecimal",
            Self::Binary => "Binary",
        }
    }
    pub fn format(self, e: &Entry, raw: i32) -> String {
        match self {
            Self::Decimal => {
                if e.data_type == "hex" {
                    (raw as u32).to_string()
                } else {
                    e.format(raw)
                }
            }
            Self::Hexadecimal => format!("0x{:08X}", raw as u32),
            Self::Binary => format!("{:032b}", raw as u32),
        }
    }
    pub fn encode(self, e: &Entry, text: &str) -> Result<i32, String> {
        match self {
            Self::Decimal => e.encode(text),
            Self::Hexadecimal => u32::from_str_radix(
                text.trim()
                    .trim_start_matches("0x")
                    .trim_start_matches("0X"),
                16,
            )
            .map(|v| v as i32)
            .map_err(|_| "Expected 32-bit hexadecimal bits".into()),
            Self::Binary => u32::from_str_radix(
                text.trim()
                    .trim_start_matches("0b")
                    .replace(' ', "")
                    .as_str(),
                2,
            )
            .map(|v| v as i32)
            .map_err(|_| "Expected 32 binary bits".into()),
        }
    }
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Entry {
    pub address: u16,
    pub name: String,
    pub data_type: String,
    pub writable: bool,
    #[serde(default)]
    pub array_size: Option<usize>,
}
impl Entry {
    pub fn decode(&self, value: i32) -> f64 {
        match self.data_type.as_str() {
            "float" => f32::from_bits(value as u32) as f64,
            "uint32_t" | "hex" => value as u32 as f64,
            _ => value as f64,
        }
    }
    pub fn format(&self, value: i32) -> String {
        match self.data_type.as_str() {
            "hex" => format!("0x{:08X}", value as u32),
            "float" => f32::from_bits(value as u32).to_string(),
            "uint32_t" => (value as u32).to_string(),
            _ => value.to_string(),
        }
    }
    pub fn encode(&self, text: &str) -> Result<i32, String> {
        let text = text.trim();
        if self.data_type == "float" {
            let value = text.parse::<f32>().map_err(|_| "Expected a finite float")?;
            if !value.is_finite() {
                return Err("Expected a finite float".into());
            }
            return Ok(value.to_bits() as i32);
        }
        if let Some(hex) = text.strip_prefix("0x").or_else(|| text.strip_prefix("0X")) {
            return u32::from_str_radix(hex, 16)
                .map(|x| x as i32)
                .map_err(|_| "Expected a 32-bit hexadecimal value".into());
        }
        if self.data_type == "uint32_t" || self.data_type == "hex" {
            text.parse::<u32>()
                .map(|x| x as i32)
                .map_err(|_| "Expected an unsigned 32-bit value".into())
        } else {
            text.parse::<i32>()
                .map_err(|_| "Expected a signed 32-bit value".into())
        }
    }
}
pub fn parse_map(content: &str, space: Space) -> Result<Vec<Entry>, Vec<String>> {
    static DECLARATION: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let declaration = DECLARATION.get_or_init(|| {
        regex::Regex::new(
            r"^(int32_t|uint32_t|float|hex)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\[(\d+)\])?\s*;?\s*$",
        )
        .unwrap()
    });
    let mut entries = vec![];
    let mut errors = vec![];
    let mut writable = space == Space::Parameter;
    let mut names = HashSet::new();
    let mut block = false;
    for (line_no, line) in content.lines().enumerate() {
        let lower = line.to_lowercase();
        if space == Space::Register
            && (lower.contains("read/write") || lower.contains("read write"))
            && !lower.contains("read only")
        {
            writable = true;
            continue;
        }
        let mut clean = String::new();
        let bytes = line.as_bytes();
        let mut i = 0;
        while i < bytes.len() {
            if block {
                if bytes[i..].starts_with(b"*/") {
                    block = false;
                    i += 2;
                } else {
                    i += 1;
                }
            } else if bytes[i..].starts_with(b"/*") {
                block = true;
                i += 2;
            } else if bytes[i..].starts_with(b"//") {
                break;
            } else {
                clean.push(bytes[i] as char);
                i += 1;
            }
        }
        let clean = clean.trim();
        if clean.is_empty()
            || clean.starts_with('#')
            || clean.starts_with("typedef struct")
            || clean == "{"
            || clean.starts_with('}')
        {
            continue;
        }
        let Some(c) = declaration.captures(clean) else {
            errors.push(format!("Line {}: invalid declaration", line_no + 1));
            continue;
        };
        let name = c[2].to_string();
        let count = c.get(3).map_or(Ok(1usize), |v| v.as_str().parse::<usize>());
        let Ok(count) = count else {
            errors.push(format!("Line {}: invalid array size", line_no + 1));
            continue;
        };
        if count == 0 || count > 65536 || entries.len() + count > 65536 {
            errors.push(format!(
                "Line {}: address range exceeds 0–65535",
                line_no + 1
            ));
            continue;
        }
        if !names.insert(name.clone()) {
            errors.push(format!("Line {}: duplicate {name}", line_no + 1));
            continue;
        }
        for index in 0..count {
            entries.push(Entry {
                address: entries.len() as u16,
                name: if c.get(3).is_some() {
                    format!("{name}[{index}]")
                } else {
                    name.clone()
                },
                data_type: c[1].to_string(),
                writable,
                array_size: c.get(3).map(|_| count),
            });
        }
    }
    if errors.is_empty() {
        Ok(entries)
    } else {
        Err(errors)
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SysCommand {
    pub code: u16,
    pub name: String,
    #[serde(default)]
    pub description: String,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Metadata {
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub unit: String,
    #[serde(default)]
    pub value_list: Vec<ValueLabel>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValueLabel {
    pub value: String,
    pub label: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub is_default: bool,
    pub registers_map: String,
    pub parameters_map: String,
    #[serde(default)]
    pub system_registers_map: String,
    #[serde(default)]
    pub board_types_map: String,
    #[serde(default)]
    pub sys_commands: Vec<SysCommand>,
    #[serde(default)]
    pub registers_metadata: BTreeMap<String, Metadata>,
    #[serde(default)]
    pub parameters_metadata: BTreeMap<String, Metadata>,
    #[serde(default)]
    pub dashboards: Vec<Dashboard>,
}
impl Profile {
    pub fn commands(&self) -> Vec<SysCommand> {
        let mut commands = vec![
            SysCommand {
                code: 65000,
                name: "Read Flash".into(),
                description: "Load parameters from flash".into(),
            },
            SysCommand {
                code: 65001,
                name: "Write Flash".into(),
                description: "Persist parameters to flash".into(),
            },
            SysCommand {
                code: 65002,
                name: "Reset Firmware".into(),
                description: "Restart the device".into(),
            },
        ];
        commands.extend(
            self.sys_commands
                .iter()
                .filter(|c| !(65000..=65002).contains(&c.code))
                .cloned(),
        );
        commands
    }
    pub fn board_type_name(&self, id: u8) -> String {
        static PATTERN: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
        let pattern = PATTERN.get_or_init(|| {
            regex::Regex::new(r#"^\s*(\w+)\s*=\s*(\d+)(?:\s*,\s*"([^"]+)")?"#).unwrap()
        });
        for line in self.board_types_map.lines() {
            if let Some(c) = pattern.captures(line) {
                if c[2].parse::<u8>().ok() == Some(id) {
                    return c.get(3).map(|s| s.as_str().to_string()).unwrap_or_else(|| {
                        c[1].trim_start_matches("BOARD_TYPE_").replace('_', " ")
                    });
                }
            }
        }
        format!("Board type {id}")
    }
    pub fn apply_map_draft(&mut self, draft: &Profile) {
        self.registers_map = draft.registers_map.clone();
        self.parameters_map = draft.parameters_map.clone();
        // System register definitions belong to the datastream protocol, not the editor draft.
        self.board_types_map = draft.board_types_map.clone();
        self.sys_commands = draft.sys_commands.clone();
        self.registers_metadata = draft.registers_metadata.clone();
        self.parameters_metadata = draft.parameters_metadata.clone();
    }
    pub fn maps_differ(&self, other: &Profile) -> bool {
        let a = self.export();
        let b = other.export();
        a["maps"] != b["maps"] || a["metadata"] != b["metadata"]
    }
    pub fn map(&self, s: Space) -> &str {
        match s {
            Space::Register => &self.registers_map,
            Space::Parameter => &self.parameters_map,
            Space::SysRegister => &self.system_registers_map,
        }
    }
    pub fn map_mut(&mut self, s: Space) -> &mut String {
        match s {
            Space::Register => &mut self.registers_map,
            Space::Parameter => &mut self.parameters_map,
            Space::SysRegister => &mut self.system_registers_map,
        }
    }
    pub fn entries(&self, s: Space) -> Vec<Entry> {
        parse_map(self.map(s), s).unwrap_or_default()
    }
    pub fn resolve(&self, b: &Binding) -> Option<Entry> {
        self.entries(b.space)
            .into_iter()
            .find(|e| e.name == b.name && e.data_type == b.data_type)
    }
    pub fn metadata(&self, s: Space, name: &str) -> Option<&Metadata> {
        let name = name.split('[').next().unwrap_or(name);
        match s {
            Space::Register => self.registers_metadata.get(name),
            Space::Parameter => self.parameters_metadata.get(name),
            _ => None,
        }
    }
    pub fn export(&self) -> serde_json::Value {
        serde_json::json!({"dshub_profile":1,"name":self.name,"maps":{"registers":self.registers_map,"parameters":self.parameters_map,"systemRegisters":self.system_registers_map,"boardTypes":self.board_types_map,"sysCommands":self.sys_commands.iter().filter(|c|!(65000..=65002).contains(&c.code)).collect::<Vec<_>>()},"metadata":{"registers":self.registers_metadata,"parameters":self.parameters_metadata},"nativeDashboards":self.dashboards,"dashboards":crate::profile_compat::export_dashboards(&self.dashboards)})
    }
    pub fn import(text: &str) -> Result<Self, String> {
        let v: serde_json::Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
        if v["dshub_profile"] != 1 {
            return Err("Unsupported or missing dshub_profile version".into());
        }
        let name = v["name"]
            .as_str()
            .filter(|s| !s.trim().is_empty())
            .ok_or("Missing profile name")?;
        let mut p = default_profiles().remove(0);
        p.id = unique_id();
        p.name = name.into();
        p.is_default = false;
        p.registers_map = v["maps"]["registers"]
            .as_str()
            .ok_or("Missing registers map")?
            .into();
        p.parameters_map = v["maps"]["parameters"]
            .as_str()
            .ok_or("Missing parameters map")?
            .into();
        p.system_registers_map = v["maps"]["systemRegisters"]
            .as_str()
            .unwrap_or_default()
            .into();
        p.board_types_map = v["maps"]["boardTypes"].as_str().unwrap_or_default().into();
        p.sys_commands =
            serde_json::from_value(v["maps"]["sysCommands"].clone()).unwrap_or_default();
        p.registers_metadata =
            serde_json::from_value(v["metadata"]["registers"].clone()).unwrap_or_default();
        p.parameters_metadata =
            serde_json::from_value(v["metadata"]["parameters"].clone()).unwrap_or_default();
        p.dashboards = serde_json::from_value(v["nativeDashboards"].clone())
            .unwrap_or_else(|_| crate::profile_compat::import_dashboards(&v["dashboards"], &p));
        for s in Space::ALL {
            parse_map(p.map(s), s).map_err(|e| e.join("\n"))?;
        }
        Ok(p)
    }
}
pub fn unique_id() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(0);
    format!(
        "{}-{}",
        crate::communicator::now_ms() as u64,
        NEXT.fetch_add(1, Ordering::Relaxed)
    )
}
pub fn default_profiles() -> Vec<Profile> {
    let commands = vec![
        SysCommand {
            code: 65000,
            name: "Read Flash".into(),
            description: "Load parameters from flash".into(),
        },
        SysCommand {
            code: 65001,
            name: "Write Flash".into(),
            description: "Persist parameters to flash".into(),
        },
        SysCommand {
            code: 65002,
            name: "Reset Firmware".into(),
            description: "Restart the device".into(),
        },
    ];
    let mut profiles: Vec<Profile> = [
        (
            "default",
            "Default",
            include_str!("../assets/maps/registers.map"),
            include_str!("../assets/maps/parameters.map"),
            include_str!("../assets/maps/system_registers.map"),
        ),
        (
            "cnc_motor_controller",
            "CNC Motor Controller",
            include_str!("../assets/maps/cnc_registers.map"),
            include_str!("../assets/maps/cnc_parameters.map"),
            include_str!("../assets/maps/cnc_system_registers.map"),
        ),
    ]
    .into_iter()
    .map(|(id, name, r, p, s)| Profile {
        id: id.into(),
        name: name.into(),
        is_default: true,
        registers_map: r.into(),
        parameters_map: p.into(),
        system_registers_map: s.into(),
        board_types_map: include_str!("../assets/maps/boardtypes.map").into(),
        sys_commands: commands.clone(),
        registers_metadata: BTreeMap::new(),
        parameters_metadata: BTreeMap::new(),
        dashboards: vec![Dashboard {
            id: unique_id(),
            name: "Dashboard".into(),
            widgets: vec![],
        }],
    })
    .collect();
    let data: serde_json::Value =
        serde_json::from_str(include_str!("../assets/cnc-profile-data.json"))
            .expect("bundled CNC definitions");
    let cnc = &mut profiles[1];
    cnc.sys_commands.extend(
        serde_json::from_value::<Vec<SysCommand>>(data["CNC_SYS_COMMANDS"].clone())
            .expect("bundled commands"),
    );
    cnc.registers_metadata = serde_json::from_value(data["CNC_REGISTERS_METADATA"].clone())
        .expect("bundled register metadata");
    cnc.parameters_metadata = serde_json::from_value(data["CNC_PARAMETERS_METADATA"].clone())
        .expect("bundled parameter metadata");
    cnc.dashboards = crate::cnc_dashboard::dashboards(cnc);
    profiles
}
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Binding {
    pub space: Space,
    pub address: u16,
    pub name: String,
    pub data_type: String,
    #[serde(default)]
    pub array_size: Option<usize>,
}
impl Binding {
    pub fn new(space: Space, e: &Entry) -> Self {
        Self {
            space,
            address: e.address,
            name: e.name.clone(),
            data_type: e.data_type.clone(),
            array_size: e.array_size,
        }
    }
    pub fn matches(&self, p: &Profile) -> bool {
        p.entries(self.space).iter().any(|e| {
            e.address == self.address
                && e.name == self.name
                && e.data_type == self.data_type
                && e.array_size == self.array_size
        })
    }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum WidgetKind {
    ValueRead,
    Gauge,
    ProgressBar,
    EncoderDisplay,
    LedIndicator,
    StateLed,
    StatusMatrix,
    Button,
    Dropdown,
    ValueWrite,
    DirectionalControl,
    DataTable,
    AlarmList,
    DeviceInfo,
    Container,
    MiniPlot,
}
impl WidgetKind {
    pub const ALL: [Self; 16] = [
        Self::ValueRead,
        Self::Gauge,
        Self::ProgressBar,
        Self::EncoderDisplay,
        Self::LedIndicator,
        Self::StateLed,
        Self::StatusMatrix,
        Self::Button,
        Self::Dropdown,
        Self::ValueWrite,
        Self::DirectionalControl,
        Self::DataTable,
        Self::AlarmList,
        Self::DeviceInfo,
        Self::Container,
        Self::MiniPlot,
    ];
    pub fn title(self) -> &'static str {
        match self {
            Self::ValueRead => "Value Readout",
            Self::Gauge => "Gauge",
            Self::ProgressBar => "Progress Bar",
            Self::EncoderDisplay => "Encoder Display",
            Self::LedIndicator => "LED Indicator",
            Self::StateLed => "State LED",
            Self::StatusMatrix => "Status Matrix",
            Self::Button => "Button",
            Self::Dropdown => "Dropdown",
            Self::ValueWrite => "Value Write",
            Self::DirectionalControl => "Directional Control",
            Self::DataTable => "Data Table",
            Self::AlarmList => "Alarm List",
            Self::DeviceInfo => "Device Info",
            Self::Container => "Container",
            Self::MiniPlot => "Mini-Plot",
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Threshold {
    pub op: String,
    pub value: f64,
    pub role: String,
    pub label: String,
}
impl Threshold {
    pub fn matches(&self, v: f64) -> bool {
        match self.op.as_str() {
            ">" => v > self.value,
            ">=" => v >= self.value,
            "<" => v < self.value,
            "<=" => v <= self.value,
            "!=" => v != self.value,
            _ => v == self.value,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Widget {
    pub id: String,
    pub kind: WidgetKind,
    pub label: String,
    pub binding: Option<Binding>,
    pub min: f64,
    pub max: f64,
    pub factor: f64,
    pub unit: String,
    pub value: String,
    pub command: Option<u16>,
    pub options: Vec<ValueLabel>,
    pub thresholds: Vec<Threshold>,
    pub rows: Vec<Binding>,
    pub children: Vec<Widget>,
    pub width: f32,
    pub height: f32,
    /// Canvas coordinates relative to the containing dashboard or container.
    #[serde(default)]
    pub position: Option<[f32; 2]>,
    pub confirm: bool,
    #[serde(default)]
    pub format: DisplayFormat,
    #[serde(default)]
    pub directions: Vec<DirectionTarget>,
    #[serde(default)]
    pub row_styles: BTreeMap<String, RowStyle>,
    #[serde(default = "default_on_value")]
    pub on_value: f64,
    #[serde(default)]
    pub on_label: String,
    #[serde(default)]
    pub off_label: String,
    #[serde(default = "default_true")]
    pub show_inactive: bool,
    #[serde(default = "default_decimals")]
    pub decimals: usize,
    #[serde(default)]
    pub show_raw: bool,
    #[serde(default)]
    pub secondary_unit: String,
    #[serde(default)]
    pub vertical: bool,
    #[serde(default = "default_poll_ms")]
    pub poll_ms: u64,
    #[serde(default = "default_time_span")]
    pub time_span: f64,
    #[serde(default = "default_padding")]
    pub padding: f32,
    #[serde(default = "default_padding")]
    pub spacing: f32,
}
fn default_decimals() -> usize {
    3
}
fn default_poll_ms() -> u64 {
    250
}
fn default_time_span() -> f64 {
    60.
}
fn default_padding() -> f32 {
    8.
}
fn default_on_value() -> f64 {
    1.
}
fn default_true() -> bool {
    true
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectionTarget {
    pub direction: String,
    pub command: u16,
    #[serde(default)]
    pub label: String,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RowStyle {
    pub label: String,
    pub format: DisplayFormat,
    pub thresholds: Vec<Threshold>,
}

impl Widget {
    pub fn new(kind: WidgetKind) -> Self {
        Self {
            id: unique_id(),
            kind,
            label: kind.title().into(),
            binding: None,
            min: 0.,
            max: 100.,
            factor: 1.,
            unit: String::new(),
            value: "0".into(),
            command: None,
            options: vec![],
            thresholds: vec![],
            rows: vec![],
            children: vec![],
            width: 300.,
            height: 180.,
            position: None,
            confirm: false,
            format: DisplayFormat::default(),
            directions: vec![],
            row_styles: BTreeMap::new(),
            on_value: 1.,
            on_label: "On".into(),
            off_label: "Off".into(),
            show_inactive: true,
            decimals: 3,
            show_raw: false,
            secondary_unit: String::new(),
            vertical: false,
            poll_ms: 250,
            time_span: 60.,
            padding: 8.,
            spacing: 8.,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dashboard {
    pub id: String,
    pub name: String,
    pub widgets: Vec<Widget>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlotSeries {
    pub id: String,
    pub binding: Binding,
    pub enabled: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preferences {
    pub dark: bool,
    pub last_ip: String,
    pub udp: bool,
    pub auto_scan: bool,
    pub auto_connect: bool,
    #[serde(default = "default_retries")]
    pub auto_connect_retries: u32,
    #[serde(default = "default_retry_delay")]
    pub auto_connect_retry_delay: u64,
    pub poll_ms: u64,
    pub time_span: f64,
    pub max_points: usize,
    pub log_settings: crate::types::LogSettings,
}
fn default_retries() -> u32 {
    3
}
fn default_retry_delay() -> u64 {
    2000
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            dark: true,
            last_ip: "127.0.0.1".into(),
            udp: false,
            auto_scan: true,
            auto_connect: false,
            auto_connect_retries: 3,
            auto_connect_retry_delay: 2000,
            poll_ms: 100,
            time_span: 60.,
            max_points: 20000,
            log_settings: Default::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn maps_respect_boundary_and_arrays() {
        let e = parse_map("uint32_t A[2];\n// Read/Write\nfloat B;", Space::Register).unwrap();
        assert_eq!(e.len(), 3);
        assert!(!e[1].writable);
        assert!(e[2].writable);
        assert_eq!(e[2].address, 2);
    }
    #[test]
    fn map_rejects_duplicate_overflow_and_invalid_declaration() {
        for source in [
            "float A;\nfloat A;",
            "float A[65537];",
            "float A[0];",
            "garbage",
        ] {
            assert!(parse_map(source, Space::Register).is_err());
        }
    }
    #[test]
    fn float_and_unsigned_roundtrip() {
        for ty in ["float", "uint32_t", "int32_t", "hex"] {
            let e = Entry {
                address: 0,
                name: "V".into(),
                data_type: ty.into(),
                writable: true,
                array_size: None,
            };
            let text = match ty {
                "float" => "-2.5",
                "uint32_t" => "4294967295",
                "hex" => "0xFFFFFFFF",
                _ => "-2147483648",
            };
            let raw = e.encode(text).unwrap();
            assert_eq!(e.encode(&e.format(raw)).unwrap(), raw);
        }
    }
    #[test]
    fn profiles_roundtrip_and_shipped_maps_parse() {
        for p in default_profiles() {
            for s in Space::ALL {
                assert!(parse_map(p.map(s), s).is_ok(), "{} {:?}", p.name, s);
            }
            let q = Profile::import(&p.export().to_string()).unwrap();
            assert_eq!(p.registers_map, q.registers_map);
        }
    }
    #[test]
    fn binding_drift_requires_review() {
        let mut p = default_profiles().remove(0);
        p.registers_map = "float A;\nfloat B;".into();
        let b = Binding::new(Space::Register, &p.entries(Space::Register)[1]);
        p.registers_map = "float B;\nfloat A;".into();
        assert!(!b.matches(&p));
        assert_eq!(p.resolve(&b).unwrap().address, 0);
    }
}
