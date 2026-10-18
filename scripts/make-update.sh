#!/usr/bin/env bash
# Packs Wayzerr.app into Wayzerr-update-<version>.zip for in-app updates.
set -euo pipefail
APP=${1:-dist/mac-arm64/Wayzerr.app}
VER=$(node -p "require('./package.json').version")
OUT=${2:-dist/Wayzerr-update-$VER.zip}
(cd "$(dirname "$APP")" && zip -qry "$(realpath -m "$OLDPWD/$OUT")" "$(basename "$APP")")
echo "Built $OUT"
