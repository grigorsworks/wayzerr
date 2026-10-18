// Talk mode engine, shared by the desktop app and the phone page.
//   WzTalk.listen(opts)  — opens the mic, notices when you start and stop talking, hands over each phrase as a WAV
//   WzTalk.speak(text)   — reads a reply aloud with the computer's own voices (sentence by sentence)
// Plain script (no imports) so it can be loaded by a <script> tag in both places.
(function () {
  'use strict';
  var TARGET_RATE = 16000;

  // ---------- microphone + "are they talking?" detector ----------
  // opts: { onLevel(0..1), onStart(), onPhrase({ wav: ArrayBuffer, ms }), onError(err) }
  async function listen(opts) {
    opts = opts || {};
    var stream = await openMic(opts.deviceId);
    var AC = window.AudioContext || window.webkitAudioContext;
    var ctx = new AC();
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (_) {} }
    var src = ctx.createMediaStreamSource(stream);
    var proc = ctx.createScriptProcessor(2048, 1, 1);
    var mute = ctx.createGain(); mute.gain.value = 0; // the processor must be connected to run, but we don't want to hear ourselves
    src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);

    var rate = ctx.sampleRate;
    var frameMs = 2048 / rate * 1000;
    var preroll = [], prerollMax = Math.ceil(450 / frameMs); // keep the last ~0.45 s so the first word isn't clipped
    var chunks = [], inSpeech = false, voicedMs = 0, quietMs = 0, totalMs = 0;
    var floor = 0.006, calib = 0, paused = false, resumeAt = 0, closed = false, level = 0;
    var SILENCE_END = opts.silenceMs || 1100, MIN_VOICED = 280, MAX_PHRASE = 90000;

    function finish(force) {
      if (!inSpeech) return;
      var ok = voicedMs >= MIN_VOICED;
      var parts = chunks; chunks = []; inSpeech = false; voicedMs = 0; quietMs = 0; totalMs = 0; preroll = [];
      if (!ok) return;
      try { opts.onPhrase && opts.onPhrase({ wav: toWav(parts, rate), ms: parts.length * frameMs, forced: !!force }); } catch (e) { opts.onError && opts.onError(e); }
    }

    proc.onaudioprocess = function (e) {
      if (closed) return;
      var input = e.inputBuffer.getChannelData(0);
      var sum = 0;
      for (var i = 0; i < input.length; i++) sum += input[i] * input[i];
      var rms = Math.sqrt(sum / input.length);
      level = level * 0.6 + Math.min(1, rms * 9) * 0.4;
      if (opts.onLevel) opts.onLevel(paused ? 0 : level);
      if (paused || Date.now() < resumeAt) return;
      var copy = new Float32Array(input); // the browser reuses the buffer
      if (calib < 8) { floor = Math.max(0.004, (floor * calib + rms) / (calib + 1)); calib++; preroll.push(copy); return; } // first ~0.35 s: learn the room noise
      var thr = Math.max(0.014, floor * 2.8);
      var loud = rms > thr;
      if (!inSpeech) {
        if (!loud) floor = floor * 0.97 + rms * 0.03; // keep following the background noise
        preroll.push(copy); if (preroll.length > prerollMax) preroll.shift();
        if (loud) {
          voicedMs += frameMs;
          if (voicedMs >= 90) { inSpeech = true; chunks = preroll.slice(); preroll = []; quietMs = 0; totalMs = chunks.length * frameMs; opts.onStart && opts.onStart(); }
        } else voicedMs = 0;
        return;
      }
      chunks.push(copy); totalMs += frameMs;
      if (loud) { voicedMs += frameMs; quietMs = 0; } else quietMs += frameMs;
      if (quietMs >= SILENCE_END || totalMs >= MAX_PHRASE) finish(false);
    };

    return {
      // stop listening for a while (while the bot thinks / speaks); drops anything half-heard
      pause: function () { paused = true; inSpeech = false; chunks = []; preroll = []; voicedMs = 0; quietMs = 0; },
      resume: function (delay) { preroll = []; chunks = []; inSpeech = false; voicedMs = 0; quietMs = 0; resumeAt = Date.now() + (delay == null ? 450 : delay); paused = false; },
      // "I'm done" — hand over what was heard so far without waiting for the pause
      flush: function () { finish(true); },
      isTalking: function () { return inSpeech; },
      close: function () {
        closed = true;
        try { proc.disconnect(); src.disconnect(); mute.disconnect(); } catch (_) {}
        try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {}
        try { ctx.close(); } catch (_) {}
      },
    };
  }

  // The chosen microphone, or the computer's default one if that isn't there any more
  async function openMic(deviceId) {
    var base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    if (deviceId) { try { return await navigator.mediaDevices.getUserMedia({ audio: Object.assign({ deviceId: { exact: deviceId } }, base) }); } catch (_) { /* unplugged: use the default */ } }
    return navigator.mediaDevices.getUserMedia({ audio: base });
  }
  async function devices() {
    try { return (await navigator.mediaDevices.enumerateDevices()).filter(function (d) { return d.kind === 'audioinput' && d.deviceId !== 'communications'; }).map(function (d) { return { id: d.deviceId, label: d.label || '' }; }); } catch (_) { return []; }
  }
  // Plain recording (dictation and the microphone test): { stop(cancel) -> Promise<{ wav, ms } | null> }
  async function record(opts) {
    opts = opts || {};
    var stream = await openMic(opts.deviceId);
    var AC = window.AudioContext || window.webkitAudioContext, ctx = new AC();
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (_) {} }
    var src = ctx.createMediaStreamSource(stream), proc = ctx.createScriptProcessor(2048, 1, 1), mute = ctx.createGain(); mute.gain.value = 0;
    src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
    var chunks = [], level = 0, done = false, rate = ctx.sampleRate, label = (stream.getAudioTracks()[0] || {}).label || '';
    proc.onaudioprocess = function (e) {
      if (done) return;
      var input = e.inputBuffer.getChannelData(0), sum = 0;
      for (var i = 0; i < input.length; i++) sum += input[i] * input[i];
      level = level * 0.6 + Math.min(1, Math.sqrt(sum / input.length) * 9) * 0.4;
      if (opts.onLevel) opts.onLevel(level);
      if (!opts.discard) chunks.push(new Float32Array(input));
    };
    return {
      label: label,
      stop: function (cancel) {
        if (done) return Promise.resolve(null);
        done = true;
        try { proc.disconnect(); src.disconnect(); mute.disconnect(); } catch (_) {}
        try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {}
        try { ctx.close(); } catch (_) {}
        if (cancel || !chunks.length) return Promise.resolve(null);
        return Promise.resolve({ wav: toWav(chunks, rate), ms: chunks.length * 2048 / rate * 1000 });
      },
    };
  }

  // Float32 chunks → 16 kHz mono 16-bit WAV
  function toWav(parts, rate) {
    var len = 0; parts.forEach(function (p) { len += p.length; });
    var all = new Float32Array(len), o = 0;
    parts.forEach(function (p) { all.set(p, o); o += p.length; });
    var peak = 0; // quiet voices: bring the loudest moment up to about 90% (never more than 8x, so noise isn't blown up)
    for (var q = 0; q < all.length; q += 7) { var av = Math.abs(all[q]); if (av > peak) peak = av; }
    if (peak > 0.004 && peak < 0.6) { var gain = Math.min(8, 0.9 / peak); for (var g = 0; g < all.length; g++) all[g] *= gain; }
    var ratio = rate / TARGET_RATE, n = Math.floor(all.length / ratio), pcm = new Int16Array(n);
    for (var i = 0; i < n; i++) { // average the samples that fall into each output sample (simple low-pass)
      var a = Math.floor(i * ratio), b = Math.max(a + 1, Math.floor((i + 1) * ratio)), s = 0;
      for (var j = a; j < b && j < all.length; j++) s += all[j];
      var v = Math.max(-1, Math.min(1, s / (b - a)));
      pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    var buf = new ArrayBuffer(44 + pcm.length * 2), dv = new DataView(buf);
    function str(at, t) { for (var k = 0; k < t.length; k++) dv.setUint8(at + k, t.charCodeAt(k)); }
    str(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, TARGET_RATE, true); dv.setUint32(28, TARGET_RATE * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    str(36, 'data'); dv.setUint32(40, pcm.length * 2, true);
    new Int16Array(buf, 44).set(pcm);
    return buf;
  }
  function b64(buf) {
    var u = new Uint8Array(buf), s = '', step = 0x8000;
    for (var i = 0; i < u.length; i += step) s += String.fromCharCode.apply(null, u.subarray(i, i + step));
    return btoa(s);
  }

  // Whisper makes up a few phrases when it only hears noise
  function junk(text, ms) {
    var t = String(text || '').trim();
    if (!t) return true;
    if (/^[\s.,!?…-]*$/.test(t)) return true;
    if (/^(\[.*\]|\(.*\)|\*.*\*)$/.test(t)) return true;
    if (ms < 1600 && /^(you|thank you|thanks|thanks for watching|bye|okay|ok|hmm|mm|uh|um)[.!\s]*$/i.test(t)) return true;
    return false;
  }

  // ---------- reading replies aloud ----------
  var synth = window.speechSynthesis || null;
  var voicesCache = [];
  function loadVoices() { try { voicesCache = synth ? synth.getVoices() : []; } catch (_) { voicesCache = []; } return voicesCache; }
  if (synth) { loadVoices(); try { synth.addEventListener('voiceschanged', loadVoices); } catch (_) {} }

  function voices() { return voicesCache.length ? voicesCache : loadVoices(); }
  function ready(timeout) { // wait until the system has listed its voices
    return new Promise(function (res) {
      if (voices().length || !synth) return res(voices());
      var t0 = Date.now(), iv = setInterval(function () { if (voices().length || Date.now() - t0 > (timeout || 2500)) { clearInterval(iv); res(voices()); } }, 80);
    });
  }

  // A rough guess of which language a reply is in, so it's read with a matching voice
  var STOP = {
    en: 'the and you that this with for are was have not but what can your will about from they there would which their been'.split(' '),
    es: 'el la los las que de y en un una por con para como pero más está esto muy también puedo tengo usted'.split(' '),
    fr: 'le la les des est une pour que vous dans pas sur avec mais plus très être nous cette ce sont'.split(' '),
    de: 'der die das und ist nicht ein eine mit für auf ich sie den dem auch wir sind kann wenn dass'.split(' '),
    it: 'il lo la gli che di è un una per con non sono come più anche questo molto della questo posso'.split(' '),
    pt: 'o a os as que de e um uma para com não como mais mas está isso muito também você posso'.split(' '),
    nl: 'de het een en van ik je dat niet is met voor op zijn ook maar wat kan dit te'.split(' '),
  };
  function detect(text) {
    var t = String(text || '').slice(0, 800);
    if (/[぀-ヿ]/.test(t)) return 'ja';
    if (/[가-힯]/.test(t)) return 'ko';
    if (/[一-鿿]/.test(t)) return 'zh';
    if (/[Ѐ-ӿ]/.test(t)) return 'ru';
    if (/[؀-ۿ]/.test(t)) return 'ar';
    if (/[֐-׿]/.test(t)) return 'he';
    if (/[฀-๿]/.test(t)) return 'th';
    if (/[ऀ-ॿ]/.test(t)) return 'hi';
    var words = t.toLowerCase().match(/[a-zà-ÿ]+/g) || [], best = '', bestN = 0;
    if (words.length < 4) return '';
    Object.keys(STOP).forEach(function (l) {
      var n = 0; for (var i = 0; i < words.length; i++) if (STOP[l].indexOf(words[i]) >= 0) n++;
      if (n > bestN) { bestN = n; best = l; }
    });
    return bestN >= 2 ? best : '';
  }

  var NICE = /premium|enhanced|siri|natural|neural|online/i;
  var PREFER = /^(samantha|ava|allison|susan|zoe|serena|daniel|karen|moira|tessa|alex|google us english|microsoft (aria|jenny|guy))/i;
  function pickVoice(lang, wanted) {
    var all = voices();
    if (!all.length) return null;
    var l = (lang || (navigator.language || 'en').slice(0, 2)).toLowerCase();
    var mine = all.filter(function (v) { return String(v.lang || '').toLowerCase().indexOf(l) === 0; });
    if (wanted) { var w = mine.filter(function (v) { return v.name === wanted; })[0]; if (w) return w; }
    if (!mine.length) return null; // let the system choose its default
    var exact = mine.filter(function (v) { return String(v.lang).toLowerCase().replace('_', '-') === (navigator.language || '').toLowerCase(); });
    var pool = exact.length ? exact : mine;
    return pool.filter(function (v) { return NICE.test(v.name) && !/novelty|whisper|bad |good news|cellos|bells|organ|zarvox|trinoids|boing|jester/i.test(v.name); })[0]
      || pool.filter(function (v) { return PREFER.test(v.name); })[0]
      || pool.filter(function (v) { return v.localService; })[0] || pool[0];
  }

  // Replies are written for the eye. Make them something you'd want to hear.
  function clean(text) {
    var t = String(text || '');
    t = t.replace(/```[\s\S]*?```/g, ' (some code is on the screen) ');
    t = t.replace(/`([^`]+)`/g, '$1');
    t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
    t = t.replace(/\[([^\]]+)\]\((?:https?:\/\/|mailto:)[^)]*\)/g, '$1');
    t = t.replace(/https?:\/\/\S+/g, 'a link');
    t = t.replace(/^\s{0,3}#{1,6}\s*/gm, '').replace(/^\s*[-*•]\s+/gm, '').replace(/^\s*\d+[.)]\s+/gm, '');
    t = t.replace(/^\s*\|?[\s:|-]{3,}\|?\s*$/gm, ' ').replace(/\|/g, ', ');
    t = t.replace(/(\*\*|__|\*|_|~~)/g, '');
    t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '');
    t = t.replace(/\s*\n+\s*/g, '. ').replace(/\.\s*\./g, '.').replace(/\s{2,}/g, ' ').trim();
    return t;
  }
  function sentences(text, max) {
    var out = [], parts = String(text).match(/[^.!?。！？]+[.!?。！？]*\s*/g) || [String(text)], used = 0;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim(); if (!p) continue;
      if (used + p.length > max) { if (!out.length) out.push(p.slice(0, max)); out.push('The rest is on the screen.'); break; }
      while (p.length > 220) { var cut = p.lastIndexOf(',', 220); if (cut < 80) cut = p.lastIndexOf(' ', 220); if (cut < 80) cut = 220; out.push(p.slice(0, cut + 1).trim()); p = p.slice(cut + 1).trim(); }
      if (p) out.push(p);
      used += parts[i].length;
    }
    return out;
  }

  var current = null;
  // → { done: Promise<'ended'|'cancelled'|'unavailable'>, cancel() }
  function speak(text, o) {
    o = o || {};
    stopSpeaking();
    var spoken = clean(text);
    if (!synth || !spoken) return { done: Promise.resolve('unavailable'), cancel: function () {} };
    var job = { cancelled: false };
    job.cancel = function () { job.cancelled = true; try { synth.cancel(); } catch (_) {} };
    job.done = (async function () {
      await ready();
      if (!voices().length) return 'unavailable';
      var lang = detect(spoken), voice = pickVoice(lang, o.voice), list = sentences(spoken, o.maxChars || 1100), any = false;
      for (var i = 0; i < list.length; i++) {
        if (job.cancelled) return 'cancelled';
        var r = await new Promise(function (res) {
          var u = new SpeechSynthesisUtterance(list[i]);
          if (voice) { u.voice = voice; u.lang = voice.lang; } else if (lang) u.lang = lang;
          u.rate = o.rate || 1.04; u.volume = o.volume == null ? 1 : o.volume;
          var guard = setTimeout(function () { res('stuck'); }, 25000 + list[i].length * 120);
          u.onend = function () { clearTimeout(guard); res('ok'); };
          u.onerror = function (e) { clearTimeout(guard); res(job.cancelled || (e && (e.error === 'canceled' || e.error === 'interrupted')) ? 'cancel' : 'err'); };
          u.onstart = function () { any = true; if (o.onStart && i === 0) o.onStart(); };
          try { synth.speak(u); } catch (_) { clearTimeout(guard); res('err'); }
        });
        if (r === 'cancel') return 'cancelled';
        if (r === 'err' && !any) return 'unavailable';
      }
      return job.cancelled ? 'cancelled' : 'ended';
    })();
    current = job;
    return job;
  }
  function stopSpeaking() { if (current) { current.cancel(); current = null; } else if (synth) { try { synth.cancel(); } catch (_) {} } }
  // iPhones only let a page talk after a tap — call this from the tap that starts talk mode
  function prime() { if (!synth) return; try { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch (_) {} }

  window.WzTalk = { listen: listen, record: record, devices: devices, speak: speak, stopSpeaking: stopSpeaking, prime: prime, ready: ready, voices: voices, pickVoice: pickVoice, detect: detect, clean: clean, junk: junk, b64: b64, supported: function () { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (window.AudioContext || window.webkitAudioContext)); } };
})();
