#!/usr/bin/env python3
"""Makes the Windows and Linux icons from the one master picture, build/icon.png (1024 x 1024, the Wayzerr logo).

  build/icon.ico            Windows: 16, 24, 32, 48, 64, 128 and 256 px in one file (for the .exe, the installer and the shortcuts)
  build/icons/<n>x<n>.png   Linux: the same picture in every size the desktop menus ask for

Run it on a Mac after the logo changes:  python3 scripts/make-icons.py
It only needs python3 and sips (both ship with macOS). The Mac icon (.icns) is made by electron-builder from build/icon.png itself.
"""
import os, struct, subprocess, sys, tempfile, zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'build', 'icon.png')
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
LINUX_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
BMP_UP_TO = 48  # small sizes are stored the classic way (a bitmap); bigger ones as PNG, which Windows reads natively


def resize(size, out):
    if size == 1024:
        with open(SRC, 'rb') as a, open(out, 'wb') as b:
            b.write(a.read())
    else:
        subprocess.run(['sips', '-z', str(size), str(size), SRC, '--out', out], check=True, stdout=subprocess.DEVNULL)


def decode_png(data):
    """8-bit RGBA or RGB PNG -> (width, height, bytes of RGBA rows, top to bottom)."""
    assert data[:8] == b'\x89PNG\r\n\x1a\n', 'not a PNG'
    pos, idat, w = 8, b'', None
    while pos < len(data):
        n, kind = struct.unpack('>I4s', data[pos:pos + 8])
        chunk = data[pos + 8:pos + 8 + n]
        if kind == b'IHDR':
            w, h, depth, ctype, _, _, interlace = struct.unpack('>IIBBBBB', chunk)
            assert depth == 8 and ctype in (2, 6) and interlace == 0, 'need an 8-bit RGB/RGBA PNG without interlacing'
        elif kind == b'IDAT':
            idat += chunk
        pos += 12 + n
    bpp = 4 if ctype == 6 else 3
    raw = zlib.decompress(idat)
    stride, rows, prev = w * bpp, [], bytearray(w * bpp)
    for y in range(h):
        f = raw[y * (stride + 1)]
        line = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for i in range(stride):
            a = line[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            if f == 1: line[i] = (line[i] + a) & 255
            elif f == 2: line[i] = (line[i] + b) & 255
            elif f == 3: line[i] = (line[i] + ((a + b) >> 1)) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(bytes(line))
        prev = line
    if bpp == 3:
        rows = [b''.join(r[i:i + 3] + b'\xff' for i in range(0, len(r), 3)) for r in rows]
    return w, h, rows


def bmp_frame(png_bytes):
    """The bitmap form of one icon size: a 40 byte header, the pixels bottom row first (blue, green, red, alpha), and an empty mask."""
    w, h, rows = decode_png(png_bytes)
    pix = b''.join(b''.join(r[i + 2:i + 3] + r[i + 1:i + 2] + r[i:i + 1] + r[i + 3:i + 4] for i in range(0, len(r), 4)) for r in reversed(rows))
    mask = bytes(((w + 31) // 32) * 4 * h)
    return struct.pack('<IiiHHIIiiII', 40, w, h * 2, 1, 32, 0, len(pix) + len(mask), 0, 0, 0, 0) + pix + mask


def main():
    if not os.path.exists(SRC):
        sys.exit('missing ' + SRC)
    tmp = tempfile.mkdtemp()
    frames = []
    for s in ICO_SIZES:
        p = os.path.join(tmp, '%d.png' % s)
        resize(s, p)
        png = open(p, 'rb').read()
        frames.append((s, bmp_frame(png) if s <= BMP_UP_TO else png))
    head = struct.pack('<HHH', 0, 1, len(frames))
    offset, entries, body = 6 + 16 * len(frames), b'', b''
    for s, data in frames:
        entries += struct.pack('<BBBBHHII', 0 if s >= 256 else s, 0 if s >= 256 else s, 0, 0, 1, 32, len(data), offset + len(body))
        body += data
    with open(os.path.join(ROOT, 'build', 'icon.ico'), 'wb') as f:
        f.write(head + entries + body)
    out = os.path.join(ROOT, 'build', 'icons')
    os.makedirs(out, exist_ok=True)
    for s in LINUX_SIZES:
        resize(s, os.path.join(out, '%dx%d.png' % (s, s)))
    print('wrote build/icon.ico (%s px) and build/icons/ (%s px)' % (', '.join(map(str, ICO_SIZES)), ', '.join(map(str, LINUX_SIZES))))


main()
