# Building the native Rust application

Run all commands from the repository root. Rust 1.95+ and platform C/C++ build tools are required. The reproducible dependency selection is in the root `Cargo.lock`.

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

The CI workflow checks all three desktop platforms, runs the emulator and protocol conformance tests on Linux, and publishes archives, a macOS app bundle (`packaging/macos/bundle.sh`) and the Debian package on version tags. It signs the Windows executable and signs and notarizes the macOS bundle when the certificate secrets are configured; otherwise those steps are skipped. Windows installers and RPM packages are not built.

## Device integration test

```sh
cargo test --locked --test emulator -- --ignored
```

This starts and stops the bundled Python emulator. Python 3 and free local TCP port 2009 / UDP port 2011 are required. The test covers both transports, control, reads/writes, float representation, command acknowledgements, refused writes and polling.

```sh
cargo test --locked --test conformance -- --ignored
```

This replays `tests/protocol-vectors.json` against the emulator so it cannot drift from [PROTOCOL.md](PROTOCOL.md).

## Native rendering smoke test

```sh
bash tests/native-smoke.sh                   # all eighteen scenes
bash tests/native-smoke.sh registers editor  # only the named scenes
```

Linux only. Screenshots go to `target/native-smoke/` unless a directory is given. See [egui migration validation](docs/egui-migration.md). The former Tauri application's sources are kept at the `tauri-reference` tag.
