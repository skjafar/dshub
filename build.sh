#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
case "${1:-bin}" in
  dev) cargo run ;;
  bin) cargo build --release ;;
  run) ./target/release/dshub ;;
  test) cargo test; cargo clippy --all-targets -- -D warnings ;;
  pkg)
    cargo build --release
    stage="target/package/dshub"
    mkdir -p "$stage/DEBIAN" "$stage/usr/bin" "$stage/usr/share/applications" "$stage/usr/share/icons/hicolor/128x128/apps" "$stage/usr/share/doc/dshub"
    install -m755 target/release/dshub "$stage/usr/bin/dshub"
    install -m644 packaging/dshub.desktop "$stage/usr/share/applications/dshub.desktop"
    install -m644 assets/icon.png "$stage/usr/share/icons/hicolor/128x128/apps/dshub.png"
    install -m644 LICENSE "$stage/usr/share/doc/dshub/copyright"
    version=$(sed -n 's/^version = "\([^"]*\)"/\1/p' Cargo.toml | head -1)
    arch=$(dpkg --print-architecture)
    cat > "$stage/DEBIAN/control" <<CONTROL
Package: dshub
Version: $version
Section: electronics
Priority: optional
Architecture: $arch
Maintainer: Sofian Jafar <skjafar@gmail.com>
Depends: libegl1, libgl1, libxkbcommon0
Recommends: xdg-desktop-portal
Description: Native Rust device monitoring and control workstation
CONTROL
    dpkg-deb --root-owner-group --build "$stage" "target/package/dshub_${version}_${arch}.deb"
    ;;
  *) echo "Usage: $0 {dev|bin|run|test|pkg}" >&2; exit 2 ;;
esac
