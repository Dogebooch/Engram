## Tis

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

- [x] ⚠️ **Decide**: bundle OpenMoji locally vs CDN-fetch — chose `openmoji@^17` devDep + build script that copies into `public/symbols/openmoji/` (gitignored) and emits `public/symbols.json` (committed). Postinstall runs `symbols:build`; failures exit 0 so `npm install` never breaks.
- [x] Vendor OpenMoji SVGs into `/public/symbols/openmoji/` — curated to ~1640 entries (8 useful Unicode groups, no skin-tone variants, no flags/components).
- [x] Build symbol library index (`symbols.json`) with `{id, displayName, aliases, tags, source, qualityRank, imageUrl}`
- [x] Library search component (virtualized grid via `@tanstack/react-virtual`, token-aware substring + tiered ranking)
- [x] Drag from library → drop on canvas (HTML5 native drag with custom mime + `useCanvasDrop` hook converting client coords via `stage.container().getBoundingClientRect()`)
- [x] Konva `Transformer` for resize/rotate on selected symbol — refined Figma-precise styling, scale-reset on transformEnd, padding=4, cardinal-only rotation snaps
- [x] Layer order management (reorder via `[` `]` for back/forward, `{` `}` for to-back/to-front; array-as-truth, `layerIndex` ignored)
- [x] ⚠️ **Decide**: Game-Icons inclusion timing — deferred to Phase 7
- [x] Bonus (TODO-adjacent, ship-ready): click-to-add-at-center, multi-select via Shift+click, Delete/Backspace, Cmd+D duplicate, Esc clear, recent-symbols strip (cap 16), drop affordance via amber inner-glow, search `/` kbd hint, loading skeleton, missing-index recovery state.

---

## Phase 3 — Markdown notes panel + bidirectional sync (3 days)

- [x] CodeMirror with markdown mode, dark theme — custom oklch theme reading CSS tokens, h1/h2 hierarchy distinct via Geist Sans + tracking, dimmed `#`/`##` markers via `t.processingInstruction`
- [x] Custom syntax highlighting for `{sym:UUID}` tokens — `Decoration.replace` widget with image + display name; broken refs render mono `[missing]` with destructive dashed border; atomic ranges so cursor traverses chip as one unit
- [x] Markdown parser using `unified` + `remark-parse` — `src/lib/notes/parse.ts` with synthetic fact IDs (`slug(section)::slug(name)#occurrence`), char offsets via mdast `position.start.offset`, code-block exclusion via `syntaxTree.resolve` so `{sym:...}` literals in fenced code are not chipped
- [x] Custom remark plugin: extract `{sym:UUID}` references → nested `ParsedNotes` tree (sections → facts → symbolRefs) plus flat `factsById` and `factsBySymbolId` indices for O(1) sync lookups
- [x] Selection sync: `useEffect` on canvas selection → CodeMirror `dispatch` to highlight bullet line — uses `EditorView.scrollIntoView` + transient line decoration via custom `StateField` + `StateEffect`, 850ms cubic-bezier pulse-down
- [x] Selection sync: CodeMirror cursor position → Zustand store → canvas highlight — `cursorFactId`/`cursorSymbolIds`/`lastActiveFactId` added to `selection-slice`; canvas-stage derives `glowSet`, `symbol-node` applies Konva shadow when glowing-and-not-selected
- [x] Edit `##` heading → debounced rename (no full rebuild) — name-based fact identity for Phase 3 (synthetic ID retrofit deferred to Phase 4 per [decision in plan](../../C:/Users/drumm/.claude/plans/we-are-continuing-to-misty-fountain.md)); parser is pure + memoized on notes string, no re-init churn
- [x] Drop symbol on canvas → auto-insert `* {sym:UUID} ` bullet under active Fact in notes — `use-canvas-drop` reads `lastActiveFactId`, calls `insertSymbolBullet` (handles existing-fact append, `## Unassigned` reuse, blank-doc creation); idempotent
- [x] Save debounce (500ms) → IndexedDB — already wired pre-Phase 3, `setNotes` flows through existing `debounced-save.ts` subscription
- [x] Bonus: cursor breadcrumb (Section › Fact, monospace tracking + amber tick), click-chip-to-select-canvas-symbol, library-load-triggers-chip-refresh, code-block exclusion, vitest suite (23 tests covering parser + insert), dev-only `window.__engramStore` exposure for debugging
- [x] Frontend-design polish pass — editorial command-line aesthetic: 4px chip radius (was pill), keyframe `eng-bullet-pulse` glow, breadcrumb amber-tick gutter marker, typewriter-prompt empty state with kbd hints

---

## Phase 4 — Tagging UX + grouping (1 day)

