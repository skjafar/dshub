pub mod backend;
pub mod diagnostics;
pub mod map_files;
pub mod model;
pub mod profile_compat;
pub mod runtime;
pub mod ui;

mod cnc_dashboard;
pub mod dashboard_kit;
pub(crate) mod showcase_dashboard;

// Backend modules stay addressable at the crate root for existing callers.
pub use backend::{commands, communicator, poll, scanner, types};
