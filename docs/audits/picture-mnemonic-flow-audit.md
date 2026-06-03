# Picture-Mnemonic Flow Audit

> **Date:** 2026-05-10  
> **Scope:** End-to-end flow for adding a pre-made picture mnemonic — upload image → outline symbols on canvas → fill markdown sidebar → review before save.  
> **Approach:** Code walk + live runtime inspection on the dev server (port 3001) against the user's existing PE Sketchy picmonic and a naturally-occurring orphan record in the index.  
> **Output:** Prioritized findings (P0 / P1 / P2) per screen, with location, fix, and complexity.

---

## Summary of severity

| | Count |
|---|---|
| **P0 (broken / blocking)** | 7 |
| **P1 (clearly wrong)** | 13 |
| **P2 (polish)** | 11 |

The flow is functional but has two structurally significant gaps:

1. **There is no packaged "upload pre-made picture mnemonic" entry point.** Users have to know that the path is "create empty picmonic → drop background → manually drag symbols → tag bullets in notes." Anki and Notion both put the dominant content type up-front in the Add dialog; Engram hides it behind a generic `+`.
2. **No review-before-save step.** Saves are debounced live to IDB with a 500ms timer. Crash mid-keystroke loses recent work; the index is updated synchronously while the picmonic record is not, so an interrupted save produces an orphan card that *looks fine on the home screen* and silently fails when clicked. Already reproduced in the user's local IDB (see P0-1).

---

## 1. The flow today, in one diagram

```
Home library                Editor                       (no review)         Home library
┌───────────────────┐    ┌─────────────────────────┐                     ┌───────────────┐
│ + New Picmonic    │ ─> │ ┌──────┐ ┌────┐ ┌─────┐ │  (autosave 500ms    │ Updated card  │
│ Import bundle .zip│    │ │ Lib  │ │ Cv │ │Notes│ │ ─> debounce -> IDB) │               │
│ [picmonic cards…] │ <─ │ │backd │ │ +  │ │ md  │ │                     │               │
└───────────────────┘    │ └──────┘ └────┘ └─────┘ │                     └───────────────┘
                         └─────────────────────────┘
                          ↑ no stepper / no progress / no exit confirm
```

Every "screen" except the home library is one Editor view with three resizable panels. The mental model "four screens" is not reflected in the UI.

---

## 2. P0 — broken or blocking

### P0-1. Orphan picmonic records render as healthy cards

**Reproduction (already real on this machine):**

```js
// IDB index (engram:picmonic-index:v1) has 3 entries
// IDB picmonic records exist for only 2 of them
// Third entry: { id: "a59e126b-…", name: "alpha-outline test", hasThumb: false, … }
// No engram:picmonic:a59e126b-… record present.
```

**On screen:** the orphan renders identically to working picmonics — `AT picmonic alpha-outline test 0 syms · 0 facts · 23h ago`. There is no warning indicator, no broken-thumb state, no "couldn't load" badge. Clicking the card does nothing visible: `currentPicmonicId` stays `null`, the URL stays at `/`, no toast, no error dialog. Verified live.

**Root cause:** [src/lib/store/slices/picmonic-slice.ts](src/lib/store/slices/picmonic-slice.ts:75) writes the index entry synchronously on `createPicmonic()`. The picmonic record itself is only written via the 500ms debounced save. Tab close inside that window leaves the index lying about what exists.

**Fix:** Write a placeholder record synchronously alongside the index entry so the index never references a missing key. Detect orphans on load and offer "delete this empty card" rather than failing silent. Pair with a startup integrity sweep: any index entry without a matching record gets surfaced in a small "couldn't load these N items" toast with a remove button.

**Complexity:** S (placeholder write) + S (integrity sweep) = **S**.

---

### P0-2. Tab close mid-debounce is not survival-safe

**Reproduction:** In a fresh picmonic, type rapidly into notes for <500ms then close the tab. `flushPendingSave()` is dispatched async without `event.preventDefault()`, so the browser kills the page before the IDB write completes.

**Files:** [src/lib/store/debounced-save.ts](src/lib/store/debounced-save.ts) (500ms debounce constant `SAVE_DEBOUNCE_MS`), [src/lib/storage/use-flush-on-unload.ts](src/lib/storage/use-flush-on-unload.ts:13–22) (non-blocking flush).

**Fix:** Two changes.
1. Reduce `SAVE_DEBOUNCE_MS` to 250ms, matching the index debounce. (S)
2. On `beforeunload`, if there's a pending save, perform a synchronous `localStorage` mirror of the latest serialized picmonic JSON keyed by `engram:pending-save:{id}`. On startup, recover any pending-save mirror into IDB and clear the mirror. localStorage is sync-only and survives tab kills. (M)

**Complexity:** **M**.

