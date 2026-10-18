#!/usr/bin/env bash
# Wayzerr pre-flight: run BEFORE `xcrun notarytool submit` (and again with --post afterwards).
# Read-only: it only runs codesign / spctl / stapler / otool / plutil / file / python3 -I on what you point it at.
#
#   scripts/preflight.sh dist/mac-arm64/Wayzerr.app                         # before notarizing
#   scripts/preflight.sh dist/mac-arm64/Wayzerr.app dist/Wayzerr.dmg --post # after notarizing + stapling
#   scripts/preflight.sh APP [DMG] [--post] [--qemu path/to/qemu-system-aarch64]
#
# Exit code 0 = no FAIL. WARN lines are things Apple accepts but you should know about.
set -u
APP=""; DMG=""; POST=0; QEMU=""
while [ $# -gt 0 ]; do
  case "$1" in
    --post) POST=1 ;;
    --qemu) shift; QEMU="${1:-}" ;;
    *.dmg)  DMG="$1" ;;
    *)      [ -z "$APP" ] && APP="$1" ;;
  esac
  shift
done
[ -d "$APP" ] || { echo "usage: $0 path/to/Wayzerr.app [Wayzerr.dmg] [--post] [--qemu path]"; exit 2; }
APP="${APP%/}"
FAIL=0; WARN=0
pass() { printf '  PASS  %s\n' "$*"; }
fail() { printf '  FAIL  %s\n' "$*"; FAIL=$((FAIL+1)); }
warn() { printf '  WARN  %s\n' "$*"; WARN=$((WARN+1)); }
info() { printf '  info  %s\n' "$*"; }
hdr()  { printf '\n== %s\n' "$*"; }

PLIST="$APP/Contents/Info.plist"
pl() { /usr/bin/plutil -extract "$1" raw -o - "$PLIST" 2>/dev/null; }

hdr "1. The app and its Info.plist"
info "bundle id $(pl CFBundleIdentifier), version $(pl CFBundleShortVersionString) (build $(pl CFBundleVersion)), minimum macOS $(pl LSMinimumSystemVersion)"
for k in NSMicrophoneUsageDescription NSAppleEventsUsageDescription; do
  v="$(pl $k)"; [ -n "$v" ] && pass "$k is set" || fail "$k is missing (voice / osascript keystrokes need it)"
done
for k in NSCameraUsageDescription NSBluetoothAlwaysUsageDescription NSAudioCaptureUsageDescription; do
  v="$(pl $k)"; case "$v" in "This app needs access to"*) warn "$k is still Electron's placeholder: \"$v\"";; esac
done
[ -n "$(pl NSDownloadsFolderUsageDescription)" ] || warn "NSDownloadsFolderUsageDescription missing: macOS shows a generic Downloads prompt"
[ "$(pl NSAppTransportSecurity.NSAllowsArbitraryLoads)" = "true" ] && warn "NSAllowsArbitraryLoads is true (Electron default; fine for notarization, a reviewer may ask why)"

hdr "2. Developer ID signature on the app"
OUT="$(/usr/bin/codesign -dvvv "$APP" 2>&1)"
case "$OUT" in *"Signature=adhoc"*) fail "ad-hoc signature (Signature=adhoc): needs a Developer ID Application certificate";; *"not signed at all"*) fail "not signed";; esac
echo "$OUT" | grep -q '^Authority=Developer ID Application' && pass "Authority: $(echo "$OUT" | grep -m1 '^Authority=Developer ID Application' | cut -d= -f2-)" || fail "no 'Developer ID Application' authority"
TEAM="$(echo "$OUT" | sed -n 's/^TeamIdentifier=//p')"
{ [ -n "$TEAM" ] && [ "$TEAM" != "not set" ]; } && pass "TeamIdentifier=$TEAM" || fail "TeamIdentifier not set"
VER="$(/usr/bin/codesign --verify --deep --strict --verbose=2 "$APP" 2>&1)" && pass "codesign --verify --deep --strict" || { fail "codesign --verify --deep --strict failed:"; echo "$VER" | tail -5 | sed 's/^/        /'; }

