use crate::model::*;
use std::collections::HashSet;
/// Firmware-ready structure, with arrays consolidated and the access boundary preserved.
pub fn header(entries: &[Entry], space: Space) -> String {
    let name = match space {
        Space::Register => "ds_register_names_t",
        Space::Parameter => "ds_parameter_names_t",
        Space::SysRegister => "ds_system_register_names_t",
    };
    let mut out="#pragma once\n#include <stdint.h>\n\n#ifndef PACKED\n#define PACKED\n#endif\n\ntypedef struct PACKED\n{\n".to_string();
    let mut seen = HashSet::new();
    let mut boundary = false;
    for e in entries {
        if e.writable && !boundary {
            out.push_str("    // Read/Write\n");
            boundary = true;
        }
        let base = e.name.split('[').next().unwrap_or(&e.name);
        if !seen.insert(base) {
            continue;
        }
        let ty = if e.data_type == "hex" {
            "uint32_t"
        } else {
            &e.data_type
        };
        if let Some(size) = e.array_size {
            out.push_str(&format!("    {ty} {base}[{size}];\n"));
        } else {
            out.push_str(&format!("    {ty} {base};\n"));
        }
    }
    out.push_str(&format!("}} {name};\n"));
    if space == Space::Register {
        out.push_str(&format!(
            "#define DS_REGISTERS_READ_ONLY_COUNT {}\n",
            entries.iter().take_while(|e| !e.writable).count()
        ));
    }
    out
}
pub fn commands_map(commands: &[SysCommand]) -> String {
    commands
        .iter()
        .filter(|c| !(65000..=65002).contains(&c.code))
        .map(|c| {
            format!(
                "{} {} {}",
                c.code,
                c.name,
                serde_json::to_string(&c.description).unwrap()
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}
pub fn commands_header(commands: &[SysCommand]) -> String {
    let mut out = "#pragma once\n\ntypedef enum {\n".to_string();
    for c in commands
        .iter()
        .filter(|c| !(65000..=65002).contains(&c.code))
    {
        let name: String = c
            .name
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || c == '_' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        out.push_str(&format!("    {name} = {},\n", c.code));
    }
    out.push_str("} ds_sys_command_t;\n");
    out
}
pub fn parse_commands(text: &str) -> Result<Vec<SysCommand>, String> {
    let mut commands = vec![];
    let mut seen = HashSet::new();
    for (index, line) in text.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with("//") {
            continue;
        }
        let mut parts = line.splitn(2, char::is_whitespace);
        let code = parts
            .next()
            .unwrap()
            .parse::<u16>()
            .map_err(|_| format!("Line {}: invalid command code", index + 1))?;
        let rest = parts
            .next()
            .ok_or_else(|| format!("Line {}: missing name", index + 1))?
            .trim();
        let (name, description) = rest.split_once(char::is_whitespace).unwrap_or((rest, ""));
        if !seen.insert(code) {
            return Err(format!("Duplicate command code {code}"));
        }
        commands.push(SysCommand {
            code,
            name: name.into(),
            description: serde_json::from_str::<String>(description)
                .unwrap_or_else(|_| description.trim().into()),
        });
    }
    Ok(commands)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn firmware_header_roundtrip_preserves_addresses_and_access() {
        let entries =
            parse_map("uint32_t R[3];\n// Read/Write\nfloat V;", Space::Register).unwrap();
        assert_eq!(
            parse_map(&header(&entries, Space::Register), Space::Register).unwrap(),
            entries
        );
    }
    #[test]
    fn commands_map_roundtrips_descriptions() {
        let c = vec![SysCommand {
            code: 0,
            name: "ENABLE".into(),
            description: "Enable all motors".into(),
        }];
        let parsed = parse_commands(&commands_map(&c)).unwrap();
        assert_eq!(parsed[0].code, 0);
        assert_eq!(parsed[0].description, c[0].description);
    }
}
