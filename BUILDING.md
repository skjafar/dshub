# DSHub — Building and Distributing

DSHub v0.2.0+ is a native Tauri desktop application. It does not run as a server and does not require PM2, Node.js, or systemd at runtime. This document covers building release packages for distribution.

---

## Prerequisites

### Arch Linux

```bash
sudo pacman -S rust npm webkit2gtk-4.1 gtk3 libsoup3 base-devel
```

### Ubuntu / Debian

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev \
  libssl-dev curl build-essential pkg-config
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo bash -
sudo apt install nodejs
```

### Fedora

```bash
sudo dnf install webkit2gtk4.1-devel gtk3-devel libsoup3-devel openssl-devel \
  curl gcc
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

---

## Build Steps

```bash
git clone https://github.com/skjafar/dshub.git
cd dshub

# 1. Install frontend dependencies
npm --prefix client ci

# 2. Build the React frontend
npm --prefix client run build

# 3. Build the Tauri app (binary + packages)
cd src-tauri
cargo tauri build
```

Output files:
```
src-tauri/target/release/dshub              # standalone binary
src-tauri/target/release/bundle/deb/        # .deb package
src-tauri/target/release/bundle/rpm/        # .rpm package
```

### Binary Only (faster, no packaging)

```bash
cd src-tauri
cargo build --release
# binary: target/release/dshub
```

---

## Installing the Built Packages

### .deb (Ubuntu / Debian / Mint)

```bash
sudo dpkg -i src-tauri/target/release/bundle/deb/DSHub_0.2.0_amd64.deb
```

### .rpm (Fedora / openSUSE / RHEL)

```bash
sudo rpm -i src-tauri/target/release/bundle/rpm/DSHub-0.2.0-1.x86_64.rpm
```

### Standalone Binary

Copy `target/release/dshub` anywhere on `$PATH`:

```bash
sudo install -Dm755 src-tauri/target/release/dshub /usr/local/bin/dshub
```

---

## Development Mode

```bash
cd src-tauri
cargo tauri dev
```

This starts the Vite dev server (`npm --prefix client run dev` via `beforeDevCommand`) and opens a Tauri window with hot-reload. Changes to Rust code trigger a full recompile; changes to the frontend hot-reload in-place.

---

## Releasing a New Version

1. Update `version` in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`
2. Build: `cargo tauri build`
3. Tag the release:
   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```
4. Upload `.deb` and `.rpm` from `target/release/bundle/` to the GitHub release
5. Update the AUR package (see `aur/MAINTAINER_GUIDE.md`)

---

## Runtime Dependencies

These must be installed on the end-user's machine. They are automatically declared as dependencies in the `.deb` and `.rpm` packages.

| Package | Purpose |
|---------|---------|
| `webkit2gtk-4.1` / `libwebkit2gtk-4.1` | WebView rendering engine |
| `gtk3` / `libgtk-3` | UI toolkit |
| `libsoup3` | HTTP/networking support |
| `openssl` | TLS |
| `xdg-utils` | `xdg-open` for external links |

There is no Node.js, npm, or Python runtime dependency.
