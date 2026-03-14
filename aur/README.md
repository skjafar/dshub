# DSHub — AUR Package

Arch Linux package for DSHub, a native desktop application for monitoring and controlling industrial devices via TCP/UDP.

## Package Information

| Field | Value |
|-------|-------|
| Package name | `dshub` |
| Architecture | `x86_64` |
| License | MIT |
| Runtime deps | `webkit2gtk-4.1`, `gtk3`, `libsoup3`, `openssl`, `xdg-utils` |
| Build deps | `rust`, `npm`, `webkit2gtk-4.1`, `libsoup3` |

## Installation

### From AUR

```bash
# Using yay
yay -S dshub

# Using paru
paru -S dshub

# Manual
git clone https://aur.archlinux.org/dshub.git
cd dshub
makepkg -si
```

### After Installation

Launch DSHub from your application launcher or run:

```bash
dshub
```

There is no service to start, no browser to open. DSHub is a self-contained desktop application.

## Installed Files

```
/usr/bin/dshub                              # Application binary
/usr/share/applications/dshub.desktop       # Desktop entry
/usr/share/icons/hicolor/32x32/apps/        # Icons
/usr/share/icons/hicolor/128x128/apps/
/usr/share/icons/hicolor/256x256/apps/
/usr/share/licenses/dshub/LICENSE
```

## Uninstallation

```bash
yay -R dshub
# or
paru -R dshub
# or
sudo pacman -R dshub
```

No leftover config files in `/etc` — user settings are stored in `~/.config/dshub/` and can be removed manually if desired.

## Building Locally

```bash
cd aur/
makepkg -si
```

### Build Requirements

```bash
sudo pacman -S --needed rust npm webkit2gtk-4.1 libsoup3 base-devel
```

The PKGBUILD:
1. Clones the repository at the tagged version
2. Builds the React frontend with `npm ci` + `npm run build`
3. Compiles the Rust binary with `cargo build --release --locked`
4. Installs the binary, desktop entry, and icons

## Firewall Notes

DSHub communicates directly with devices — no ports need to be opened on the machine running DSHub. Outbound connections are made to:

| Port | Protocol | Purpose |
|------|----------|---------|
| 2011 | UDP | Device discovery (broadcast) + data |
| 2009 | TCP | Device data stream |

If a host firewall blocks outbound UDP broadcast, discovery will fail.

## Troubleshooting

**App does not launch:**
```bash
# Run from terminal to see error output
dshub
```

**Missing WebKit:**
```bash
sudo pacman -S webkit2gtk-4.1
```

**Build fails:**
```bash
# Clean and retry
rm -rf pkg/ src/
makepkg -f
```

## Support

- Issues: https://github.com/skjafar/dshub/issues
- AUR page: https://aur.archlinux.org/packages/dshub
