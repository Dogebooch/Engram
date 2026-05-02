# Engram — Manual Checklist (Phases 1–7)

> Pre–Phase 8 manual smoke pass. Walk top-to-bottom; tick boxes as you confirm. Marks: **⚠️** = regression-prone, **🔬** = needs DevTools console.
> (Manual Comments are located below each check box, an x represents a "passing" grade, with minor comments below, and an O represents possible faulty/failure, again with comments below each )

## Phase 0–1 — Foundations

### Layout

- [x] App loads at `localhost:3000` → home (Picmonic library) renders without console errors
  - Port 3001 is environmental — Next.js falls through when 3000 is taken by another process. Not an Engram bug; no code change.
- [x] Topbar shows "engram" brand + accent dot; right side shows `library` stamp when no picmonic open
  - Brand emblem to replace amber accent dot — deferred to Phase 8 (design decision, not a bug).
- [x] Open any picmonic → topbar swaps in: panel-toggle icons, picmonic name, save status, export menu, Study, ?
- [x] Resize handles between left/center/right panels drag smoothly and stick after release
- [x] **⌘+B** → left panel collapses / re-opens; topbar icon greys when collapsed
- [x] **⌘+\\** → right panel collapses / re-opens; topbar icon greys when collapsed
- [x] Click brand "engram" → returns home (saves any in-progress edits first)
- [x] **⚠️** Hard reload (Ctrl+R) → state restored: panel collapse + last-opened picmonic + canvas + notes
  - Fixed: hydration race resolved by making `SymbolNode` reactive to the library cache via `useSymbolsReady`, plus warming `loadSymbols()` from `Hydrated` as soon as persist hydration completes. Symbols now show neutral placeholder rect while the library is in-flight, then resolve to real images — no red `?` flash.

---

## Phase 2 — Symbol library + canvas placement

### Library

