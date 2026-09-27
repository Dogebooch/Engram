# ROADMAP — Engram v1.3 → the scene hub

The single planning doc (replaces the old TODO and IMPROVEMENTS docs, 2026-09-27). Detailed design
happens in a plan-mode spike at the start of each phase; this file says *what* and *why*.

**North star:** every scene you own is in Engram, findable in seconds, easy to finish or make without
a manual, safe on disk, and attached to the Anki cards you already review.

## Why this roadmap exists

Engram stopped being used on 2026-07-06. The reasons, in the user's words and order:

1. **Learning curve too high** — no guidance on how to make a scene fast or what the tools do.
2. **My scenes weren't in it** — ingest built ~1,537 `.engram.zip` scenes (630 vetted, 83 flagged,
   ~824 untriaged) from ~1,813 videos, but import is manual.
3. **Making scenes too slow.**

## Principles

- Fix what made you quit, in that order.
- The app teaches itself — in context, not in a manual.
- Nothing gets imported by hand.
- Your data ends up as plain files you can back up.
- **Anki stays the scheduler.** Engram attaches scenes to the cards you already have; no duplicate
  cards, no in-app spaced repetition.
- Every phase ends with a **real-use check by you**, not just green tests.
- Anything not tied to a named pain waits in the Backlog.

## Review snapshot (2026-09-27)

| Keep — strong foundations | Gaps |
|---|---|
| Markdown-as-truth with atomic notes+canvas sync | **Storage:** everything in WebView2 IndexedDB (~24 MB); no files, no backups, delete is permanent, orphaned blobs leak |
| Sliced Zustand + zundo undo/redo | **Library:** search matches scene names only; tags modeled but no UI; thumbnails are base64 in one index blob (breaks near 1,500 scenes) |
| Form/Source notes, single keybinding table | **Ingested scenes** are facts-only: symbols are placeholders on a grid, so hotspots don't work until placed |
| Dark theme, in-tree shadcn, polished motion | **Learnability:** no onboarding; `?` list + ⌘K only; the fastest tagging flow (armed "+ symbol") is hidden |
| Ingest autopilot + `design-mnemonic` skill both output bundles | **Making:** bundle import is a manual/dev-app hack |
| Tauri 2 release pipeline + auto-update | **Bugs:** drag-symbol-onto-Fact broken in Form view; no vertex undo while tracing; SPEC promises Playwright E2E that doesn't exist |
| | **Study:** reveal-only player; CSV export only (no images, no AnkiConnect) |

## Phases

| # | Phase | Status | Size |
|---|---|---|---|
| 0 | Hygiene & re-alignment | Not started | 1 session |
| 1 | Scenes in, findable | Not started | M (2–3 sessions) |
| 2 | Learnable without a manual | Not started | M |
| 3 | Safe on disk | Not started | L (3–4 sessions) |
| 4 | Finish & make fast | Not started | M |
| 5 | Study via Anki | Not started | M |
| 6 | Make art in Engram (optional) | Not started | M–L |

### Phase 0 — Hygiene & re-alignment

- **Why:** clear stale branches, dead files and wrong pointers before building on top of them.
- **Done when:** `npm test` / `lint` / `build` + ingest pytest green before and after; no stale
  pointers in docs, memory or skills.
- **Size:** 1 session.

Checklist:

- [ ] Baseline `npm test`, `npm run lint`, `npm run build`, ingest pytest (record results).
- [ ] Prune merged + snapshot branches (14 stale); **ask before any remote delete**.
- [ ] Remove orphan `.claude/worktrees/*`, `.codex-next-dev.*.log`, dead `../create_draft.py`,
  May-28 screenshots in `../`, `.playwright-mcp/`.
- [ ] Decide `.agents/` (untracked Codex fork): track it and fix its `.Codex` paths, or delete it.
- [ ] Settle the AGENTS.md "Codex in-app browser" line.
- [ ] Rewrite `PRD.md` to the hub vision above.
- [ ] `SPEC.md`: drop the Playwright E2E promise, or add one smoke test.
- [ ] Delete `TODO_Archive.md` if nothing in it is live.
- [ ] Drop the stale `settings.local.json` entry.
- [ ] Split `canvas-stage.tsx` along its seams (Phases 2 + 4 touch it); before/after check in the
  running app.
- [ ] Fix the ingest `escalateReason()` dead-end.
- [ ] Make `engram/` the canonical session root; consolidate the two Claude memory folders.
- [ ] Reclaim disk: `.next` (3.1 GB), `cargo clean`.
- **Never prune `video-ingest-runs/` or `_benchmark/`.**

### Phase 1 — Scenes in, findable

