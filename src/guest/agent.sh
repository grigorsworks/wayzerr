#!/bin/bash
# Wayzerr helper inside the bot's computer: runs the commands Wayzerr drops into /mnt/shared/.wz/q, so nothing has to be
# typed into a dialog. It writes a heartbeat so Wayzerr knows it is alive.
Q=/mnt/shared/.wz
mkdir -p "$Q/q"
exec 9>/tmp/wz-agent.lock; flock -n 9 || exit 0
[ -z "$DISPLAY" ] && export DISPLAY=:0
# a little swap, so a big program next to a browser does not run the computer out of memory
if ! swapon --show 2>/dev/null | grep -q .; then
  [ -f /var/wzswap ] || { sudo -n fallocate -l 1G /var/wzswap && sudo -n chmod 600 /var/wzswap && sudo -n mkswap /var/wzswap >/dev/null; } 2>/dev/null
  sudo -n swapon /var/wzswap 2>/dev/null
fi
n=$(date +%s)
while true; do
  n=$((n+1)); echo "$n" > "$Q/hb"
  # keep the screen on: after 10 idle minutes the desktop would go dark ("Display output is not active") while a bot is still working
  [ $((n % 120)) = 0 ] && { xset s off; xset -dpms; xset s noblank; } >/dev/null 2>&1
  for f in "$Q"/q/run-*.sh; do
    [ -e "$f" ] || continue
    mv "$f" "$f.go" 2>/dev/null || continue
    setsid bash "$f.go" >/dev/null 2>&1 &
  done
  sleep 0.5
done
