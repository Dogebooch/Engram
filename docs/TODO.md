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

## Phase 8 — Further Polish and ideas stated by Doug

> Subsections ordered by yield. **8.1 → 8.4 are the big-win UX changes** that move the product meaningfully forward. **8.5 → 8.8 are infrastructure, polish, and deferrable work.** Within each subsection items are loosely ordered by what's natural to build first.
>
> "Yield" here = how much it changes the user's day-to-day experience. Items that feel "expected for any editor" but are missing (undo/redo, marquee select) count as high yield even if they aren't paradigm-shifting, because their absence is a constant papercut.

---

### 8.1 — Right-panel sidebar: from raw markdown to structured outliner [HIGHEST YIELD]

> The single biggest UX delta. Today the right panel is a raw CodeMirror buffer; the user must know markdown syntax (`#`, `##`, `* {sym:UUID}`) to author structure. Convert it into a proper hierarchy view (Group → Fact → Symbol + Description) with click-to-add, drag-drop reorganization, inline edits, and collapsible groups. Markdown stays the source of truth — the panel becomes a GUI on top of the same parser.

- [ ] **Visual hierarchy in the right panel**
  - Tree shape: `Group (Section)` → `Fact(s)` → `Symbol(s) + Description`. Indented, with subtle leading rails and disclosure carets.
  - Each level styled distinctly so the user can read the structure at a glance (Section bigger/uppercase, Fact medium, Symbol-row compact).
  - Driven off the existing `parseNotes()` output — no schema changes; the panel is a new view, not a new model.
- [ ] **Quick-add buttons for Section / Fact** — one click, < 1 second to add either. Inserts the heading at the cursor or end-of-doc and focuses it for naming.
- [ ] **Hotkeys for adding a Symbol or a Description to the focused Fact** — shortcut keys mirror the buttons.
- [ ] **Drag-drop reorganization** of facts and sections inside the panel; canvas + Study order auto-update because they read from the same parsed tree.
- [ ] **Collapsible Groups** — user can fold a Section to hide its facts, reducing clutter for long decks.
- [ ] **Define the grouping behavior up front** — does a "Group" in the sidebar mean the same thing as a Konva-level Group on the canvas? Answer this _before_ building the tree view; the answer shapes the data model.
  - Today canvas Groups are spatial (`groupId` on symbol layers). Sidebar Sections are textual (`# Section` heading). They're different concepts. Decide: keep two distinct concepts (clearer mental model, more UI) or unify (one concept, more abstraction). Recommend: keep distinct, but render canvas Groups _inside_ the same sidebar tree as a sibling concept under each Section.
- [ ] **Double-click a `{sym:UUID}` chip in notes to inline-edit its description**
  - CodeMirror widget interaction; opens a small inline input over the chip.
  - Decide: edit the per-chip description text (after the `:`) only, or override the display name too.
- [ ] **Click the red `[missing]` chip → opens a library picker that swaps the broken `ref` in place** — replaces the manual delete-and-retype workflow.
- [ ] **Right-click a chip in the sidebar → Replace symbol** (alternate path to the same flow above) — complicated because of CodeMirror's event model; fold this in if it's cheap, defer if it isn't.
- [ ] **Delete chip in sidebar → also deletes the canvas symbol** — confirmation dialog before destruction; reuses the existing `confirmSymbolDelete` flag.
- [ ] **Carry the same UX language to the Study player's review-screen surfaces** — fact list, symbol thumbnails, descriptions all use the same component shape so users see one consistent layout in author-mode and study-mode.

---

### 8.2 — Spatial editing on the canvas (no markdown required) [HIGHEST YIELD]

> Companion to 8.1. The canvas should be a peer authoring surface to the sidebar — drop symbols, drag hotspots, name facts, all without leaving the canvas. Combined with 8.1 this kills the "you need to know markdown to use Engram" friction entirely.

