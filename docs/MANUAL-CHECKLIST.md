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
  - Works well, but maybe we can make h1 and h2 different colors
- [x] Empty notes → typewriter prompt + kbd hints visible
  - works well, but maybe we can make Empty Notes show up as a "dimmed" color (slightly muted, slightly smaller). Or
  - I also noticed that if you delete a symbol and click control Z, it only undoes the changes to the Markdown, it does not re-add the symbol to the canvas and redo the interactive element on the Markdown
  - It's also kind of non-intuitive how the "expected" formatting of "Section header, Fact, Symbol: Description +/- Personal Notes" is supposed to be made/edited. Some buttons/commands or visual guidance on the Markdown column for how to navigate those behaviors and build the markdown file would be nice. (context: I'm not great at markdown, so rather than learning how to write in markdown I thought it might be nice to have some buttons. However, if its easier to just make a key the user can reference, with some hotkeys, that'd work too)

### Symbol chips

- [x] Drop symbol on canvas → notes get `* {sym:UUID} ` bullet → chip renders inline with image + display name
  - Note: when I drag a symbol onto the canvas, the Markdown column on the right is automatically updated with a new symbol (I love this behavior), when I simply click on an emblem to add it to the canvas, the symbol does not get added to the Markdown column
- [x] Manually type `* {sym:00000000-0000-0000-0000-000000000000}` → red `[missing]` chip with destructive dashed border
- [x] Paste `{sym:UUID}` inside a fenced `code` block → renders as literal text, NOT as a chip
- [ ] Cursor traverses chip atomically (left/right arrow steps over it as one unit)
  - This behavior doesn't seem to be working correctly, as when I type `sym:UUID`, the cursor still goes through each letter. I think that's honestly fine though, idk why the user would want that behavior

### Sync — canvas → notes

- [x] Click symbol on canvas → matching bullet line in notes pulses (~850ms cubic-bezier) and scrolls into view
  - Love this behavior, maybe we can make the "active" highlight 20-30% more visible
- [x] Breadcrumb above editor shows `Section › Fact` with amber tick gutter marker
  - This is the location that I'd discuss having a faded highlight for the entire section header/fact and then a bigger highlight for the active symbol. The user should be able to group in their mind by section, and then the fact/actively selected symbol as a single unit

### Sync — notes → canvas

- [O] Move cursor onto a `* {sym:...}` line → linked symbols glow on canvas (Konva shadow); glow persists while cursor is on that line
  - I'm not sure how to elicit this behavior
- [x] Click a chip in notes → that symbol gets selected on canvas (Transformer attaches)
  - It's remarkable that you integrated this behavior

### Mutations

- [x] **⚠️** Edit `## Heading` text in place → fact renames live; no parser rebuild lag, no chip flicker
- [x] Drop library symbol while cursor is inside `## Fact` → bullet inserted under that Fact
  - This is also remarkable behavior, but again maybe we add some very subtle highlighting +/- pill box behavior to "visually link" the Section/Fact/Symbol and Description
- [O] Drop while cursor is at top of empty doc → `## Unassigned` heading auto-created with bullet underneath
  - The right column doesn't automatically open when the first symbol is dropped/edited in a new/existing canvas
  - The Right column should open once in the canvas - Only once a symbol is added or selected. We use the right Column as the "Navigator"
  - `## Unassigned` heading should be changed to `## Fact 1` in a new document, or `Fact n+1` if adding at the end of an already made Picture scene
- [x] Drop same symbol again under same Fact → no duplicate bullet (idempotent)
  - This behavior seems to be dropping an error in the Dev tools. I'm unsure what's causing it, and the frontend seems to work fine, (it may be under content.js:11)

### Save flow

- [x] Save status transitions "Saving" (spinner) → "Saved" (green checkmark) within ~500ms of last keystroke
- [x] Idle → status returns to dashed idle
  - Add a parenthesis with the time next to it when idle (e.g. `SAVED (HH:MM)`) in 24 hour time
  - Time should match the local machine's time

---

## Phase 4 — Tagging UX + grouping

### Drag-tag (canvas → notes)

