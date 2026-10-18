# (WZ_WHAT is set above this line by Wayzerr.)
[ -z "$DISPLAY" ] && export DISPLAY=:0
case "$WZ_WHAT" in
  http://*|https://*) cmd=(firefox "$WZ_WHAT");;
  [Tt]erminal) cmd=(xfce4-terminal);;
  [Ff]iles|"File manager"|"file manager") cmd=(thunar);;
  [Bb]rowser|"Web browser"|"web browser") cmd=(firefox);;
  *) cmd=(bash -c "$WZ_WHAT");;
esac
setsid nohup "${cmd[@]}" >/dev/null 2>&1 &
sleep 1
echo "Opened $WZ_WHAT"