- [ ] **Editor-side hotspot ghost + inline reveal-card editor**
  - Phase 5 hotspot circles only render in the player overlay ([player-stage.tsx:274](src/components/editor/player/player-stage.tsx:274) — `<HotspotCircle>` lives there, never on the editor canvas). Authoring-time friction: user has no way to see whether a Fact's centroid lands somewhere readable until they press M to enter Study mode, AND the only way to rename a Fact, change its Section, or edit a symbol's description is by typing into the markdown column.
  - **Ghost ring layer**: faint numbered ring per Fact on the editor canvas — same numbered glyph + position math as `HotspotCircle`, at low opacity (~15%) and non-interactive on the ring itself. Reuse `getOrderedFacts(parsed)` from [fact-order.ts](src/lib/notes/fact-order.ts) and the centroid math in [centroid.ts](src/lib/canvas/centroid.ts) so the preview cannot drift from the player. While dragging a symbol, fade further (~8%) so they don't fight the active interaction.
  - **Click-to-edit popup**: clicking a ghost ring opens an editable variant of the player's [hotspot-reveal-card.tsx](src/components/editor/player/hotspot-reveal-card.tsx). Same shape (Section eyebrow → Fact name → per-symbol description rows) but every line is an inline input. Edits round-trip back to the markdown column:
    - Section eyebrow → renames the `# Section` heading (string replace at `parsed.sections[i].headingFrom..headingTo`).
    - Fact name → renames the `## Fact` heading (string replace at `fact.headingFrom..headingTo`); factId re-synthesizes on next parse.
    - Description row → edits the trailing text after `{sym:UUID}` on that bullet line (the chunk between the chip and the next newline).
    - All three reuse the existing notes-store mutation path (`setNotes(cid, newNotes)`); no new persistence surface.
  - Toggle the ghost layer via a topbar/settings switch — default OFF so the editor canvas stays clean for users who don't want it.
- [ ] **`Replace symbol…` action on canvas symbols**
  - Right-click → Replace, or double-click while a symbol is selected → opens a constrained library picker that swaps the symbol's `ref` in place.
  - Replaces the awkward delete-then-add-then-clean-up-`[missing]`-chip workflow without changing the chip's location in notes.
- [ ] **Right-click menu enhancements** for canvas symbols — already has Move Forward/Back/Copy/Delete/Group from Phase 4. Add: Add Description, Add Note, Add to Section, Replace. **All four must round-trip into the sidebar.**
- [ ] **Smart group highlight on canvas**: when a symbol that belongs to a sidebar Group is selected, faintly highlight the other group-mates on canvas so the user sees the "this is one mnemonic cluster" relationship without losing the active selection.
- [ ] **Click-and-drag rectangle marquee select** — left-click on empty canvas, drag to draw a selection rectangle, release to select all symbols intersected. Standard editor behavior.

---

### 8.3 — Canvas hardening: undo, multi-select, layer feedback

> The "expected for any serious editor" features that aren't there yet. Lower paradigm-shift than 8.1/8.2 but higher per-day annoyance because their absence is felt every session.

- [ ] **Undo/redo (Ctrl+Z / Ctrl+Shift+Z) across canvas + notes**
  - Needs a single coherent undo stack: canvas-slice mutations + notes-slice setNotes.
  - Coalesce typing bursts in notes (CodeMirror already groups its own history but the wrapping store update needs a windowed flush).
  - Decide what counts as one "step": a duplicate, a multi-delete, a drag-tag (canvas + notes both change).
- [ ] **Multi-select rotation/resize polish**
  - Konva Transformer multi-node interaction is choppy at non-cardinal rotations and pivot-around-bbox-center can feel wrong for far-apart selections.
  - Investigate per-node rotation vs. group-wrap pivoting; possibly disable rotate handle for multi when it's not useful.
- [ ] **Visual selection / layer indicator ("deck of cards")**
  - Mini-stack mockup near a selected symbol that shows its position in the Z-stack and previews what `[`/`]`/`{`/`}` will do.
  - Strictly non-invasive (auto-fades on idle); decide whether it appears for any selection or only on layer-key press.
- [ ] **Topbar Edit menu**: Undo, Redo, Insert (Section / Fact). Lands once 8.1 (Insert source) and 8.3 (Undo/Redo source) ship.

---

### 8.4 — Home screen reimagined: tags-first picmonic library

