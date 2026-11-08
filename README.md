# DSHub

DSHub is a native Rust workstation for monitoring and controlling devices over TCP and UDP. The application uses **egui / eframe** for its desktop interface and **Tokio** for device I/O. The native build has no JavaScript, Node.js, Tauri, WebView, or HTTP server dependency.

## Run

Install Rust 1.89 or newer, then run from the repository root:

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
4. Use Registers, Parameters and System Registers to search, read, refresh and inspect values. System registers are read-only. Integer, unsigned, float and hexadecimal map types retain their wire representation; decimal, hexadecimal and binary display modes are available.
5. Add traces from a data pane to the Plot. Configure a Dashboard with readouts, gauges, indicators, controls, tables, alarms, containers and mini-plots.

The Main Window owns one device session. Every pane and native daughter window shares that session. Drag tabs to arrange docked panes. Right-click a tab to focus it, duplicate it or move it to a native window. Closing a daughter window returns its panes to the Main Window. Closing the Main Window exits the app.

Profiles own maps, metadata and dashboards. The Map Editor keeps changes in a draft until **Save Profile**. Address or type changes put affected bindings into **Needs review**; those bindings stop reading and writing until explicitly rebound. The review indicator includes bindings in hidden dashboards and nested containers. Profile export/import uses version-one `.dshub-profile` files, including compatibility with dashboards from the former desktop interface.

Workspaces retain named pane arrangements and daughter windows per Profile. Native settings, dashboards, current layouts and plot definitions are saved periodically and on normal exit. Connection sockets, device readings and plot samples are never restored as live device state.

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
# Starts the Python emulator; requires free TCP 2009 / UDP 2011:
cargo test --locked --test emulator -- --ignored
```

An opt-in native smoke fixture exercises rendered panes, real device control and daughter windows. See [the migration notes](docs/egui-migration.md) for the commands and validation limits.

## Source layout

| Path | Responsibility |
|---|---|
| `src/main.rs` | Native desktop entry point |
| `src/ui/` | egui shell, panes, dashboard widgets, review and session actor |
| `src/model.rs` | Maps, Profiles, bindings, typed values and persistent domain models |
| `src/profile_compat.rs` | Version-one Profile/dashboard file compatibility |
| `src/map_files.rs` | Firmware header and command-map import/export |
| `src/backend/` | Existing Rust commands, communicator, discovery, polling and protocol types adapted to run without Tauri |
| `src/runtime.rs` | Bounded in-process backend event bridge |
| `assets/` | Embedded maps, CNC metadata and application icon |
| `tests/emulator.rs` | Real TCP/UDP integration test |
| `packaging/` | Linux desktop integration |

The former Tauri/React application was removed; its sources are kept at the `tauri-reference` tag. The backend's behavior is deliberately preserved for a separate backend review after the native application is accepted.

## Distribution

`./build.sh bin` builds the release binary; `./build.sh pkg` also creates a Debian package on Debian-compatible hosts. `build.bat bin` builds the Windows executable. The GitHub workflow builds and checks Linux, Windows and macOS; version tags publish native archives and the Linux Debian package.

The AUR recipe under `aur-bin/` describes the previously published 0.2.4 release. It should be updated with verified release URLs and checksums when a native release is published.

MIT license. See [LICENSE](LICENSE).
