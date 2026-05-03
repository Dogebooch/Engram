# TODO — Build Order with Decision Points

Decision points are flagged ⚠️. Hit one → pause, decide, then proceed. See #TODO_Archive for previously finished tasks if needed

## Phase 8 — Further Polish and ideas stated by Doug

> Subsections ordered by yield. **8.1 → 8.4 are the big-win UX changes** that move the product meaningfully forward. **8.5 → 8.8 are infrastructure, polish, and deferrable work.** Within each subsection items are loosely ordered by what's natural to build first.
>
> "Yield" here = how much it changes the user's day-to-day experience. Items that feel "expected for any editor" but are missing (undo/redo, marquee select) count as high yield even if they aren't paradigm-shifting, because their absence is a constant papercut.

---

### 8.1 — Right-panel sidebar: from raw markdown to structured outliner [HIGHEST YIELD]

> The single biggest UX delta. Today the right panel is a raw CodeMirror buffer; the user must know markdown syntax (`#`, `##`, `* {sym:UUID}`) to author structure. Convert it into a proper hierarchy view (Group → Fact → Symbol + Description) with click-to-add, drag-drop reorganization, inline edits, and collapsible groups. Markdown stays the source of truth — the panel becomes a GUI on top of the same parser.

- [x] **Visual hierarchy in the right panel**
  - Tree shape: `Group (Section)` → `Fact(s)` → `Symbol(s) + Description`. Indented, with subtle leading rails and disclosure carets.
  - Each level styled distinctly so the user can read the structure at a glance (Section bigger/uppercase, Fact medium, Symbol-row compact).
  - Driven off the existing `parseNotes()` output — no schema changes; the panel is a new view, not a new model.

- [x] **Hotkeys for adding a Symbol or a Description to the focused Fact** — shortcut keys mirror the buttons.
- [O] **Drag-drop reorganization** of facts and sections inside the panel; canvas + Study order auto-update because they read from the same parsed tree.
  - [x] The drag emblem is to the left of the facts (in line)
  - [x] Click anywhere in the box to be able to drag
  - [x] Make the text in the right column (headings) the muted gold (easier to read)
- [x] ## **Collapsible Groups** — user can fold a Section to hide its facts, reducing clutter for long decks.
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