- **Why:** your scenes weren't in it (pain 2), and 1,500 scenes are useless if you can't find one.
- **Done when:** typing "splenic vein" finds every scene and fact that encodes it; a newly built
  bundle shows up without clicking Import.
- **Scope:**
  - Import-folder setting: every built bundle imports once (idempotent), new ones auto-import on
    launch — ingest and `design-mnemonic` output alike.
  - Status seeded from `tools/video-ingest/ingest_queue.json`: ready / needs review / flagged.
  - Thumbnails out of the index blob + virtualized library grid.
  - Delete → Trash (restorable).
  - Search across facts, symbols and meanings in all scenes; quick open; jump to the fact.
  - Placeholder scenes don't show fake hotspots.
- **Not doing:** storage swap (Phase 3), tag UI (Backlog).
- **Size:** M (2–3 sessions).
- **Start here:** `src/lib/import/use-bundle-import.ts`, `source-video-match.ts`
  (`findExistingImportedSource`), `src/lib/export/import.ts`; ledger keys = MVS video ids =
  `meta.sourceVideo.id`; bundles in `../video-ingest-runs/<slug>/*.engram.zip`; thumbnails =
  `thumbDataUrl` in IDB `engram:picmonic-index:v1` (`use-thumbnail-capture.ts` needs a live stage, so
  imported scenes need a downscaled backdrop); delete = `picmonic-slice.ts:90-115`; name-only search
  at `home.tsx:150`; search index like `symbols/search.ts` over `parseNotes()`.

### Phase 2 — Learnable without a manual

- **Why:** the learning curve (pain 1). Simplify first, then teach with one mechanism.
- **Done when:** you build a scene from blank (3+ facts, 5+ symbols) in ≤10 min, and finish an
  imported one, without asking anyone.
- **Scope:**
  - Simple mode: advanced tools behind "More".
  - Next-step coach on each scene: what's left → one-click action + a one-line "what this does".
  - Example scene from `../_benchmark/` on first run.
  - Fix drag-symbol-onto-Fact tagging in the Form view.
  - Surface hidden speed paths: armed "+ symbol" chip, drag-to-tag hint, always-visible outline
    handles.
- **Not doing:** guided tour, help center, video tutorials.
- **Size:** M.
- **Start here:** coach derives from `symbolHasOutline()` / `findMissingOutlines()`
  (`src/lib/canvas/symbol-outline.ts`), `src/lib/notes/lint.ts`, the walkthrough queue
  (`interactions-slice.ts:44-49,263-290`), canvas empty state (`canvas-stage.tsx:888-945`). Drag bug:
  `data-fact-block` is set only in `codemirror/fact-heading-extension.ts`, never under
  `panels/notes-panel/outline/`. Armed add = `addSymbolTargetFactId` (`interactions-slice.ts:53,96-97`).

### Phase 3 — Safe on disk

- **Why:** before heavy editing starts, while migration is still small. Imported scenes are
  regenerable from their zips, so the interim IDB risk is low.
- **Done when:** the library is a plain folder you can back up (e.g. OneDrive); Claude edits a
  `notes.md` and Engram shows it.
- **Scope:**
  - Library = folder of scene folders (the existing bundle layout) + shared `symbols/<sha256>`.
  - Storage port: IDB impl (web + tests) and FS impl, picked by `isTauriRuntime()`.
  - Rust commands beside `save_bytes`: atomic temp+rename writes, trash.
  - Images via the asset protocol (ACL detail = spike).
  - IDB → disk migration on first launch (IDB kept until verified); rescan on focus + "changed on
    disk" prompt.
  - Retire `STUDY_READY.md`.
- **Not doing:** Supabase/cloud sync (the OneDrive folder is the sync).
- **Size:** L (3–4 sessions).
- **Start here:** layout from `src/lib/export/bundle.ts`; stickers `symbols/<sha256>.<ext>` +
  `symbols/index.json` (canvas refs `user:<uuid>` unchanged, `src/lib/user-assets/refs.ts`); per-scene
  `thumb.jpg`; `<Library>/.trash/`; `<Library>/.engram-index.json` cache; prefs + library path stay in
  IDB. `assetProtocol` is disabled in `src-tauri/tauri.conf.json` (CSP already allows
  `http://asset.localhost`). Risks: save-flow races (flush before close), zundo (test it), AV file
  locks (retry). Orphan-blob TODOs at `canvas-slice.ts:673,699`.

### Phase 4 — Finish & make fast

- **Why:** making scenes too slow (pain 3). Only the two biggest time sinks + the hot loops.
- **Done when:** placing an imported scene's symbols takes ≤2 min; a missed question becomes a fact
  in the right scene in ≤1 min.
