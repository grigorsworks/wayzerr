# How a Wayzerr release reaches everyone

The code is open source on GitHub. The installers and the update feed are served from wayzerr.com, which runs on Cloudflare.

```
GitHub (source code)  ->  GitHub Actions builds the installers  ->  a person uploads the kit to Cloudflare R2  ->  wayzerr.com/latest.json tells every copy of Wayzerr to update
```

## 1. Build (GitHub Actions)
1. Make sure `package.json` has the right `version` and that `src/changelog.json` has notes for it.
2. GitHub -> **Actions** -> **Build installers** -> **Run workflow**.
3. The workflow builds on GitHub's own machines: Windows (`.exe`, `.zip`), Mac (`.dmg`, Apple silicon), Linux x64 (`.AppImage`, `.deb`) and Linux ARM64 (`.AppImage`). All of them share one build stamp (`yyyymmddhhmm`), which is how the app decides that something is newer.
4. When it finishes, open the run and download the **release-kit** artifact. The builds are not code-signed yet.

Nothing is published by this step.

## 2. Test
Install at least one build on a real computer and check that it starts, signs in and can update.

## 3. Publish (uploading the kit)
The kit contains the installers, already renamed the way the server requires, `latest.json`, `SHA256SUMS.txt` and `UPLOAD-STEPS.txt`.

File names must match `Wayzerr-<version>[-windows|-linux|-linux-arm64].<dmg|zip|exe|AppImage|deb>`; the server refuses any other name. The raw names from the build (`Wayzerr.dmg`, `Wayzerr-Setup.exe`) do not match, which is why the kit renames them.

1. Upload all installer files to the R2 bucket that serves wayzerr.com (Cloudflare dashboard -> R2 -> bucket -> Upload, or `wrangler r2 object put`).
2. Upload `latest.json` **last**. The moment it is replaced, every running copy of Wayzerr offers the new version, and the website's `/download/...` links point to the new files.
3. To undo a bad release, upload the previous `latest.json` again.

## How the app uses `latest.json`
- On start, and when someone presses "Check for updates", the app reads `https://wayzerr.com/latest.json` first (older backup feeds are listed in `package.json`).
- It offers an update when the feed's `build` stamp is newer than its own.
- It downloads over HTTPS only, refuses a file without a SHA-256, and checks the SHA-256 and size before installing. On Mac the new app must also be validly signed.

`latest.json` format (made by `scripts/make-release-kit.js`):

```json
{
  "version": "1.3.33", "build": "202611010930", "notes": ["..."],
  "url": "Wayzerr-1.3.33.dmg", "sha256": "...", "size": 123,
  "platforms": { "win32": {"url": "...-windows.exe", "sha256": "...", "size": 1},
                 "linux": {"url": "...-linux.AppImage", "sha256": "...", "size": 1},
                 "linux-arm64": {"url": "...-linux-arm64.AppImage", "sha256": "...", "size": 1} },
  "downloads": { "windows": {"url": "..."}, "windowsZip": {"url": "..."}, "linuxDeb": {"url": "..."}, "linuxArm64": {"url": "..."} }
}
```

## Code signing
Not set up yet. See `legal/ACTION-CHECKLIST.md` and the `signing/` folder.
