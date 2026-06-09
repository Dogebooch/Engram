# TODO — Build Order

---

## Notes panel — Form-first redesign

- [x] **Phase 1 — Form view (primary surface).** Structured Fact cards with inline DESC/MEAN/WHY fields, editable titles, ✕ delete on facts/sections/rows (untag-only), per-field clear, `+ section`/`+ fact`/`+ symbol`, button-driven empty state, Form/Source toggle (`ui.notesView`). Components under `src/components/editor/panels/notes-panel/outline/`; pure helpers `remove-fact`, `remove-section`, `remove-bullet-from-fact`, `insert-heading`, `set-heading-text` (co-located tests). Markdown stays canonical; CodeMirror retained as the Source view.
- [x] **Phase 2 — Drag-and-drop organization.** Grip handles on rows/facts/sections; pointer-drag with a drop-indicator (`outline/outline-drag.ts`, modeled on `symbol-row-drag.ts`) reorders symbol rows within/between facts, reorders fact cards + moves them between sections, and reorders sections. Pure helpers `reorder-bullet.ts` (`moveBulletToIndex`), `move-fact.ts`, `move-section.ts` (co-located tests). All rewrite canonical markdown.

---

## Final — Desktop wrap (skeleton; detail when Phase 8 lands)

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
