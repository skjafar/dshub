# DSHub — AUR Package

Arch Linux package for DSHub, a native desktop application for monitoring and controlling industrial devices via TCP/UDP.

## Package Information

| Field | Value |
|-------|-------|
| Package name | `dshub-bin` |
| Architecture | `x86_64` |
| License | MIT |
| Runtime deps | `webkit2gtk-4.1`, `gtk3`, `libsoup3`, `openssl`, `xdg-utils` |

## Installation

### From AUR

```bash
# Using yay
yay -S dshub-bin

# Using paru
paru -S dshub-bin

# Manual
git clone https://aur.archlinux.org/dshub-bin.git
cd dshub-bin
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
```

## Uninstallation

```bash
yay -R dshub-bin
# or
paru -R dshub-bin
# or
sudo pacman -R dshub-bin
```

No leftover config files in `/etc` — user settings are stored in `~/.config/dshub/` and can be removed manually if desired.

## Building Locally

```bash
cd aur-bin/
makepkg -si
```

### Build Requirements

```bash
sudo pacman -S --needed webkit2gtk-4.1 libsoup3 base-devel
```

The PKGBUILD:
1. Downloads the pre-built binary from the GitHub release
2. Downloads the source tarball for icons and desktop file
3. Installs the binary, desktop entry, and icons

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

## Support

- Issues: https://github.com/skjafar/dshub/issues
- AUR page: https://aur.archlinux.org/packages/dshub-bin