> Today the home is a flat grid that says "Create your first Picmonic" forever. As the user's library grows past a handful, this won't scale. Convert the home into a proper tagged library with parent/child hierarchy, search, and tag-based sorting.

- [ ] **Home left panel = picmonic browser** with search via tags / folders / name. Symbol library only renders inside the editor (not on home).
- [ ] **Tags as the main organizing primitive**
  - 1-click add tag from a card.
  - Parent/child hierarchy support (e.g. `Pharmacology / Antibiotics / Beta-lactams`).
  - Visual hierarchy that's easy to scan, search, and sort.
  - Typing parent/child paths feels fast and inline (think Things-style `path/sub/leaf` autocomplete).
- [ ] **Tag-sorted view as the default home layout** when the app launches.
- [ ] **EmptyHero only shows when zero picmonics exist** — past zero, the tag/list view takes over.
- [ ] **1–2 click navigation back to the picmonic library** from inside the editor (already partially solved by the `engram` brand button → home; verify the round-trip is clean).

---

### 8.5 — Settings pane (consolidated)

> A single home for user preferences. Pulls together the keybinding editor, theme toggle, panel auto-hide, hotspot-behavior toggle, timezone, and any settings 8.1–8.4 surface along the way. Build the shell once, then drop categories in.

- [ ] **Settings pane shell organized by categories** — Editor, General, Customization, Accessibility. Suggested action ID schema for keybindings: `{ id: string, label: string, defaultBinding: Keybinding, currentBinding: Keybinding }`.
- [ ] **Keybinding editor** — view all bound shortcuts in one place (today scattered across `useEditorKeybindings`); allow rebinds; detect conflicts (binding `Cmd+S` would override the new save handler, etc.); reset-to-defaults action.
- [ ] **Right-column auto-hide behavior** — toggle/configure how aggressively the right notes panel auto-opens (currently hard-wired in `use-auto-open-right-panel.ts`).
- [ ] **"Reset to defaults"** with a hard-stop confirmation; offer to backup settings first.
- [ ] **Backup user settings to JSON file** — exports the persisted UI prefs + keybindings as a portable file the user can import on a new machine.
- [ ] **Theme toggle: light / dark / system**
  - `next-themes` + `<ThemeProvider>` already wired in Phase 1; defaults to dark.
  - Light theme tokens already defined in `globals.css :root`.
  - Remaining work: toggle UI, themed Konva colors (stage paper, dot grid, radial backdrop currently hardcoded for dark), themed save-status `success` shade, audit empty-state and panels for light-mode contrast.
- [ ] **Hotspot behavior in study mode** — hover vs click toggle. Editor remains click-only. Hover lights up the reveal card on cursor-over; click requires explicit press.
- [ ] **Timezone setting** — default = local machine time, user can override (affects "Saved (HH:MM)" display).
- [ ] **Persistent storage status** — read-only display of whether the browser has granted persistent storage (the Tier 1 fix already shipped); a "Pin storage" button for Firefox/Safari users who need a gesture to grant it.

---

### 8.6 — Polish & cosmetics

> Small visual wins; one polish sweep when other 8.x sections settle.

- [ ] **Brand emblem to replace amber accent dot in topbar** — replace the `bg-accent` round dot in `topbar.tsx` with an SVG glyph (brain? mnemonic mark? something Engram-specific).
- [ ] **Topbar Help menu** with a Docs link — lands once 8.8 produces something to link to.
- [x] when User highlights over the "Rotate" on the canvas, it should show up the "recycle" symbol, instead of a cross, to let the user know they are rotating the symbol.
- [x] When draging a symbol, currently just the mouse cursor shows, it should show a hand to show that the symbol is grabbed.
- [x] Hitting the delete key deletes the selected item.
- [x] Topbar **File menu** (Open / Import / Save / Export) — shipped during the Phase 5/6 walkthrough alongside `⌘+S` keybinding.

---

### 8.7 — "Study sheet" export — picture + key in one document

> Single discrete export feature; lower yield than the UX overhaul work in 8.1–8.4 but small and self-contained, easy to drop in once the sidebar/canvas refactors stabilize.

