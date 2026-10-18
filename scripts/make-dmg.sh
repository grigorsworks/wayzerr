#!/usr/bin/env bash
# Builds Wayzerr.dmg (drag-to-Applications installer with a custom background) on Linux.
# Needs: mkfs.hfsplus (hfsprogs), hfsplus (planetbeing/libdmg-hfsplus + our `untar` command),
# dmg (fanquake/libdmg-hfsplus), python3 with ds_store + mac_alias.
# On a Mac you can instead run:  npx electron-builder --mac dmg
set -euo pipefail
APP=${1:-dist/mac-arm64/Wayzerr.app}
OUT=${2:-dist/Wayzerr.dmg}
BG=${3:-build/dmg-background.tiff}
VOL=Wayzerr
W=$(mktemp -d)
mkdir -p "$W/stage" && cp -a "$APP" "$W/stage/"
tar --format=ustar -C "$W/stage" -cf "$W/stage.tar" .
SZ=$(du -sm "$W/stage" | cut -f1)
dd if=/dev/zero of="$W/vol.hfs" bs=1M count=$((SZ * 125 / 100 + 40)) status=none
mkfs.hfsplus -v "$VOL" "$W/vol.hfs" >/dev/null

# Background first, so its folder/file get the first catalog IDs (16 and 17).
hfsplus "$W/vol.hfs" mkdir /.background
hfsplus "$W/vol.hfs" add "$BG" /.background/background.tiff
[ -f build/VolumeIcon.icns ] && hfsplus "$W/vol.hfs" add build/VolumeIcon.icns /.VolumeIcon.icns

python3 - "$W/vol.hfs" "$W/DS_Store" "$VOL" <<'PY'
import sys, struct, datetime
from ds_store import DSStore
from mac_alias import Alias, VolumeInfo, TargetInfo
img, out, vol = sys.argv[1:4]
hdr = open(img, 'rb').read(1024 + 128)[1024:]
cdate = datetime.datetime(1904, 1, 1, tzinfo=datetime.timezone.utc) + datetime.timedelta(seconds=struct.unpack('>I', hdr[16:20])[0])
alias = Alias(
    volume=VolumeInfo(vol, cdate, b'H+', 5, 0, b'\x00\x00', posix_path='/Volumes/' + vol),
    target=TargetInfo(0, 'background.tiff', 16, 17, cdate, b'\x00' * 4, b'\x00' * 4,
                      folder_name='.background', cnid_path=[16],
                      carbon_path=vol + ':.background:background.tiff',
                      posix_path='/.background/background.tiff'),
)
with DSStore.open(out, 'w+') as d:
    d['.']['bwsp'] = {'ShowStatusBar': False, 'WindowBounds': '{{200, 120}, {660, 512}}', 'ContainerShowSidebar': False,
                      'ShowToolbar': False, 'ShowTabView': False, 'ShowSidebar': False, 'ShowPathbar': False, 'SidebarWidth': 0}
    d['.']['icvp'] = {'viewOptionsVersion': 1, 'iconSize': 128.0, 'gridSpacing': 100.0, 'textSize': 13.0, 'arrangeBy': 'none',
                      'showIconPreview': True, 'showItemInfo': False, 'labelOnBottom': True,
                      'backgroundType': 2, 'backgroundImageAlias': alias.to_bytes(),
                      'backgroundColorRed': 0.984, 'backgroundColorGreen': 0.98, 'backgroundColorBlue': 0.992,
                      'gridOffsetX': 0.0, 'gridOffsetY': 0.0, 'scrollPositionX': 0.0, 'scrollPositionY': 0.0}
    d['.']['vSrn'] = ('long', 1)
    d['Wayzerr.app']['Iloc'] = (180, 246)
    d['Applications']['Iloc'] = (480, 246)
    d['.background']['Iloc'] = (900, 900)
    d['.VolumeIcon.icns']['Iloc'] = (900, 1000)
PY

hfsplus "$W/vol.hfs" untar "$W/stage.tar" >/dev/null
hfsplus "$W/vol.hfs" symlink /Applications /Applications
hfsplus "$W/vol.hfs" add "$W/DS_Store" /.DS_Store
dmg "$W/vol.hfs" "$OUT" >/dev/null
rm -rf "$W"
echo "Built $OUT"
