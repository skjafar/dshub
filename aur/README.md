# DeviceMon Web - AUR Package

This directory contains files for building and distributing DeviceMon Web as an Arch Linux AUR package.

## Package Information

- **Package Name**: `devicemon-web`
- **Description**: Modern web application for monitoring and controlling embedded devices
- **License**: MIT
- **Architecture**: x86_64, aarch64
- **Dependencies**: nodejs>=18.0.0, npm
- **Optional Dependencies**: python (for emulator), pm2 (for alternative process management)

## Installation for Users

### From AUR (Recommended)

```bash
# Using yay
yay -S devicemon-web

# Using paru
paru -S devicemon-web

# Manual installation
git clone https://aur.archlinux.org/devicemon-web.git
cd devicemon-web
makepkg -si
```

### Quick Start After Installation

```bash
# Start the service
sudo systemctl start devicemon-web

# Enable auto-start on boot
sudo systemctl enable devicemon-web

# Open in browser
xdg-open http://localhost:3002

# Or use the helper command
devicemon-web start
devicemon-web open
```

### Using the Emulator

```bash
# Start emulator
sudo systemctl start devicemon-web-emulator

# Or run directly
devicemon-web-emulator run

# Or use the helper command
devicemon-web-emulator start
```

## Package Structure

After installation, files are located at:

```
/opt/devicemon-web/          # Application files
├── dist/                    # Server build
├── client/build/            # Client build
├── emulator/                # Board emulator
└── node_modules/            # Dependencies

/etc/devicemon-web/          # Configuration
├── config.env               # Environment variables
└── maps/                    # Register/parameter maps
    ├── registers.map
    ├── parameters.map
    └── boardtypes.map

/usr/bin/                    # Commands
├── devicemon-web            # Service wrapper
└── devicemon-web-emulator   # Emulator wrapper

/usr/lib/systemd/system/     # Systemd services
├── devicemon-web.service
└── devicemon-web-emulator.service

/usr/share/applications/     # Desktop entry
└── devicemon-web.desktop

/usr/share/doc/devicemon-web/  # Documentation
├── README.md
├── QUICK_START.md
└── DEPLOYMENT-PM2.md

/var/log/devicemon-web/      # Log files
```

## Helper Commands

### devicemon-web

```bash
devicemon-web start      # Start the service
devicemon-web stop       # Stop the service
devicemon-web restart    # Restart the service
devicemon-web status     # Show service status
devicemon-web logs       # Show live logs
devicemon-web enable     # Enable auto-start on boot
devicemon-web disable    # Disable auto-start
devicemon-web open       # Open in browser
```

### devicemon-web-emulator

```bash
devicemon-web-emulator start    # Start emulator service
devicemon-web-emulator stop     # Stop emulator service
devicemon-web-emulator restart  # Restart emulator service
devicemon-web-emulator status   # Show service status
devicemon-web-emulator logs     # Show live logs
devicemon-web-emulator enable   # Enable auto-start on boot
devicemon-web-emulator disable  # Disable auto-start
devicemon-web-emulator run      # Run emulator directly (foreground)
```

## Configuration

Edit `/etc/devicemon-web/config.env`:

```bash
# Change server port
PORT=3002

# Set logging level
LOG_LEVEL=info

# Configure server URL (optional)
# VITE_SERVER_URL=http://192.168.1.100:3002
```

After changing configuration:

```bash
sudo systemctl restart devicemon-web
```

## Customizing Maps

Register and parameter maps can be customized:

```bash
# Edit maps
sudo nano /etc/devicemon-web/maps/registers.map
sudo nano /etc/devicemon-web/maps/parameters.map
sudo nano /etc/devicemon-web/maps/boardtypes.map

# Restart to apply changes
sudo systemctl restart devicemon-web
```

## Logs and Debugging

```bash
# Service logs
journalctl -u devicemon-web -f

# Emulator logs
journalctl -u devicemon-web-emulator -f

# Recent errors
journalctl -u devicemon-web -p err -n 50

# All logs since boot
journalctl -u devicemon-web -b
```

## Security

The service runs as a dedicated `devicemon` user with limited privileges:

- No login shell
- Restricted filesystem access
- Memory limited to 512MB
- Protected system directories

