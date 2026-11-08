//! Persistent domain state shared by every native viewport.
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};
use std::sync::{Arc, Mutex};

/// Declares a string-backed enum that keeps the persisted and portable text
/// form while the program works with variants. Unrecognised text maps to the
/// fallback, matching how the former interface treated it.
macro_rules! text_enum {
    ($(#[$meta:meta])* $name:ident, fallback $fallback:ident, { $($variant:ident => $text:literal),+ $(,)? }) => {
        $(#[$meta])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[serde(from = "String", into = "String")]
        pub enum $name { $($variant),+ }
        impl $name {
            pub const ALL: &'static [Self] = &[$(Self::$variant),+];
            pub fn as_str(self) -> &'static str {
                match self { $(Self::$variant => $text),+ }
            }
        }
        impl From<&str> for $name {
            fn from(text: &str) -> Self {
                match text { $($text => Self::$variant,)+ _ => Self::$fallback }
            }
        }
        impl From<String> for $name {
            fn from(text: String) -> Self {
                text.as_str().into()
            }
        }
        impl From<$name> for String {
            fn from(value: $name) -> Self {
                value.as_str().into()
            }
        }
        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str(self.as_str())
            }
        }
        impl From<$name> for eframe::egui::WidgetText {
            fn from(value: $name) -> Self {
                value.as_str().into()
            }
        }
    };
}