- [ ] **Self-contained HTML study sheet**
  - User goal: open one document and see the hotspot-annotated scene plus a scannable list of every Fact + its symbol descriptions, like a printable study aid.
  - One `.html` file with all images embedded as `data:` URLs (same off-screen Konva rasterizer that powers `rasterizePicmonicToPng` in [png.ts](src/lib/export/png.ts)). Layout: title eyebrow → annotated scene with numbered hotspot rings (reuse `getOrderedFacts` + centroid math + `<HotspotCircle>` glyph) → numbered fact list below, each row showing fact name, per-symbol image thumbnails, and descriptions. Searchable, copyable, scrollable, and `⌘P → Save as PDF` produces a real PDF with zero PDF-lib dependency.
  - File: `src/lib/export/study-sheet.ts` builds the HTML string; `exportStudySheet(picmonic)` in [src/lib/export/index.ts](src/lib/export/index.ts) downloads it. Add as a new row in both the editor [editor-export-menu.tsx](src/components/editor/editor-export-menu.tsx) and home [export-menu.tsx](src/components/editor/home/export-menu.tsx) with hint copy `study sheet`.
  - Alternatives considered (defer): one giant PNG (no search, cramped at 12+ facts) and a real PDF via jsPDF/@react-pdf (adds ~200–500KB dep + ~400 LOC for image/font embedding + manual pagination — only worth it if a true `.pdf` becomes a hard requirement).

---

### 8.8 — Auto-save snapshots & explicit backups (low priority for solo use)

> Save infrastructure beyond the basic debounce. **Lower yield because bundle export + Cmd+S already cover the realistic loss scenarios.** Strongly consider deferring most of this to Phase 9 alongside the vault story — once data lives in user-controlled files, the OS's own version-history (Time Machine, OneDrive, etc.) handles snapshots for free.

- [ ] **Periodic auto-save with snapshot history per file**
  - User can change the auto-save interval in the Settings pane.
  - Settings pane exposes a section for scrolling through previous saves of a specific picmonic (File Snapshots).
  - User can define how many snapshots are kept and when they expire (every 30 days, max 50 backups, etc.).
  - On Windows, expired snapshots go to the Recycle Bin instead of being hard-deleted.
