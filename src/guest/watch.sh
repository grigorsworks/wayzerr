#!/bin/bash
# Shows what a command is doing in a small terminal window, then closes a few seconds after it finishes.
Q=/mnt/shared/.wz
tail -n +1 -f "$Q/out-$1.txt" 2>/dev/null &
p=$!
while [ ! -f "$Q/done-$1" ]; do sleep 1; done
sleep 6; kill $p 2>/dev/null
