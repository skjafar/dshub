# DSHub - AUR Package

This directory contains files for building and distributing DSHub as an Arch Linux AUR package.

## Package Information

- **Package Name**: `dshub`
- **Description**: Modern web application for monitoring and controlling embedded devices
- **License**: MIT
- **Architecture**: x86_64, aarch64
- **Dependencies**: nodejs>=18.0.0, npm
- **Optional Dependencies**: python (for emulator), pm2 (for alternative process management)

## Installation for Users

### From AUR (Recommended)

```bash
# Using yay
yay -S dshub

# Using paru
paru -S dshub

# Manual installation
git clone https://aur.archlinux.org/dshub.git
cd dshub
makepkg -si
```

### Quick Start After Installation

```bash
# Start the service
sudo systemctl start dshub

# Enable auto-start on boot
sudo systemctl enable dshub

# Open in browser
xdg-open http://localhost:3002

# Or use the helper command
dshub start
dshub open
```

### Using the Emulator

```bash
# Start emulator
sudo systemctl start dshub-emulator

# Or run directly
dshub-emulator run

# Or use the helper command
dshub-emulator start
```

## Package Structure

After installation, files are located at:

```
/opt/dshub/          # Application files
├── dist/                    # Server build
├── client/build/            # Client build
├── emulator/                # Board emulator
└── node_modules/            # Dependencies

/etc/dshub/          # Configuration
├── config.env               # Environment variables
└── maps/                    # Register/parameter maps
    ├── registers.map
    ├── parameters.map
    └── boardtypes.map

/usr/bin/                    # Commands
├── dshub            # Service wrapper
└── dshub-emulator   # Emulator wrapper

/usr/lib/systemd/system/     # Systemd services
├── dshub.service
└── dshub-emulator.service

/usr/share/applications/     # Desktop entry
└── dshub.desktop

/usr/share/doc/dshub/  # Documentation
├── README.md
├── QUICK_START.md
└── DEPLOYMENT-PM2.md

/var/log/dshub/      # Log files
```

## Helper Commands

### dshub

```bash
dshub start      # Start the service
dshub stop       # Stop the service
dshub restart    # Restart the service
dshub status     # Show service status
dshub logs       # Show live logs
dshub enable     # Enable auto-start on boot
dshub disable    # Disable auto-start
dshub open       # Open in browser
```

### dshub-emulator

```bash
dshub-emulator start    # Start emulator service
dshub-emulator stop     # Stop emulator service
dshub-emulator restart  # Restart emulator service
dshub-emulator status   # Show service status
dshub-emulator logs     # Show live logs
dshub-emulator enable   # Enable auto-start on boot
dshub-emulator disable  # Disable auto-start
dshub-emulator run      # Run emulator directly (foreground)
```

## Configuration

Edit `/etc/dshub/config.env`:

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
sudo systemctl restart dshub
```

## Customizing Maps

Register and parameter maps can be customized:

```bash
# Edit maps
sudo nano /etc/dshub/maps/registers.map
sudo nano /etc/dshub/maps/parameters.map
sudo nano /etc/dshub/maps/boardtypes.map

# Restart to apply changes
sudo systemctl restart dshub
```

## Logs and Debugging

```bash
# Service logs
journalctl -u dshub -f

# Emulator logs
journalctl -u dshub-emulator -f

# Recent errors
journalctl -u dshub -p err -n 50

# All logs since boot
journalctl -u dshub -b
```

## Security

The service runs as a dedicated `dshub` user with limited privileges:

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
yay -R dshub

# Or with paru
paru -R dshub

# Remove configuration (optional)
sudo rm -rf /etc/dshub
sudo rm -rf /var/log/dshub

# Remove dshub user (optional)
sudo userdel dshub
sudo groupdel dshub
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
   git clone ssh://aur@aur.archlinux.org/dshub.git aur-repo
   ```

2. **Update Package**:
   ```bash
   cd aur-repo/

   # Copy files from your project
   cp ../PKGBUILD .
   cp ../dshub.install .
   cp ../dshub.service .
   cp ../dshub-emulator.service .
   cp ../dshub.desktop .
   cp ../dshub-server .
   cp ../dshub-emulator-bin .
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
systemctl status dshub

# Check logs
journalctl -u dshub -n 50

# Check permissions
ls -la /opt/dshub
ls -la /etc/dshub
```

### Port already in use

```bash
# Find what's using port 3002
sudo lsof -i :3002

# Change port in config
sudo nano /etc/dshub/config.env
# Set: PORT=3003

# Restart service
sudo systemctl restart dshub
```

### Cannot connect to devices

```bash
# Check if emulator is running
systemctl status dshub-emulator

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
- **Documentation**: `/usr/share/doc/dshub/`

## License

MIT License - See LICENSE file in package
