# ADR 0006: Native Rust application with egui

Status: Implemented on `codex/egui-rebuild`; platform and physical-device acceptance pending.

## Decision

Replace the active Tauri/React application with a root Rust Cargo package using egui/eframe, egui_dock and egui_plot. Keep Tokio and the existing Rust device communication behavior. The resulting desktop runtime does not embed a browser or execute JavaScript.

The migration ports application behavior that previously lived in TypeScript into Rust: Profiles, maps and metadata, value conversion and validation, persistent layouts and dashboards, binding identity/review, plots, and device-operation outcomes.

## Integration boundary

The former backend's Tauri command macros are removed from the native copy. Commands accept ordinary `&AppState` references; spawning uses Tokio. An in-process handle supplies shared state and a bounded event queue with the existing serializable event payloads. Network work executes on a Tokio runtime and the egui thread submits actions through a session actor.

This deliberately avoids a simultaneous protocol/backend redesign. The user requested a separate backend-only review after the native application's functional acceptance.

## Native windows and persistence

Use egui viewports for genuine OS daughter windows and egui_dock for pane layout within each viewport. Windows share one session. A closed daughter returns its panes to the main workspace. Window geometry, current per-Profile layouts and named Workspaces persist through eframe storage.

The prior dockview layout representation is not portable to egui_dock. Native layouts start separately. Version-one portable Profile files remain compatible, including the sixteen dashboard widget kinds; native additions are retained in a separate extension section.

## Consequences

Builds use Cargo alone. The release workflow builds native Linux, Windows and macOS executables and archives; Debian packaging uses dpkg-deb. The new workflow does not configure signed Windows installers, macOS notarization or RPM packaging.

The old `client/` and `src-tauri/` sources remain available for migration comparison. They are outside the active Cargo graph and release path. They can be removed after acceptance without changing the native application.

Verification and remaining acceptance work are recorded in `docs/egui-migration.md`.
