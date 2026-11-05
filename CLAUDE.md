# Native Rust application

Use the root Cargo package on this branch. The production application is egui/eframe + Tokio, implemented in Rust. `client/` and `src-tauri/` are references to the former application and are excluded from the native dependency graph.

Read `CONTEXT.md` for architecture and `docs/egui-migration.md` for migration decisions and verification. Existing protocol details remain in `PROTOCOL.md`.

## Commands

```sh
cargo run --locked
cargo fmt --check
cargo test --locked
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo build --locked --release
cargo test --locked --test emulator -- --ignored
bash tests/native-smoke.sh
```

The emulator and rendering harness need free TCP 2009 / UDP 2011. The rendering harness is Linux-only and isolates application settings. Do not run smoke fixtures against physical devices.

## Engineering rules

- Never block the egui drawing thread on network I/O. Submit actions to the session actor.
- Keep protocol behavior in `src/backend/`; keep application models and view behavior separate.
- This migration intentionally defers the user's standalone Rust backend review. Avoid unrelated protocol redesign while accepting the native interface.
- Every read binding carries captured entry identity. Drifted bindings must stop polling and block writes until explicitly reviewed.
- System registers are read-only in every data pane and widget.
- Writes and commands require Control on the current transport. Queuing is not acknowledgement. Preserve refusal and unknown-outcome states.
- Every native viewport shares one live session. Closing a daughter returns its panes to the main workspace. Native window geometry is persisted with layouts.
- Profile map drafts must preserve dashboards modified after the draft opened. Keep live readings and pending operations out of persistence.
- Use the existing version-one portable Profile format for import/export and preserve compatibility with all sixteen dashboard widget kinds.
- Keep line-ending-only changes out of diffs. Shell scripts use LF; Windows batch scripts use CRLF.

## Design direction

DSHub serves embedded engineers inspecting raw device data and operators monitoring equipment. The interface should be calm, precise and capable: dark-first, dense, readable and explicit about current device state. Use tonal hierarchy, restrained cyan accents and stable numeric alignment. Status information must remain distinguishable in both dark and light themes. Avoid decoration and animation that compete with device information.

Historical architectural decisions under `docs/adr/` describe the former Tauri interface where their implementation-specific details differ. The native migration decision is recorded in `docs/adr/0006-native-egui.md`.
