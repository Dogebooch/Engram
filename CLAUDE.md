# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Engram (aka "Mnemonic Editor") — a single-user, local-only desktop web app for authoring Picmonic/Sketchy-style mnemonic scenes. Authoritative spec lives in [docs/PRD.md](docs/PRD.md) (vision, scope, v1 done-criteria) and [docs/SPEC.md](docs/SPEC.md) (stack decisions, data model, edge-case behaviors). **Read both before non-trivial changes.** Active work and recently completed items: [docs/TODO.md](docs/TODO.md).

## Commands

```bash
npm run dev          # next dev — localhost:3000
npm run build        # next build (typechecks)
npm run lint         # eslint (uses eslint.config.mjs, flat config)
npm test             # vitest run (one-shot)
npm run test:watch   # vitest (watch mode)
npm run symbols:build  # regenerate /public/symbols/openmoji/ (also runs postinstall)
```

Run a single test file: `npx vitest run src/lib/notes/parse.test.ts`. Tests use `fake-indexeddb` via [vitest.setup.ts](vitest.setup.ts) — IDB code works in tests.

## Architecture (the parts that span files)

- **Markdown is the source of truth.** `notes.md` (Sections / `##` Facts / symbol bullets with `{sym:UUID}` tokens) drives content; `canvas.json` only stores positions, transforms, and overrides. Bidirectional sync happens through [src/lib/notes/](src/lib/notes/) (parse, tag, insert, fact-id, bullet) and is wired to the editor via [src/lib/canvas/add-symbol-with-note-sync.ts](src/lib/canvas/add-symbol-with-note-sync.ts). Don't introduce parallel structured state for content that can be derived from notes.

- **Sliced Zustand store with IDB persistence.** [src/lib/store/index.ts](src/lib/store/index.ts) composes six slices: `picmonic`, `ui`, `selection`, `canvas`, `interactions`, `player`. Persist middleware writes via [persist.ts](src/lib/store/persist.ts) (JSON storage adapter over `idb-keyval`). Only `currentPicmonicId` and `ui` are persisted — the rest is rebuilt on hydration. Per-Picmonic content lives in a separate IDB-backed index: see [src/lib/store/index-store.ts](src/lib/store/index-store.ts) and the debounced save flow ([debounced-save.ts](src/lib/store/debounced-save.ts), [save-now.ts](src/lib/store/save-now.ts), [src/lib/storage/use-save-flow-monitor.ts](src/lib/storage/use-save-flow-monitor.ts)).

- **Schema versioning + v2 scaffolding.** Canvas records carry `schemaVersion` and pass through `normalizeCanvas()` ([src/lib/types/canvas.ts](src/lib/types/canvas.ts)) on load. Fields `SymbolLayer.animation*`, `canvas.factMeta`, and `canvas.timeline` are **v2 scaffolding with no v1 UI** — preserve them in serialization, don't strip them as "unused."

- **Konva canvas + clamp/centroid logic.** Konva stage rendering is in [src/components/editor/canvas/](src/components/editor/canvas/). Pure helpers (Fact-hotspot centroid recompute, viewport clamp, PNG raster) live in [src/lib/canvas/](src/lib/canvas/). Hotspot recompute on symbol move respects the `userOverride` flag.

- **Symbol library.** Sources are aggregated and ranked (user > openmoji > game-icons > twemoji) in [src/lib/symbols/](src/lib/symbols/). The OpenMoji asset directory (`/public/symbols/openmoji/`) is gitignored and rebuilt by [scripts/build-symbol-index.mjs](scripts/build-symbol-index.mjs) on `postinstall`.

- **Keybindings are a single source of truth.** [src/lib/keybindings.ts](src/lib/keybindings.ts) drives both runtime handlers and the in-app `?` help overlay. SPEC deliberately doesn't duplicate the table — update this file, not the docs.

## Conventions specific to this repo

- Path alias: `@/*` → `src/*` (see [tsconfig.json](tsconfig.json)).
- shadcn/ui components live under `src/components/ui/` and are owned in-tree (don't re-pull them — edit them).
- Tailwind v4 (CSS-first config in [src/app/globals.css](src/app/globals.css), no `tailwind.config.*`).
- IDs are `crypto.randomUUID()` everywhere — see [src/lib/id.ts](src/lib/id.ts). Don't introduce nanoid/uuid deps.
- Tests are co-located with source (`*.test.ts` next to the file under test), not in a separate tree.

## Things to leave alone unless asked

- `factMeta`, `timeline`, and `SymbolLayer.animation*` fields (v2 scaffolding — see SPEC §"Architecture-only fields").
- The markdown bullet format `Visual description → meaning; encoding-note (why)` — only `{sym:UUID}` is structurally required, the rest is freeform on purpose.
- Rejected stack alternatives in SPEC §"Stack decisions made" — don't relitigate without cause.

## General Coding Practices

Scope — only do what was asked. A bug fix doesn't get surrounding cleanup. A simple feature doesn't get extra config knobs. No "improvements" that weren't requested.
Documentation — don't add docstrings, comments, or type annotations to code you didn't change. Comments only where logic isn't self-evident.
Defensive coding — no error handling, fallbacks, or validation for situations that can't actually occur. Trust internal code and framework guarantees. Validate only at system boundaries (user input, external APIs).
Abstractions — no helpers or utilities for one-time operations. No designing for hypothetical future needs. Minimum complexity for the current task.