- [x] Implement underlying action: `tagSymbolWithFact(symbolId, factNameOrId)` — `src/lib/notes/tag.ts` (idempotent, name-collision reuse, 13 unit tests). Slice wrappers `tagSymbolsWithFact` / `tagSymbolsWithNewFact` in `canvas-slice.ts` for batch tagging.
- [x] Drag-tag: drag symbol onto `##` line → tag — pointer-based bridge in `use-canvas-tag-drag.ts`; CodeMirror line decoration in `fact-heading-extension.ts` adds `data-fact-id`. Position reverts on drop. ::after pseudo-element drives the drop affordance (CM 6 blocks direct `.cm-line` background/box-shadow/outline-width — pseudo-element sidesteps it).
- [x] Keyboard-tag: `F` opens shadcn Command palette filtered to existing Facts + "Create new" — `dialogs/fact-picker.tsx`. Multi-select aware. Editorial mono aesthetic matching breadcrumb.
- [x] Right-click → context menu (shadcn DropdownMenu controlled with 1×1 fixed-positioned trigger) → "Tag with Fact..." plus Group/Ungroup/Z-order/Duplicate/Delete with platform-appropriate kbd hints. Mounted only when active to avoid Base UI nativeButton warnings flooding the console.
- [x] `Cmd+G` group selection — logical grouping (groupId + Group records, no Konva.Group transform). Selection auto-expands via `selectGroupAware` / `toggleGroupAware`. Alt+click bypasses group expansion. Subtle dashed amber outline on each member when any group member is selected.
- [x] `Cmd+Shift+G` ungroup (preserves world coordinates) — verified via `canvas-slice.group.test.ts` (8 tests cover regroup-of-pre-grouped, mixed selections, world-coord preservation).
- [x] Bonus: Esc ladder closes picker → menu → clears selection. Help overlay updated with new bindings. shadcn `command dialog dropdown-menu separator` installed via CLI. fake-indexeddb wired for vitest persist sanity.

---

## Phase 5 — Hotspots + Study mode (2 days)

- [x] Compute Fact centroid from linked symbol bounding boxes — `src/lib/canvas/centroid.ts` (mean of post-rotation centers; userOverride wins). Single-symbol facts anchor at the upper-right of the symbol so the hotspot reads as a tag instead of an occlusion; multi-symbol centroids that fall inside any linked symbol are nudged just past its boundary. 12 unit tests.
- [x] Render numbered circle on canvas per Fact (numbered by Section → Fact order) — `hotspot-circle.tsx` Konva primitive, ordering via `getOrderedFacts(parsed)` in `src/lib/notes/fact-order.ts` (excludes Unassigned + zero-symbol facts so numbering stays gapless).
- [x] User-draggable hotspot (sets `userOverride: true`, blocks recompute) — Konva `draggable` on hotspot Group → `setHotspotOverride(factId, x, y)`. Override indicator: dashed inner ring. Right-click → "Reset position" via `clearHotspotOverride`.
- [x] Player view component — fullscreen overlay (`player-overlay.tsx`), single-shell architecture (no new route). Editor stays mounted underneath; opaque player background fully obscures it.
- [x] Hotspot mode: click circle → reveal Fact name + meaning + symbol glow — `hotspot-reveal-card.tsx` with smart-flip placement; per-symbol description / meaning / encoding parsed at reveal time via `src/lib/notes/bullet.ts` (12 unit tests). Linked symbols glow via existing Konva-shadow infra.
- [x] Sequential mode: Prev/Next buttons, current Fact symbols highlighted, others dimmed — `sequential-rail.tsx` (right rail with Section › Fact ordinal, fact name, symbol thumbnails, per-symbol meaning + encoding) + `sequential-controls.tsx` (centered prev/counter/next pill). Non-linked symbols dimmed via new `dimFactor` prop on `SymbolNode`.
- [x] `M` toggles between modes — `M` enters player from editor (default last-used display, persisted in `ui.lastPlayerMode`), then cycles Hotspot ↔ Sequential within. Topbar Play button mirrors keyboard for discoverability.
- [x] Esc returns to editor — Esc ladder: closes reveal card first if open, then exits player.
- [x] Bonus polish: arrow-key prev/next in Sequential, number-key 1-9 jump to fact N (both modes), "FACT 03 / 07" zero-padded counter, dimmed-symbol fade transitions, segmented mode toggle pill, study-mode dot signal in topbar, persisted last-used mode, opaque vignette overlay (no editor bleed-through), comprehensive Help overlay update with new bindings.

---

## Phase 6 — Persistence + Export (1 day)

