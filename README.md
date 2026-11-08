# DSHub

DSHub is a native Rust workstation for monitoring and controlling devices over TCP and UDP. The application uses **egui / eframe** for its desktop interface and **Tokio** for device I/O. The native build has no JavaScript, Node.js, Tauri, WebView, or HTTP server dependency.

## Run

Install Rust 1.95 or newer, then run from the repository root:

```sh
cargo run --locked
```

For an optimized binary:

```sh
cargo build --locked --release
# Linux / macOS
target/release/dshub
# Windows
# target\release\dshub.exe
```

On Linux the desktop needs OpenGL/EGL, X11 or Wayland, and libxkbcommon. Native file dialogs use the desktop's XDG portal. Debian/Ubuntu build prerequisites:

```sh
sudo apt install build-essential pkg-config libxkbcommon-dev libwayland-dev libegl1-mesa-dev libgl1-mesa-dev
```

Windows uses the MSVC Rust toolchain and Visual Studio C++ build tools. macOS uses the Xcode command-line tools. No WebKit or WebView2 installation is required.

## Work with a device

1. **Scan** for devices, or enter an IP address and select **TCP** or **UDP**.
2. **Connect**, then **Take Control** before sending writes or commands.
3. Select the device's **Profile**. The bundled Default and CNC profiles include maps; CNC also includes command definitions and entry metadata.
4. Use Registers, Parameters and System Registers to search, read, refresh and inspect values. System registers are read-only. Tables show each entry in its declared type (DEFAULT view) or in decimal, hexadecimal or binary, with engineering units when the map declares scale and offset. Double-click a writable value to edit it; Enter writes, Esc discards, and values not yet sent stay outlined.
5. Add traces from a data pane to a Plot. Plots show a crosshair read-out of every trace, pause, export PNG or CSV, and record every reading to CSV for later replay.
6. Configure a Dashboard with readouts, gauges, indicators, controls, tables, alarms, containers and mini-plots on a snapping grid.

Press **Ctrl+K** for the command palette and **/** to focus search. The Activity log can be filtered, paused and decodes the selected packet.

The Main Window owns one device session. Every pane and native daughter window shares that session. Drag tabs to arrange docked panes. Right-click a tab to focus it, duplicate it or move it to a native window. Window titles name the device and Profile. Closing a daughter window returns its panes to the Main Window, and a daughter window closes itself once its last pane is gone. Closing the Main Window exits the app.

Profiles own maps, metadata, commands and dashboards. **Manage Profiles** creates, duplicates, renames, imports, exports and deletes them. The Map Editor keeps changes in a draft until **Save Profile** and outlines every field that differs from the saved Profile. Address or type changes put affected bindings into **Needs review**; those bindings stop reading and writing until explicitly rebound. The review indicator includes bindings in hidden dashboards and nested containers. Profile export/import uses version-one `.dshub-profile` files, including compatibility with dashboards from the former desktop interface.

Workspaces retain named pane arrangements and daughter windows per Profile. Each Profile is stored as its own JSON file in the application data folder; preferences, current layouts, Workspaces, window geometry and plot definitions are saved after changes and on normal exit. Connection sockets, device readings, pending operations and plot samples are never restored. Warnings, errors and crash reports go to a log folder (Preferences > Logging > Open log folder).

## Without hardware

```sh
python3 emulator/dshub_emulator.py
```

Connect to `127.0.0.1`, select the CNC Profile and Take Control. The emulator implements discovery, TCP/UDP, register and parameter operations, CNC commands and simulated motion. See [emulator/README.md](emulator/README.md) and [PROTOCOL.md](PROTOCOL.md).

## Validation

```sh
cargo fmt --check
cargo test --locked
cargo clippy --locked --all-targets --all-features -- -D warnings
# Start the Python emulator; require free TCP 2009 / UDP 2011:
cargo test --locked --test emulator -- --ignored
cargo test --locked --test conformance -- --ignored
```

An opt-in native smoke fixture renders panes against the emulator with real device control and daughter windows: `bash tests/native-smoke.sh` for all eighteen scenes, or name scenes (`bash tests/native-smoke.sh registers editor`). See [the migration notes](docs/egui-migration.md) for details and validation limits.

## Source layout

| Path | Responsibility |
|---|---|
| `src/main.rs` | Native desktop entry point |
| `src/lib.rs` | Library crate shared by the binary, tests and examples |
| `src/ui/` | egui shell, panes, dashboard widgets, review, Profile store and session actor |
| `src/model.rs` | Maps, Profiles, bindings, typed values and persistent domain models |
| `src/profile_compat.rs` | Version-one Profile/dashboard file compatibility |
| `src/map_files.rs` | Firmware header and command-map import/export |
| `src/backend/` | Existing Rust commands, communicator, discovery, polling and protocol types adapted to run without Tauri |
| `src/runtime.rs` | Bounded in-process backend event bridge |
| `src/cnc_dashboard.rs` | Bundled CNC operator dashboards |
| `src/diagnostics.rs` | Rolling log file and crash reports |
| `assets/` | Embedded maps, CNC metadata, fonts and application icon |
| `emulator/` | Python CNC device emulator |
| `tests/emulator.rs` | Real TCP/UDP integration test |
| `tests/conformance.rs` | Replays `tests/protocol-vectors.json` against the emulator |
| `tests/native-smoke.sh` | Native rendering smoke scenes |
| `examples/export_profile.rs` | Portable Profile fixture export / re-export |
| `packaging/` | Linux desktop entry and macOS app bundle |
| `aur-bin/` | Arch Linux `dshub-bin` recipe |

The former Tauri/React application was removed; its sources are kept at the `tauri-reference` tag. The backend's behavior is deliberately preserved for a separate backend review after the native application is accepted.

## Distribution

`./build.sh bin` builds the release binary; `./build.sh pkg` also creates a Debian package on Debian-compatible hosts. `build.bat bin` builds the Windows executable. The GitHub workflow builds and checks Linux, Windows and macOS; version tags publish native archives, a macOS app bundle and the Linux Debian package. Windows binaries are signed and the macOS bundle is signed and notarized when the certificates are configured as repository secrets.

The AUR recipe under `aur-bin/` is prepared for 0.3.0. Its checksums are filled in with `updpkgsums` once the `v0.3.0` release is published; the AUR currently carries 0.2.4.

MIT license. See [LICENSE](LICENSE).