Systemd security features enabled:
- `NoNewPrivileges=true`
- `PrivateTmp=true`
- `ProtectSystem=strict`
- `ProtectHome=true`
- `ProtectKernelTunables=true`

## Firewall Configuration

If using a firewall, allow these ports:

```bash
# UFW
sudo ufw allow 3002/tcp    # Web interface
sudo ufw allow 2009/tcp    # Device TCP communication
sudo ufw allow 2011/udp    # Device UDP communication + discovery

# Firewalld
sudo firewall-cmd --permanent --add-port=3002/tcp
sudo firewall-cmd --permanent --add-port=2009/tcp
sudo firewall-cmd --permanent --add-port=2011/udp
sudo firewall-cmd --reload
```

## Uninstallation

```bash
# Remove package
yay -R devicemon-web

# Or with paru
paru -R devicemon-web

# Remove configuration (optional)
sudo rm -rf /etc/devicemon-web
sudo rm -rf /var/log/devicemon-web

# Remove devicemon user (optional)
sudo userdel devicemon
sudo groupdel devicemon
```

## Building the Package (For Maintainers)

### Prerequisites

```bash
# Install build tools
sudo pacman -S base-devel git nodejs npm
```

### Build Steps

1. **Prepare the source**:
   ```bash
   cd aur/
   ```

2. **Update PKGBUILD**:
   - Update `pkgver` to match your release version
   - Update `url` to your repository
   - Update maintainer information

3. **Generate checksums**:
   ```bash
   updpkgsums
   ```

4. **Test build locally**:
   ```bash
   makepkg -f
   ```

5. **Test installation**:
   ```bash
   makepkg -i
   ```

6. **Generate .SRCINFO**:
   ```bash
   makepkg --printsrcinfo > .SRCINFO
   ```

### Publishing to AUR

1. **Initial Setup** (first time only):
   ```bash
   # Configure SSH for AUR
   ssh-keygen -t ed25519 -C "your.email@example.com"

   # Add key to AUR account
   cat ~/.ssh/id_ed25519.pub
   # Upload to: https://aur.archlinux.org/account/

   # Clone AUR repository
   git clone ssh://aur@aur.archlinux.org/devicemon-web.git aur-repo
   ```

2. **Update Package**:
   ```bash
   cd aur-repo/

   # Copy files from your project
   cp ../PKGBUILD .
   cp ../devicemon-web.install .
   cp ../devicemon-web.service .
   cp ../devicemon-web-emulator.service .
   cp ../devicemon-web.desktop .
   cp ../devicemon-web-server .
   cp ../devicemon-web-emulator-bin .
   cp ../config.env .

   # Generate .SRCINFO
   makepkg --printsrcinfo > .SRCINFO

   # Commit and push
   git add .
   git commit -m "Update to version X.Y.Z"
   git push
   ```

## Version Management

When releasing a new version:

1. Update `pkgver` in `PKGBUILD`
2. Increment `pkgrel` to 1 for new versions
3. Update checksums: `updpkgsums`
4. Test build: `makepkg -f`
5. Update `.SRCINFO`: `makepkg --printsrcinfo > .SRCINFO`
6. Commit and push to AUR

## Troubleshooting

### Service won't start

```bash
# Check service status
systemctl status devicemon-web

# Check logs
journalctl -u devicemon-web -n 50

# Check permissions
ls -la /opt/devicemon-web
ls -la /etc/devicemon-web
```

### Port already in use

```bash
# Find what's using port 3002
sudo lsof -i :3002

# Change port in config
sudo nano /etc/devicemon-web/config.env
# Set: PORT=3003

# Restart service
sudo systemctl restart devicemon-web
```

### Cannot connect to devices

```bash
# Check if emulator is running
systemctl status devicemon-web-emulator

# Check firewall
sudo ufw status
sudo firewall-cmd --list-all

# Check network connectivity
ping <device-ip>
```

## Contributing

To contribute to the AUR package:

1. Fork the main repository
2. Make changes to files in `aur/` directory
3. Test the package build
4. Submit a pull request

## Support

- **Issues**: Report on GitHub repository
- **AUR Comments**: Use AUR package page
- **Documentation**: `/usr/share/doc/devicemon-web/`

## License

MIT License - See LICENSE file in package
