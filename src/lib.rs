#[path = "backend/commands.rs"]
pub mod commands;
#[path = "backend/communicator.rs"]
pub mod communicator;
pub mod model;
#[path = "backend/poll.rs"]
pub mod poll;
pub mod runtime;
#[path = "backend/scanner.rs"]
pub mod scanner;
#[path = "backend/types.rs"]
pub mod types;
pub mod ui;

pub mod profile_compat;

pub mod map_files;

mod cnc_dashboard;
