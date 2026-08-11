//! Issue 01's popout spike, host side.
//!
//! The webview under test cannot report its own verdict: WebView2 does not
//! forward console output to the terminal that launched it, and the spike has
//! to be readable from a CI log on three platforms. So the probe hands its
//! result to the host, which prints it where a CI job can grep for it.
//!
//! Debug builds only, and stripped from a release binary by `cfg` rather than
//! by discipline — this is a command that exists to print whatever the frontend
//! hands it, which is fine for a spike and unacceptable in a shipped app.

/// Prints the probe's verdict to stdout, prefixed so CI can find it.
#[cfg(debug_assertions)]
#[tauri::command]
pub fn spike_report(payload: String) {
    println!("{payload}");
    log::info!("{payload}");
}
