# Building the native Rust application

Run all commands from the repository root. Rust 1.89+ and platform C/C++ build tools are required. The reproducible dependency selection is in the root `Cargo.lock`.

```sh
cargo run --locked                    # development
cargo build --locked --release       # optimized executable
cargo fmt --check
cargo test --locked
cargo clippy --locked --all-targets --all-features -- -D warnings
```

Linux build libraries:

```sh
sudo apt install build-essential pkg-config libxkbcommon-dev libwayland-dev libegl1-mesa-dev libgl1-mesa-dev
```

Use Rust's MSVC toolchain plus Visual Studio C++ Build Tools on Windows; use the Xcode command-line tools on macOS. egui uses the native event loop and OpenGL renderer. Linux file dialogs use XDG Desktop Portal. Neither Node/npm nor Tauri/WebKit/WebView2 participates in this build.

The resulting binary is `target/release/dshub` (`dshub.exe` on Windows). Maps, CNC metadata, fonts and the app icon are embedded.

## Helpers and packaging

- `./build.sh dev` / `build.bat dev`: run a development build.
- `./build.sh bin` / `build.bat bin`: build the release executable.
- `./build.sh test` / `build.bat test`: run tests and lint checks.
- `./build.sh run` / `build.bat run`: run the built release executable.
- `./build.sh pkg`: build a Debian package using `dpkg-deb` in `target/package/`.

The CI workflow checks all three desktop platforms and publishes archives on version tags. Signing, notarization and Windows installers are not configured by the native workflow.

## Device integration test

```sh
cargo test --locked --test emulator -- --ignored
```

This starts and stops the bundled Python emulator. Python 3 and free local TCP port 2009 / UDP port 2011 are required. The test covers both transports, control, reads/writes, float representation, command acknowledgements, refused writes and polling.

See [egui migration validation](docs/egui-migration.md) for native rendering smoke tests. The previous implementation remains in `client/` and `src-tauri/` as a reference; running commands there builds the historical app rather than the native application.
