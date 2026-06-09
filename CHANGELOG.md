# Changelog

All notable changes to Engram are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Tauri 2 desktop packaging (Windows MSI + NSIS installers).
- Auto-update via GitHub Releases — the app checks on launch and exposes **File → Check for updates…**.
- `version:bump` script keeping `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` in sync.
- GitHub Actions release workflow triggered on `v*.*.*` tags.
- MIT LICENSE and project README.

## [1.3.0] - 2026-06-08

### Added
- Give a Fact's placeholder a picture without tracing: the "Add a picture" prompt now offers **Pick from library** (focuses the symbol library and assigns your pick to that placeholder), and **Replace symbol** surfaces **Recent** and **My Uploads** alongside the stock grid — so local-device images are reachable from both.
- Notes panel **Form view** — structured Fact cards with inline description/meaning/why fields, now the primary authoring surface; the CodeMirror source view remains the escape hatch.

### Changed
- A Fact that carries an image now counts as a finished visual — it is no longer flagged as "needs outline" in the walkthrough or missing-outline count.

## [0.1.0] - TBD

Initial public release.