hdr "3. Every Mach-O file: signed by the same team, hardened runtime, secure timestamp"
N=0; BAD=0
while IFS= read -r -d '' f; do
  case "$(file -b "$f")" in *Mach-O*) ;; *) continue;; esac
  N=$((N+1)); rel="${f#$APP/Contents/}"
  o="$(/usr/bin/codesign -dvv "$f" 2>&1)"
  p=""
  echo "$o" | grep -q 'code object is not signed' && p="unsigned"
  echo "$o" | grep -q 'Signature=adhoc' && p="$p ad-hoc"
  echo "$o" | grep -Eq 'flags=0x[0-9a-f]+\(.*runtime' || p="$p no-hardened-runtime"
  echo "$o" | grep -q '^Timestamp=' || p="$p no-secure-timestamp"
  t="$(echo "$o" | sed -n 's/^TeamIdentifier=//p')"; [ -n "$TEAM" ] && [ "$t" != "$TEAM" ] && p="$p team-mismatch($t)"
  [ -n "$p" ] && { BAD=$((BAD+1)); [ $BAD -le 12 ] && printf '        %s:%s\n' "$rel" "$p"; }
done < <(find "$APP" -type f -print0)
[ $BAD -gt 12 ] && printf '        ... and %d more\n' $((BAD-12))
[ $BAD -eq 0 ] && pass "all $N Mach-O files are Developer ID signed, hardened, timestamped" || fail "$BAD of $N Mach-O files are not notarization-ready"

hdr "4. Entitlements"
EN="$(/usr/bin/codesign -d --entitlements :- "$APP" 2>/dev/null)"
has() { echo "$EN" | grep -q "<key>$1</key>"; }
has com.apple.security.get-task-allow && fail "get-task-allow is set (notarization rejects it)" || pass "no get-task-allow"
for k in com.apple.security.cs.allow-jit com.apple.security.device.audio-input com.apple.security.automation.apple-events; do
  has $k && pass "main app has $k" || warn "main app lacks $k (needed under the hardened runtime: JIT / microphone / osascript)"
done
has com.apple.security.cs.disable-library-validation && warn "disable-library-validation is on: any unsigned dylib can be loaded into Wayzerr"
has com.apple.security.cs.allow-dyld-environment-variables && warn "allow-dyld-environment-variables is on"
has com.apple.security.app-sandbox && info "app-sandbox is on (a Mac App Store style build; Wayzerr's VM / osascript / npm will not work in it)"

hdr "5. Electron fuses (what a local attacker can do to a signed Wayzerr that holds Screen Recording / Accessibility)"
EF="$APP/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework"
FUSES="$(/usr/bin/python3 -I - "$EF" <<'PYEOF'
import sys
data = open(sys.argv[1], 'rb').read()
s = b'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'
i = data.find(s)
names = ['RunAsNode', 'EnableCookieEncryption', 'EnableNodeOptionsEnvironmentVariable', 'EnableNodeCliInspectArguments',
         'EnableEmbeddedAsarIntegrityValidation', 'OnlyLoadAppFromAsar', 'LoadBrowserProcessSpecificV8Snapshot',
         'GrantFileProtocolExtraPrivileges', 'WasmTrapHandlers']
want = {'EnableNodeOptionsEnvironmentVariable': '0', 'EnableNodeCliInspectArguments': '0',
        'EnableEmbeddedAsarIntegrityValidation': '1', 'OnlyLoadAppFromAsar': '1', 'EnableCookieEncryption': '1'}
if i < 0:
    print('FAIL fuse wire not found'); sys.exit(0)
v = [chr(b) for b in data[i + len(s) + 2: i + len(s) + 2 + data[i + len(s) + 1]]]
for name, val in zip(names, v):
    if name in want:
        print(('PASS ' if val == want[name] else 'FAIL ') + f'{name} = {val} (want {want[name]})')
    elif name == 'RunAsNode':
        print(('WARN ' if val == '1' else 'PASS ') + f'RunAsNode = {val}  (1 = any program can run Wayzerr as a Node.js; src/runtime.js:36 needs it until you ship a separate node)')
PYEOF
)"
while IFS= read -r line; do
  case "$line" in PASS*) pass "${line#PASS }";; WARN*) warn "${line#WARN }";; FAIL*) fail "${line#FAIL }";; esac
done <<< "$FUSES"

hdr "6. Things inside the bundle that the notary service also looks into"
ARCH=0
while IFS= read -r -d '' f; do
  case "$(file -b "$f")" in
    *Zip*|*gzip*|*"tar archive"*|*"POSIX tar"*|*"ar archive"*|*"Java archive"*|*"PE32"*|*ELF*|*"disk image"*|*"xar archive"*)
      ARCH=$((ARCH+1)); [ $ARCH -le 8 ] && warn "archive / foreign binary inside the bundle: ${f#$APP/Contents/} ($(file -b "$f" | cut -c1-40)); the notary opens archives and every Mach-O in them must be signed too";;
  esac
