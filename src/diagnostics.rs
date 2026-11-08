//! Field diagnostics: a rolling log file and crash reports in the
//! application's data folder, so problems can be reported from builds that
//! have no console (the Windows release).
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const LOG_FILE: &str = "dshub.log";
/// The log file is rotated to `dshub.log.1` at start-up past this size.
const MAX_LOG_BYTES: u64 = 2 * 1024 * 1024;

/// Where logs and crash reports are written.
pub fn log_dir() -> Option<PathBuf> {
    eframe::storage_dir("DSHub").map(|dir| dir.join("logs"))
}

/// Starts logging to stderr and the log file, and installs the crash-report
/// panic hook. `RUST_LOG` still selects levels; the default records DSHub's
/// own messages at info and other crates at warn.
pub fn init() {
    let file = log_dir().and_then(|dir| open_log(&dir).ok());
    let mut builder = env_logger::Builder::from_env(
        env_logger::Env::default().default_filter_or("warn,dshub=info"),
    );
    if let Some(file) = file {
        builder.target(env_logger::Target::Pipe(Box::new(Tee(Mutex::new(file)))));
    }
    let _ = builder.try_init();
    install_panic_hook();
}

fn open_log(dir: &Path) -> std::io::Result<std::fs::File> {
    std::fs::create_dir_all(dir)?;
    let path = dir.join(LOG_FILE);
    if std::fs::metadata(&path).is_ok_and(|m| m.len() > MAX_LOG_BYTES) {
        let _ = std::fs::rename(&path, dir.join(format!("{LOG_FILE}.1")));
    }
    std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
}

/// Writes every log line to stderr and the log file.
struct Tee(Mutex<std::fs::File>);
impl Write for Tee {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let _ = std::io::stderr().write_all(buf);
        self.0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .write_all(buf)?;
        Ok(buf.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        let _ = std::io::stderr().flush();
        self.0.lock().unwrap_or_else(|e| e.into_inner()).flush()
    }
}

fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let report = crash_report(info);
        log::error!("{report}");
        if let Some(dir) = log_dir() {
            let name = format!(
                "crash-{}.txt",
                jiff::Timestamp::now().strftime("%Y%m%d-%H%M%S")
            );
            let _ =
                std::fs::create_dir_all(&dir).and_then(|_| std::fs::write(dir.join(name), &report));
        }
        previous(info);
    }));
}

fn crash_report(info: &std::panic::PanicHookInfo<'_>) -> String {
    let message = info
        .payload()
        .downcast_ref::<&str>()
        .map(|s| s.to_string())
        .or_else(|| info.payload().downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "unknown panic".into());
    let location = info
        .location()
        .map(|l| format!("{}:{}", l.file(), l.line()))
        .unwrap_or_default();
    format!(
        "DSHub {} crashed\nOS: {} {}\nThread: {}\nAt: {location}\nMessage: {message}\n\nBacktrace:\n{}\n",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        std::env::consts::ARCH,
        std::thread::current().name().unwrap_or("unnamed"),
        std::backtrace::Backtrace::force_capture()
    )
}

/// Opens the log folder in the platform's file manager.
pub fn open_log_dir() -> Result<(), String> {
    let dir = log_dir().ok_or("No application data folder is available")?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let program = if cfg!(target_os = "windows") {
        "explorer"
    } else if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };
    std::process::Command::new(program)
        .arg(&dir)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not open {}: {e}", dir.display()))
}
