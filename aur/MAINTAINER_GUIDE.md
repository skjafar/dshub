# AUR Maintainer Guide — DSHub

Quick reference for maintaining the `dshub` AUR package.

## Initial AUR Setup (One Time)

```bash
# 1. Create account at https://aur.archlinux.org

# 2. Generate SSH key (if you don't have one)
ssh-keygen -t ed25519 -C "skjafar@gmail.com"

# 3. Upload public key to AUR
cat ~/.ssh/id_ed25519.pub
# Paste at: https://aur.archlinux.org/account/ → SSH Keys

# 4. Test connection
ssh aur@aur.archlinux.org help

# 5. Clone the AUR repo (creates it on first push if it doesn't exist)
git clone ssh://aur@aur.archlinux.org/dshub.git ~/aur-dshub
```

---

## Publishing a New Version

### 1. Update PKGBUILD

In `aur/PKGBUILD`:
```bash
pkgver=0.2.0   # new version
pkgrel=1       # reset to 1 for a new version
```

For a PKGBUILD-only fix at the same app version, only increment `pkgrel`:
```bash
pkgver=0.1.0
pkgrel=2
```

### 2. Regenerate .SRCINFO

```bash
cd aur/
makepkg --printsrcinfo > .SRCINFO
```

### 3. Test Build Locally

```bash
# Full clean build
rm -rf pkg/ src/
makepkg -f

# Install and test
makepkg -i
dshub   # verify it launches
makepkg -ei --noconfirm  # remove test install
```

### 4. Tag the Release on GitHub

```bash
cd /path/to/dshub
git tag v0.2.0
git push origin v0.2.0
```

### 5. Publish to AUR

```bash
# Copy updated files to your AUR repo clone
cp aur/PKGBUILD aur/.SRCINFO ~/aur-dshub/

cd ~/aur-dshub
git add PKGBUILD .SRCINFO
git commit -m "Update to v0.2.0"
git push
```

The AUR package page updates immediately.

---

## Quick Publish Script

Save as `aur/publish-aur.sh`:

```bash
#!/bin/bash
set -e

VERSION="${1:?Usage: $0 <version>}"
AUR_REPO="${2:-$HOME/aur-dshub}"

echo "Publishing DSHub v${VERSION} to AUR"

cd "$(dirname "$0")"   # aur/ directory

# Update version in PKGBUILD
sed -i "s/^pkgver=.*/pkgver=${VERSION}/" PKGBUILD
sed -i "s/^pkgrel=.*/pkgrel=1/" PKGBUILD

# Regenerate .SRCINFO
makepkg --printsrcinfo > .SRCINFO

# Test build
rm -rf pkg/ src/
makepkg -f

echo "Build succeeded. Copying to AUR repo..."
cp PKGBUILD .SRCINFO "$AUR_REPO/"

cd "$AUR_REPO"
git add PKGBUILD .SRCINFO
git commit -m "Update to v${VERSION}"
git push

echo "Published v${VERSION}"
```

Usage:
```bash
chmod +x aur/publish-aur.sh
./aur/publish-aur.sh 0.2.0
```

---

## Testing Checklist

Before pushing to AUR:

- [ ] `makepkg -f` succeeds in a clean `src/` directory
- [ ] `makepkg -i` installs without errors
- [ ] `dshub` launches the window
- [ ] Device scan sends packets (check with Wireshark or emulator)
- [ ] `pacman -R dshub` removes cleanly, no orphaned files
- [ ] `.SRCINFO` regenerated and committed

---

## Common Issues

**`cargo build` fails with missing system lib:**
```bash
# Add to makedepends in PKGBUILD and re-test
sudo pacman -S <missing-package>
```

**Checksum mismatch (if using a tarball source instead of git+):**
```bash
updpkgsums
```

**Build environment is dirty:**
```bash
rm -rf pkg/ src/
makepkg -f
```

---

## AUR Guidelines Reference

- [AUR Submission Guidelines](https://wiki.archlinux.org/title/AUR_submission_guidelines)
- [PKGBUILD Reference](https://wiki.archlinux.org/title/PKGBUILD)
- [.SRCINFO Reference](https://wiki.archlinux.org/title/.SRCINFO)

## Responding to AUR Comments

**Build fails:**
> Please share the full log: `makepkg -f 2>&1 | tee build.log`

**App won't launch:**
> Run `dshub` in a terminal and share the output.

**Package out of date:**
> Thanks — update is in progress.
