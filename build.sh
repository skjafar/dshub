#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BINARY="$ROOT/src-tauri/target/release/dshub"

usage() {
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  dev       Start dev mode with hot-reload (requires tauri-cli)"
    echo "  bin       Build standalone binary only (fast)"
    echo "  pkg       Build binary + .deb and .rpm packages"
    echo "  install   Build .deb and install it with dpkg"
    echo "  run       Run the last built binary"
    echo "  clean     Remove all build artifacts"
    echo ""
    echo "Note: Windows (.exe) and macOS (.dmg) builds require running on those"
    echo "platforms natively, or use GitHub Actions (.github/workflows/build.yml)."
    echo ""
}

build_frontend() {
    echo ">> Building frontend..."
    npm --prefix "$ROOT/client" ci --silent
    npm --prefix "$ROOT/client" run build
}

check_tauri_cli() {
    if ! cargo tauri --version &>/dev/null; then
        echo "tauri-cli not found. Installing..."
        cargo install tauri-cli --version "^2" --locked
    fi
}

case "${1:-}" in
    dev)
        check_tauri_cli
        echo ">> Starting Tauri dev mode..."
        cd "$ROOT/src-tauri"
        cargo tauri dev
        ;;

    bin)
        build_frontend
        echo ">> Compiling Rust binary..."
        cd "$ROOT/src-tauri"
        cargo build --release
        echo ""
        echo "Done: $BINARY"
        ;;

    pkg)
        check_tauri_cli
        build_frontend
        echo ">> Building packages (.deb, .rpm)..."
        cd "$ROOT/src-tauri"
        cargo tauri build
        echo ""
        echo "Done:"
        find "$ROOT/src-tauri/target/release/bundle" -name "*.deb" -o -name "*.rpm" | sort | sed 's/^/  /'
        ;;

    install)
        check_tauri_cli
        build_frontend
        echo ">> Building .deb package..."
        cd "$ROOT/src-tauri"
        cargo tauri build --bundles deb
        DEB=$(find "$ROOT/src-tauri/target/release/bundle/deb" -name "*.deb" | head -1)
        echo ">> Installing $DEB..."
        sudo dpkg -i "$DEB"
        echo ""
        echo "Installed. Run: dshub"
        ;;

    run)
        if [ ! -f "$BINARY" ]; then
            echo "No binary found. Run '$0 bin' first."
            exit 1
        fi
        "$BINARY"
        ;;

    clean)
        echo ">> Cleaning build artifacts..."
        rm -rf "$ROOT/src-tauri/target"
        rm -rf "$ROOT/client/build"
        echo "Done."
        ;;

    *)
        usage
        exit 1
        ;;
esac