- [O] Drag canvas symbol toward right panel → cursor over `## Fact` line → line bg highlights amber (via `::after` pseudo-element)
  - I like this idea, but it's a little wonky; particularly if the program doesn't pickup that the symbol is being placed under a fact (say, the user tries to place it under a h1). In that case, the symbol just goes off the canvas, and the program throws an error in the dev command (symbol isn't visually present anymore on the canvas). Note that if a fact is selected, and then a symbol dragged onto the canvas, if that bug happens, the symbol is still rendered as a pill box on the md column
  - One of the things that would make this more intuitive is if there were a bigger highlighted region when trying to drop a symbol on the md. Rather than having to match the single line that the fact is on, having a larger box that covers all symbols under a fact
  - If the fact is at the end of the list and has no symbols, a highlighted box that is multiple lines tall is temporarily made, and then shortens to the Fact + New Symbol once the symbol is dropped.
  - If an empty fact is in the middle of a list, when the user drags over that fact's line, a highlighted box multiple lines tall pushes facts below it down, briefly until the symbol is dragged and added to the markdown, then the text below is moved back up
- [x] Release over `##` → bullet appears under heading; symbol now tagged with that Fact
- [x] **⚠️** Symbol's canvas position reverts to where it started (drag-tag is non-destructive)
  - See above for the weird bug I explained
- [x] Multi-select → drag any one onto `##` → all selected get tagged
  - Works well. Nice Job

### Keyboard-tag (F)

- [ ] Select 1+ symbols → **F** → fact picker (shadcn Command) opens
- [ ] Picker lists existing Facts; type to filter
- [ ] Type a brand-new name → "Create new" entry at bottom; selecting creates the Fact
- [ ] Press F with no selection → toast "Select a symbol first"

### Right-click (context menu)

- [ ] Right-click canvas symbol → menu: Tag with Fact… / Group / Ungroup / Z-order / Duplicate / Delete with platform kbd hints
- [ ] "Tag with Fact…" opens same picker as F
- [ ] **🔬** Mount/unmount produces no Base UI `nativeButton` warnings in console

### Grouping

- [ ] Select 2+ → **⌘+G** → toast "Grouped N symbols"; dashed amber outline on each member when any one is selected
- [ ] Select 1 → ⌘+G → toast "Select 2+ symbols to group" (no group created)
- [ ] **⚠️** Click any group member → all members auto-select
- [ ] **Alt+click** group member → only that one selected (bypass)
- [ ] Select group → **⌘+⇧+G** → ungroups; world coordinates preserved

### Esc ladder (verify in this order)

- [ ] Help open + nothing else → Esc closes help
- [ ] Picker open, no help → Esc closes picker
- [ ] Context menu open, no picker/help → Esc closes menu
- [ ] No overlays, selection active → Esc clears selection

---

## Phase 5 — Hotspots + Study mode

### Hotspot rendering

- [ ] Author 2+ Facts each with ≥1 symbol → numbered hotspot circles appear at centroids
- [ ] Numbering matches Section → Fact order in notes; gapless (zero-symbol Facts excluded)
- [ ] **Unassigned** Fact → no hotspot rendered
- [ ] Single-symbol Fact → hotspot anchors at upper-right of symbol (reads as a tag, not occlusion)
- [ ] **⚠️** Multi-symbol Fact whose centroid would fall _inside_ a linked symbol → hotspot nudged just past that symbol's boundary

### Hotspot interaction

- [ ] Drag a hotspot circle → on release, dashed inner ring appears (override indicator)
- [ ] **🔬** `useStore.getState().picmonics[<id>].canvas.factHotspots[<factId>].userOverride === true`
- [ ] Move a linked symbol → overridden hotspot stays put; non-overridden recomputes
- [ ] Right-click hotspot → "Reset position" → ring gone, hotspot reverts to centroid

### Player entry

- [ ] **M** in editor → opens fullscreen player overlay (last-used mode honored)
- [ ] Topbar **Study** button → same as M
- [ ] **🔬** `useStore.getState().player.open === true`; editor mounted underneath but fully obscured by opaque overlay

### Hotspot mode

- [ ] Mode is hotspot → numbered circles visible on stage
- [ ] Click a circle → reveal card with fact name + meaning + per-symbol description / encoding
- [ ] **⚠️** Card placement smart-flips near canvas edges (no clipping)
- [ ] Linked symbols glow during reveal
- [ ] Esc with card open → closes card only (player stays open)
- [ ] Esc with no card → exits player

### Sequential mode

- [ ] **M** in player → cycles to Sequential
- [ ] Right rail shows: Section › Fact ordinal, fact name, symbol thumbnails with description + encoding
- [ ] Center pill: Prev / `FACT 03 / 07` zero-padded counter / Next
- [ ] **→** advances; **←** retreats; buttons disabled at ends
- [ ] Non-current Fact's symbols dim to ~50% opacity (smooth fade)
- [ ] **1**–**9** → jump to Fact N (out-of-range no-ops)

### Mode toggle / topbar signal

- [ ] Player closed → topbar has no study-mode dot
- [ ] Player open → topbar shows discreet study-mode dot signal
- [ ] M cycles back to Hotspot from Sequential

---

## Phase 6 — Persistence + Export + Home

### Home (Picmonic list)

- [ ] 0 picmonics → **EmptyHero** with "Build your first mnemonic scene" + Create + Import
- [ ] 1+ picmonics → grid view: 16:9 thumbnails, name, tags, "X total" count, Import button
- [ ] Search by name → filters cards in real-time (case-insensitive substring)
- [ ] Tag filter chips → click to toggle; multiple tags applied as AND
- [ ] No matches → "No Picmonics match those filters" + Clear filters
- [ ] Card menu → Rename / Edit Tags / Duplicate / Export / Delete

### CRUD

- [ ] **Rename** → dialog; Enter saves, Esc cancels; empty reverts
- [ ] **Edit Tags** → chip-on-Enter editor; autocomplete from union of all picmonics' tags
- [ ] **Duplicate** → new id, name + " (copy)"; tags + canvas + notes preserved
- [ ] **Delete** → confirm dialog → on confirm: IDB record + index entry purged. Reload → card stays gone.
- [ ] **🔬** After delete, `useIndexStore.getState().index` does not contain the deleted id

### Picmonic name editing in topbar

- [ ] Click picmonic name in editor topbar → inline text field
- [ ] Enter or blur saves; empty reverts to old name

### Export menu (editor)

- [ ] Topbar Export → dropdown: PNG / Markdown / Anki CSV / —— / Bundle (.zip)
- [ ] Each item shows hint (`2× scene`, `notes.md`, `per-Fact`, `all`)
- [ ] **PNG** → downloads `<picmonic-name>.png`; opening shows scene at 2× pixelRatio
- [ ] **Markdown** → downloads `notes.md`; raw `#`, `##`, `* {sym:UUID}` preserved
- [ ] **Anki CSV** → downloads `<picmonic-name>.csv`; columns: `picmonic_name, section, fact_name, symbol_descriptions, image_path`
- [ ] Anki CSV: Unassigned + zero-symbol Facts excluded
- [ ] Anki CSV: multi-symbol Fact descriptions joined with `¶` (note the spaces)
- [ ] **Bundle** → downloads `<slug>.zip` containing `notes.md`, `canvas.json`, `meta.json`, `scene.png` at root
- [ ] Each export triggers brief "Exported <format>" toast

### Thumbnail

- [ ] Add a symbol → save fires → return to home → thumbnail reflects current canvas
- [ ] **🔬** `useIndexStore.getState().index.find(e => e.id === '<id>').thumbDataUrl` is non-empty after first save→saved transition

---

## Phase 7 — Polish, error states, import

### Help dialog

- [ ] Press **?** (Shift+/) → dialog opens with manpage stamp header (`engram(1) • v0.1 • keyboard`)
- [ ] Sections: Editor / Canvas & symbols / Player / Picmonic
- [ ] Each row: label + optional hint + key chips with `+` separators
- [ ] Click ? icon in topbar → same dialog opens
- [ ] Esc closes dialog (Esc ladder prioritizes help)

### Storage quota warnings

- [ ] **🔬** Force a real ~80% threshold by importing several large bundles, OR override storage estimate in DevTools:
  ```js
  navigator.storage.estimate = async () => ({
    usage: 82_000_000,
    quota: 100_000_000,
  });
  ```
  Then trigger a save (edit a symbol) and wait ~2s → toast `Storage 80% full` (yellow warning)
- [ ] Bump override to `usage: 96_000_000` → trigger save → toast `Storage 95% full — saves may fail` (red, with `Open Home` action)
- [ ] Topbar quota badge appears when ≥95% — clickable, returns home
- [ ] **🔬** Reload the page → no duplicate warning toast (verify `useStore.getState().ui.storageQuota.lastWarned` persisted)

### Save-error recovery

- [ ] **🔬** Force a save error in console:
  ```js
  useStore.setState({ saveStatus: "error" });
  ```
  → toast `Save failed` with action button `Export bundle`
- [ ] Click `Export bundle` → triggers bundle export flow

### Bundle import

- [ ] Home grid header shows **Import** button
- [ ] EmptyHero shows `or [Import]` link as alternative to Create
- [ ] Click Import → file picker filtered to `.zip`
- [ ] **⚠️** Round-trip: export a bundle from Picmonic A, delete A, import the bundle → new picmonic with identical canvas + notes + group + hotspot overrides
- [ ] **🔬** Imported picmonic gets a NEW root id (regenerated to avoid collision)
- [ ] Import a malformed `.zip` (e.g. unzip and remove `notes.md`, re-zip) → error toast describing reason (`schema-mismatch`, `invalid-json`, `missing-file`, etc.)
- [ ] **🔬** Import a bundle whose `factHotspots` references a factId no longer in `notes.md` → imports OK; orphan dropped; `console.warn` logged
- [ ] **🔬** Import a bundle whose `notes.md` references a `{sym:UUID}` not in `canvas.json` → imports OK; soft warn; chip renders as `[missing]`

### Themed canvas chrome

- [ ] **🔬** In DevTools, run `document.documentElement.style.setProperty('--stage', '#440000')` → canvas paper rect re-paints within one frame
- [ ] **🔬** Override `--stage-grid` → dot grid color updates
- [ ] **🔬** Override `--stage-vignette-start` and `--stage-vignette-stop` → radial backdrop updates
- [ ] **🔬** Console clean during a normal author session — no React warnings, no Konva warnings, no CodeMirror errors

---

## Cross-cuts (run last)

### 5-minute end-to-end smoke

- [ ] Clean state → home empty
- [ ] Create picmonic → drop **5 symbols** from library
- [ ] Add **3 Facts** in notes; tag symbols across them via all three paths (drag, F, right-click)
- [ ] Group 2 of the symbols
- [ ] Drag one hotspot to override its position
- [ ] **M** → cycle through both player modes; jump to Fact 2 via `2`
- [ ] Esc out → rename picmonic; tag it with `test`
- [ ] Export bundle
- [ ] Delete picmonic from home → confirm gone
- [ ] Re-import the bundle → state matches what was exported (canvas, notes, group, override)

### Persistence durability

- [ ] **⚠️** Quit browser tab, reopen `localhost:3000` → state restored to last save
- [ ] **🔬** DevTools → Application → IndexedDB shows `engram:picmonic:<id>` records and one `engram:picmonic-index:v1` entry

### Keyboard shortcut roll-call

- [ ] Editor: **⌘+N**, **⌘+B**, **⌘+\\**, **/**, **?** all fire as expected
- [ ] Canvas: **F**, **⌘+G**, **⌘+⇧+G**, **Delete**, **Backspace**, **⌘+D**, **[**, **]**, **{**, **}** all fire
- [ ] Player: **M**, **←**, **→**, **1**–**9**, **Esc** all fire
- [ ] Esc ladder: help → picker → context menu → clear selection (in that order)

---

## Known gaps (do NOT test, just be aware)

- **⌘+S** — listed in help dialog with hint _auto-saves on edit_ but **no handler is registered** in `src/lib/keybindings.ts`. Browser captures it as "Save Page As…". Auto-save handles persistence; explicit ⌘+S is currently a no-op stub. Either remove from help or wire a handler in Phase 8.

---

## After running

- Triage failures by phase tag (e.g. `P3-7`, `P5-12`).
- Don't fix in-place during the smoke run — log each failure, finish the pass, then prioritize: fix-now vs. defer-to-Phase-8.
- When all items pass: tick `docs/TODO.md` line 119 and start Phase 8.