text_enum!(
    /// A map entry's C type. `Unknown` marks a binding whose snapshot recorded no
    /// type; it never matches an entry, so such bindings always need review.
    DataType, fallback Unknown, {
        Int32 => "int32_t",
        Uint32 => "uint32_t",
        Float => "float",
        Hex => "hex",
        Unknown => "",
    }
);
impl DataType {
    /// The types a map may declare.
    pub const DECLARABLE: [Self; 4] = [Self::Int32, Self::Uint32, Self::Float, Self::Hex];
}
text_enum!(
    /// Threshold comparison. Unknown comparators compare for equality.
    Comparator, fallback Eq, {
        Eq => "==",
        Ne => "!=",
        Gt => ">",
        Ge => ">=",
        Lt => "<",
        Le => "<=",
    }
);
text_enum!(
    /// Semantic status colour role.
    Role, fallback Idle, {
        Ok => "ok",
        Warn => "warn",
        Error => "error",
        Info => "info",
        Accent => "accent",
        Idle => "idle",
    }
);
impl Role {
    /// Roles a user may assign to a threshold, in the order offered.
    pub const THRESHOLD: [Self; 6] = [
        Self::Idle,
        Self::Error,
        Self::Warn,
        Self::Ok,
        Self::Info,
        Self::Accent,
    ];
}
text_enum!(
    /// Jog direction of a directional control button.
    Direction, fallback Up, {
        Up => "up",
        Down => "down",
        Left => "left",
        Right => "right",
        UpLeft => "upLeft",
        UpRight => "upRight",
        DownLeft => "downLeft",
        DownRight => "downRight",
    }
);
impl Direction {
    /// Column and row on a 3×3 compass grid, north at the top.
    pub fn cell(self) -> (usize, usize) {
        match self {
            Self::UpLeft => (0, 0),
            Self::Up => (1, 0),
            Self::UpRight => (2, 0),
            Self::Left => (0, 1),
            Self::Right => (2, 1),
            Self::DownLeft => (0, 2),
            Self::Down => (1, 2),
            Self::DownRight => (2, 2),
        }
    }
    pub fn arrow(self) -> &'static str {
        match self {
            Self::Up => egui_phosphor::regular::ARROW_UP,
            Self::Down => egui_phosphor::regular::ARROW_DOWN,
            Self::Left => egui_phosphor::regular::ARROW_LEFT,
            Self::Right => egui_phosphor::regular::ARROW_RIGHT,
            Self::UpLeft => egui_phosphor::regular::ARROW_UP_LEFT,
            Self::UpRight => egui_phosphor::regular::ARROW_UP_RIGHT,
            Self::DownLeft => egui_phosphor::regular::ARROW_DOWN_LEFT,
            Self::DownRight => egui_phosphor::regular::ARROW_DOWN_RIGHT,
        }
    }
}

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
    /// Each entry in its declared type: integers in decimal, floats as floats,
    /// hex entries in hexadecimal. Offered by the Register and Parameter panes
    /// only; dashboard widgets keep the three portable Profile formats.
    Native,
}
impl DisplayFormat {
    /// The formats a dashboard widget can use (portable Profile format v1).
    pub const ALL: [Self; 3] = [Self::Decimal, Self::Hexadecimal, Self::Binary];
    pub fn title(self) -> &'static str {
        match self {
            Self::Native => "Default",
            Self::Decimal => "Decimal",
            Self::Hexadecimal => "Hexadecimal",
            Self::Binary => "Binary",
        }
    }
    /// Like [`Self::format`], but the Default view shows engineering values
    /// for entries that declare scaling.
    pub fn format_with(self, e: &Entry, raw: i32, meta: Option<&Metadata>) -> String {
        match (self, meta.and_then(Metadata::scaling)) {
            (Self::Native, Some(_)) => format_number(e.engineering(raw, meta)),
            _ => self.format(e, raw),
        }
    }
    /// The inverse of [`Self::format_with`].
    pub fn encode_with(
        self,
        e: &Entry,
        text: &str,
        meta: Option<&Metadata>,
    ) -> Result<i32, String> {
        match (self, meta.and_then(Metadata::scaling)) {
            (Self::Native, Some(_)) => {
                let value = text
                    .trim()
                    .parse::<f64>()
                    .map_err(|_| "Expected a number".to_string())?;
                e.from_engineering(value, meta)
            }
            _ => self.encode(e, text),
        }
    }
    pub fn format(self, e: &Entry, raw: i32) -> String {
        match self {
            Self::Native => e.format(raw),
            Self::Decimal => {
                if e.data_type == DataType::Hex {
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
            Self::Native | Self::Decimal => e.encode(text),
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
    pub data_type: DataType,
    pub writable: bool,
    #[serde(default)]
    pub array_size: Option<usize>,
}
impl Entry {
    pub fn decode(&self, value: i32) -> f64 {
        match self.data_type {
            DataType::Float => f32::from_bits(value as u32) as f64,
            DataType::Uint32 | DataType::Hex => value as u32 as f64,
            _ => value as f64,
        }
    }
    /// The decoded value with the entry's engineering scaling applied.
    pub fn engineering(&self, raw: i32, meta: Option<&Metadata>) -> f64 {
        let decoded = self.decode(raw);
        match meta.and_then(Metadata::scaling) {
            Some((scale, offset)) => decoded * scale + offset,
            None => decoded,
        }
    }
    /// The raw value for an engineering value: the inverse of [`Self::engineering`].
    pub fn from_engineering(&self, value: f64, meta: Option<&Metadata>) -> Result<i32, String> {
        let (scale, offset) = meta.and_then(Metadata::scaling).unwrap_or((1., 0.));
        if scale == 0. {
            return Err(format!("{} has a scale of zero", self.name));
        }
        let decoded = (value - offset) / scale;
        if !decoded.is_finite() {
            return Err("Expected a finite number".into());
        }
        match self.data_type {
            DataType::Float => Ok((decoded as f32).to_bits() as i32),
            DataType::Uint32 | DataType::Hex => {
                let v = decoded.round();
                if (0.0..=u32::MAX as f64).contains(&v) {
                    Ok(v as u32 as i32)
                } else {
                    Err("Out of range for an unsigned 32-bit value".into())
                }
            }
            _ => {
                let v = decoded.round();
                if (i32::MIN as f64..=i32::MAX as f64).contains(&v) {
                    Ok(v as i32)
                } else {
                    Err("Out of range for a signed 32-bit value".into())
                }
            }
        }
    }
    pub fn format(&self, value: i32) -> String {
        match self.data_type {
            DataType::Hex => format!("0x{:08X}", value as u32),
            DataType::Float => format_float(f32::from_bits(value as u32)),
            DataType::Uint32 => (value as u32).to_string(),
            _ => value.to_string(),
        }
    }
    pub fn encode(&self, text: &str) -> Result<i32, String> {
        let text = text.trim();
        if self.data_type == DataType::Float {
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
        if matches!(self.data_type, DataType::Uint32 | DataType::Hex) {
            text.parse::<u32>()
                .map(|x| x as i32)
                .map_err(|_| "Expected an unsigned 32-bit value".into())
        } else {
            text.parse::<i32>()
                .map_err(|_| "Expected a signed 32-bit value".into())
        }
    }
}
/// Shortest round-trip text for a float, switching to exponent notation where
/// plain decimals would run to dozens of digits.
pub fn format_float(v: f32) -> String {
    let magnitude = v.abs();
    if v == 0. || !v.is_finite() || (1e-4..1e9).contains(&magnitude) {
        v.to_string()
    } else {
        format!("{v:e}")
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
        let mut rest = line;
        while !rest.is_empty() {
            if block {
                match rest.find("*/") {
                    Some(end) => {
                        block = false;
                        rest = &rest[end + 2..];
                    }
                    None => rest = "",
                }
            } else {
                let open = rest.find("/*");
                let comment = rest.find("//");
                match (open, comment) {
                    (_, Some(c)) if open.is_none_or(|o| c < o) => {
                        clean.push_str(&rest[..c]);
                        rest = "";
                    }
                    (Some(o), _) => {
                        clean.push_str(&rest[..o]);
                        block = true;
                        rest = &rest[o + 2..];
                    }
                    _ => {
                        clean.push_str(rest);
                        rest = "";
                    }
                }
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
            errors.push(format!(
                "Line {}: invalid declaration \"{clean}\" (expected e.g. \"float NAME;\" or \"uint32_t NAME[4];\")",
                line_no + 1
            ));
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
                data_type: c[1].into(),
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
/// A parsed map with indexed lookups.
#[derive(Debug, Default)]
pub struct ParsedMap {
    pub entries: Vec<Entry>,
    pub errors: Vec<String>,
    by_address: HashMap<u16, usize>,
    by_name: HashMap<String, usize>,
}
impl ParsedMap {
    fn new(text: &str, space: Space) -> Self {
        let (entries, errors) = match parse_map(text, space) {
            Ok(entries) => (entries, vec![]),
            Err(errors) => (vec![], errors),
        };
        let by_address = entries
            .iter()
            .enumerate()
            .map(|(i, e)| (e.address, i))
            .collect();
        let by_name = entries
            .iter()
            .enumerate()
            .map(|(i, e)| (e.name.clone(), i))
            .collect();
        Self {
            entries,
            errors,
            by_address,
            by_name,
        }
    }
    pub fn at(&self, address: u16) -> Option<&Entry> {
        self.by_address.get(&address).map(|&i| &self.entries[i])
    }
    pub fn named(&self, name: &str) -> Option<&Entry> {
        self.by_name.get(name).map(|&i| &self.entries[i])
    }
}

/// Parses `text`, reusing an earlier parse of identical text.
///
/// Maps are looked up many times per frame (every binding check, reading and
/// table row); parsing them each time made frame cost grow with map size times
/// the number of bindings. Comparing the text against a few cached sources is
/// a length check plus at most one memcmp per entry.
pub fn parsed_map(text: &str, space: Space) -> Arc<ParsedMap> {
    const CAPACITY: usize = 32;
    type Cache = Mutex<VecDeque<(Space, Arc<str>, Arc<ParsedMap>)>>;
    static CACHE: std::sync::OnceLock<Cache> = std::sync::OnceLock::new();
    let cache = CACHE.get_or_init(Default::default);
    if let Some((_, _, parsed)) = cache
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .iter()
        .find(|(s, source, _)| *s == space && &**source == text)
    {
        return parsed.clone();
    }
    let parsed = Arc::new(ParsedMap::new(text, space));
    let mut cache = cache.lock().unwrap_or_else(|e| e.into_inner());
    cache.push_front((space, text.into(), parsed.clone()));
    cache.truncate(CAPACITY);
    parsed
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SysCommand {
    pub code: u16,
    pub name: String,
    #[serde(default)]
    pub description: String,
    /// Always confirmed, with a press-and-hold, wherever it is sent.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub critical: bool,
}
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Metadata {
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub unit: String,
    #[serde(default)]
    pub value_list: Vec<ValueLabel>,
    /// Engineering value = decoded value × scale + offset. Shared by tables,
    /// the Inspector, plots and widgets.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scale: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offset: Option<f64>,
    /// Write limits in engineering units, checked before a write is sent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    /// Names of individual bits, for status words.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub bits: Vec<BitLabel>,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BitLabel {
    pub bit: u8,
    pub label: String,
}
impl Metadata {
    pub fn bit_name(&self, bit: u8) -> Option<&str> {
        self.bits
            .iter()
            .find(|b| b.bit == bit)
            .map(|b| b.label.as_str())
            .filter(|l| !l.is_empty())
    }
    /// (scale, offset) when the entry declares engineering scaling.
    pub fn scaling(&self) -> Option<(f64, f64)> {
        (self.scale.is_some() || self.offset.is_some())
            .then(|| (self.scale.unwrap_or(1.), self.offset.unwrap_or(0.)))
    }
    /// Refuses a raw value whose engineering value is outside min/max.
    pub fn check(&self, e: &Entry, raw: i32) -> Result<(), String> {
        let value = e.engineering(raw, Some(self));
        let unit = if self.unit.is_empty() {
            String::new()
        } else {
            format!(" {}", self.unit)
        };
        if let Some(min) = self.min.filter(|min| value < *min) {
            return Err(format!(
                "{} is below the minimum {}{unit} for {}",
                format_number(value),
                format_number(min),
                e.name
            ));
        }
        if let Some(max) = self.max.filter(|max| value > *max) {
            return Err(format!(
                "{} is above the maximum {}{unit} for {}",
                format_number(value),
                format_number(max),
                e.name
            ));
        }
        Ok(())
    }
}
/// Shortest text for an engineering value.
pub fn format_number(v: f64) -> String {
    let magnitude = v.abs();
    if v == 0. || !v.is_finite() || (1e-4..1e12).contains(&magnitude) {
        let text = format!("{v:.9}");
        let text = text.trim_end_matches('0').trim_end_matches('.');
        if text == "-0" {
            "0".into()
        } else {
            text.into()
        }
    } else {
        format!("{v:e}")
    }
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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
        let mut commands = library_commands();
        commands.extend(
            self.sys_commands
                .iter()
                .filter(|c| !(65000..=65002).contains(&c.code))
                .cloned(),
        );
        commands
    }
    /// The catalogued command for `code`, library commands included.
    pub fn command(&self, code: u16) -> Option<SysCommand> {
        self.commands().into_iter().find(|c| c.code == code)
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
    /// Whether maps, commands or metadata differ (what a Map Editor draft edits).
    pub fn maps_differ(&self, other: &Profile) -> bool {
        let profile_commands = |p: &Profile| {
            p.sys_commands
                .iter()
                .filter(|c| !(65000..=65002).contains(&c.code))
                .cloned()
                .collect::<Vec<_>>()
        };
        self.registers_map != other.registers_map
            || self.parameters_map != other.parameters_map
            || self.system_registers_map != other.system_registers_map
            || self.board_types_map != other.board_types_map
            || self.registers_metadata != other.registers_metadata
            || self.parameters_metadata != other.parameters_metadata
            || profile_commands(self) != profile_commands(other)
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
    /// The parsed map for `s`; an invalid map has no entries.
    pub fn parsed(&self, s: Space) -> Arc<ParsedMap> {
        parsed_map(self.map(s), s)
    }
    pub fn entries(&self, s: Space) -> Vec<Entry> {
        self.parsed(s).entries.clone()
    }
    pub fn entry_at(&self, s: Space, address: u16) -> Option<Entry> {
        self.parsed(s).at(address).cloned()
    }
    pub fn resolve(&self, b: &Binding) -> Option<Entry> {
        self.parsed(b.space)
            .named(&b.name)
            .filter(|e| e.data_type == b.data_type)
            .cloned()
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
        let mut p = Profile::template();
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
impl Profile {
    /// A blank, non-default Profile carrying the protocol's system registers,
    /// board types and library commands.
    pub fn template() -> Self {
        Profile {
            id: unique_id(),
            name: String::new(),
            is_default: false,
            registers_map: String::new(),
            parameters_map: String::new(),
            system_registers_map: include_str!("../assets/maps/system_registers.map").into(),
            board_types_map: include_str!("../assets/maps/boardtypes.map").into(),
            sys_commands: library_commands(),
            registers_metadata: BTreeMap::new(),
            parameters_metadata: BTreeMap::new(),
            dashboards: vec![],
        }
    }
}
fn library_commands() -> Vec<SysCommand> {
    vec![
        SysCommand {
            code: 65000,
            name: "Read Flash".into(),
            description: "Load parameters from flash".into(),
            critical: false,
        },
        SysCommand {
            code: 65001,
            name: "Write Flash".into(),
            description: "Persist parameters to flash".into(),
            critical: true,
        },
        SysCommand {
            code: 65002,
            name: "Reset Firmware".into(),
            description: "Restart the device".into(),
            critical: true,
        },
    ]
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
    let commands = library_commands();
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
    let showcase = crate::showcase_dashboard::dashboard(&profiles[0]);
    profiles[0].dashboards.insert(0, showcase);
    profiles
}
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Binding {
    pub space: Space,
    pub address: u16,
    pub name: String,
    pub data_type: DataType,
    #[serde(default)]
    pub array_size: Option<usize>,
}
impl Binding {
    pub fn new(space: Space, e: &Entry) -> Self {
        Self {
            space,
            address: e.address,
            name: e.name.clone(),
            data_type: e.data_type,
            array_size: e.array_size,
        }
    }
    pub fn matches(&self, p: &Profile) -> bool {
        p.parsed(self.space).at(self.address).is_some_and(|e| {
            e.name == self.name && e.data_type == self.data_type && e.array_size == self.array_size
        })
    }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum WidgetKind {
    ValueRead,
    Gauge,
    ProgressBar,
    EncoderDisplay,
    /// The former LED Indicator: read from older dashboards only, and turned
    /// into a [`WidgetKind::StateLed`] as they load (see [`Dashboard`]).
    #[doc(hidden)]
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
    /// Plain text on the canvas: no card, title or binding.
    Label,
}
impl WidgetKind {
    pub const ALL: [Self; 16] = [
        Self::ValueRead,
        Self::Gauge,
        Self::ProgressBar,
        Self::EncoderDisplay,
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
        Self::Label,
    ];
    /// Drawn without a card: the control or text itself is the widget.
    pub fn frameless(self) -> bool {
        matches!(
            self,
            Self::Button
                | Self::Label
                | Self::ValueRead
                | Self::StateLed
                | Self::Dropdown
                | Self::ProgressBar
                | Self::ValueWrite
        )
    }
    /// Smallest canvas height. A widget whose content is one line (a value,
    /// lamp, bar, menu or input) shrinks to one line of text, plus the card's
    /// padding when it has one; the rest keep room for a title and content.
    pub fn min_height(self) -> f32 {
        match self {
            kind if kind.frameless() => 24.,
            Self::EncoderDisplay => 36.,
            _ => 48.,
        }
    }
    pub fn title(self) -> &'static str {
        match self {
            Self::ValueRead => "Value Readout",
            Self::Gauge => "Gauge",
            Self::ProgressBar => "Progress Bar",
            Self::EncoderDisplay => "Encoder Display",
            Self::StateLed | Self::LedIndicator => "State LED",
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
            Self::Label => "Label",
        }
    }
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Threshold {
    pub op: Comparator,
    pub value: f64,
    pub role: Role,
    pub label: String,
    /// A chosen colour shown instead of the role's palette colour. The role
    /// still says how serious the state is.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<[u8; 3]>,
}
impl Threshold {
    pub fn new(op: Comparator, value: f64, role: Role, label: impl Into<String>) -> Self {
        Self {
            op,
            value,
            role,
            label: label.into(),
            color: None,
        }
    }
    pub fn matches(&self, v: f64) -> bool {
        match self.op {
            Comparator::Gt => v > self.value,
            Comparator::Ge => v >= self.value,
            Comparator::Lt => v < self.value,
            Comparator::Le => v <= self.value,
            Comparator::Ne => v != self.value,
            Comparator::Eq => v == self.value,
        }
    }
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
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
    /// Settings of the former LED Indicator, read only to turn it into a
    /// State LED's states.
    #[serde(default = "default_on_value", skip_serializing)]
    on_value: f64,
    #[serde(default = "default_on_label", skip_serializing)]
    on_label: String,
    #[serde(default = "default_off_label", skip_serializing)]
    off_label: String,
    #[serde(default = "default_true")]
    pub show_inactive: bool,
    /// Status Matrix width: 8, 16 or 32 bits.
    #[serde(default = "default_bit_count")]
    pub bit_count: u8,
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
    /// Scale of the widget's text, 1 = the theme's sizes.
    #[serde(default = "default_text_size")]
    pub text_size: f32,
    /// Progress Bar and Value Write: show the current value as text.
    #[serde(default = "default_true")]
    pub show_value: bool,
}
fn default_text_size() -> f32 {
    1.
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
fn default_on_label() -> String {
    "On".into()
}
fn default_off_label() -> String {
    "Off".into()
}
fn default_bit_count() -> u8 {
    32
}
fn default_true() -> bool {
    true
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DirectionTarget {
    pub direction: Direction,
    pub command: u16,
    #[serde(default)]
    pub label: String,
}
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct RowStyle {
    pub label: String,
    pub format: DisplayFormat,
    pub thresholds: Vec<Threshold>,
}

impl Default for Widget {
    fn default() -> Self {
        Self::new(WidgetKind::ValueRead)
    }
}
/// The states of a former LED Indicator: lit in the colour of the rule that
/// matched its on value, otherwise its off label in the idle colour.
pub fn led_states(
    on_value: f64,
    on_label: &str,
    off_label: &str,
    colours: &[Threshold],
) -> Vec<Threshold> {
    let lit = colours.iter().find(|t| t.matches(on_value));
    let mut on = Threshold::new(
        Comparator::Eq,
        on_value,
        lit.map_or(Role::Ok, |t| t.role),
        lit.map(|t| t.label.as_str())
            .filter(|l| !l.trim().is_empty())
            .unwrap_or(on_label),
    );
    on.color = lit.and_then(|t| t.color);
    let mut states = vec![on];
    if !off_label.trim().is_empty() {
        states.push(Threshold::new(
            Comparator::Ne,
            on_value,
            Role::Idle,
            off_label,
        ));
    }
    states
}
impl Widget {
    /// Turns a former LED Indicator, here and in containers, into a State LED.
    pub fn convert_legacy(&mut self) {
        if self.kind == WidgetKind::LedIndicator {
            self.kind = WidgetKind::StateLed;
            self.thresholds = led_states(
                self.on_value,
                &self.on_label,
                &self.off_label,
                &self.thresholds,
            );
        }
        self.children.iter_mut().for_each(Widget::convert_legacy);
    }
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
            height: if kind == WidgetKind::Label { 24. } else { 180. },
            position: None,
            confirm: false,
            format: DisplayFormat::default(),
            directions: vec![],
            row_styles: BTreeMap::new(),
            on_value: 1.,
            on_label: "On".into(),
            off_label: "Off".into(),
            show_inactive: true,
            bit_count: 32,
            decimals: 3,
            show_raw: false,
            secondary_unit: String::new(),
            vertical: false,
            poll_ms: 250,
            time_span: 60.,
            padding: 8.,
            spacing: 8.,
            text_size: 1.,
            show_value: true,
        }
    }
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(from = "DashboardData")]
pub struct Dashboard {
    pub id: String,
    pub name: String,
    pub widgets: Vec<Widget>,
}
/// A dashboard as stored, before older widget kinds are converted.
#[derive(Deserialize)]
struct DashboardData {
    id: String,
    name: String,
    widgets: Vec<Widget>,
}
impl From<DashboardData> for Dashboard {
    fn from(d: DashboardData) -> Self {
        let mut widgets = d.widgets;
        widgets.iter_mut().for_each(Widget::convert_legacy);
        Self {
            id: d.id,
            name: d.name,
            widgets,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlotSeries {
    pub id: String,
    pub binding: Binding,
    pub enabled: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
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
    /// Devices connected to most recently, newest first.
    pub recent: Vec<RecentDevice>,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecentDevice {
    /// `ip:port` as connected.
    pub address: String,
    pub udp: bool,
    #[serde(default)]
    pub name: Option<String>,
}
impl Preferences {
    /// How many recent devices are remembered.
    pub const RECENT: usize = 6;
    /// Moves a successful connection to the front of the recent list;
    /// returns whether the list changed.
    pub fn remember(&mut self, device: RecentDevice) -> bool {
        if self.recent.first() == Some(&device) {
            return false;
        }
        self.recent
            .retain(|d| !(d.address == device.address && d.udp == device.udp));
        self.recent.insert(0, device);
        self.recent.truncate(Self::RECENT);
        true
    }
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
            recent: vec![],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn former_led_indicators_load_as_state_leds() {
        // A native dashboard saved before the LED Indicator was merged, with
        // one inside a container.
        let text = r#"{"id":"d","name":"Old","widgets":[
            {"kind":"LedIndicator","on_value":2,"on_label":"Held","off_label":"Free",
             "thresholds":[{"op":"==","value":2,"role":"warn","label":""}]},
            {"kind":"Container","children":[{"kind":"LedIndicator","off_label":""}]}]}"#;
        let d: Dashboard = serde_json::from_str(text).unwrap();
        let led = &d.widgets[0];
        assert_eq!(led.kind, WidgetKind::StateLed);
        assert_eq!(
            led.thresholds,
            vec![
                Threshold::new(Comparator::Eq, 2., Role::Warn, "Held"),
                Threshold::new(Comparator::Ne, 2., Role::Idle, "Free"),
            ]
        );
        let inner = &d.widgets[1].children[0];
        assert_eq!(inner.kind, WidgetKind::StateLed);
        assert_eq!(
            inner.thresholds,
            vec![Threshold::new(Comparator::Eq, 1., Role::Ok, "On")]
        );
        // Saved again, nothing of the former kind remains.
        let saved = serde_json::to_string(&d).unwrap();
        assert!(!saved.contains("LedIndicator") && !saved.contains("on_label"));
    }
    #[test]
    fn threshold_colours_are_optional() {
        let mut t: Threshold =
            serde_json::from_str(r#"{"op":">","value":1,"role":"warn","label":""}"#).unwrap();
        assert_eq!(t.color, None);
        assert!(!serde_json::to_string(&t).unwrap().contains("color"));
        t.color = Some([1, 2, 3]);
        let back: Threshold = serde_json::from_str(&serde_json::to_string(&t).unwrap()).unwrap();
        assert_eq!(back, t);
    }
    #[test]
    fn one_line_widgets_shrink_to_one_line_of_text() {
        for kind in [
            WidgetKind::Button,
            WidgetKind::Label,
            WidgetKind::ValueRead,
            WidgetKind::StateLed,
            WidgetKind::Dropdown,
            WidgetKind::ProgressBar,
            WidgetKind::ValueWrite,
        ] {
            assert_eq!(kind.min_height(), 24., "{kind:?}");
        }
        assert_eq!(WidgetKind::EncoderDisplay.min_height(), 36.);
        assert_eq!(WidgetKind::Gauge.min_height(), 48.);
    }
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
        for ty in DataType::DECLARABLE {
            let e = Entry {
                address: 0,
                name: "V".into(),
                data_type: ty,
                writable: true,
                array_size: None,
            };
            let text = match ty {
                DataType::Float => "-2.5",
                DataType::Uint32 => "4294967295",
                DataType::Hex => "0xFFFFFFFF",
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

#[cfg(test)]
mod parse_tests {
    use super::*;

    #[test]
    fn recent_devices_are_unique_newest_first_and_bounded() {
        let mut prefs = Preferences::default();
        let device = |n: usize, udp| RecentDevice {
            address: format!("10.0.0.{n}:2009"),
            udp,
            name: None,
        };
        for n in 0..8 {
            assert!(prefs.remember(device(n, false)));
        }
        assert!(!prefs.remember(device(7, false)));
        assert!(prefs.remember(device(3, false)));
        assert!(prefs.remember(device(3, true)));
        let order: Vec<_> = prefs
            .recent
            .iter()
            .map(|d| (d.address.clone(), d.udp))
            .collect();
        assert_eq!(prefs.recent.len(), Preferences::RECENT);
        assert_eq!(order[0], ("10.0.0.3:2009".into(), true));
        assert_eq!(order[1], ("10.0.0.3:2009".into(), false));
        assert_eq!(order[2], ("10.0.0.7:2009".into(), false));
    }

    #[test]
    fn engineering_scaling_round_trips_and_limits_are_checked() {
        let e = &parse_map("int32_t T;", Space::Register).unwrap()[0];
        let meta = Metadata {
            unit: "°C".into(),
            scale: Some(0.1),
            offset: Some(-40.),
            min: Some(-20.),
            max: Some(85.),
            ..Default::default()
        };
        let native = DisplayFormat::Native;
        assert_eq!(native.format_with(e, 650, Some(&meta)), "25");
        assert_eq!(native.encode_with(e, "25", Some(&meta)), Ok(650));
        assert_eq!(
            DisplayFormat::Decimal.format_with(e, 650, Some(&meta)),
            "650"
        );
        assert!(meta.check(e, 650).is_ok());
        assert_eq!(
            meta.check(e, 100).unwrap_err(),
            "-30 is below the minimum -20 °C for T"
        );
        assert!(meta
            .check(e, 1300)
            .unwrap_err()
            .contains("above the maximum 85"));
        assert!(Metadata::default().scaling().is_none());
    }

    #[test]
    fn default_format_shows_each_entry_in_its_declared_type() {
        let e = parse_map("int32_t I;\nuint32_t U;\nfloat F;\nhex H;", Space::Register).unwrap();
        let native = DisplayFormat::Native;
        assert_eq!(native.format(&e[0], -5), "-5");
        assert_eq!(native.format(&e[1], -1), "4294967295");
        assert_eq!(native.format(&e[2], 1.5_f32.to_bits() as i32), "1.5");
        assert_eq!(native.format(&e[3], 255), "0x000000FF");
        for (entry, text) in e.iter().zip(["-5", "7", "1.5", "0xFF"]) {
            let raw = native.encode(entry, text).unwrap();
            assert_eq!(native.encode(entry, &native.format(entry, raw)), Ok(raw));
        }
    }

    #[test]
    fn comments_and_non_ascii_text_are_handled_per_character() {
        let e = parse_map(
            "float A; // température °C\n/* bloc\n é */ uint32_t B[2]; /* x */\nhex C;",
            Space::Parameter,
        )
        .unwrap();
        let names: Vec<_> = e.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, ["A", "B[0]", "B[1]", "C"]);
    }

    #[test]
    fn extreme_floats_use_exponent_notation_and_round_trip() {
        let e = Entry {
            address: 0,
            name: "F".into(),
            data_type: DataType::Float,
            writable: true,
            array_size: None,
        };
        for raw in [
            2,
            0x0080_0000,
            f32::MAX.to_bits() as i32,
            1.5f32.to_bits() as i32,
        ] {
            let text = e.format(raw);
            assert!(text.len() < 16, "{text}");
            assert_eq!(e.encode(&text).unwrap(), raw);
        }
        assert_eq!(e.format(1.5f32.to_bits() as i32), "1.5");
    }

    #[test]
    fn invalid_declarations_quote_the_offending_text() {
        let errors = parse_map("floot A;", Space::Register).unwrap_err();
        assert!(errors[0].contains("floot A;"), "{errors:?}");
    }

    #[test]
    fn parsed_maps_are_shared_and_indexed() {
        let text = "float A;\nuint32_t B[2];";
        let first = parsed_map(text, Space::Register);
        assert!(Arc::ptr_eq(&first, &parsed_map(text, Space::Register)));
        assert_eq!(first.at(2).unwrap().name, "B[1]");
        assert_eq!(first.named("A").unwrap().address, 0);
        assert!(!Arc::ptr_eq(&first, &parsed_map(text, Space::Parameter)));
    }

    #[test]
    fn text_enums_keep_their_portable_spelling() {
        let t: Threshold =
            serde_json::from_str(r#"{"op":">=","value":1,"role":"warn","label":""}"#).unwrap();
        assert_eq!((t.op, t.role), (Comparator::Ge, Role::Warn));
        assert_eq!(
            serde_json::to_value(&t).unwrap(),
            serde_json::json!({"op":">=","value":1.0,"role":"warn","label":""})
        );
        assert_eq!(DataType::from(""), DataType::Unknown);
        assert_eq!(Role::from("typo"), Role::Idle);
    }
}
