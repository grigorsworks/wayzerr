#!/usr/bin/env bash
# Wayzerr: build -> sign (Developer ID, hardened runtime, secure timestamp) -> notarize -> staple -> DMG -> sign/notarize/staple the DMG.
# Run on a Mac with Xcode command line tools and your "Developer ID Application" certificate in the login keychain.
#
# One-time setup (stores your Apple credentials in the keychain; nothing is written to this repo):
#   xcrun notarytool store-credentials wayzerr-notary --apple-id "you@example.com" --team-id "ABCDE12345" --password "app-specific-password"
#   (or with an App Store Connect API key: --key AuthKey_XXXX.p8 --key-id XXXX --issuer 00000000-0000-0000-0000-000000000000)
#
# Then:
#   export WZ_IDENTITY="Developer ID Application: Your Name (ABCDE12345)"
#   scripts/sign-and-notarize.sh
set -euo pipefail
cd "$(dirname "$0")/.."

IDENTITY="${WZ_IDENTITY:?export WZ_IDENTITY='Developer ID Application: Your Name (TEAMID)'}"
PROFILE="${WZ_NOTARY_PROFILE:-wayzerr-notary}"
APP="dist/mac-arm64/Wayzerr.app"
DMG="dist/Wayzerr.dmg"
VER="$(node -p "require('./package.json').version")"
ENGINE="${WZ_ENGINE_DIR:-}"          # optional: folder with bin/qemu-system-aarch64, bin/qemu-img, lib/*.dylib that you publish for "Give your bots a computer"

step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

notarize() {   # $1 = file to submit (zip, dmg or pkg)
  local out id status
  out="$(xcrun notarytool submit "$1" --keychain-profile "$PROFILE" --wait --output-format json)"
  echo "$out"
  id="$(printf '%s' "$out" | /usr/bin/python3 -I -c 'import sys,json; print(json.load(sys.stdin)["id"])')"
  status="$(printf '%s' "$out" | /usr/bin/python3 -I -c 'import sys,json; print(json.load(sys.stdin)["status"])')"
  if [ "$status" != "Accepted" ]; then
    echo "Notarization status: $status. Apple's log:"; xcrun notarytool log "$id" --keychain-profile "$PROFILE" || true
    exit 1
  fi
}

step "1. Build + sign the app (electron-builder: inner binaries first, hardened runtime, secure timestamp, fuses)"
rm -rf dist
CSC_NAME="$IDENTITY" npx electron-builder --mac dir --arm64 -p never

step "2. Pre-flight (must have no FAIL before spending a notarization)"
bash scripts/preflight.sh "$APP"

step "3. Notarize the app"
ditto -c -k --keepParent "$APP" dist/Wayzerr-notarize.zip     # ditto, not zip: keeps symlinks and extended attributes
notarize dist/Wayzerr-notarize.zip
xcrun stapler staple "$APP"
xcrun stapler validate "$APP"
spctl --assess --type execute -vv "$APP"

if [ -n "$ENGINE" ]; then
  step "3b. Sign the VM engine you publish (qemu needs com.apple.security.hypervisor; its dylibs must be signed first)"
  for f in "$ENGINE"/lib/*.dylib; do codesign --force --timestamp --options runtime --sign "$IDENTITY" "$f"; done
  codesign --force --timestamp --options runtime --sign "$IDENTITY" "$ENGINE/bin/qemu-img"
  codesign --force --timestamp --options runtime --entitlements build/entitlements.qemu.plist --sign "$IDENTITY" "$ENGINE/bin/qemu-system-aarch64"
  bash scripts/preflight.sh "$APP" --qemu "$ENGINE/bin/qemu-system-aarch64" | sed -n '/== 10/,$p'
  echo "Now re-pack the engine tarball, update its size + sha256 in the manifest on wayzerr.com (src/computer.js:274-302)."
fi

step "4. Update zip for the in-app updater (made from the STAPLED app)"
ditto -c -k --keepParent "$APP" "dist/Wayzerr-update-$VER.zip"

step "5. DMG from the stapled app (macOS builds it natively; scripts/make-dmg.sh is only for building on Linux)"
STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
ditto "$APP" "$STAGE/Wayzerr.app"
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname Wayzerr -srcfolder "$STAGE" -fs HFS+ -format UDZO -ov "$DMG"
# (prefer the custom background? try:  npx electron-builder --prepackaged "$APP" --mac dmg --arm64 -p never   and sign the result below)
codesign --force --timestamp --sign "$IDENTITY" "$DMG"
codesign --verify --verbose=2 "$DMG"

step "6. Notarize + staple the DMG"
notarize "$DMG"
xcrun stapler staple "$DMG"
xcrun stapler validate "$DMG"
spctl --assess --type open --context context:primary-signature -vv "$DMG"

step "7. Final check"
bash scripts/preflight.sh "$APP" "$DMG" --post

step "8. Update feed (the app checks this sha256 + size before it installs anything)"
node scripts/release-info.js feed "https://wayzerr.com/Wayzerr.dmg" "$DMG"
echo "Upload dist/Wayzerr.dmg and dist/latest.json together."

# --- Test it like a customer, on a Mac that has never seen the app (a clean macOS VM works):
#   1. Put the DMG on a web server (or AirDrop it), download it with Safari so it gets the quarantine flag.
#   2. Open the DMG, drag Wayzerr to Applications, double-click it: expect the single "downloaded from the Internet. Open?" prompt, no "can't be opened" / "unidentified developer".
#   3. Check:  xattr -l /Applications/Wayzerr.app ; spctl -a -vv /Applications/Wayzerr.app  (source=Notarized Developer ID)
#   4. Turn Wi-Fi off before step 2 to prove the stapled ticket works offline.
