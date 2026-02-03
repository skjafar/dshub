# AUR Maintainer Guide - DSHub

Quick reference for maintaining the DSHub AUR package.

## Initial AUR Setup (One Time)

```bash
# 1. Create AUR account at https://aur.archlinux.org

# 2. Generate SSH key
ssh-keygen -t ed25519 -C "your.email@example.com"

# 3. Add public key to AUR account
cat ~/.ssh/id_ed25519.pub
# Upload at: https://aur.archlinux.org/account/

# 4. Test SSH connection
ssh -T aur@aur.archlinux.org

# 5. Clone your package repository (first time)
git clone ssh://aur@aur.archlinux.org/dshub.git aur-publish
```

## Publishing New Version

### 1. Update Version

Edit `PKGBUILD`:
```bash
pkgver=2.1.0    # New version
pkgrel=1        # Reset to 1 for new version
```

### 2. Update Checksums

```bash
cd aur/
updpkgsums
```

### 3. Test Build

```bash
# Clean build
makepkg -f

# Test installation
makepkg -i

# Test the installed package
dshub start
xdg-open http://localhost:3002
```

### 4. Generate .SRCINFO

```bash
makepkg --printsrcinfo > .SRCINFO
```

### 5. Publish to AUR

```bash
# Copy files to AUR repo
cp PKGBUILD .SRCINFO *.service *.desktop *.install *-bin config.env ../aur-publish/

cd ../aur-publish/

# Commit
git add .
git commit -m "Update to version 2.1.0"

# Push to AUR
git push
```

## Quick Publish Script

Create `publish-aur.sh`:

```bash
#!/bin/bash
set -e

VERSION="$1"

if [ -z "$VERSION" ]; then
    echo "Usage: $0 <version>"
    exit 1
fi

echo "Publishing DSHub v${VERSION} to AUR"

cd aur/

# Update version
sed -i "s/pkgver=.*/pkgver=${VERSION}/" PKGBUILD
sed -i "s/pkgrel=.*/pkgrel=1/" PKGBUILD

# Update checksums
updpkgsums

# Generate .SRCINFO
makepkg --printsrcinfo > .SRCINFO

# Test build
makepkg -f

# Copy to AUR repo
cp PKGBUILD .SRCINFO *.service *.desktop *.install *-bin config.env ../aur-publish/

cd ../aur-publish/

# Commit and push
git add .
git commit -m "Update to version ${VERSION}"
git push

echo "Successfully published v${VERSION} to AUR"
```

Usage:
```bash
chmod +x publish-aur.sh
./publish-aur.sh 2.1.0
```

## Handling Package Updates

### Bug Fix Release

```bash
# Same version, increment pkgrel
pkgver=2.0.0
pkgrel=2    # Increment this
```

### Major/Minor Release

```bash
# New version, reset pkgrel
pkgver=2.1.0    # Update version
pkgrel=1        # Reset to 1
```

## Testing Checklist

Before publishing, verify:

- [ ] Build succeeds: `makepkg -f`
- [ ] Installation works: `makepkg -i`
- [ ] Service starts: `sudo systemctl start dshub`
- [ ] Service status: `systemctl status dshub`
- [ ] Web interface loads: http://localhost:3002
- [ ] Emulator works: `dshub-emulator run`
- [ ] Configuration editable: `/etc/dshub/config.env`
- [ ] Maps customizable: `/etc/dshub/maps/`
- [ ] Helper commands work: `dshub start`
- [ ] Uninstall clean: `pacman -R dshub`

## Common Issues

### Checksum Mismatch

```bash
# Regenerate checksums
updpkgsums
```

### Build Fails

```bash
# Clean build environment
rm -rf pkg/ src/
makepkg -f
```

### Service Won't Start

```bash
# Check logs
journalctl -u dshub -n 50

# Check permissions
ls -la /opt/dshub
ls -la /etc/dshub
```

## Responding to AUR Comments

Common questions and answers:

**Q: Package fails to build**
```
Please provide the full build log:
makepkg -f 2>&1 | tee build.log
```

**Q: Service won't start**
```
Check the service status:
sudo systemctl status dshub
journalctl -u dshub -n 50
```

**Q: How to change port?**
```
Edit /etc/dshub/config.env
Set PORT=3003
sudo systemctl restart dshub
```

**Q: Out of date**
```
Thank you! I'll update to the latest version shortly.
(Then follow "Publishing New Version" steps)
```

## Deleting the Package (Nuclear Option)

Only if absolutely necessary:

```bash
# Request deletion at:
# https://aur.archlinux.org/pkgbase/dshub/request/

# Reason: abandoned, renamed, moved to official repos, etc.
```

## Resources

- AUR Submission Guidelines: https://wiki.archlinux.org/title/AUR_submission_guidelines
- PKGBUILD Manual: https://wiki.archlinux.org/title/PKGBUILD
- makepkg Manual: https://wiki.archlinux.org/title/Makepkg
- .SRCINFO: https://wiki.archlinux.org/title/.SRCINFO

## Contact

For package-specific issues:
- AUR Comments: https://aur.archlinux.org/packages/dshub
- GitHub Issues: https://github.com/yourusername/dshub/issues