done < <(find "$APP" -type f -print0)
[ $ARCH -eq 0 ] && pass "no archives or foreign binaries inside the bundle"
ABS=0
while IFS= read -r -d '' l; do t="$(readlink "$l")"; case "$t" in /*|*../../../../*) ABS=$((ABS+1)); fail "symlink points outside the bundle: ${l#$APP/Contents/} -> $t";; esac; done < <(find "$APP" -type l -print0)
[ $ABS -eq 0 ] && pass "no absolute symlinks"

hdr "7. Strings Apple's scanners and human reviewers notice (info only)"
ASAR="$APP/Contents/Resources/app.asar"
if [ -f "$ASAR" ]; then
  for s in 'com.apple.quarantine' 'xattr -cr' 'ELECTRON_RUN_AS_NODE' 'cloudflared' 'osascript' 'screencapture' 'CGEventPost' 'curl -fsS'; do
    c="$(LC_ALL=C grep -a -c -F -- "$s" "$ASAR" 2>/dev/null)"; info "$(printf '%-22s' "$s") appears on $c line(s) of app.asar"
  done
fi

hdr "8. Notarization state"
if [ $POST -eq 1 ]; then
  /usr/bin/xcrun stapler validate "$APP" >/dev/null 2>&1 && pass "stapled ticket present on the app" || fail "app has no stapled ticket"
  S="$(/usr/sbin/spctl --assess --type execute -vv "$APP" 2>&1)"
  echo "$S" | grep -q 'source=Notarized Developer ID' && pass "Gatekeeper: Notarized Developer ID" || fail "Gatekeeper: $(echo "$S" | tr '\n' ' ')"
else
  info "skipped (run again with --post after notarizing and stapling)"
fi

if [ -n "$DMG" ]; then
  hdr "9. The DMG"
  D="$(/usr/bin/codesign -dvv "$DMG" 2>&1)"
  echo "$D" | grep -q '^Authority=Developer ID Application' && pass "DMG is signed ($(echo "$D" | sed -n 's/^TeamIdentifier=/team /p'))" || fail "DMG is not signed with Developer ID"
  if [ $POST -eq 1 ]; then
    /usr/bin/xcrun stapler validate "$DMG" >/dev/null 2>&1 && pass "stapled ticket present on the DMG" || fail "DMG has no stapled ticket"
    S="$(/usr/sbin/spctl --assess --type open --context context:primary-signature -vv "$DMG" 2>&1)"
    echo "$S" | grep -q 'accepted' && pass "Gatekeeper accepts the DMG" || fail "Gatekeeper: $(echo "$S" | tr '\n' ' ')"
  fi
fi

if [ -n "$QEMU" ]; then
  hdr "10. VM engine: $QEMU"
  Q="$(/usr/bin/codesign -dvv --entitlements :- "$QEMU" 2>&1)"
  echo "$Q" | grep -q 'com.apple.security.hypervisor' && pass "qemu has com.apple.security.hypervisor (needed for -accel hvf)" || fail "qemu lacks com.apple.security.hypervisor: the computer will not start"
  echo "$Q" | grep -q 'Signature=adhoc' && warn "qemu is ad-hoc signed (works when the app downloads it; sign it with Developer ID if you ship it inside the app)"
  echo "$Q" | grep -Eq 'flags=0x[0-9a-f]+\(.*runtime' && info "qemu has hardened runtime" || info "qemu has no hardened runtime"
  /usr/bin/otool -L "$QEMU" 2>/dev/null | tail -n +2 | awk '{print $1}' | grep -v -E '^/usr/lib|^/System' | while read -r lib; do
    r="${lib/@executable_path/$(dirname "$QEMU")}"
    /usr/bin/codesign -dv "$r" >/dev/null 2>&1 && info "links $lib (signed)" || warn "links $lib (UNSIGNED or missing)"
  done
fi

hdr "Result"
printf '  %d FAIL, %d WARN\n' "$FAIL" "$WARN"
if [ $FAIL -eq 0 ]; then echo "  No blockers found by this script. (The real test is still: notarytool submit --wait says Accepted.)"; else echo "  Fix the FAIL lines before submitting."; fi
[ $FAIL -eq 0 ]
