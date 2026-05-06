# Engram

Single-user, local-only desktop app for authoring Picmonic / Sketchy-style mnemonic scenes. Markdown-driven content, Konva-based canvas, ZIP import/export.

Authoritative spec: [`docs/PRD.md`](docs/PRD.md), [`docs/SPEC.md`](docs/SPEC.md).

## Install (end users)

Download the latest Windows installer from [Releases](https://github.com/Dogebooch/engram/releases/latest) — pick `Engram_<version>_x64-setup.exe` (NSIS) or `Engram_<version>_x64_en-US.msi`.

> **First-run note:** Engram is not yet code-signed. Windows SmartScreen will show "Windows protected your PC" the first time you run the installer. Click **More info → Run anyway**. Subsequent installs and auto-updates do not re-trigger the warning.

The app self-updates: on launch it checks GitHub Releases and prompts when a new version is available. You can also trigger a check manually via **File → Check for updates…**.

Your data lives in `%LOCALAPPDATA%\com.dogebooch.engram\` (IndexedDB inside WebView2). Uninstalling removes the binary; data persists. Use **File → Export Bundle** to back up a Picmonic to a `.zip`.

## Develop

### Prerequisites (one-time)

- **Node.js 20+** ([nodejs.org](https://nodejs.org))
- **Rust** ([rustup.rs](https://rustup.rs)) — required only if building the desktop app
- **Microsoft C++ Build Tools** — install Visual Studio 2022 Build Tools, "Desktop development with C++" workload — required only if building the desktop app
- **WebView2** — pre-installed on Windows 11

### Run

```bash
git clone https://github.com/Dogebooch/Engram.git
cd Engram
npm install                # postinstall regenerates symbol index
npm run tauri:dev          # desktop app, hot reload
# OR
npm run dev                # plain web dev server at localhost:3000
```

`tauri:dev` first run takes 3–10 minutes (Rust compiles a lot of crates). Subsequent runs are seconds.

### Test / lint

```bash
npm test
npm run lint
```

### Build a local installer

```bash
npm run tauri:build
```

Output: `src-tauri/target/release/bundle/msi/Engram_<version>_x64_en-US.msi`.

## Release (maintainer)

1. `npm run version:bump -- patch` (or `minor` / `major`) — bumps `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` together.
2. `git commit -am "release: vX.Y.Z"` and `git tag vX.Y.Z`
3. `git push origin main --tags`

GitHub Actions builds the installer, signs it with the updater key, and publishes a Release with `latest.json`. Installed users get an update toast within seconds of opening the app.

See [`CHANGELOG.md`](CHANGELOG.md) for release history.

## License

MIT — see [`LICENSE`](LICENSE).