- [ ] **Manual local backup button** (note from original list: "might be worth deferring to v2 or Phase 9" — agreed; once Phase 9 vault mode lands, the user's vault folder _is_ the backup).

---

### 8.9 — Tutorial & docs (defer unless Engram gets shared)

> Lowest yield for solo use. Implement only if Engram gets shared with other users — for solo dogfood the docs cost more to maintain than they save.

- [ ] **Built-in walkthrough tutorial** with highlighted regions and popups for the key actions (drop symbol, tag with Fact, Study mode, export).
- [ ] **Comprehensive Docs page** under the Help menu (which itself lands in 8.6).

---

## After Phase 8

- [ ] **Game-Icons integration (curated subset)** — deferred from Phase 7. Add ~800–1200 medically-relevant B&W icons from the Game-Icons set to complement OpenMoji. Direct PRD alignment ("Pixorize-class output") — color emoji fights the editorial dark-mode aesthetic for medical mnemonics; B&W stylized icons for organs, syringes, microscopes, skulls, weapons (toxin/poison encoding) match the Sketchy voice. **Approach:**
  - Vendor Game-Icons SVGs into `public/symbols/game-icons/` (gitignored, build-script driven like OpenMoji per [build-symbol-index.mjs](scripts/build-symbol-index.mjs))
  - Curate to a medical-relevant subset before merge — full 4000+ would bury good matches
  - Extend `symbols.json` index with `source: "game-icons"`, `qualityRank: 2` (per [SPEC.md](docs/SPEC.md) ranking)
  - Source filter UI in library (toggle openmoji vs game-icons) — or merged with badge so users can scan
  - Verify search ranking discipline so good matches surface; one-day standalone ticket

- [ ] **Non-modal help cheatsheet sheet (optional Phase 8 polish)** — current [help-dialog.tsx](src/components/editor/help-dialog.tsx) is modal: user can't reference a shortcut while typing in notes. Phase 8 nice-to-have: a non-modal Sheet variant pinned to the right side that the user toggles with `?` and leaves open while working. Best-of-both-worlds vs. the modal Dialog. ~Half day.

- [ ] **Playwright E2E (only if sharing engram)** — skipped in Phase 7 because solo-desktop dogfood is the practical equivalent. Revisit only if engram gets shared (open-source, given to a colleague) — at that point contributors need a smoke-test that doesn't require each of them to dogfood. Specifically catches what vitest can't: HTML5 drag-drop, CodeMirror keystroke→debounced-save races, Konva→DOM stage attach in `exportPng`. Do not add for solo use — maintenance burden outweighs catch rate.

- [ ] **Typed `ExportError` class hierarchy (only when 3rd export format lands)** — current one-line `QuotaExceededError` switch is sufficient for solo-desktop with two formats. Add the typed reason enum (`stage-not-ready` / `quota-exceeded` / `no-canvas` / `zip-build-failed` / etc.) when a third export format ships (cloud upload? share link?) and there are real error patterns to encode. Premature abstraction today.

---

## v2+ (architected, not built — DO NOT touch in v1)

- Audio per Fact (data slot exists, no UI)
- Animation per symbol (data slot exists, no UI)
- Animated video export/video player in study mode
- AI suggested symbols for a given fact
- AI generated story (Audio transcript)
  - Utilizes the Sections, Fact and Topic (heading of the Picture Mnemonic)
  - Must not deviate from the Facts/Symbols/descriptions in the md column
  - Could add a separate section for "Additional Information" in the md file that the AI utilizes to make the video more engaging/enriching (explaining a topic more in depth), without adding new symbols; (ex: symbol only shows Cardiorenal syndrome symbol, but in the additional information the user added the mechanism, so the audio transcript explains the mechanism, even though there's only the symbol for cardiorenal syndrome)
  - This "Additional information" must be clearly labeled for what its purpose is (strictly for educational video generation)
- AI generated voice (for more engaging and immersive experience for the video viewer)
- Cloud sync (Supabase) — UUIDs already cloud-portable
- (Maybe) AI symbol generation with reference styles
  - Separate pane/tab to edit symbols in place or generate single new symbols to add to the canvas without leaving the editor
- Public Picmonic library
- Expand the tools in the canvas but ensure hard cap on when to stop adding tools; keep it relevant to tools that help blend the scene to make it unified. Avoid Scope Creep; this is not Photoshop (Background Remover from imported symbols, Basic painting tools, blending tools, eraser etc.)

## Phase 9 — Compile & ship as a desktop app

> Wrap the web app as a packaged desktop binary so end users get a "real app" they install once. Eliminates the "Clear browsing data" risk class, kills storage eviction, and unlocks file-vault mode (markdown-as-source-of-truth on disk) cheaply.
>
> Skeleton only — fill in details when v1 + Phase 8 polish is done and there's demand for distribution. Not a v1 blocker.

### Wrapper choice

- [ ] **Pick wrapper: Tauri (recommended) vs. Electron**
  - Tauri: ~5MB installer, system webview (no bundled Chromium), Rust main process. Lighter, faster install, less RAM.
  - Electron: ~150MB installer, bundled Chromium guarantees rendering parity across OS versions, Node main process. Heavier but more predictable.
  - Default to Tauri unless we hit a specific Chromium-only feature Engram needs. Konva/CodeMirror/Zustand all work in any modern webview — should be fine.

### Pre-wrap hygiene

- [ ] **Audit assumptions about being on `localhost:3001`** — search for hardcoded URLs, `location.origin` reads, etc. Wrapped app serves from `tauri://` or `app://` schemes.
- [ ] **Confirm no server calls leaked in.** Engram is local-first by design; double-check before shipping that no analytics / fonts / CDN dependencies sneak in via Next.js defaults.
- [ ] **Strip dev-only globals** from production bundle (`window.__engramStore` exposure, console logs).
- [ ] **Replace `useThemedCssVar` SSR fallbacks** if any rely on document being available at build time — check Next 16 build output.

### Persistence migration (the real Phase 9 win)

- [ ] **"Vault folder" mode** — file-based storage replacing IDB.
  - User picks a folder once at first launch (or accepts a default like `~/Documents/Engram/`).
  - One `.json` file per picmonic at `<vault>/<slug>.json` containing `{ canvas, notes, meta, factHotspots }`.
  - Index is the folder listing itself — no separate `engram:picmonic-index:v1` record. Recompute on launch by reading directory.
  - Thumbnails written as `<vault>/.thumbs/<id>.jpg` (dotfile so they don't pollute the visible folder).
  - Symbol library remains static assets shipped with the app, not in the vault.
  - Reuses the existing bundle export/import logic for `.zip` round-trip; the vault is essentially "always-bundled."
  - In Tauri this is a few hundred LOC (`fs::write`, `fs::read_dir`, atomic writes via temp-file-rename); in Electron same shape via Node `fs/promises`.
- [ ] **Migration: import existing IDB picmonics into the vault on first launch** of the wrapped app — read `engram:picmonic:*` from IDB, write to vault, mark IDB records migrated. One-shot.
- [ ] **Keep IDB as fallback for the web build** — web users continue with browser storage. Conditional behind a build-time flag (e.g. `process.env.NEXT_PUBLIC_TARGET === 'desktop'`).

### Build & distribution pipeline

- [ ] **CI build matrix:** Windows (x64), macOS (arm64 + x64 universal), Linux (AppImage + .deb). GitHub Actions: `tauri-action` if Tauri, `electron-builder` if Electron.
- [ ] **Code signing**:
  - Windows: EV cert or Azure Trusted Signing — without it SmartScreen flags every install.
  - macOS: Apple Developer ID + notarization. Required to avoid "unidentified developer" Gatekeeper block. ~$100/yr.
  - Linux: AppImage doesn't need signing; .deb optional.
  - Decision deferred until distribution model is decided (see below).
- [ ] **Auto-update**: Tauri has built-in updater (signed manifest hosted at a URL). Electron has electron-updater. Both need a static host for the update feed (GitHub Releases works free).
- [ ] **Versioning + changelog discipline** — semver, generated changelog (changesets or release-please).

### Distribution model

- [ ] **Decide: free direct download vs. App Store vs. open source.**
  - Free direct (GitHub Releases): zero gatekeeping, no per-install cost, but users see "unidentified" warnings without code signing.
  - Mac App Store / MAS: requires sandboxing rework (file API limited), $99/yr. Probably overkill for solo-dev tool.
  - Microsoft Store: lower friction than MAS; $19 one-time fee. Worth considering.
  - Open source on GitHub: zero distribution cost, contributors can build their own. Aligns with the Obsidian-vault philosophy ("your data, your tools"). Default recommendation.

### Telemetry & crash reporting

- [ ] **Default: no telemetry.** Local-first means local-period; respect the user's machine. Document the no-telemetry stance in README.
- [ ] **Optional opt-in crash reporter** (Sentry, Tauri-native crash dump) — only behind an explicit settings toggle. Off by default. Surface a privacy note next to the toggle.

### First-launch UX

- [ ] **Welcome flow** — pick vault folder (or accept default), brief tour of File menu + Cmd+S + Study mode + bundle export.
- [ ] **Migration prompt** if upgrading from web to desktop on the same machine: detect existing IDB picmonics, offer one-click import into the new vault.
- [ ] **Backup nag** — gentle "you haven't exported a backup in N weeks" once-a-month toast. Cheap insurance.

### Optional: PWA install path as intermediate step

- [ ] **PWA manifest + service worker** — ship `manifest.webmanifest` so Chrome's address-bar offers "Install Engram." Costs nothing today; gives users a desktop-like experience without the wrap pipeline. Auto-grants persistent storage. Useful intermediate distribution while Phase 9 proper is in flight.

### Out of scope for Phase 9 itself

- Multi-device sync (lives in v2+ cloud sync entry below).
- Plugin/extension API (would need a real architectural pass).
- Native menubar customization beyond File menu (Edit/View/Window/Help — those are Phase 8 if desired).
