//! Session recording: every reading that arrives is appended to a CSV file,
//! which can later be replayed offline into Plot panes.
use crate::model::*;
use crate::types::RegisterData;
use std::collections::{BTreeMap, VecDeque};
use std::io::Write;
use std::path::PathBuf;

const HEADER: &str = "time_ms,space,address,name,raw,value";

pub struct Recorder {
    writer: std::io::BufWriter<std::fs::File>,
    pub path: PathBuf,
    pub samples: usize,
    pub started: f64,
    /// The first write failure; the session stops the recording and reports it.
    pub error: Option<String>,
}

/// Where recordings are written.
pub fn dir() -> Option<PathBuf> {
    eframe::storage_dir("DSHub").map(|dir| dir.join("recordings"))
}

impl Recorder {
    pub fn start() -> Result<Self, String> {
        let dir = dir().ok_or("No application data folder is available")?;
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let name = format!(
            "recording-{}.csv",
            jiff::Timestamp::now().strftime("%Y%m%d-%H%M%S")
        );
        let path = dir.join(name);
        let file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
        let mut writer = std::io::BufWriter::new(file);
        writeln!(writer, "{HEADER}").map_err(|e| e.to_string())?;
        Ok(Self {
            writer,
            path,
            samples: 0,
            started: crate::communicator::now_ms(),
            error: None,
        })
    }
    pub fn write(&mut self, s: Space, r: &RegisterData, entry: Option<&Entry>) {
        let name = entry.map_or(r.name.as_str(), |e| e.name.as_str());
        let value = entry.map_or(r.value as f64, |e| e.decode(r.value));
        let written = writeln!(
            self.writer,
            "{:.3},{},{},{},{},{}",
            r.timestamp,
            space_key(s),
            r.address,
            name.replace(',', " "),
            r.value,
            value
        );
        match written {
            Ok(()) => self.samples += 1,
            Err(e) => {
                self.error.get_or_insert(e.to_string());
            }
        }
    }
    /// Flushes the file; returns its path.
    pub fn finish(mut self) -> Result<PathBuf, String> {
        self.writer.flush().map_err(|e| e.to_string())?;
        Ok(self.path)
    }
}

fn space_key(s: Space) -> &'static str {
    match s {
        Space::Register => "register",
        Space::Parameter => "parameter",
        Space::SysRegister => "system",
    }
}

/// One recorded address: where it was read, its name and its samples
/// (`[seconds, decoded value]`, time-ordered).
pub struct Track {
    pub space: Space,
    pub address: u16,
    pub name: String,
    pub points: VecDeque<[f64; 2]>,
}

/// Reads a recording back. Unreadable lines are skipped; a file without the
/// expected header is refused.
pub fn parse(text: &str) -> Result<Vec<Track>, String> {
    let mut lines = text.lines();
    if lines.next().map(str::trim) != Some(HEADER) {
        return Err("Not a DSHub recording (unexpected header)".into());
    }
    let mut tracks: BTreeMap<(Space, u16), Track> = BTreeMap::new();
    for line in lines {
        let fields: Vec<&str> = line.split(',').collect();
        let [time, space, address, name, _raw, value] = fields[..] else {
            continue;
        };
        let space = match space {
            "register" => Space::Register,
            "parameter" => Space::Parameter,
            "system" => Space::SysRegister,
            _ => continue,
        };
        let (Ok(time), Ok(address), Ok(value)) = (
            time.parse::<f64>(),
            address.parse::<u16>(),
            value.parse::<f64>(),
        ) else {
            continue;
        };
        tracks
            .entry((space, address))
            .or_insert_with(|| Track {
                space,
                address,
                name: name.to_string(),
                points: VecDeque::new(),
            })
            .points
            .push_back([time / 1000., value]);
    }
    if tracks.is_empty() {
        return Err("The recording holds no samples".into());
    }
    let mut tracks: Vec<Track> = tracks.into_values().collect();
    for track in &mut tracks {
        track
            .points
            .make_contiguous()
            .sort_by(|a, b| a[0].total_cmp(&b[0]));
    }
    Ok(tracks)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recordings_parse_into_sorted_tracks() {
        let text = format!(
            "{HEADER}\n2000.000,register,5,SPEED,7,7\n1000.000,register,5,SPEED,6,6\nbad line\n1500.000,parameter,1,GAIN,0,0.5\n"
        );
        let tracks = parse(&text).unwrap();
        assert_eq!(tracks.len(), 2);
        let speed = tracks.iter().find(|t| t.name == "SPEED").unwrap();
        assert_eq!(speed.space, Space::Register);
        assert_eq!(speed.points, [[1., 6.], [2., 7.]]);
        assert!(parse("time,value\n1,2").is_err());
        assert!(parse(HEADER).is_err());
    }
}
