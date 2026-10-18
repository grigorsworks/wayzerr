# Wayzerr

**AI bots that work like teammates.** Each bot has its own personality and memory, its own browser, and (on Apple silicon Macs, Windows PCs and Linux computers) its own small Linux computer it can use. You bring the AI you already pay for (ChatGPT, Claude, Gemini or your own key). Bots can run tasks on a schedule, use your connected apps, and you can chat with them from your phone.

Download the app, see videos and read the FAQ at **https://wayzerr.com**. This repository is the source code of the desktop app (Mac, Windows and Linux).

> The Mac and Windows downloads are not code-signed yet, so your system shows a warning the first time you open them. The download page explains how to open them.

## Run it from source

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
git clone https://github.com/grigorsworks/wayzerr.git
cd wayzerr
npm install
sh scripts/fetch-speech-model.sh   # the voice-typing model (about 77 MB) and library file
npm start
```

Build installers with [electron-builder](https://www.electron.build) (see the `build` section of `package.json` and the helper scripts in `scripts/`):

```bash
npx electron-builder --mac dir --arm64 -p never      # Mac (unsigned)
npx electron-builder --linux AppImage --x64 -p never # Linux
npx electron-builder --win dir --x64 -p never        # Windows
```

## What is where

| Folder / file | What it is |
|---|---|
| `src/main.js` | the main process: windows, settings, schedules, updates, IPC |
| `src/preload.js` | the only bridge between the interface and the main process |
| `src/renderer/` | the interface (chat, settings, calendar, bot characters) |
| `src/ai.js` | talks to AI providers, builds the bots' instructions and tools |
| `src/browser.js` | the bots' built-in browser |
| `src/computer.js`, `src/p9.js`, `src/guest/` | the bots' own computer (QEMU virtual machine) |
| `src/mymac.js` | lets bots control your own Mac (only if you allow it) |
| `src/connectors.js`, `src/aiapps.js` | connected apps and MCP servers |
| `src/vault.js`, `src/secrets.js` | saved logins and cards (encrypted on your computer) |
| `src/updater.js` | in-app updates |
| `src/phone.js`, `src/mobile/` | the phone companion |
| `signing/` | notes and scripts for signing and notarizing the Mac app |

Your chats, memory and saved logins stay on your computer. Bots send your messages to the AI you connected, and use `wayzerr.com` only for your account sign-in, the update feed and the connected-apps service.

## Contributing

Bug reports, ideas and pull requests are welcome. Please open an issue first for bigger changes. For security problems, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Third-party components are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
