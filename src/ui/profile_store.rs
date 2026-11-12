//! Profiles are user documents: each is kept in its own JSON file under the
//! application data folder, apart from UI state (layouts, preferences), so a
//! layout problem can never take Profiles with it and Profiles can be copied
//! or backed up individually.
use crate::model::Profile;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

pub struct ProfileStore {
    dir: PathBuf,
    /// The text last written (or read) per Profile id; unchanged Profiles
    /// are not rewritten.
    written: HashMap<String, String>,
}

/// What loading the folder found.
pub struct Loaded {
    pub profiles: Vec<Profile>,
    /// Files that could not be read; each was renamed aside, never deleted.
    pub problems: Vec<String>,
}

impl ProfileStore {
    /// The store in the application data folder, if there is one.
    pub fn open() -> Option<Self> {
        eframe::storage_dir("DSHub").map(|dir| Self::at(dir.join("profiles")))
    }
    pub fn at(dir: PathBuf) -> Self {
        Self {
            dir,
            written: HashMap::new(),
        }
    }
    fn path(&self, id: &str) -> PathBuf {
        // Ids are generated (alphanumeric and dashes); anything else is
        // replaced so a crafted id cannot leave the folder.
        let safe: String = id
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        self.dir.join(format!("{safe}.json"))
    }
    /// Reads every Profile file, ordered by `order` (ids) and then by name.
    pub fn load(&mut self, order: &[String]) -> Loaded {
        let mut profiles = vec![];
        let mut problems = vec![];
        let Ok(entries) = std::fs::read_dir(&self.dir) else {
            return Loaded { profiles, problems };
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            match std::fs::read_to_string(&path)
                .map_err(|e| e.to_string())
                .and_then(|text| {
                    serde_json::from_str::<Profile>(&text)
                        .map(|p| (p, text))
                        .map_err(|e| e.to_string())
                }) {
                Ok((profile, text)) => {
                    self.written.insert(profile.id.clone(), text);
                    profiles.push(profile);
                }
                Err(e) => problems.push(set_aside(&path, &e)),
            }
        }
        let rank = |p: &Profile| {
            order
                .iter()
                .position(|id| id == &p.id)
                .unwrap_or(usize::MAX)
        };
        profiles.sort_by(|a, b| rank(a).cmp(&rank(b)).then_with(|| a.name.cmp(&b.name)));
        Loaded { profiles, problems }
    }
    /// Writes changed Profiles and removes files of deleted ones.
    pub fn save(&mut self, profiles: &[Profile]) -> Result<(), String> {
        std::fs::create_dir_all(&self.dir).map_err(|e| e.to_string())?;
        for profile in profiles {
            let text = serde_json::to_string_pretty(profile).map_err(|e| e.to_string())?;
            if self.written.get(&profile.id) == Some(&text) {
                continue;
            }
            write_atomically(&self.path(&profile.id), &text)?;
            self.written.insert(profile.id.clone(), text);
        }
        let removed: Vec<String> = self
            .written
            .keys()
            .filter(|id| !profiles.iter().any(|p| &p.id == *id))
            .cloned()
            .collect();
        for id in removed {
            let _ = std::fs::remove_file(self.path(&id));
            let _ = std::fs::remove_file(self.path(&id).with_extension("json.bak"));
            self.written.remove(&id);
        }
        Ok(())
    }
}

/// Replaces `path` with `text`: written to a temporary file and synced
/// before the rename, so a power cut leaves the old or the new file, never
/// an empty one. The version being replaced is kept as `<name>.json.bak`.
fn write_atomically(path: &Path, text: &str) -> Result<(), String> {
    use std::io::Write;
    let temporary = path.with_extension("json.tmp");
    let mut file = std::fs::File::create(&temporary).map_err(|e| e.to_string())?;
    file.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);
    if path.exists() {
        // Best effort: a missing backup must not stop the save.
        let _ = std::fs::copy(path, path.with_extension("json.bak"));
    }
    std::fs::rename(&temporary, path).map_err(|e| e.to_string())
}

/// Renames an unreadable Profile file so it is kept but no longer loaded.
fn set_aside(path: &Path, error: &str) -> String {
    let stamp = jiff::Timestamp::now().strftime("%Y%m%d-%H%M%S");
    let aside = path.with_extension(format!("json.unreadable-{stamp}"));
    match std::fs::rename(path, &aside) {
        Ok(()) => format!("{} ({error}); kept as {}", path.display(), aside.display()),
        Err(e) => format!("{} ({error}; could not be set aside: {e})", path.display()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::default_profiles;

    fn temporary_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("dshub-profile-store-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn profiles_round_trip_in_order_and_deletions_remove_files() {
        let dir = temporary_dir("roundtrip");
        let mut profiles = default_profiles();
        let mut store = ProfileStore::at(dir.clone());
        store.save(&profiles).unwrap();
        let order: Vec<String> = profiles.iter().rev().map(|p| p.id.clone()).collect();
        let loaded = ProfileStore::at(dir.clone()).load(&order);
        assert!(loaded.problems.is_empty());
        assert_eq!(loaded.profiles.len(), profiles.len());
        assert_eq!(loaded.profiles[0].id, order[0]);

        let removed = profiles.pop().unwrap();
        store.save(&profiles).unwrap();
        assert!(!store.path(&removed.id).exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn unreadable_profiles_are_set_aside_not_lost() {
        let dir = temporary_dir("unreadable");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("broken.json"), "{ not json").unwrap();
        let loaded = ProfileStore::at(dir.clone()).load(&[]);
        assert!(loaded.profiles.is_empty());
        assert_eq!(loaded.problems.len(), 1);
        assert!(!dir.join("broken.json").exists());
        assert!(std::fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .any(|e| e.file_name().to_string_lossy().contains("unreadable")));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
