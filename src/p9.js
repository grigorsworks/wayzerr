// A small 9P2000.L file server. On Windows the virtual machine program (QEMU) cannot share a folder with the bot's computer
// by itself, so Wayzerr serves the shared "Wayzerr Files" folder over the network instead: the Linux system mounts it with its
// own built-in 9p client, so it looks exactly like the folder on a Mac or Linux PC. It only listens on this computer
// (127.0.0.1; the bot's computer reaches it as 10.0.2.2), only lets in a client that knows the secret, and never goes above the
// shared folder.
const net = require('net');
const fs = require('fs');
const path = require('path');

const T = { statfs: 8, lopen: 12, lcreate: 14, symlink: 16, mknod: 18, rename: 20, readlink: 22, getattr: 24, setattr: 26, xattrwalk: 30, xattrcreate: 32, readdir: 40, fsync: 50, lock: 52, getlock: 54, link: 70, mkdir: 72, renameat: 74, unlinkat: 76, version: 100, auth: 102, attach: 104, flush: 108, walk: 110, read: 116, write: 118, clunk: 120, remove: 122 };
const RLERROR = 7;
const ERRNO = { EPERM: 1, ENOENT: 2, EIO: 5, EBADF: 9, EAGAIN: 11, ENOMEM: 12, EACCES: 13, EBUSY: 16, EEXIST: 17, EXDEV: 18, ENOTDIR: 20, EISDIR: 21, EINVAL: 22, EMFILE: 24, EFBIG: 27, ENOSPC: 28, EROFS: 30, EMLINK: 31, ENAMETOOLONG: 36, ENOSYS: 38, ENOTEMPTY: 39, ELOOP: 40, EOPNOTSUPP: 95, ETIMEDOUT: 110 };
const errnoOf = (e) => (e && typeof e.errno === 'number' && e.errno > 0 ? e.errno : ERRNO[e && e.code] || ERRNO.EIO);
const WIN = process.platform === 'win32';
const WIN_BAD = /[<>:"|?*\x00-\x1f]|[. ]$/;
const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;
const QTDIR = 0x80, QTSYMLINK = 0x02;
const O = { ACC: 3, TRUNC: 0o1000, APPEND: 0o2000 };
const MAXMSIZE = 1 << 20;

class Err extends Error { constructor(no) { super('errno ' + no); this.no = no; } }

// Little-endian reader and writer for the 9P message fields.
class Rd {
  constructor(b, o = 0) { this.b = b; this.o = o; }
  u8() { const v = this.b.readUInt8(this.o); this.o += 1; return v; }
  u16() { const v = this.b.readUInt16LE(this.o); this.o += 2; return v; }
  u32() { const v = this.b.readUInt32LE(this.o); this.o += 4; return v; }
  u64() { const v = this.b.readBigUInt64LE(this.o); this.o += 8; return Number(v); }
  str() { const n = this.u16(); const v = this.b.toString('utf8', this.o, this.o + n); this.o += n; return v; }
  bytes(n) { const v = this.b.subarray(this.o, this.o + n); this.o += n; return v; }
}
const W = {
  u8: (n) => { const b = Buffer.alloc(1); b.writeUInt8(n); return b; },
  u16: (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; },
  u32: (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; },
  u64: (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(Math.max(0, Math.floor(n)))); return b; },
  str: (s) => { const d = Buffer.from(String(s), 'utf8'); return Buffer.concat([W.u16(d.length), d]); },
  qid: (st) => { const b = Buffer.alloc(13); b.writeUInt8(st.isDirectory() ? QTDIR : st.isSymbolicLink() ? QTSYMLINK : 0, 0); b.writeUInt32LE(0, 1); b.writeBigUInt64LE(BigInt(st.ino) & 0xffffffffffffffffn, 5); return b; },
};