- [x] Picmonic list view (home, single-page; topbar swaps on `currentId`): grid of cards w/ 16:9 thumbnails, search input, AND-multi-tag filter
- [x] Create / open / delete / duplicate / rename Picmonic — bug-fix: `deletePicmonic` now purges IDB record + index entry (previous version leaked)
- [x] Tag assignment on Picmonic (lightweight, no nesting) — chip-on-Enter editor with autocomplete from union of all index tags
- [x] Export PNG: `stage.toDataURL({ pixelRatio: 2 })` → download (editor topbar dropdown)
- [x] Export Markdown: download `notes.md`
- [x] Export Anki CSV: parse → emit rows (`picmonic_name, section, fact_name, symbol_descriptions, image_path`); excludes Unassigned + zero-symbol facts; multi-symbol facts joined with `¶`
- [x] ⚠️ **Decide**: bundle export as single .zip — **yes**. `<slug>/notes.md + canvas.json + meta.json + scene.png`. Layout matches SPEC `docs/SPEC.md:28` so Phase 7 import is a 20-line parse.
- [x] Bonus: separate `engram:picmonic-index:v1` IDB record (slim entries with thumbDataUrl/symbolCount/factCount); one-time migration from raw `engram:picmonic:*` keys; thumbnail captured on `saving → saved` transition via `useThumbnailCapture(stageRef)` hook (no extra renders); 16-test vitest coverage (Anki CSV + index store).

---

## Phase 7 — Polish + tests (2–3 days)

- [x] Unit tests: markdown parser — added round-trip + cross-section duplicates + re-entered sections + malformed UUID variants ([parse.test.ts](src/lib/notes/parse.test.ts))
- [x] Unit tests: canvas state serialization ([serialize.test.ts](src/lib/canvas/serialize.test.ts), 7 tests; round-trip empty + populated + override + animation slots + forward-compat)
- [x] Integration tests: `tagSymbolWithFact` atomicity — bulk + mixed + cross-section ([tag.test.ts](src/lib/notes/tag.test.ts))
- [x] Integration tests: hotspot recompute logic — recompute on move, override sticky, clear-then-recompute, JSON round-trip ([centroid.test.ts](src/lib/canvas/centroid.test.ts))
- [x] **Round-trip integration test (Playwright deferred — see Phase 8 note below):** author → export → re-import → state-equal verified via vitest in [import.test.ts](src/lib/export/import.test.ts) (11 tests including round-trip + every typed `BundleImportError.reason` + factHotspots orphan reconciliation + `{sym:UUID}` cross-ref warning)
- [x] Empty / error states — broken `{sym:UUID}` chip + zero-symbol facts excluded from study + library missing-index recovery + home no-results — all already shipped through Phase 3–6; Phase 7 added save-error recovery toast (the actual day-1 dogfood gap) with "Export bundle" action button
- [x] Keyboard shortcut help overlay (`?` key) — [help-dialog.tsx](src/components/editor/help-dialog.tsx) replaces the toast with a categorized shadcn Dialog (Editor / Canvas & Symbols / Player / Picmonic), monospace kbd chips, "manpage stamp" header. Discreet `?` icon button in topbar for discoverability.
- [x] Storage quota warnings (80% / 95% thresholds) — [use-save-flow-monitor.ts](src/lib/storage/use-save-flow-monitor.ts) subscribes to `saveStatus` and fires threshold-crossing toasts; topbar `<QuotaBadge>` at >= 95%; `ui.storageQuota.lastWarned` persisted so reload doesn't re-fire warnings.
- [x] **Bundle Import (.zip)** — [import.ts](src/lib/export/import.ts) closes the round-trip from Phase 6 export. Validates schemaVersion + UUIDs, regenerates root id, **reconciles factHotspots** against re-parsed notes (drops orphans with warn), soft-warns on broken `{sym:UUID}` cross-refs. Wired into home grid header + EmptyHero via [import-button.tsx](src/components/editor/home/import-button.tsx).
- [x] Theme the Konva canvas chrome — [use-themed-css-var.ts](src/lib/theme/use-themed-css-var.ts) (`useSyncExternalStore` + `MutationObserver`) so paper rect, dot grid, and radial backdrop track `--stage` / `--stage-grid` / `--stage-vignette-*`. Light-theme foundation in place for Phase 8 toggle UI; `useEffect([stageFill])` calls `stage.draw()` since react-konva does not auto-redraw on Rect/Circle `fill` prop change.

---

## Before you move on to Phase 8: MANUAL CHECK

- [x] Have Claude Generate a Manual Checklist for Each Phase to this point, and manually run through the checks to ensure the program is behaving as expected.
- [x] Manual Checklist complete (Keyboard Shortcut rollcall finished)

---
