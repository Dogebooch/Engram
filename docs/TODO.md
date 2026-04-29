# TODO — Build Order with Decision Points

Decision points are flagged ⚠️. Hit one → pause, decide, then proceed.

---

## Phase 0 — Setup (1–2 hrs)

- [x] ⚠️ **Decide app name**
- [x] ⚠️ **Decide repo visibility**
- [x] Create GitHub repo
- [x] `npx create-next-app@latest <name> --ts --tailwind --app --eslint --src-dir`
- [x] `git init`, push initial commit
- [x] Create `CLAUDE.md`
- [x] Create `.claude/settings.json` enabling `frontend-design` skill
- [x] In Claude Code: run `/init` to scaffold memory bank
- [x] Drop `PRD.md` and `SPEC.md` into `docs/` in the repo

---

## Phase 1 — Foundations (1–2 days)

- [x] Add deps: `konva react-konva zustand idb-keyval @uiw/react-codemirror @codemirror/lang-markdown unified remark-parse @tanstack/react-virtual`
- [x] Add shadcn/ui: `npx shadcn@latest init`, install `button dialog command input scroll-area resizable tabs tooltip`
- [x] Build 3-panel resizable layout (`@/components/Layout.tsx`) — left/center/right with collapsible sides
- [x] Empty Konva `<Stage>` in center panel with placeholder backdrop
- [x] Zustand store skeleton with `idb-keyval` persist middleware
- [x] UUID helper using `crypto.randomUUID()`
- [x] Hello-world: load app, see 3 panels, see empty canvas, refresh — state survives

---

## Phase 2 — Symbol library + canvas placement (2 days)

- [ ] ⚠️ **Decide**: bundle OpenMoji locally vs CDN-fetch
  - Bundling (~5MB gzipped) = offline-friendly, instant search
  - CDN = smaller bundle, network dependency
  - Recommendation: bundle locally for v1
- [ ] Vendor OpenMoji SVGs into `/public/symbols/openmoji/`
- [ ] Build symbol library index (`symbols.json`) with `{id, displayName, aliases, tags, source, qualityRank, imageUrl}`
- [ ] Library search component (virtualized grid, fuzzy search via `fuse.js` or simple includes)
- [ ] Drag from library → drop on canvas (use Konva's drop detection)
- [ ] Konva `Transformer` for resize/rotate on selected symbol
- [ ] Layer order management (reorder via `[` `]` shortcuts)
- [ ] ⚠️ **Decide**: Game-Icons inclusion timing — Phase 2 or defer to Phase 7
  - Recommendation: defer, OpenMoji alone gets you authoring fast

---

## Phase 3 — Markdown notes panel + bidirectional sync (3 days)

- [ ] CodeMirror with markdown mode, dark theme
- [ ] Custom syntax highlighting for `{sym:UUID}` tokens
- [ ] Markdown parser using `unified` + `remark-parse`
- [ ] Custom remark plugin: extract `{sym:UUID}` references → array of `{factName, sectionName, symbolIds}` mappings
- [ ] Selection sync: `useEffect` on canvas selection → CodeMirror `dispatch` to highlight bullet line
- [ ] Selection sync: CodeMirror cursor position → Zustand store → canvas highlight
- [ ] Edit `##` heading → debounced rename (no full rebuild)
- [ ] Drop symbol on canvas → auto-insert `* {sym:UUID} ` bullet under active Fact in notes
- [ ] Save debounce (500ms) → IndexedDB

---

## Phase 4 — Tagging UX + grouping (1 day)

- [ ] Implement underlying action: `tagSymbolWithFact(symbolId, factNameOrId)`
- [ ] Drag-tag: drag symbol onto `##` line → tag (use Konva → DOM drag bridge or HTML5 DnD)
- [ ] Keyboard-tag: `F` opens shadcn Command palette filtered to existing Facts + "Create new"
- [ ] Right-click → context menu (shadcn ContextMenu) → "Tag with Fact..."
- [ ] `Cmd+G` group selection (Konva Group node)
- [ ] `Cmd+Shift+G` ungroup (preserve world coordinates)

---

## Phase 5 — Hotspots + Study mode (2 days)

- [ ] Compute Fact centroid from linked symbol bounding boxes
- [ ] Render numbered circle on canvas per Fact (numbered by Section → Fact order)
- [ ] User-draggable hotspot (sets `userOverride: true`, blocks recompute)
- [ ] Player view component (route or modal)
- [ ] Hotspot mode: click circle → reveal Fact name + meaning + symbol glow
- [ ] Sequential mode: Prev/Next buttons, current Fact symbols highlighted, others dimmed
- [ ] `M` toggles between modes
- [ ] Esc returns to editor

---

## Phase 6 — Persistence + Export (1 day)

- [ ] Picmonic list view (root route): grid of saved Picmonics with thumbnails, tag filter
- [ ] Create / open / delete Picmonic
- [ ] Tag assignment on Picmonic (lightweight, no nesting)
- [ ] Export PNG: `stage.toDataURL({ pixelRatio: 2 })` → download
- [ ] Export Markdown: download `notes.md`
- [ ] Export Anki CSV: parse → emit rows
- [ ] ⚠️ **Decide**: bundle export as single .zip (notes.md + canvas.json + assets) — yes/no for v1
  - Recommendation: yes — round-trip import becomes trivial later

---

## Phase 7 — Polish + tests (2–3 days)

- [ ] Unit tests: markdown parser (round-trip, edge cases: malformed, empty, deeply nested)
- [ ] Unit tests: canvas state serialization
- [ ] Integration tests: `tagSymbolWithFact` atomicity
- [ ] Integration tests: hotspot recompute logic (with and without override)
- [ ] E2E (Playwright): author → export → re-import → identical render
- [ ] Empty / error states (no Picmonics yet, broken `{sym:UUID}` ref, etc.)
- [ ] Keyboard shortcut help overlay (`?` key)
- [ ] Storage quota warnings (80% / 95% thresholds)
- [ ] Game-Icons integration if not done in Phase 2

---

## Phase 8 - Further Polish stated by Doug

- [ ] Settings pane with editable keyboard shortcuts
  - View all bound shortcuts in one place (currently scattered across `useEditorKeybindings`)
  - Allow user to rebind any action; persist to IDB alongside ui prefs
  - Detect conflicts (e.g. binding `Cmd+S` would override browser save)
  - Reset-to-defaults action
  - Suggested action ID schema: `{ id: string, label: string, defaultBinding: Keybinding, currentBinding: Keybinding }`
- [ ] Theme toggle (light / dark / system) in topbar
  - `next-themes` + `<ThemeProvider>` already wired in Phase 1; defaults to dark
  - Light theme tokens already defined in `globals.css :root`
  - Remaining work: toggle UI in topbar, themed Konva colors (stage paper, dot grid, radial backdrop currently hardcoded for dark), themed save-status `success` shade, audit empty-state and panels for light-mode contrast

## v2+ (architected, not built — DO NOT touch in v1)

- Audio per Fact (data slot exists, no UI)
- Animation per symbol (data slot exists, no UI)
- Animated video export
- Cloud sync (Supabase) — UUIDs already cloud-portable
- AI symbol generation with reference styles
- Public Picmonic library
