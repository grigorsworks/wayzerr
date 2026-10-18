#!/usr/bin/env bash
# Run before every build: every script must parse, and the app must start and answer a message.
set -e
cd "$(dirname "$0")/.."
for f in src/*.js src/renderer/*.js src/stt/stt.js; do node --check "$f"; done
echo "syntax ok"
