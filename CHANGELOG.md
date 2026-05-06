# Changelog

All notable changes to Engram are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Tauri 2 desktop packaging (Windows MSI + NSIS installers).
- Auto-update via GitHub Releases — the app checks on launch and exposes **File → Check for updates…**.
- `version:bump` script keeping `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` in sync.
- GitHub Actions release workflow triggered on `v*.*.*` tags.
- MIT LICENSE and project README.

## [0.1.0] - TBD

Initial public release.
