# TODO — Build Order

---

## Phase 8 — v1 Polish

> Ordered by yield. 8.1–8.3 move the product meaningfully forward. 8.4 is a verification pass + one discrete win.

---

### 8.1 — Canvas-first authoring [HIGHEST YIELD]

> Moves authoring from the markdown panel onto the canvas. After this ships, users drop a symbol, click its hotspot ring, and type the fact name + descriptions in-place. The right panel becomes a reviewer, not a primary authoring surface. Eliminates "you need to know markdown to use Engram."

- [ ] **Ghost hotspot rings on editor canvas** — faint numbered ring per Fact at its centroid, non-interactive. Reuse `HotspotCircle` with `isActive=false` in a `listening={false}` Konva layer; reuse `getOrderedFacts` ([fact-order.ts](src/lib/notes/fact-order.ts)) and `getFactAnchor` ([centroid.ts](src/lib/canvas/centroid.ts)) so the preview matches the player exactly. While dragging a symbol, fade further so rings don't compete. Toggle via a topbar switch, default OFF.
- [ ] **Click ghost ring → editable reveal card** — same layout as [hotspot-reveal-card.tsx](src/components/editor/player/hotspot-reveal-card.tsx) but every field is an inline input: Section eyebrow, Fact name, per-symbol description rows. Edits round-trip through `setNotes(cid, newNotes)` via string-replace at `headingFrom..headingTo` (parser already exposes these offsets on `ParsedFact`).
  - ⚠️ **factId rename trap**: factId synthesizes from slug(section) + slug(name) + ordinal. Renaming a Fact changes its factId, orphaning `canvas.factHotspots[oldId]`. The mutation must migrate the key atomically: `factHotspots[newId] = factHotspots[oldId]; delete factHotspots[oldId]`.
- [ ] **Replace symbol** — right-click or double-click a selected canvas symbol → library picker swaps the `ref` in place. Eliminates the delete-then-add-then-fix-`[missing]` workflow without disturbing the chip's position in notes.
- [ ] **Marquee select** — left-click drag on empty canvas draws a selection rectangle; release selects all intersected symbols.

---

### 8.2 — Notes panel chip enhancements

> Narrow wins that don't require outliner rewrite. Chips already render as widgets ([sym-token-extension.ts](src/lib/notes/codemirror/sym-token-extension.ts)); extend the widget API.

- [ ] **Double-click chip → inline-edit description** — small input opens over the chip; edits only the bullet text after `{sym:UUID}`. Decide up front: description text only, or display name too.
- [ ] **Click `[missing]` chip → library picker** — swaps the broken UUID in the source string in-place. Replaces manual delete-and-retype.

---

### 8.3 — Canvas undo/redo

> Canvas has zero undo today. CodeMirror already has its own notes history — keep it. Add a separate canvas-side store history. Two stacks, each obvious from focus context.

- [ ] **Canvas undo/redo (Ctrl+Z / Ctrl+Shift+Z)** — store-level history for canvas slice mutations: moves, resizes, deletes, tags, groups, backdrop changes. `zundo` middleware is the lowest-friction path. Coalesce rapid drag bursts with a ~500ms window so a drag isn't 60 undo steps.
- [ ] **Topbar Edit menu** — Undo, Redo. Lands once canvas undo ships.

---

### 8.4 — Verification pass + theme toggle

> Home library already shipped (search, tag filter, cards, EmptyHero gating). Two items remain.

- [ ] **Verify editor → home round-trip is clean** — brand button → home, then re-open a picmonic; confirm canvas + notes state survives the round-trip.
- [ ] **Theme toggle: light / dark / system** — `next-themes` + `<ThemeProvider>` already wired; light tokens already in `globals.css :root`. Remaining: toggle UI in topbar + themed Konva colors (stage paper, dot grid, radial backdrop currently hardcoded dark).

---

## Phase 9 — Desktop wrap (skeleton; detail when Phase 8 is done)

- [ ] **Pick wrapper: Tauri** (recommended; ~5MB installer, system webview, Rust process) unless a Chromium-only feature blocks it.
- [ ] **Audit for `localhost:3001` assumptions** — search hardcoded URLs; wrapped app serves from `tauri://` or `app://`.
- [ ] **Confirm no server calls** — no analytics, fonts, or CDN deps sneaking in via Next.js defaults.
- [ ] **Strip dev-only globals** — `window.__engramStore`, stray console logs.
- [ ] **Vault folder mode** — one `.json` per picmonic at `<vault>/<slug>.json`; index = directory listing; thumbnails at `<vault>/.thumbs/<id>.jpg`. A few hundred LOC in the Tauri main process (`fs::write`, `fs::read_dir`, atomic temp-file-rename).
- [ ] **IDB → vault migration** — one-shot on first desktop launch; read `engram:picmonic:*` from IDB, write to vault, mark migrated.
- [ ] **Keep IDB for web build** — conditional on `NEXT_PUBLIC_TARGET === 'desktop'`.
- [ ] **CI build matrix** — Windows (x64), macOS (arm64 + x64 universal), Linux (AppImage + .deb). `tauri-action` in GitHub Actions.
- [ ] **Code signing** — Windows: EV cert or Azure Trusted Signing. macOS: Developer ID + notarization (~$100/yr). Defer until distribution model decided.
- [ ] **PWA as intermediate step** — `manifest.webmanifest` + service worker; Chrome offers "Install Engram" from address bar; auto-grants persistent storage. Free, ships before the full wrap is ready.

---

## v2+

- Hierarchical tag picker (`Pharmacology/Antibiotics/Beta-lactams`) — flat tags sufficient for solo dogfood
- Study sheet HTML export — annotated scene + scrollable fact list in one file; `⌘P → PDF` for free
- Auto-save snapshot history — once vault mode lands, OS version history (Time Machine, OneDrive) handles this
- Game-Icons integration — ~800–1200 curated B&W icons; `source: "game-icons"`, `qualityRank: 2` in symbols.json
- Typed `ExportError` hierarchy — only when 3rd export format lands
- Playwright E2E — only if Engram gets shared with contributors
- Audio per Fact (data slot exists, no UI)
- Animation per symbol (data slot exists, no UI)
- Animated video export + video player in study mode
- AI suggested symbols for a given fact
- AI generated story (audio transcript from Sections/Facts/Symbols + optional additional-info block; additional-info clearly labeled, strictly for video enrichment)
- AI voice generation
- Cloud sync (Supabase) — UUIDs already cloud-portable
- AI symbol generation with reference styles
- Public Picmonic library
- Expanded canvas tools (background remover, basic paint/blend — keep lean; this is not Photoshop)
