#!/bin/bash
# Opens an AppImage on this computer (it has no FUSE, so it is unpacked once and then started).
f="$(readlink -f "$1")"; shift
n="$(basename "$f" .AppImage)"; d="$HOME/.local/appimages/$n"; log="$HOME/.local/appimage-run.log"
[ -z "$DISPLAY" ] && export DISPLAY=:0
# The unpacking step itself needs zlib's development file, and Electron apps need these libraries; install them first, once.
if [ ! -f "$HOME/.local/.wzlibs" ]; then
  L="zlib1g-dev libfuse2 libnss3 libatk-bridge2.0-0 libgbm1 libasound2 libxss1 libxtst6 libgtk-3-0 libcups2 libdrm2 libxkbcommon0 libatspi2.0-0"
  echo "Installing the libraries the app needs (one time)..."
  if sudo -n apt-get install -y $L >"$log.apt" 2>&1 || { sudo -n apt-get update >>"$log.apt" 2>&1; sudo -n apt-get install -y $L >>"$log.apt" 2>&1; }; then touch "$HOME/.local/.wzlibs"; else echo "Installing libraries failed:" >&2; tail -n 5 "$log.apt" >&2; fi
fi
# programs open links with xdg-open; some minimal systems lack it, and then a "sign in" or "open the browser" button silently does nothing
command -v xdg-open >/dev/null 2>&1 || sudo -n apt-get install -y xdg-utils >>"$log.apt" 2>&1
if [ ! -f "$d/.ok" ] || [ "$f" -nt "$d/.ok" ]; then
  rm -rf "$d"; mkdir -p "$d"; chmod u+x "$f"
  if ! (cd "$d" && "$f" --appimage-extract >"$log" 2>&1); then
    chmod a-x "$f"; echo "Unpacking failed:" >&2; tail -n 5 "$log" >&2; free -m >&2; df -h "$HOME" >&2; exit 1
  fi
  touch "$d/.ok"; chmod a-x "$f"
fi
cd "$d/squashfs-root" || exit 1
exe=./AppRun; [ -x "$exe" ] || exe="$(ls -1 | head -1)"
flags=""; [ -f resources/app.asar ] && flags="--no-sandbox --disable-gpu"
exec "$exe" $flags "$@"
