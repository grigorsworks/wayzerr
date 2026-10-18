# Third-party software

Wayzerr's own code is MIT licensed (see `LICENSE`). It bundles or downloads the following, each under its own license:

| Component | Where | License |
|---|---|---|
| Electron, Chromium | the app runtime | MIT and the Chromium licenses (shipped with the app as `LICENSES.chromium.html`) |
| noVNC 1.5.0 | `src/renderer/vendor/novnc.js` | MPL-2.0 (https://github.com/novnc/noVNC) |
| PDF.js | `src/renderer/vendor/pdf*.mjs` | Apache-2.0 (Mozilla Foundation) |
| Transformers.js 4.3.0 | `src/stt/transformers.min.js`, downloaded by `scripts/fetch-speech-model.sh` | Apache-2.0 |
| ONNX Runtime Web | `src/stt/ort-wasm-*` | MIT |
| Whisper base (ONNX conversion by Xenova) | downloaded by `scripts/fetch-speech-model.sh` | MIT (OpenAI Whisper) / Apache-2.0 (conversion) |
| npm packages in `package.json` | `npm install` | each package's own license |
| QEMU (the bots' computer engine) | downloaded at run time | GPL-2.0 and others (https://www.qemu.org/license/) |
| cloudflared (phone link helper) | downloaded at run time | Apache-2.0 (Cloudflare) |

Names such as Claude, ChatGPT, Gemini, Gmail and Google are trademarks of their owners; Wayzerr is not affiliated with them.
