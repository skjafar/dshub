# DSHub

A desktop application for monitoring and controlling industrial devices via TCP/UDP protocols. Built with Tauri v2 (Rust backend) and React/TypeScript (frontend).

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Rust](https://img.shields.io/badge/rust-1.77%2B-orange.svg)
![TypeScript](https://img.shields.io/badge/typescript-5.7-blue.svg)
![Tauri](https://img.shields.io/badge/tauri-v2-purple.svg)

## Features

- **Auto-Discovery** — UDP broadcast scan finds devices on the local network automatically
- **Dual Protocol** — Connect via TCP or UDP with seamless switching
- **Real-Time Plotting** — Live charting of register values at configurable poll rates
- **Register / Parameter Management** — Read and write operations with input validation
- **Modern UI** — Material-UI with dark/light themes
- **Native Desktop** — Ships as a single binary; no server process, no browser required
- **Type-Safe** — Full TypeScript coverage on the frontend, strict Rust on the backend

## Quick Start

### Install (Arch Linux)

```bash
yay -S dshub
# or
paru -S dshub
```

Launch from your application menu or run `dshub`.

### Build from Source

#### Prerequisites

| Tool | Minimum Version | Purpose |
|------|----------------|---------|
| Rust + Cargo | 1.77 | Backend compilation |
| Node.js | 18 | Frontend build |
| npm | 9 | Frontend dependencies |
| webkit2gtk-4.1 | — | Tauri WebView runtime |

On Arch Linux:
```bash
sudo pacman -S rust npm webkit2gtk-4.1 gtk3 libsoup3
```

On Ubuntu/Debian:
```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev \
  libssl-dev curl build-essential
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

#### Build

```bash
git clone https://github.com/skjafar/dshub.git
cd dshub

# Build frontend
npm --prefix client ci
npm --prefix client run build

# Build and package
cd src-tauri
cargo tauri build        # produces .deb and .rpm in target/release/bundle/
# or just the binary:
cargo build --release    # binary at target/release/dshub
```

#### Development

```bash
cd src-tauri
cargo tauri dev          # starts Vite dev server + Tauri with hot-reload
```

### Testing Without Hardware

Use the included Python emulator:

```bash
# Terminal 1: start the emulator
python3 emulator/dshub_emulator.py

# Terminal 2: launch the app
dshub                    # or run from source: cargo tauri dev
```

Click **Scan for Devices** — the emulator will appear as "Python Emulator".

## Project Structure

```
dshub/
├── client/              # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── components/  # UI panels
│   │   ├── contexts/    # DSHubContext (IPC bridge), SettingsContext
│   │   ├── maps/        # Register/parameter map definitions
│   │   └── types/       # TypeScript types
│   └── build/           # Production build (embedded in binary)
├── src-tauri/           # Rust backend (Tauri v2)
│   ├── src/
│   │   ├── lib.rs       # App setup, command registration
│   │   ├── commands.rs  # #[tauri::command] handlers + AppState
│   │   ├── communicator.rs  # TCP/UDP device communication
│   │   ├── scanner.rs   # UDP broadcast discovery
│   │   └── types.rs     # Shared types (serde)
│   └── tauri.conf.json
├── emulator/            # Python board emulator (no dependencies)
└── aur/                 # Arch Linux AUR package files
```

## Architecture

DSHub uses Tauri's IPC bridge — the React frontend calls Rust functions via `invoke()` and receives push events via `listen()`. There is no HTTP server or WebSocket.

```
React UI  ──invoke()──►  Rust Commands  ──tokio::net──►  Device (TCP/UDP)
          ◄──listen()──  tauri events   ◄──────────────  Device response
```

**Backend modules:**

| Module | Responsibility |
|--------|---------------|
| `commands.rs` | All `#[tauri::command]` functions, `AppState` with async Mutex |
| `communicator.rs` | Sequential request/response over TCP or UDP via mpsc channel |
| `scanner.rs` | UDP broadcast discovery, enumerates real network interfaces |
| `types.rs` | Protocol constants, serde types shared with the frontend |

**Frontend → Backend calls:**

| Action | Rust command |
|--------|-------------|
| Scan for devices | `start_scan` |
| Connect to device | `connect_device` |
| Read register | `read_register` |
| Write register | `write_register` |
| Start live plot | `start_plotting` |
| Take control | `take_control` |

## Protocol

### Discovery (UDP port 2011)

**Request (5 bytes):**
```
[0xDEADBEEF (4B, LE)] [0x01]
```

**Response (32+ bytes):**
```
[Magic (4B)] [0x02] [BoardType] [Firmware (2B)]
[BoardID (4B)] [IP (4B, LE)] [TCPPort (2B)] [UDPPort (2B)]
[Reserved (2B)] [MAC (6B)] [BoardName (null-terminated)]
```

### Data (TCP port 2009 / UDP port 2011)

**Packet (6 bytes):**
```
[Command (1B)] [Address (1B)] [Value (4B, signed LE)]
```

| Command | Operation |
|---------|-----------|
| 0 | SYS_COMMAND |
| 1 | Read Register |
| 2 | Write Register |
| 3 | Read Parameter |
| 4 | Write Parameter |
| 5 | Take Control |

## Map Files

Register and parameter names are loaded from plain-text map files at runtime:

```
client/public/maps/registers.map
client/public/maps/parameters.map
client/public/maps/boardtypes.map
```

Format:
```c
// C-style comments supported
uint32_t    REGISTER_NAME;
int32_t     SIGNED_REGISTER;
float       FLOAT_REGISTER;
hex         HEX_VALUE;
```

## Build Commands

Use the included `build.sh` helper from the project root:

| Command | Description |
|---------|-------------|
| `./build.sh dev` | Development mode with hot-reload |
| `./build.sh bin` | Build standalone binary only (fast) |
| `./build.sh pkg` | Build binary + .deb and .rpm packages |
| `./build.sh install` | Build .deb and install with dpkg |
| `./build.sh run` | Run the last built binary |
| `./build.sh clean` | Remove all build artifacts |

Or invoke the underlying tools directly:

| Command | Description |
|---------|-------------|
| `cargo tauri dev` | Development mode with hot-reload (run from `src-tauri/`) |
| `cargo tauri build` | Release build with packages |
| `cargo build --release` | Binary only (faster, no bundling) |
| `npm --prefix client run build` | Frontend production build |

Windows and macOS builds are handled automatically by GitHub Actions (`.github/workflows/build.yml`) when a version tag is pushed.

## Technology Stack

**Frontend:**
- React 19
- TypeScript 5.7
- Vite 6
- Material-UI 7
- Chart.js 4
- `@tauri-apps/api` (IPC)

**Backend:**
- Rust 1.77+
- Tauri v2
- Tokio (async runtime)
- Serde / serde_json

## Troubleshooting

**Cannot discover devices:**
- Ensure your machine and the device are on the same subnet
- Check that UDP port 2011 is not blocked by a firewall
- The Rust backend binds to each non-loopback interface and sends directed broadcasts

**Cannot connect after discovery:**
- Click **Take Control** after connecting — the device will reject data without it
- Verify no other client is holding control of the device

**Build fails (webkit2gtk not found):**
```bash
# Arch
sudo pacman -S webkit2gtk-4.1

# Ubuntu 22.04+
sudo apt install libwebkit2gtk-4.1-dev
```

**Cargo.lock out of date:**
```bash
cd src-tauri
cargo update
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit changes
4. Push and open a Pull Request against `master`

## License

MIT License.
