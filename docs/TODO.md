# TODO — Build Order

---

## Phase 8 — v1 Polish

> 8.1 is the load-bearing change for downstream pipeline reliability. 8.2–8.5 are discrete wins, mostly orthogonal.

---

### 8.1 — Bullet structure enforcement [HIGHEST YIELD]

> "Uniform markdown" guarantee for the downstream animation/video pipeline is solved by linting bullets + exposing parts as a selection-bound mini-form _inside_ notes-panel. No parallel structured panel, no canvas.json content fields. See [SPEC §"Bullet validation & structured editing"](docs/SPEC.md).

#### 8.1a — Pipeline export schema [GATE]

- [x] Write [docs/PIPELINE-SCHEMA.md](docs/PIPELINE-SCHEMA.md) — JSON shape of one exported mnemonic for the downstream animator/exporter. Per-Fact: `factId`, `name`, ordering, `audioRef`, narrative timing slots. Per-symbol-in-Fact: `chipUuid`, `description`, `meaning`, `encoding`, animation hints (placeholder for v2).
- [x] Categorize each field as **prose → bullet** or **machine-state → canvas.json**. New machine-state fields land alongside `animation*` / `factMeta` / `timeline`, never inside bullet text.
- [x] Decide which fields are mandatory vs optional for export. List drives the lint rules in 8.1b.
- [x] Block 8.1b and 8.1c until this lands.

#### 8.1b — Bullet linter

- [x] [src/lib/notes/lint.ts](src/lib/notes/lint.ts) — pure `lintBullet(text, ctx?): LintIssue[]`. Reuses `parseBullet` from [bullet.ts](src/lib/notes/bullet.ts). Issue codes: `missing-symbol-token`, `malformed-symbol-token`, `missing-arrow`, `missing-semicolon`, `empty-description`, `unknown-symbol-uuid`, `untagged-symbol` (latter requires Fact context).
- [x] Severity map: pipeline-blocking issues → error, format-only → warning. Driven by 8.1a's mandatory/optional split.
- [x] Co-located tests next to [bullet.test.ts](src/lib/notes/bullet.test.ts), one case per issue code.
- [x] Wire into CodeMirror via `@codemirror/lint`'s `linter()` extension in [notes-panel](src/components/editor/panels/notes-panel/index.tsx). Issues render as gutter markers + hover tooltips.
- [x] Header badge in notes-panel showing total error/warning counts; click jumps to first issue.

#### 8.1c — Selection-bound inline form

- [x] `src/components/editor/panels/notes-panel/selected-bullet-form.tsx`. Mounts above the CodeMirror when exactly one canvas symbol is selected AND that symbol has a bullet under at least one Fact.
- [x] Inputs: `description`, `meaning`, `encoding` (shadcn `<Textarea>` / `<Input>`).
- [x] On change → existing notes write helpers ([tag.ts](src/lib/notes/tag.ts), [bullet.ts](src/lib/notes/bullet.ts), [insert.ts](src/lib/notes/insert.ts)) splice the new bullet text in. No parallel update path.
- [x] On external markdown edit (typing in CodeMirror), repopulate from the freshly parsed bullet — markdown stays canonical.
- [x] Disambiguation when symbol is tagged in multiple Facts: small Fact selector at the top of the form picks which bullet to edit.
- [x] Hide the form when 0 or 2+ symbols selected; selection-scoped by design.

---

### 8.2 — Notes panel chip enhancements

> Narrow wins extending the existing widget API in [sym-token-extension.ts](src/lib/notes/codemirror/sym-token-extension.ts).

- [ ] **Double-click chip → inline-edit description.** Small input opens over the chip; edits only the bullet text after `{sym:UUID}`. Decide upfront: description text only, or display name too.
- [ ] **Click broken chip → SymbolPicker** swaps the broken UUID in the source string in-place. Replaces manual delete-and-retype. Reuses the picker from the Add Symbol flow.

---

### 8.3 — Canvas polish

> Salvaged from old plan. Orthogonal to authoring direction, still useful.

- [ ] **Replace symbol** — right-click selected canvas symbol → SymbolPicker (anchored to cursor) → `updateSymbol(symbolId, { ref: newRef })`. Does NOT modify notes (chip UUID unchanged). Right-click only; double-click is reserved for 8.2's chip inline-edit so semantics stay consistent across surfaces.
- [ ] **Marquee select** — left-click drag on empty canvas (no symbol under pointer at `mousedown`) draws a Konva `Rect` overlay. On `mouseup`, AABB hit-test against each `SymbolLayer`'s bounding box and replace `selection.symbolIds` with the intersected set. Hold Shift to add to existing selection. Cancel on Escape. Suppress the rect if drag distance < 4px (treat as a click that deselects).

---

### 8.4 — Canvas undo/redo

> Canvas has zero undo today. CodeMirror keeps its own notes history; canvas needs a separate stack.

- [ ] Canvas-slice store history covering: moves, resizes, deletes, tags, groups, backdrop changes. `zundo` middleware is the lowest-friction path. Coalesce rapid drag bursts within a ~500ms window so a drag isn't 60 undo steps.
- [ ] Wire `Ctrl+Z` / `Ctrl+Shift+Z` via [keybindings.ts](src/lib/keybindings.ts) when the canvas has focus.
- [ ] Topbar Edit menu: Undo, Redo. Lands once the stack works.

---

### 8.5 — Verification + theme toggle

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
