# DSHub native application context

The active application on `codex/egui-rebuild` is the root Cargo package. `cargo run --locked` launches egui/eframe; all application logic and device communication run in Rust. The old `client/` and `src-tauri/` trees are migration references and are not built or shipped by the native target.

## Boundaries

- `src/ui/mod.rs` owns native windows, docked panes, per-Profile layouts, dialogs and persistence.
- `src/ui/session.rs` owns the GUI's live session. It sends actions to one Tokio actor. Only that actor changes device connection and subscription state; drawing never awaits I/O.
- `src/backend/` preserves the old Rust communication behavior. Tauri macros, handles and task spawning were replaced with ordinary Rust references, `runtime::AppHandle` and Tokio. Window management moved to the UI. This was an integration migration, not the separately requested backend review.
- `src/ui/theme.rs` defines the visual system: tonal surfaces, ghost borders, the cyan accent and the type scale (bundled Inter and JetBrains Mono, see `assets/fonts/README.md`). Status colours come from `src/ui/colors.rs` and must stay distinguishable in both themes.
- `src/runtime.rs` holds shared backend state and a bounded queue of typed `Event`s. When full it sheds telemetry, never state transitions. Each burst of events wakes the interface once to repaint; there is no polling timer, IPC, HTTP service or WebView.
- `src/model.rs` owns address spaces, map parsing, typed values, Profile artifacts, widget configuration and captured binding identity.
- `src/profile_compat.rs` imports/exports the existing version-one portable Profile format and translates dashboard configurations. Native fields preserve additional native settings while a compatible dashboard section remains available to the former interface.
- `src/map_files.rs` exports firmware-ready C structures and command definitions.

## Invariants

There is one device connection per application. All native windows share its readings, control state, log and polling registry. System registers are read-only. Writes and profile commands require Control on the active transport. A queued operation is not a confirmed write: confirmation/refusal comes from device updates; a missing acknowledgement becomes an unknown outcome.

Bindings capture name, map type, array extent, address and address space. Changed bindings stop subscribing and cannot write until reviewed. Review includes stored dashboards and nested containers. Map Editor drafts update maps/metadata/commands only; they must not overwrite concurrent dashboard edits.

Named Workspaces and current layouts belong to a Profile. Settings, native window geometry, dashboards and plot definitions persist through eframe storage. Live readings, sockets, pending operations and samples do not persist. Use eframe's storage codec for dock states: their uninitialized geometry may contain infinities that plain JSON cannot roundtrip.

## Verification

`cargo test --locked` covers domain behavior and headless egui interactions. `cargo test --locked --test emulator -- --ignored` launches the real Python emulator for TCP/UDP integration. `bash tests/native-smoke.sh` exercises eighteen native rendering scenes against the emulator with isolated Linux storage and saves screenshots; name scenes (`bash tests/native-smoke.sh registers editor`) to render only those. See `docs/egui-migration.md` for evidence and the remaining platform/hardware acceptance work.
