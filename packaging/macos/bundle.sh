#!/usr/bin/env bash
# Builds DSHub.app from target/release/dshub and, when signing secrets are
# set, signs it with a Developer ID, notarizes and staples it. Without
# secrets the bundle is ad-hoc signed (Gatekeeper will still warn).
#   MACOS_CERTIFICATE (base64 .p12), MACOS_CERTIFICATE_PASSWORD,
#   MACOS_SIGNING_IDENTITY, APPLE_ID, APPLE_TEAM_ID, APPLE_APP_PASSWORD
set -euo pipefail
version=$(sed -n 's/^version = "\(.*\)"/\1/p' Cargo.toml | head -1)
app=target/package/DSHub.app
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
install -m755 target/release/dshub "$app/Contents/MacOS/dshub"
sed "s/VERSION/$version/g" packaging/macos/Info.plist > "$app/Contents/Info.plist"
iconset=$(mktemp -d)/dshub.iconset
mkdir -p "$iconset"
for size in 16 32 64 128 256 512; do
    sips -z "$size" "$size" assets/icon.png --out "$iconset/icon_${size}x${size}.png" >/dev/null
done
iconutil -c icns "$iconset" -o "$app/Contents/Resources/dshub.icns"

if [[ -n "${MACOS_CERTIFICATE:-}" ]]; then
    keychain=build.keychain
    echo "$MACOS_CERTIFICATE" | base64 --decode > certificate.p12
    security create-keychain -p ci "$keychain"
    security default-keychain -s "$keychain"
    security unlock-keychain -p ci "$keychain"
    security import certificate.p12 -k "$keychain" -P "$MACOS_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
    security set-key-partition-list -S apple-tool:,apple: -s -k ci "$keychain"
    rm certificate.p12
    codesign --force --options runtime --timestamp --sign "$MACOS_SIGNING_IDENTITY" "$app"
    ditto -c -k --keepParent "$app" target/package/notarize.zip
    xcrun notarytool submit target/package/notarize.zip \
        --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_PASSWORD" --wait
    xcrun stapler staple "$app"
    rm target/package/notarize.zip
else
    codesign --force --sign - "$app"
fi
ditto -c -k --keepParent "$app" dshub-macos-app.zip
