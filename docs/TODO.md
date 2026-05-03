# TODO — Build Order

---

## Phase 8 — v1 Polish

> 8.1 is the load-bearing change for downstream pipeline reliability. 8.2–8.5 are discrete wins, mostly orthogonal.

---

### 8.4 — Verification + theme toggle

- [ ] Verify editor → home round-trip is clean. Brand button → home, re-open a picmonic; canvas + notes survive the round-trip.
- [ ] Theme toggle: light / dark / system. `next-themes` + `<ThemeProvider>` already wired; light tokens already in [globals.css](src/app/globals.css). Remaining: topbar UI + themed Konva colors (stage paper, dot grid, radial backdrop currently hardcoded dark).

---

## Phase 9 — Desktop wrap (skeleton; detail when Phase 8 lands)

- [ ] **Pick wrapper: Tauri** (recommended; ~5MB installer, system webview, Rust process) unless a Chromium-only feature blocks it.
- [ ] Audit for `localhost:3001` assumptions — search hardcoded URLs; wrapped app serves from `tauri://` or `app://`.
- [ ] Confirm no server calls — no analytics, fonts, or CDN deps sneaking in via Next.js defaults.
- [ ] Strip dev-only globals — `window.__engramStore`, stray console logs.
- [ ] **Vault folder mode** — one `.json` per picmonic at `<vault>/<slug>.json`; index = directory listing; thumbnails at `<vault>/.thumbs/<id>.jpg`. Tauri main process: `fs::write`, `fs::read_dir`, atomic temp-file-rename.
- [ ] IDB → vault migration on first desktop launch; mark migrated.
- [ ] Keep IDB for the web build (conditional on `NEXT_PUBLIC_TARGET === 'desktop'`).
- [ ] CI build matrix — Windows (x64), macOS (arm64 + x64 universal), Linux (AppImage + .deb). `tauri-action` in GitHub Actions.
- [ ] Code signing — Windows EV cert or Azure Trusted Signing; macOS Developer ID + notarization (~$100/yr). Defer until distribution model decided.
- [ ] **PWA as intermediate step** — `manifest.webmanifest` + service worker; Chrome offers "Install Engram" from address bar; auto-grants persistent storage. Ships before the full wrap is ready.

---

## v2+ (architecture is ready, no UI shipped)

- Hierarchical tag picker (`Pharmacology/Antibiotics/Beta-lactams`) — flat tags sufficient for solo dogfood.
- Study sheet HTML export — annotated scene + scrollable fact list in one file; `⌘P → PDF` for free.
- Game-Icons integration — ~800–1200 curated B&W icons; `source: "game-icons"`, `qualityRank: 2`.
- Audio per Fact (`factMeta[factId].audioRef` slot exists, no UI).
- Animation per symbol (`SymbolLayer.animation*` slots exist, no UI).
- Animated video export + video player in study mode (consumes `canvas.timeline[]`).
- AI-suggested symbols for a given Fact.
- AI-generated story (audio transcript from Sections / Facts / Symbols + optional additional-info block; clearly labeled, strictly for video enrichment).
- AI voice generation.
- Cloud sync (Supabase) — UUIDs already cloud-portable.
- AI symbol generation with reference styles.
- Public Picmonic library / sharing.