- [x] Library grid renders virtualized 5–6 columns of OpenMoji symbols
- [x] Search input shows `/` kbd hint in placeholder
- [x] Press **/** → focuses search input (also expands left panel if collapsed)
- [x] Type `scorp` → results filter quickly; matches surface within first row or two
- [x] **Recent strip** appears above results after first add; capped at 16 entries
  - Fixed: recent strip now has subtle bg tint + stronger border, plus an `ALL` mini-header above the main grid, so the two zones read as distinct sections.
- [x] **🔬 Missing-index recovery** — rename `public/symbols.json` to `symbols.json.bak` and reload → "Failed to load symbols" + Retry button. Restore filename, click Retry, library reloads.

### Canvas placement

- [x] Drag library card onto canvas → drop affordance (amber inner-glow) appears during drag
- [x] On drop, symbol lands at cursor coords (not at center)
- [x] Click library card without dragging → symbol added at canvas center
- [x] Each new symbol gets a fresh layer (above previous)
  - Deferred to Phase 8: double-click chip in notes to inline-edit the symbol description (CodeMirror widget interaction; needs design pass).

### Selection + transformer

- [x] Click symbol on canvas → Konva Transformer appears (corner handles + rotate handle, padding 4px)
- [x] Drag corner → resize works
- [x] **🔬** After resize ends, `useStore.getState().picmonics[<id>].canvas.symbols.find(s => s.id === '<id>')` shows updated `width`/`height`, `scaleX`/`scaleY` reset to 1
  - Verified by code inspection: `canvas-transformer.tsx:56-60` calls `node.scaleX(1); node.scaleY(1)` and writes `width = node.width() * scaleX`, `height = node.height() * scaleY` back to the store on `transformEnd`. Round-trip covered by `serialize.test.ts`.
- [x] **⚠️** Drag rotate handle → cardinal snaps near 0° / 90° / 180° / 270°
- [x] Single click → only that symbol selected
- [x] **Shift+click** another → both selected; second Shift+click on same toggles off
  - Deferred to Phase 8: multi-select rotation/resize feel (Konva Transformer multi-node interaction).
  - Deferred to Phase 8: Ctrl+Z undo across canvas + notes (proper undo stack; touches both stores).
  - Deferred to Phase 8: visual selection / layer indicator ("deck of cards" idea recorded for design exploration).
- [x] **Esc** → clears selection, Transformer dismounts

### Layer order

- [x] Select non-bottom symbol → **[** → moves one layer back
- [x] **]** → moves one layer forward
- [x] **{** (Shift+\[) → to back
- [x] **}** (Shift+\]) → to front
- [x] Visible Z-order on canvas matches array order in `useStore.getState()` symbols
  - Verified in Preview: placed 3 symbols, called `reorderSymbol(middleId, 'toBack')` → store array reordered to `[middle, first, last]` and visible Z-order updated to match. Array-as-truth is the documented design.
  - Deferred to Phase 8: "deck of cards" layer-position visualization.

### Edit shortcuts

- [x] Select → **Delete** → removed
- [x] Select → **Backspace** → removed
  - Decision (kept current behavior): leave the chip as `[missing]` in markdown when its symbol is deleted. Rationale: preserves description text, gives a breadcrumb, avoids cascading bullet-line removal across cross-tagged facts. Real swap UX (a `Replace symbol…` action that swaps the underlying ref in place) recorded under Phase 8 instead of a binary toggle.
- [x] Select → **⌘+D** → duplicate appears overlapped at same position
  - The subtle off-angle of the symbol so you can actually see that it was duplicated was a nice touch
- [x] Multi-select → Delete → all removed in one action
  - Fixed: **Ctrl/Cmd+A** now selects every symbol in the active picmonic (skipped while typing in notes — CodeMirror keeps its own select-all).
  - Fixed: deleting a canvas symbol now opens a confirmation dialog with a "Don't ask again" checkbox in the footer. Flag persists in `ui.confirmSymbolDelete`. Esc cancels (added to the Esc ladder between Help and Fact-Picker). Both the keybinding and the right-click context menu route through this confirm flow.

---

## Phase 3 — Markdown notes + bidirectional sync

### Editor render

- [x] Notes panel CodeMirror loads with dark oklch theme
- [x] Type `# Section` → h1 styled distinctively (Geist Sans, larger, tracking)
- [x] Type `## Fact` → h2 styled smaller than h1, `##` marker dimmed
  - Fixed: h2 now uses an oklch mix toward `--accent` (amber-tinted muted) so it reads as a different color, not just a dimmer h1.
- [x] Empty notes → typewriter prompt + kbd hints visible
  - Fixed: empty-prompt is dimmer (font-size 11px → 10.5px; comment-text mix 50% → 35%; kbd bg 50% → 30%, border 100% → 60%, color 70% → 55%). Reads as a soft caption, not noise.
  - Deferred to Phase 8: Ctrl+Z to redo canvas + chip when undoing notes-side delete (cross-store undo is in TODO.md:176–179).
  - Deferred to Phase 8: buttons / guidance / hotkeys for building the Section/Fact/Symbol/Description structure (queued under TODO.md:157–168 markdown UX overhaul).

### Symbol chips

- [x] Drop symbol on canvas → notes get `* {sym:UUID} ` bullet → chip renders inline with image + display name
  - Fixed: click-to-add now syncs notes too. Both the drag-drop and click paths route through a shared `addSymbolWithNoteSync` helper ([add-symbol-with-note-sync.ts](src/lib/canvas/add-symbol-with-note-sync.ts)) so they cannot diverge.
- [x] Manually type `* {sym:00000000-0000-0000-0000-000000000000}` → red `[missing]` chip with destructive dashed border
- [x] Paste `{sym:UUID}` inside a fenced `code` block → renders as literal text, NOT as a chip
- [x] Cursor traverses chip atomically (left/right arrow steps over it as one unit)
  - Decision (kept current behavior): user explicitly fine. Re-marked passing.

### Sync — canvas → notes

- [x] Click symbol on canvas → matching bullet line in notes pulses (~850ms cubic-bezier) and scrolls into view
  - Fixed: pulse intensity bumped ~25% (start opacity 22% → 28%; mid 18% → 22%; end 4% → 6%; final shadow accent 25% → 30%).
- [x] Breadcrumb above editor shows `Section › Fact` with amber tick gutter marker
  - Deferred to Phase 8: faded section/fact highlight + brighter active-symbol pill, so the user can mentally group by Section while still seeing the active selection (queued under TODO.md:157–168).

### Sync — notes → canvas

- [x] Move cursor onto a `* {sym:...}` line → linked symbols glow on canvas (Konva shadow); glow persists while cursor is on that line
  - Verified working in Preview: with selection cleared, `setCursorContext({ symbolIds: [id] })` flips the matching `Konva.Image.shadowEnabled` to true after react-konva commits. The "can't elicit" was the suppress-when-selected gating ([symbol-node.tsx](src/components/editor/canvas/symbol-node.tsx) `glowing && !selected`): clicking a chip auto-selects the symbol, so the glow is intentionally hidden behind the Transformer outline. To see the glow, click empty canvas to deselect first, then arrow-key cursor onto the bullet line.
- [x] Click a chip in notes → that symbol gets selected on canvas (Transformer attaches)

### Mutations

- [x] **⚠️** Edit `## Heading` text in place → fact renames live; no parser rebuild lag, no chip flicker
- [x] Drop library symbol while cursor is inside `## Fact` → bullet inserted under that Fact
  - Deferred to Phase 8: visual-link pill / subtle highlight grouping Section→Fact→Symbol→Description (TODO.md:157–168).
- [x] Drop while cursor is at top of empty doc → auto-created Fact heading with bullet underneath
  - Fixed: auto-created heading is now `## Fact 1` (empty doc) or `## Fact N+1` where N = max existing `Fact \d+` ordinal. Legacy `## Unassigned` still parses for backward compat. See [insert.ts](src/lib/notes/insert.ts) `nextAutoFactName` + parser post-pass in [parse.ts](src/lib/notes/parse.ts).
  - Fixed: right panel auto-opens on first symbol-add OR first selection per active picmonic via [use-auto-open-right-panel.ts](src/lib/store/use-auto-open-right-panel.ts). Per-picmonic transient flag (`ui.autoOpenedRightForActivePicmonic`, excluded from persistence). Re-collapsing is respected — subsequent adds in the same picmonic don't fight the user. Resets on picmonic switch.
- [x] Drop same symbol again under same Fact → no duplicate bullet (idempotent)
  - `content.js:11` is a Chrome-extension content script (not in the repo). Not an Engram error; user can confirm by disabling extensions. No code change.

### Save flow

- [x] Save status transitions "Saving" (spinner) → "Saved" (green checkmark) within ~500ms of last keystroke
- [x] Idle → status returns to dashed idle
  - Fixed: idle now reads `Saved (HH:MM)` in 24-hour local time (e.g. `Saved (14:23)`). New `lastSavedAt: number | null` in picmonic-slice; set in [debounced-save.ts](src/lib/store/debounced-save.ts) on success; rendered by [save-status.tsx](src/components/editor/save-status.tsx) with a 60s tick to keep the displayed minute fresh while idle. Pre-save state still shows the dashed `Idle`. Verified in Preview: `Saved (11:38)` rendered after a click-add → save cycle.

---

## Phase 4 — Tagging UX + grouping

### Drag-tag (canvas → notes)

- [x] Drag canvas symbol toward right panel → cursor over `## Fact` block → block bg highlights amber (via `::after` pseudo-element)
  - Fixed: drop zone now spans the **whole fact block** (heading + bullets + trailing whitespace), not just the heading line. Implemented via per-line `data-fact-block` decorations in [fact-heading-extension.ts](src/lib/notes/codemirror/fact-heading-extension.ts) (now a `StateField` since CM6 disallows block widgets from view plugins) plus first/middle/last position attributes that suppress internal seams in CSS so consecutive lines read as one continuous box ([globals.css](src/app/globals.css)).
  - Fixed: empty facts (heading with no body content) get a `Decoration.widget` ghost slot that expands to ~28px while a tag-drag is in flight, naturally pushing facts below it down. On drop the inserted bullet replaces the ghost's reserved space, so net displacement is zero.
  - Fixed: dragging a canvas symbol that misses every fact block AND is released **outside the canvas** now reverts the symbol's position to where the drag started ([use-canvas-tag-drag.ts](src/components/editor/canvas/use-canvas-tag-drag.ts)). Drops inside the canvas with no fact target fall through to a normal positional update, clamped to stage bounds via the new shared [clamp-stage.ts](src/lib/canvas/clamp-stage.ts) helper. No more off-canvas symbol stranding.
- [x] Release over `##` → bullet appears under heading; symbol now tagged with that Fact
- [x] **⚠️** Symbol's canvas position reverts to where it started (drag-tag is non-destructive)
  - Fixed by the same `use-canvas-tag-drag.ts` change above — revert is now unconditional whenever the pointer ends outside the canvas with no fact target, so the "drag toward notes, miss heading, land elsewhere" path no longer mutates the symbol's stored position.
- [x] Multi-select → drag any one onto `##` → all selected get tagged
  - Works well. Nice Job

### Keyboard-tag (F)

- [x] Select 1+ symbols → **F** → fact picker (shadcn Command) opens
- [x] Picker lists existing Facts; type to filter
- [x] Type a brand-new name → "Create new" entry at bottom; selecting creates the Fact
- [x] Press F with no selection → toast "Select a symbol first"

### Right-click (context menu)

- [x] Right-click canvas symbol → menu: Tag with Fact… / Group / Ungroup / Z-order / Duplicate / Delete with platform kbd hints
- [x] "Tag with Fact…" opens same picker as F
- [x] **🔬** Mount/unmount produces no Base UI `nativeButton` warnings in console

### Grouping

- [x] Select 2+ → **⌘+G** → toast "Grouped N symbols"; dashed amber outline on each member when any one is selected
- [x] Select 1 → ⌘+G → toast "Select 2+ symbols to group" (no group created)
- [x] **⚠️** Click any group member → all members auto-select
- [x] **Alt+click** group member → only that one selected (bypass)
- [x] Select group → **⌘+⇧+G** → ungroups; world coordinates preserved

### Esc ladder (verify in this order)

- [x] Help open + nothing else → Esc closes help
- [x] Picker open, no help → Esc closes picker
- [x] Context menu open, no picker/help → Esc closes menu
- [x] No overlays, selection active → Esc clears selection

---

## Phase 5 — Hotspots + Study mode

### Hotspot rendering

- [x] Author 2+ Facts each with ≥1 symbol → numbered hotspot circles appear at centroids **(press M to enter Study mode — hotspot circles render only in the player overlay, not on the editor canvas. Editor-side ghost preview queued under Phase 8 in [TODO.md](docs/TODO.md).)**
- [x] Numbering matches Section → Fact order in notes; gapless (zero-symbol Facts excluded)
- [x] **Unassigned** Fact → no hotspot rendered
- [x] Single-symbol Fact → hotspot anchors at upper-right of symbol (reads as a tag, not occlusion)
- [x] **⚠️** Multi-symbol Fact whose centroid would fall _inside_ a linked symbol → hotspot nudged just past that symbol's boundary

### Hotspot interaction

- [x] Drag a hotspot circle → on release, dashed inner ring appears (override indicator)
- [x] **🔬** `useStore.getState().picmonics[<id>].canvas.factHotspots[<factId>].userOverride === true`
- [x] Move a linked symbol → overridden hotspot stays put; non-overridden recomputes
- [x] Right-click hotspot → "Reset position" → ring gone, hotspot reverts to centroid

### Player entry

- [x] **M** in editor → opens fullscreen player overlay (last-used mode honored)
- [x] Topbar **Study** button → same as M
- [x] **🔬** `useStore.getState().player.open === true`; editor mounted underneath but fully obscured by opaque overlay

### Hotspot mode

- [x] Mode is hotspot → numbered circles visible on stage
- [x] Click a circle → reveal card with fact name + meaning + per-symbol description / encoding
- [x] **⚠️** Card placement smart-flips near canvas edges (no clipping)
- [ ] Linked symbols glow during reveal
  - This behavior doesn't seem to be working as expected.
- [x] Esc with card open → closes card only (player stays open)
- [ ] Esc with no card → exits player

### Sequential mode

- [x] **M** in player → cycles to Sequential
- [x] Right rail shows: Section › Fact ordinal, fact name, symbol thumbnails with description + encoding
- [x] Center pill: Prev / `FACT 03 / 07` zero-padded counter / Next
- [x] **→** advances; **←** retreats; buttons disabled at ends
- [x] Non-current Fact's symbols dim to ~50% opacity (smooth fade)
- [x] **1**–**9** → jump to Fact N (out-of-range no-ops)

### Mode toggle / topbar signal

- [x] Player closed → topbar has no study-mode dot
- [x] Player open → topbar shows discreet study-mode dot signal
- [x] M cycles back to Hotspot from Sequential

---

## Phase 6 — Persistence + Export + Home

### Home (Picmonic list)

- [x] 0 picmonics → **EmptyHero** with "Build your first mnemonic scene" + Create + Import
- [x] 1+ picmonics → grid view: 16:9 thumbnails, name, tags, "X total" count, Import button
- [x] Search by name → filters cards in real-time (case-insensitive substring)
- [x] Tag filter chips → click to toggle; multiple tags applied as AND
- [x] No matches → "No Picmonics match those filters" + Clear filters
- [x] Card menu → Rename / Edit Tags / Duplicate / Export / Delete

### CRUD

- [x] **Rename** → dialog; Enter saves, Esc cancels; empty reverts
- [x] **Edit Tags** → chip-on-Enter editor; autocomplete from union of all picmonics' tags
- [x] **Duplicate** → new id, name + " (copy)"; tags + canvas + notes preserved
- [x] **Delete** → confirm dialog → on confirm: IDB record + index entry purged. Reload → card stays gone.
- [x] **🔬** After delete, `useIndexStore.getState().index` does not contain the deleted id

### Picmonic name editing in topbar

- [x] Click picmonic name in editor topbar → inline text field
- [x] Enter or blur saves; empty reverts to old name

### Export menu (editor)

- [x] Topbar Export → dropdown: PNG / Markdown / Anki CSV / —— / Bundle (.zip)
- [x] Each item shows hint (`2× scene`, `notes.md`, `per-Fact`, `all`)
- [x] **PNG** → downloads `<picmonic-name>.png`; opening shows scene at 2× pixelRatio
- [x] **Markdown** → downloads `notes.md`; raw `#`, `##`, `* {sym:UUID}` preserved
- [x] **Anki CSV** → downloads `<picmonic-name>.csv`; columns: `picmonic_name, section, fact_name, symbol_descriptions, image_path`
- [x] Anki CSV: Unassigned + zero-symbol Facts excluded
- [x] Anki CSV: multi-symbol Fact descriptions joined with `¶` (note the spaces)
- [x] **Bundle** → downloads `<slug>.zip` containing `notes.md`, `canvas.json`, `meta.json`, `scene.png` at root
- [x] Each export triggers brief "Exported <format>" toast

### Thumbnail

- [x] Add a symbol → save fires → return to home → thumbnail reflects current canvas
- [x] **🔬** `useIndexStore.getState().index.find(e => e.id === '<id>').thumbDataUrl` is non-empty after first save→saved transition

---

## Phase 7 — Polish, error states, import

### Help dialog

- [x] Press **?** (Shift+/) → dialog opens with manpage stamp header (`engram(1) • v0.1 • keyboard`)
- [x] Sections: Editor / Canvas & symbols / Player / Picmonic
- [x] Each row: label + optional hint + key chips with `+` separators
- [x] Click ? icon in topbar → same dialog opens
- [x] Esc closes dialog (Esc ladder prioritizes help)
