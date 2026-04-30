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
- [ ] Theme the Konva canvas chrome — the paper rect (`STAGE_PAPER_FILL = "#181818"` in [canvas-stage.tsx](src/components/editor/canvas/canvas-stage.tsx)) and dot grid colors (`DOT_FILL = "#3f3f3f"` in [dot-grid.tsx](src/components/editor/canvas/dot-grid.tsx)) are currently hardcoded. They should read `--stage` / `--stage-grid` from CSS variables (already defined in `globals.css`) so light theme (Phase 8) doesn't need a second pass. Approach: read tokens via `getComputedStyle(document.documentElement).getPropertyValue('--stage')` once and pass into the Konva fills, plus a MutationObserver on `documentElement` `class` attribute to re-pull on theme switch.

---

## Before you move on to Phase 8
- [ ] Have Claude Generate a Manual Checklist for Each Phase to this point, and manually run through the checks to ensure the program is behaving as expected. 

## Phase 8 - Further Polish and ideas stated by Doug

- [ ] Settings pane with editable keyboard shortcuts
  - View all bound shortcuts in one place (currently scattered across `useEditorKeybindings`)
  - Allow user to rebind any action; persist to IDB alongside ui prefs
  - Detect conflicts (e.g. binding `Cmd+S` would override browser save)
  - Reset-to-defaults action
  - Suggested action ID schema: `{ id: string, label: string, defaultBinding: Keybinding, currentBinding: Keybinding }`
- [ ] Settings Pane Organized by categories, to easier find specific Settings (Ex: Editor, General, Customization, Accessibility Etc)
- [ ] Ability to change the auto hide behavior of the right column in Settings Pane
- [ ] "Reset to default" button in Settings
  - Resets all Settings to the default settings
  - Hard stop warning to ensure the user wants to confirm that action to avoid misclick
  - Ask user if they'd like to backup settings before resetting
- [ ] Add ability to backup user settings as a json file saved in the repository
- [ ] Theme toggle (light / dark / system) in topbar
  - `next-themes` + `<ThemeProvider>` already wired in Phase 1; defaults to dark
  - Light theme tokens already defined in `globals.css :root`
  - Remaining work: toggle UI in topbar, themed Konva colors (stage paper, dot grid, radial backdrop currently hardcoded for dark), themed save-status `success` shade, audit empty-state and panels for light-mode contrast
- [ ] Periodic Auto Saving
  - User can change the auto save interval in the Settings pane
  - Settings pane contains section for Scrolling through previous saves for a specific File (File Snapshots)
  - User can define how many saves are saved, and when they are deleted (ex: every 30 days, max 50 backups etc.)
  - Files delete to the Recycle Bin on Windows
- [ ] "File", "Edit" and other high yield tools located at topbar position in the Editor
  - File Menu: Export, Save, Save As, Import, Open, Preferences (Settings), Account
  - Edit Menu: Undo, Redo, Insert, 
  - Help Menu: Docs (See below)
- [ ] Create a built in tutorial so the user can Quickly get up and running with the program with minimal effort
  - A basic Walkthrough tutorial with highlighted sections and popups that walks the user through the key actions that the program offers
  - A comprehensive Docs under the "Help Menu"
- [ ] Improve the end user experience of the "Markdown Notes" (So it looks prettier)
  - Keep the Intuitive click on buttons
  - Make it so that it's easier to add symbols via the Notes tab etc. (idea: Have the user write out a fact first -> Add Symbol button -> Add description)
  - Add option to easily add Section Headers (automatically vs. manual) - Should be one click (<1 second to add)
  - Ensure a clean visual hierarchy in the right panel to show what's a Section Header (Group), base fact, a symbol, and a description (See Below)
      |Group (Section header)
      ||-Fact(s)
      |||-Symbol(s) + Description
  - User can drag parents and children to other Groups (Section Headers)
  - Add keyboard hotkeys for adding symbols to facts and adding descriptions to facts
  - Smart visualization of canvas symbols based on Groups (Section Headers); aids in visual grouping of symbols based on the section header (Ex: Risk Factors grouped in one area of the scene) -> User Clicks to edit a symbol that is under a Group (Section header) -> Slight emphasis/highlight of all symbols in the group -> only actual selection of symbol being edited
  - Groups (Section Headers) can be visually collapsed in the right panel 
- [ ] Fix the weird disconnect between the Notes (right panel) and the canvas - For example, when I go back to the home screen, how does the user pick a picture they were previously working on/search through the library of picture mnemonics
  - On the home screen, the Left Panel shows the different pictures + search via tags/folders
  - The Symbol Library only pops up when a picture scene is selected and the editor comes up
  - The user can always go back to the picture scene collection with max 1-2 clicks (when in canvas - easy to go back and select a new scene to work on)
  - The home screen says "Create your first Picmonic" only when there are no picture scenes in the library. Otherwise, it shows the tags and picture scene collection
- [ ] Any updates to the end user "Markdown" experience should also hold true for the review screen (popups, errors, representations and visualizations in the review pane)
- [x] when User highlights over the "Rotate" on the canvas, it should show up the "recycle" symbol, instead of a cross, to let the user know they are rotating the symbol.
- [x] When draging a symbol, currently just the mouse cursor shows, it should show a hand to show that the symbol is grabbed.
- [x] Hitting the delete key deletes the selected item

## v2+ (architected, not built — DO NOT touch in v1)

- Audio per Fact (data slot exists, no UI)
- Animation per symbol (data slot exists, no UI)
- Animated video export
- Cloud sync (Supabase) — UUIDs already cloud-portable
- AI symbol generation with reference styles
- Public Picmonic library
- Expand the tools in the canvas but ensure hard cap on when to stop adding tools; keep it relevant to tools that help blend the scene to make it unified. Avoid Scope Creep; this is not Photoshop (Background Remover from imported symbols, Basic painting tools, blending tools, eraser etc.)