#!/bin/bash
# Mounts Wayzerr's shared folder over the network. A computer that has no direct folder sharing (on Windows) finds the address and the
# secret in the "fw_cfg" data Wayzerr gives it ("port:secret"); Mac and Linux computers share the folder directly and have none, so this
# does nothing there. Started at boot by wz-share.service (it is part of the system image), and can be run by hand.
M="${WZ_MNT:-/mnt/shared}"
mkdir -p "$M"
mountpoint -q "$M" && exit 0
modprobe qemu_fw_cfg 2>/dev/null; modprobe 9pnet_fd 2>/dev/null; modprobe 9p 2>/dev/null
F=/sys/firmware/qemu_fw_cfg/by_name/opt/wayzerr/9p/raw
for i in $(seq 1 60); do [ -r "$F" ] && break; sleep 0.5; done
[ -r "$F" ] || exit 0
IFS=: read -r PORT TOKEN < "$F"
for i in $(seq 1 900); do
  mountpoint -q "$M" && exit 0
  mount -t 9p -o "trans=tcp,port=$PORT,version=9p2000.L,msize=262144,uname=wayzerr,aname=$TOKEN,access=any" 10.0.2.2 "$M" 2>/dev/null && exit 0
  sleep 1
done
exit 1