module.exports = function createP9({ root, secret = '', log = () => {} }) {
  const ROOT = path.resolve(root);
  const execBits = new Set(); // files the guest marked executable (the host file system cannot keep that)

  const full = (rel) => (rel ? path.join(ROOT, ...rel.split('/')) : ROOT);
  const stat = (rel) => fs.lstatSync(full(rel), { bigint: true });
  const goodName = (n) => {
    if (!n || n === '.' || n === '..' || /[\\/]/.test(n) || n.includes('\0')) throw new Err(ERRNO.EINVAL);
    if (WIN && (WIN_BAD.test(n) || WIN_RESERVED.test(n))) throw new Err(ERRNO.EINVAL);
    return n;
  };
  const child = (rel, n) => (rel ? rel + '/' + goodName(n) : goodName(n));
  const modeOf = (st, rel) => (st.isDirectory() ? 0o040777 : st.isSymbolicLink() ? 0o120777 : 0o100000 | (execBits.has(rel) ? 0o777 : 0o666));
  const secs = (ms) => Math.floor(Number(ms) / 1000);
  const nsecs = (ms) => Math.round((Number(ms) % 1000) * 1e6);

  function serve(sock) {
    sock.setNoDelay(true);
    let buf = Buffer.alloc(0), msize = 65536, uid = 1000, attached = false;
    const fids = new Map();
    const closeFid = (f) => { if (f && f.fd !== undefined && f.fd !== null) { try { fs.closeSync(f.fd); } catch (_) {} f.fd = null; } };
    const fid = (n) => { const f = fids.get(n); if (!f) throw new Err(ERRNO.EBADF); return f; };
    const reply = (type, tag, ...parts) => { const body = Buffer.concat(parts); const h = Buffer.alloc(7); h.writeUInt32LE(7 + body.length, 0); h.writeUInt8(type, 4); h.writeUInt16LE(tag, 5); sock.write(Buffer.concat([h, body])); };
    const attr = (st, rel) => {
      const sz = Number(st.size), mt = Number(st.mtimeMs), at = Number(st.atimeMs), ct = Number(st.ctimeMs);
      return Buffer.concat([W.u64(0x7ff), W.qid(st), W.u32(modeOf(st, rel)), W.u32(uid), W.u32(uid), W.u64(Number(st.nlink) || 1), W.u64(0), W.u64(sz), W.u64(4096), W.u64(Math.ceil(sz / 512)),
        W.u64(secs(at)), W.u64(nsecs(at)), W.u64(secs(mt)), W.u64(nsecs(mt)), W.u64(secs(ct)), W.u64(nsecs(ct)), W.u64(0), W.u64(0), W.u64(0), W.u64(0)]);
    };

    const handlers = {
      [T.version]: (r, tag) => {
        const m = r.u32(), v = r.str();
        for (const f of fids.values()) closeFid(f);
        fids.clear(); attached = false;
        msize = Math.max(4096, Math.min(m, MAXMSIZE));
        reply(T.version + 1, tag, W.u32(msize), W.str(/^9P2000\.L/.test(v) ? '9P2000.L' : 'unknown'));
      },
      [T.auth]: () => { throw new Err(ERRNO.EOPNOTSUPP); },
      [T.attach]: (r, tag) => {
        const f = r.u32(); r.u32(); r.str(); const aname = r.str(); const nu = r.u32();
        if (secret && aname !== secret) throw new Err(ERRNO.EACCES);
        uid = nu === 0xffffffff ? 1000 : nu; attached = true;
        fids.set(f, { rel: '', fd: null });
        reply(T.attach + 1, tag, W.qid(stat('')));
      },
      [T.flush]: (r, tag) => reply(T.flush + 1, tag),
      [T.walk]: (r, tag) => {
        const f = fid(r.u32()), nf = r.u32(), n = r.u16();
        let rel = f.rel; const qids = [];
        for (let i = 0; i < n; i++) {
          const name = r.str();
          let next;
          if (name === '..') next = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
          else { try { next = child(rel, name); } catch (e) { if (i === 0) throw e; break; } }
          let st; try { st = stat(next); } catch (e) { if (i === 0) throw e; break; }
          qids.push(W.qid(st)); rel = next;
        }
        if (n > 0 && qids.length === 0) throw new Err(ERRNO.ENOENT);
        fids.set(nf, { rel, fd: null });
        reply(T.walk + 1, tag, W.u16(qids.length), ...qids);
      },
      [T.getattr]: (r, tag) => { const f = fid(r.u32()); reply(T.getattr + 1, tag, attr(stat(f.rel), f.rel)); },
      [T.setattr]: (r, tag) => {
        const f = fid(r.u32()), valid = r.u32(), mode = r.u32(); r.u32(); r.u32(); const size = r.u64(), as = r.u64(), ans = r.u64(), ms = r.u64(), mns = r.u64();
        const p = full(f.rel);
        if (valid & 1) { if (mode & 0o111) execBits.add(f.rel); else execBits.delete(f.rel); }
        if (valid & 8) fs.truncateSync(p, size);
        if (valid & (16 | 32)) {
          const st = fs.statSync(p);
          const a = valid & 128 ? as + ans / 1e9 : valid & 16 ? Date.now() / 1000 : st.atimeMs / 1000;
          const m = valid & 256 ? ms + mns / 1e9 : valid & 32 ? Date.now() / 1000 : st.mtimeMs / 1000;
          fs.utimesSync(p, a, m);
        }
        reply(T.setattr + 1, tag);
      },
      [T.statfs]: (r, tag) => {
        r.u32();
        let s = { bsize: 4096, blocks: 1 << 24, bfree: 1 << 23, bavail: 1 << 23, files: 1 << 20, ffree: 1 << 19 };
        try { if (fs.statfsSync) { const x = fs.statfsSync(ROOT); s = { bsize: Number(x.bsize) || 4096, blocks: Number(x.blocks), bfree: Number(x.bfree), bavail: Number(x.bavail), files: Number(x.files) || 1 << 20, ffree: Number(x.ffree) || 1 << 19 }; } } catch (_) {}
        reply(T.statfs + 1, tag, W.u32(0x01021997), W.u32(s.bsize), W.u64(s.blocks), W.u64(s.bfree), W.u64(s.bavail), W.u64(s.files), W.u64(s.ffree), W.u64(0), W.u32(255));
      },
      [T.lopen]: (r, tag) => {
        const f = fid(r.u32()), flags = r.u32(), st = stat(f.rel);
        if (!st.isDirectory()) {
          const acc = flags & O.ACC;
          let nf = acc === 0 ? fs.constants.O_RDONLY : acc === 1 ? fs.constants.O_WRONLY : fs.constants.O_RDWR;
          if (flags & O.TRUNC) nf |= fs.constants.O_TRUNC;
          f.fd = fs.openSync(full(f.rel), nf);
        }
        reply(T.lopen + 1, tag, W.qid(st), W.u32(0));
      },
      [T.lcreate]: (r, tag) => {
        const f = fid(r.u32()), name = r.str(), flags = r.u32(), mode = r.u32();
        const rel = child(f.rel, name), acc = flags & O.ACC;
        let nf = (acc === 0 ? fs.constants.O_RDONLY : acc === 1 ? fs.constants.O_WRONLY : fs.constants.O_RDWR) | fs.constants.O_CREAT;
        if (flags & 0o200) nf |= fs.constants.O_EXCL;
        if (flags & O.TRUNC) nf |= fs.constants.O_TRUNC;
        f.fd = fs.openSync(full(rel), nf, 0o666);
        f.rel = rel;
        if (mode & 0o111) execBits.add(rel);
        reply(T.lcreate + 1, tag, W.qid(stat(rel)), W.u32(0));
      },
      [T.read]: (r, tag) => {
        const f = fid(r.u32()), off = r.u64(), count = Math.min(r.u32(), msize - 11);
        if (f.fd === null || f.fd === undefined) throw new Err(ERRNO.EBADF);
        const b = Buffer.alloc(count); const n = fs.readSync(f.fd, b, 0, count, off);
        reply(T.read + 1, tag, W.u32(n), b.subarray(0, n));
      },
      [T.write]: (r, tag) => {
        const f = fid(r.u32()), off = r.u64(), count = r.u32(), data = r.bytes(count);
        if (f.fd === null || f.fd === undefined) throw new Err(ERRNO.EBADF);
        let done = 0; while (done < data.length) done += fs.writeSync(f.fd, data, done, data.length - done, off + done);
        reply(T.write + 1, tag, W.u32(done));
      },
      [T.readdir]: (r, tag) => {
        const f = fid(r.u32()), off = r.u64(), count = Math.min(r.u32(), msize - 11);
        if (off === 0 || !f.list) {
          const names = fs.readdirSync(full(f.rel));
          f.list = ['.', '..', ...names];
        }
        const out = [];
        let used = 0;
        for (let i = off; i < f.list.length; i++) {
          const name = f.list[i];
          let st;
          try { st = name === '.' ? stat(f.rel) : name === '..' ? stat(f.rel.includes('/') ? f.rel.slice(0, f.rel.lastIndexOf('/')) : '') : stat(child(f.rel, name)); } catch (_) { continue; }
          const e = Buffer.concat([W.qid(st), W.u64(i + 1), W.u8(st.isDirectory() ? 4 : st.isSymbolicLink() ? 10 : 8), W.str(name)]);
          if (used + e.length > count) break;
          out.push(e); used += e.length;
        }
        reply(T.readdir + 1, tag, W.u32(used), ...out);
      },
      [T.mkdir]: (r, tag) => {
        const f = fid(r.u32()), name = r.str(); const rel = child(f.rel, name);
        fs.mkdirSync(full(rel));
        reply(T.mkdir + 1, tag, W.qid(stat(rel)));
      },
      [T.unlinkat]: (r, tag) => {
        const f = fid(r.u32()), name = r.str(), flags = r.u32(); const rel = child(f.rel, name);
        if (flags & 0x200) fs.rmdirSync(full(rel)); else { fs.unlinkSync(full(rel)); execBits.delete(rel); }
        reply(T.unlinkat + 1, tag);
      },
      [T.renameat]: (r, tag) => {
        const od = fid(r.u32()), on = r.str(), nd = fid(r.u32()), nn = r.str();
        const from = child(od.rel, on), to = child(nd.rel, nn);
        fs.renameSync(full(from), full(to));
        if (execBits.delete(from)) execBits.add(to);
        reply(T.renameat + 1, tag);
      },
      [T.rename]: (r, tag) => {
        const f = fid(r.u32()), d = fid(r.u32()), name = r.str(); const to = child(d.rel, name);
        fs.renameSync(full(f.rel), full(to));
        if (execBits.delete(f.rel)) execBits.add(to);
        f.rel = to;
        reply(T.rename + 1, tag);
      },
      [T.remove]: (r, tag) => {
        const n = r.u32(), f = fid(n);
        try { const st = stat(f.rel); if (st.isDirectory()) fs.rmdirSync(full(f.rel)); else fs.unlinkSync(full(f.rel)); } finally { closeFid(f); fids.delete(n); }
        reply(T.remove + 1, tag);
      },
      [T.clunk]: (r, tag) => { const n = r.u32(); closeFid(fids.get(n)); fids.delete(n); reply(T.clunk + 1, tag); },
      [T.fsync]: (r, tag) => { const f = fid(r.u32()); if (f.fd !== null && f.fd !== undefined) { try { fs.fsyncSync(f.fd); } catch (_) {} } reply(T.fsync + 1, tag); },
      [T.link]: (r, tag) => {
        const d = fid(r.u32()), f = fid(r.u32()), name = r.str(); const rel = child(d.rel, name);
        fs.linkSync(full(f.rel), full(rel));
        reply(T.link + 1, tag);
      },
      [T.symlink]: (r, tag) => {
        const d = fid(r.u32()), name = r.str(), target = r.str(); const rel = child(d.rel, name);
        fs.symlinkSync(target, full(rel));
        reply(T.symlink + 1, tag, W.qid(stat(rel)));
      },
      [T.readlink]: (r, tag) => { const f = fid(r.u32()); reply(T.readlink + 1, tag, W.str(fs.readlinkSync(full(f.rel)))); },
      [T.mknod]: () => { throw new Err(ERRNO.EOPNOTSUPP); },
      [T.xattrwalk]: () => { throw new Err(ERRNO.EOPNOTSUPP); },
      [T.xattrcreate]: () => { throw new Err(ERRNO.EOPNOTSUPP); },
      [T.lock]: (r, tag) => reply(T.lock + 1, tag, W.u8(0)),
      [T.getlock]: (r, tag) => { r.u32(); r.u8(); const start = r.u64(), len = r.u64(), pid = r.u32(); reply(T.getlock + 1, tag, W.u8(2), W.u64(start), W.u64(len), W.u32(pid), W.str('')); },
    };

    const onMessage = (m) => {
      const type = m.readUInt8(4), tag = m.readUInt16LE(5);
      const h = handlers[type], t0 = Date.now();
      try {
        if (!h) throw new Err(ERRNO.ENOSYS);
        if (!attached && type !== T.version && type !== T.attach && type !== T.auth) throw new Err(ERRNO.EACCES);
        h(new Rd(m, 7), tag);
      } catch (e) {
        reply(RLERROR, tag, W.u32(e instanceof Err ? e.no : errnoOf(e)));
      }
      if (Date.now() - t0 > 400) log('9p slow request', type, Date.now() - t0, 'ms');
    };
    sock.on('data', (d) => {
      buf = buf.length ? Buffer.concat([buf, d]) : d;
      for (;;) {
        if (buf.length < 4) return;
        const size = buf.readUInt32LE(0);
        if (size < 7 || size > MAXMSIZE + 64) { sock.destroy(); return; }
        if (buf.length < size) return;
        const m = buf.subarray(0, size); buf = buf.subarray(size);
        onMessage(m);
      }
    });
    const bye = () => { for (const f of fids.values()) closeFid(f); fids.clear(); };
    sock.on('close', bye);
    sock.on('error', () => { bye(); try { sock.destroy(); } catch (_) {} });
  }

  const server = net.createServer(serve);
  return {
    listen: (port = 0) => new Promise((ok, no) => { server.once('error', no); server.listen(port, '127.0.0.1', () => ok({ port: server.address().port })); }),
    close: () => { try { server.close(); } catch (_) {} },
  };
};