- **Scope:**
  - "Click where each symbol is" pass for placeholder scenes (extends the outline walkthrough).
  - Missed-question capture: paste fact → suggested scenes → add (`high-yield-fact` can write it
    directly).
  - FactPicker: recency order + `F` then `1–9`.
  - Tracing: Backspace vertex undo, double-click to close, no backdrop/pick gate.
  - In-editor hotspot preview (toggleable ghost of the study circles).
- **Not doing:** the Backlog items below unless real use asks.
- **Size:** M.
- **Start here:** tracing state machine `canvas-stage.tsx:298-344,572-607`; gate
  `dialogs/add-outline-confirm.tsx`; FactPicker sort `fact-picker.tsx:39-43`; hotspot math
  `getFactAnchor` (`src/lib/canvas/centroid.ts`) + `spreadOverlappingHotspots` (`player-stage.tsx`);
  placeholders from `tools/video-ingest/ingest_video.py::make_bundle` (5-col grid of 300×200).

### Phase 5 — Study via Anki

- **Why:** you already review cards on this material; the scene should appear where you study.
- **Done when:** in normal Anki reviews, linked cards show the mnemonic picture; one click opens the
  scene.
- **Scope:**
  - Claude skill: match a scene's facts to existing cards via AnkiConnect (reuse `anki-search`), you
    approve in chat, attach fact-highlight picture + mnemonic + `engram://` link to one agreed field
    (`anki-card-author` rails: backup first, never invent fields).
  - App: fact-highlight image render, `engram://` deep-link handler, linked note IDs as machine state.
  - Recall-first toggle in sequential study, with clearer mode/progress indicators.
- **Not doing:** in-app scheduler or quiz scoring; bulk-pushing all ~30k facts (link per scene/topic
  as studied); in-app fuzzy matcher UI.
- **Size:** M.
- **Start here:** Anki add-ons: Image Occlusion Enhanced, Anki Connect Plus (port 8765), AnkiHub.
  Today's CSV export: `src/lib/export/anki.ts`.

### Phase 6 — Make art in Engram (optional)

- **Why:** only if drawing/finding art is still the bottleneck after Phase 4. Go/no-go at phase start.
- **Done when:** you make a scene's stickers and background without leaving Engram, or the phase
  is dropped at go/no-go.
- **Scope:** local ComfyUI (FLUX.2 Klein) stickers and backgrounds, incl. reference-style symbol
  generation; ML background removal.
- **Size:** M–L.
- **Start here:** ComfyUI (Krita-paired) at `C:\Users\drumm\Documents\comfy\ComfyUI\`, port 8188;
  ROCm only (see AGENTS.md).

## Ingest track (alongside the phases)

- Remaining ~272 videos on demand, not a bulk rerun.
- After Phase 3 the pipeline writes scene folders straight into the library.
- MVS app: `P:\Python Projects\School and Studying\Medicine Video Searcher`; DB
  `%LOCALAPPDATA%\MedicineVideoSearcher\search.db`.

## Backlog — only if real use asks

- Game-Icons in the symbol library (then Twemoji).
- Duplicate-as-template / copy symbols across scenes; `Ctrl+H` find/replace in Source view.
- Keyboard gaps: rename Fact, start outline, add Fact/Section.
- Click-add placement at last pointer / staggered; "keep adding" mode.
- SAM click-to-outline.
- "Find the symbol" quiz; study session stats.
- Tag UI (flat first, hierarchical later).
- Study-sheet HTML export (scene + fact list, print to PDF).
- Polish: one toggle/pill vocabulary (`NumbersToggle`, notes lint/outline pills); human error copy
  (`CanvasErrorBoundary`, broken `{sym}` chips); canvas details (theme-aware tracing cursor, symbol
  hover, `SymbolNumberCircle` fallbacks); promote Export out of the File submenu.
- Release hygiene: confirm no server calls (fonts/CDN/analytics); strip dev-only globals
  (`window.__engramStore` — check the ingest import doesn't rely on it first).

## Someday

- Narration, animation, animated video export (v2 scaffolding stays preserved: `animation*`,
  `factMeta.audioRef`, `timeline[]`), incl. AI story and AI voice.
- AI-suggested symbols in-app (today: the `design-mnemonic` skill covers this).

## Not doing

- macOS/Linux CI, code signing, PWA.
- Supabase / cloud sync (the OneDrive library folder is the sync); public sharing / library.
- Variable canvas aspect ratio.
- Command-palette overhaul; forcing the notes panel always-open; motion redesign; restyling shadcn.
- In-app spaced repetition.
- Bulk-pushing all ~30k facts to Anki.

## How we work it

1. One phase at a time; plan-mode spike at its start.
2. End of phase: real-use check by you, CHANGELOG entry, semver bump, tick the status table here.
