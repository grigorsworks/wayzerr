# (WZ_URL and WZ_NAME are set above this line by Wayzerr.)
mkdir -p ~/Downloads ~/.local/bin ~/.local/share/applications ~/.config
install -m 755 /mnt/shared/.wz/wz-appimage.sh ~/.local/bin/wz-appimage
printf '[Desktop Entry]\nType=Application\nName=Run AppImage\nExec=%s/.local/bin/wz-appimage %%f\nMimeType=application/vnd.appimage;application/x-iso9660-appimage;\nNoDisplay=true\n' "$HOME" > ~/.local/share/applications/wz-appimage.desktop
update-desktop-database ~/.local/share/applications 2>/dev/null
touch ~/.config/mimeapps.list
grep -q '^\[Default Applications\]' ~/.config/mimeapps.list || echo '[Default Applications]' >> ~/.config/mimeapps.list
sed -i '/^application\/vnd.appimage=/d;/^application\/x-iso9660-appimage=/d' ~/.config/mimeapps.list
sed -i 's|^\[Default Applications\]|[Default Applications]\napplication/vnd.appimage=wz-appimage.desktop\napplication/x-iso9660-appimage=wz-appimage.desktop|' ~/.config/mimeapps.list
echo "Downloading $WZ_URL ..."
t="$(mktemp -d)"
(cd "$t" && curl -fL --retry 3 -sS -OJ "$WZ_URL") & cp=$!
while kill -0 $cp 2>/dev/null; do sleep 3; echo "  ... $(du -sh "$t" 2>/dev/null | cut -f1) downloaded"; done
wait $cp || { echo "Download failed."; rm -rf "$t"; exit 1; }
f="$(ls "$t" | head -1)"
[ -n "$WZ_NAME" ] && [ "$f" != "$WZ_NAME" ] && mv -f "$t/$f" "$t/$WZ_NAME" && f="$WZ_NAME"
mv -f "$t/$f" "$HOME/Downloads/$f"; rm -rf "$t"; cd ~/Downloads
echo "Saved ~/Downloads/$f ($(du -h "$f" | cut -f1)); type: $(file -b "$f" | cut -c1-80)"
case "$f" in
  *.AppImage|*.appimage)
    chmod a-x "$f"
    M="$(uname -m)"
    if [ "$M" = aarch64 ] && file -b "$f" | grep -qi 'x86-64'; then echo "This AppImage is for x86-64 (Intel/AMD) and this computer is ARM64, so it cannot run here. Look for an arm64/aarch64 build."; exit 3; fi
    if [ "$M" = x86_64 ] && file -b "$f" | grep -qiE 'aarch64|ARM'; then echo "This AppImage is for ARM64 and this computer is x86-64 (Intel/AMD), so it cannot run here. Look for an x86-64/amd64 build."; exit 3; fi
    ~/.local/bin/wz-appimage "$HOME/Downloads/$f" >~/.local/appimage-start.log 2>&1 &
    for i in $(seq 1 150); do
      sleep 2
      if pgrep -f "appimages/.*/squashfs-root" >/dev/null; then echo "Started. It is running now."; exit 0; fi
      pgrep -f "wz-appimage" >/dev/null || break
    done
    pgrep -f "appimages/.*/squashfs-root" >/dev/null && { echo "Started. It is running now."; exit 0; }
    echo "It did not start. Log:"; tail -n 15 ~/.local/appimage-start.log; exit 2;;
  *.deb) sudo -n apt-get install -y "$HOME/Downloads/$f" && echo "Installed.";;
  *.tar.gz|*.tgz|*.tar.xz|*.tar.bz2|*.zip) d="$HOME/Apps/${f%%.*}"; mkdir -p "$d"; case "$f" in *.zip) unzip -oq "$f" -d "$d";; *) tar -xf "$f" -C "$d";; esac; echo "Unpacked to $d:"; ls "$d" | head -20;;
  *) echo "Downloaded. Tell me what kind of file this is and I will work out how to open it.";;
esac
