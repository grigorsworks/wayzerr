// On-device speech to text (Whisper base), used when no cloud voice engine is connected.
// Runs in a hidden window; nothing leaves the computer.
import { pipeline, env } from './transformers.min.js';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL('./models/', location.href).href;
env.useBrowserCache = false;
env.backends.onnx.wasm.wasmPaths = { mjs: new URL('./ort-wasm-simd-threaded.jsep.mjs', location.href).href, wasm: new URL('./ort-wasm-simd-threaded.jsep.wasm', location.href).href };
env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;

let asr = null;
function load() {
  asr ||= pipeline('automatic-speech-recognition', 'Xenova/whisper-base', { dtype: 'q8', device: 'wasm' }).catch((e) => { asr = null; throw e; });
  return asr;
}

async function toPcm16k(bytes) {
  const ctx = new OfflineAudioContext(1, 1, 16000);
  const buf = await ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * 16000)), 16000);
  const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
  const out = await off.startRendering();
  return out.getChannelData(0);
}

const LANGS = { en: 'english', es: 'spanish', fr: 'french', de: 'german', it: 'italian', pt: 'portuguese', nl: 'dutch', ca: 'catalan', ru: 'russian', uk: 'ukrainian', pl: 'polish', tr: 'turkish', ar: 'arabic', he: 'hebrew', hi: 'hindi', ja: 'japanese', ko: 'korean', zh: 'chinese', sv: 'swedish', da: 'danish', no: 'norwegian', fi: 'finnish', el: 'greek', cs: 'czech', ro: 'romanian', hu: 'hungarian', id: 'indonesian', vi: 'vietnamese', th: 'thai' };
window.nxStt = {
  warm: () => load().then(() => true),
  async run(bytes, lang) {
    const audio = await toPcm16k(bytes);
    let peak = 0; for (let i = 0; i < audio.length; i += 64) peak = Math.max(peak, Math.abs(audio[i]));
    if (audio.length < 8000 || peak < 0.01) return '';
    const t = await load();
    const r = await t(audio, { chunk_length_s: 30, stride_length_s: 5, task: 'transcribe', return_timestamps: false, ...(LANGS[lang] ? { language: LANGS[lang] } : {}) });
    const text = String(r?.text || '').trim();
    // Whisper sometimes "hears" these on silence
    return /^(\[.*\]|\(.*\)|you\.?|thank you\.?|thanks for watching!?)$/i.test(text) ? '' : text;
  },
};
window.nxSttReady = true;
window.nxSttInfo = () => ({ coi: self.crossOriginIsolated, threads: env.backends.onnx.wasm.numThreads });