> Note: I pushed back against the obvious "just call `event.preventDefault()`" because Chrome shows the user the "Are you sure?" prompt every time, which is hostile for a single-user local app.

---

### P0-3. Clicking an orphan card silently fails

**Reproduction:** Click the `alpha-outline test` card in the home library. Nothing happens. No toast, no navigation, no console error.

**Files:** [src/components/editor/hydrated.tsx:65–70](src/components/editor/hydrated.tsx) — when `idbGet(picmonicKey(id))` returns `undefined`, the load path treats it as "not yet loaded" rather than "doesn't exist."

**Fix:** Distinguish the two cases. If the record is missing, show a `sonner` toast ("Couldn't load 'alpha-outline test' — record is missing. Remove from library?") with a Remove action. Don't set `currentPicmonicId` for a record that can't be loaded.

**Complexity:** **S**.

---

### P0-4. Orphan user-asset blobs from cancelled imports

**Reproduction (theoretical, code-confirmed, not live-repro'd this run):** Start a `.zip` import. `registerImportedUserAssets()` writes blobs and the user-assets index *before* the picmonic is fully persisted ([src/lib/export/import.ts:138–162](src/lib/export/import.ts)). Cancel during the post-asset, pre-picmonic-save window. Blobs remain referenced by nothing, never garbage-collected.

**Fix:** Two-phase commit pattern.
1. Stage assets under `engram:user-assets-staging:{importBatchId}` (separate index key).
2. After the picmonic record is persisted, `Promise.all`-merge staged entries into `engram:user-assets-index:v1`.
3. On startup, drop any `engram:user-assets-staging:*` keys older than 1 minute.

**Complexity:** **M**.

---

### P0-5. No canvas zoom or pan

**Files:** [src/components/editor/canvas/canvas-stage.tsx:133–168](src/components/editor/canvas/canvas-stage.tsx) — fit-box scale only, no wheel handler, no space-drag-pan.

**Why it's P0 for this flow specifically:** The Sketchy PE French battle ground reference is dense — multiple human figures, hand-held items, banners — and outlining a small element (e.g. a ribbon on a uniform) at the editor's auto-fit scale (~15% per the topbar readout, *15% scale on the existing PE picmonic confirmed live*) is impractical. Figma, Excalidraw, even Photoshop have wheel-zoom + space-pan. Engram is the outlier.

**Fix (Figma-modeled):** wheel zoom around cursor, clamp 25%–400%, `space + drag` for pan, `1` for 100%, `2` for fit. Persist viewport per picmonic so reopening returns to the user's last view.

**Complexity:** **M**.

---

### P0-6. No review-before-exit confirmation

**Files:** No file — feature does not exist. Closest neighbor is [src/components/editor/home/export-menu.tsx](src/components/editor/home/export-menu.tsx) (post-save export, wrong layer).

**Why it's P0:** A user types a fact description, hits the brand button to go home, the 500ms debounce hasn't fired, work is lost. Anki has an explicit Add button; Notion saves continuously *and* shows "saved 2s ago" provenance plus survives closes via service-worker journaling. Engram has neither.

**Fix (Anki-modeled summary modal on exit):** Intercept brand-button click and Cmd-W. If the active picmonic has a pending save *or* was created in this session, show modal: thumbnail + name + symbol-count + fact-count + buttons `Save and exit` / `Keep editing` / `Discard`. `Discard` only available for session-created picmonics that have not been saved yet.

**Complexity:** **M**.

---

### P0-7. Konva stage exceeds the recommended layer count, warning every render

**Reproduction (live, console):**
```
[warn] Konva warning: The stage has 6 layers. Recommended maximum number of layers is 3-5.
```
Logged on every editor mount and rebuild.

**Files:** [src/components/editor/canvas/canvas-stage.tsx:395–417](src/components/editor/canvas/canvas-stage.tsx) — six layers (paper bg + dot grid, backdrop, symbols, group-outline export-chrome, transformer, marquee).

**Fix:** Collapse the marquee + group-outline + transformer into a single overlay layer using Konva.Group. The performance warning becomes meaningful at 30+ outlines because Konva re-rasters per layer.

**Complexity:** **S**.

---

## 3. P1 — clearly wrong

### Screen 1 — Upload background image

- **P1-1. No "upload picture mnemonic" CTA.** Home topbar offers `New Picmonic` (empty) and `Import bundle (.zip)` (Engram-format). The user's actual goal — "I have a Sketchy image, turn it into a picmonic" — is unnamed. *Fix:* add primary CTA "Upload picture mnemonic," wire it to a flow that creates picmonic + opens file picker for backdrop in one step. Anki's Add Card model. **M**. [src/components/editor/home/](src/components/editor/home/)
- **P1-2. No drag-drop overlay on the home library.** Dropping an image on `/` does nothing — but the user's mental model says "drag image onto the app, it makes a picmonic." *Fix:* when a single image file is dragged over the home page, show a full-page accent overlay with text "Drop to create a picture mnemonic." Notion / Figma model. **S**. New code under [src/components/editor/home/](src/components/editor/home/).
- **P1-3. No full-stage drop overlay** when dragging onto the canvas with no backdrop yet. Today the drop target is just the backdrop card in the left panel. *Fix:* canvas should show a dashed accent border + text "Drop image to set background." **S**. [src/components/editor/canvas/use-backdrop-file-drop.ts](src/components/editor/canvas/use-backdrop-file-drop.ts)
- **P1-4. No progress / step indicator across the four phases.** A user new to Engram doesn't know that "outline → notes → review" comes after "drop image." *Fix:* add a 4-step checklist in the right-sidebar header that lights up as each step is completed (image set, ≥1 outline, ≥1 fact filled, save). Anki-style "Front / Back / Tags" tabs are the closest analog. **M**.

### Screen 2 — Outline symbols on the canvas

- **P1-5. No keyboard nudge.** Arrow keys do nothing on selected symbols. *Fix:* arrows = 1px, shift+arrows = 10px. [src/lib/keybindings.ts](src/lib/keybindings.ts) is the single source of truth. **S**.
- **P1-6. No layer / outline panel.** With 30+ outlines stacked over a Sketchy scene, the only way to find a specific one is click-through. *Fix:* collapsible right-panel-adjacent strip listing each outline with linked fact name; click to select, double-click to rename. Figma's layers panel. **L**.
- **P1-7. No alignment guides on drag.** Two character outlines on the same horizon line should snap. *Fix:* Figma-style smart guides using sibling AABBs as anchors. **M**.
- **P1-8. No copy/paste keyboard.** `Cmd+D` duplicates with offset, but clipboard `Cmd+C / Cmd+V` (especially for cross-picmonic paste) doesn't exist. *Fix:* serialize selection to `clipboard.writeText` JSON, parse + insert on paste. **S**.
- **P1-9. Konva warning visible to users.** Documented above as P0-7; the noisy console is a P1 even after the layer-count fix lands.

### Screen 3 — Markdown sidebar (notes panel)

- **P1-10. CodeMirror has no visible focus ring.** *Fix:* add a 2px accent ring on `.cm-editor.cm-focused` in [src/app/globals.css](src/app/globals.css). **S**.
- **P1-11. The bullet form for newly-added symbols isn't structured.** Currently the user types freeform `Visual → meaning; encoding (why)`. Anki's add-card has explicit fields. [src/components/editor/panels/notes-panel/selected-bullet-form.tsx](src/components/editor/panels/notes-panel/selected-bullet-form.tsx) exists — **read this file before designing the fix; it may already be partially implemented**. *Fix:* render a 3-field form (Visual / Meaning / Why) on first selection of a new bullet, write the canonical shape on submit, dismiss after. Subsequent edits use the freeform CM editor. **M**.

### Persistence / cross-cutting

- **P1-12. Notes/canvas delete is not bidirectional.** Delete a symbol on canvas → its `* {sym:UUID}` bullet stays in notes orphaned. [src/lib/canvas/add-symbol-with-note-sync.ts](src/lib/canvas/add-symbol-with-note-sync.ts) handles add atomically; `deleteSymbols` doesn't touch notes. *Fix:* extend the delete path to also remove matching bullets, single undo entry. **M**.
- **P1-13. `meta.source` provenance field missing.** Per the locked plan decision: add `meta.source: "imported" | "generated"` and optional `meta.sourceRef?: string`. Backfill on load via `normalizeMeta()`. Powers the review modal differentiating "first save of an imported card" vs "everyday autosave." [src/lib/types/picmonic.ts](src/lib/types/picmonic.ts). **S**.

---

## 4. P2 — polish

- **P2-1.** Tab order on home page starts at `Keyboard shortcuts` (the `?` button) — verified live. Should start at `Search by name` or the first picmonic. **S**.
- **P2-2.** No `aria-label` on the canvas Konva stage. Screen-reader users have no idea what the canvas is. **S**. [src/components/editor/canvas/canvas-stage.tsx](src/components/editor/canvas/canvas-stage.tsx)
- **P2-3.** Linting result count appears in breadcrumb but errors aren't navigable from there — click to jump to line. **S**.
- **P2-4.** No "jump to next fact" keyboard shortcut for sidebar editing. Useful when filling 6–8 facts in a row. **S**.
- **P2-5.** No bbox / dimension readout while resizing on canvas. **S**.
- **P2-6.** No canvas search by fact name (Cmd-/ in Figma). **M**, deferrable until layer panel ships.
- **P2-7.** Backdrop preview thumbnail in the library card doesn't show a loading state during initial render. **S**.
- **P2-8.** No empty state on canvas after backdrop is set but before first outline ("Drag a symbol from the library to start outlining"). **S**.
- **P2-9.** No loading skeleton on the notes panel during initial parse. **S**.
- **P2-10.** Selection-state churn on undo: Cmd-Z restores canvas but blows away selection. Figma and Excalidraw both keep selection out of undo, so this might be intentional — verify with the user before fixing. **S, may defer**.
- **P2-11.** A `dialog-header` for "Tag with Fact" is mounted in the home-page DOM under `class="sr-only"`. It's a screen-reader description for an editor-scoped dialog primitive that's globally instantiated. Either scope it to the editor route, or unmount when no picmonic is active. Not a bug, but DOM noise. **S**. [src/components/](src/components/)

---

## 5. Items deliberately NOT in scope

These were considered and rejected for this pass:

- **A guided "wizard" for the import flow.** The plan calls for an inline stepper, not a multi-step wizard. Anki, Notion, and Figma all use inline progress indicators rather than modal wizards for editor flows.
- **Cross-picmonic symbol library.** User-uploaded symbols are *already* globally stored and ID-referenced (verified: `engram:user-assets-index:v1` exists, blobs in a separate IDB DB). No deduplication change needed.
- **Schema v2 fields** (`animation*`, `factMeta`, `timeline`). Per CLAUDE.md, these are v2 scaffolding and must be preserved as-is.
- **Tauri-specific paths.** This audit ran against `next dev` only. The Tauri build inherits the same code; findings apply.

---

## 6. Verification plan for Phase 3

1. **Fresh-user happy path** — Home → "Upload picture mnemonic" → drop the Sketchy PE image → outline 6–8 regions → fill each fact's three fields → exit triggers review modal → save. Confirm thumbnail and counts on the resulting card match.
2. **30-outline fixture** — Seed the user's existing PE picmonic with 30 layers via a one-shot `<input type=file>`-style dev seed (or direct IDB write); confirm canvas legibility at 100%, 50%, 25%, fit; verify outline panel sync.
3. **Crash safety** — Create new picmonic, edit for 200ms, kill the tab via DevTools `chrome://kill`. Reopen → card resolves to either the placeholder record or surfaces a "couldn't load" toast with a remove button — never a silently-broken card.
4. **Cancel-mid-import** — Start `.zip` import, cancel after asset registration. Reopen DevTools → IDB → confirm `engram-user-assets` blob store has no orphans (or startup sweep removes them).
5. **Keyboard-only run** — Repeat (1) without touching the mouse. Tab traversal flows from Search → first picmonic → through editor → notes → review modal. Esc closes overlays consistently. Cmd-S flushes save with confirmation. `?` overlay reachable and dismissable.
6. **Lint + typecheck + tests** — `npm run lint` clean, `npm run build` clean, `npx vitest run` clean. New tests for: `normalizeMeta()` source backfill, orphan-detection on load, debounce-survival via localStorage mirror.

---

## 7. Suggested ordering for Phase 2 proposal

Group fixes by blast radius and ship in this order:

1. **Persistence integrity** (P0-1, P0-2, P0-3, P0-4, P1-13) — placeholder writes + recovery mirror + provenance field. Without this, every other fix risks losing user work.
2. **Canvas-at-scale** (P0-5, P0-7, P1-5 through P1-8) — zoom/pan, layer collapse, nudge, layer panel, alignment guides, copy/paste. Unblocks the 30-outline fixture verification.
3. **Notes panel structure** (P1-10, P1-11) — focus ring + structured bullet form. Cheap and visible.
4. **Guided flow** (P1-1, P1-2, P1-3, P1-4) — primary CTA, drag-drop overlays, step indicator. The user-visible "polishing pass" headline.
5. **Review modal** (P0-6) — Anki-style exit confirmation, depends on `meta.source` from step 1.
6. **P2 sweep** — pick the cheap ones (P2-1, P2-2, P2-7, P2-8, P2-9, P2-11) as a closing batch.

---

## Notes for the implementer

- Single source of truth for keybindings is [src/lib/keybindings.ts](src/lib/keybindings.ts). Update it, not the docs.
- Markdown is the source of truth for content. Don't introduce parallel structured state for facts/symbols — extend the notes ↔ canvas sync helpers.
- v2 scaffolding fields (`animation*`, `factMeta`, `timeline`) must be preserved through serialization but get no v1 UI.
- shadcn/ui components are owned in-tree under [src/components/ui/](src/components/ui/). Edit them, don't re-pull.
- Tailwind v4, CSS-first config in [src/app/globals.css](src/app/globals.css). No `tailwind.config.*`.
- Run a single test file: `npx vitest run src/lib/notes/parse.test.ts`.
