# SPEC — Mnemonic Editor

## Stack (final)
| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router) + TypeScript | User's preference; Vercel-ready |
| Canvas | Konva.js + react-konva | Scene composition fit (rejected: tldraw, Polotno, Fabric) |
| State | Zustand (+ persist middleware) | Simple, perfect for scope |
| Persistence v1 | IndexedDB via `idb-keyval` | Image blobs, larger payloads than localStorage |
| Markdown editor | CodeMirror 6 | Robust, customizable, supports custom syntax tokens |
| Markdown parser | `unified` + `remark-parse` + custom plugin | Standard, extensible |
| Styling | Tailwind CSS + shadcn/ui | Lightweight, AI-friendly, you own the components |
| Component virtualization | `@tanstack/react-virtual` | Symbol library grid |
| IDs | `crypto.randomUUID()` | Cloud-portable from day 1 |
| Deploy | Vercel (later) | Default for Next.js |
| Cloud (v2+) | Supabase | Schema already cloud-portable |

### Stack decisions made (do not relitigate without cause)
- **Konva over tldraw**: tldraw is whiteboarding; this is structured-scene composition.
- **Konva over Polotno SDK**: Polotno's $100+/mo licensing + Canva-style abstractions fight bespoke Fact/hotspot model.
- **Markdown-as-source over relational tables**: matches user's Obsidian workflow, single source of truth, free Markdown export.
- **IndexedDB over localStorage**: blobs and quota.
- **Zustand over Redux/Jotai**: scope doesn't justify heavier state libs.
- **Lint + selection-bound form over parallel structured panel**: bullet structure is enforced via a CodeMirror linter and a selection-bound mini-form rendered *inside* notes-panel — never by promoting bullet content into `canvas.json` or by building a parallel right-column properties panel that competes with notes-panel. Markdown stays canonical; structured editing is a presentation layer over the same text.

## Data model

### Per-Picmonic file layout
```
picmonics/{picmonic-id}/
  notes.md         # source of truth: Sections, Facts, Symbol bullets
  canvas.json      # symbol positions, transforms, layer order, fact hotspot overrides
  meta.json        # name, tags, createdAt, updatedAt, backdropRef
  assets/          # uploaded backdrop & symbols (only user-uploaded; library refs are external)
```

In IndexedDB, this is stored as a single record per Picmonic with the four parts as fields. The file-layout naming exists so future export-as-folder works trivially.

### `notes.md` schema
```markdown
# Section Heading
## Fact name (testable claim)

* {sym:UUID} Visual description → meaning; encoding-note (why)
* {sym:UUID} Another symbol bullet
```

Rules:
- `#` headings → Sections (optional; flat Picmonics have no `#`).
- `##` headings → Facts. Each `##` is a tagged unit.
- Bullet under a Fact → symbol linked to that Fact.
- `{sym:UUID}` → reference to a symbol layer in `canvas.json`. Same UUID may appear under multiple Facts (multi-tagging).
- Bullet text format: `Visual description → meaning; encoding-note`. Parser extracts each segment for display, but the user can write freeform — only the `{sym:UUID}` token is required for the link.

### `canvas.json` schema
```json
{
  "schemaVersion": 1,
  "backdrop": { "ref": "openmoji:beach-1", "uploadedBlobId": null },
  "symbols": [
    {
      "id": "uuid",
      "ref": "openmoji:scorpion",
      "x": 1248, "y": 832,
      "width": 360, "height": 250,
      "rotation": 0,
      "layerIndex": 3,
      "groupId": null,
      "animation": null,
      "animationDelay": null,
      "animationDuration": null
    }
  ],
  "groups": [
    { "id": "uuid", "name": "Tityus character", "symbolIds": ["..."] }
  ],
  "factHotspots": {
    "factId-or-name": { "x": 1100, "y": 700, "userOverride": true }
  },
  "factMeta": {
    "factId": { "audioRef": null }
  },
  "timeline": []
}
```

`factMeta` and `timeline` are v2 scaffolding — the schema reserves them, but no v1 UI writes to them. `factMeta` is keyed parallel to `factHotspots` and currently only carries `audioRef` for per-Fact narration. `timeline` is an ordered array of `{ factId, startMs, durationMs }` entries for animated video export. Records loaded from older bundles are normalized via `normalizeCanvas()` on import / IDB load.

### Symbol library entries (separate index, not per-Picmonic)
```json
{
  "id": "openmoji:1F982",
  "displayName": "Scorpion",
  "aliases": ["arachnid", "tityus"],
  "tags": ["animal", "venomous"],
  "source": "openmoji",
  "qualityRank": 1,
  "imageUrl": "/symbols/openmoji/1F982.svg"
}
```

Sources & ranks: user-uploaded (0) > OpenMoji (1) > Game-Icons (2) > Twemoji (3, optional).

## Bullet validation & structured editing

The downstream animation/video pipeline needs uniform bullet output, but the system commits to markdown-as-source-of-truth. Resolution: **lint + selection-bound form**, both rendered inside notes-panel. No parallel structured state, no third panel, no bullet content promoted to `canvas.json`.

- **Pipeline export schema** (TBD; lives in `docs/PIPELINE-SCHEMA.md`) defines the JSON shape one exported mnemonic produces for the downstream animator/exporter and which fields are mandatory. Drives the lint rule list. Authoring rule: anything prose-shaped goes in the bullet; anything machine-state (timing, animation cues, scene roles, narration refs) goes in `canvas.json` alongside `animation*` / `factMeta` / `timeline`.
- **CodeMirror linter** validates each bullet on edit: malformed `{sym:UUID}` token, missing `→` or `;` separators, empty meaning, unknown symbol UUIDs, untagged symbols. Issues surface as gutter markers, tooltips, and a header-badge count in notes-panel.
- **Selection-bound mini-form** renders inside notes-panel when exactly one symbol is selected on the canvas and is bound to one or more Facts. Inputs expose the three semantic fields (`description / meaning / encoding`) for the active Fact's bullet. Edits round-trip through the existing notes write helpers (`tag`, `bullet`, `insert`); the form repopulates from the freshly parsed bullet on external markdown change. Single source of truth, two ways to edit.

## Editor UX

### Layout
Three resizable panels:
- **Left** (~280px, collapsible): Symbol library + Layer tree (tabbed)
- **Center**: Konva stage (zoomable, pannable, fixed authoring aspect 16:9)
- **Right** (~360px, collapsible): CodeMirror notes panel

### Keyboard shortcuts

See `src/lib/keybindings.ts` for the live binding table; press `?` in-app for the rendered help overlay. SPEC intentionally does not duplicate the table — it drifts.

### Symbol library
- Aggregated, ranked, virtualized grid (5–6 columns)
- Search across name + aliases + tags across all sources
- Drag-and-drop onto canvas spawns layer at drop point
- Click adds layer at canvas center
- "Recently used" pinned section above search results

### Bidirectional sync (canvas ↔ notes)
- Click symbol on canvas → CodeMirror scrolls to + highlights matching `{sym:id}`
- Click bullet line in notes → matching symbol(s) get a glow on canvas
- Edit `##` heading text → renames Fact (no rebuild, no migration)
- Delete `* {sym:id}` line → untags symbol from that Fact only; layer remains
- Drop symbol from library → adds layer + appends `* {sym:id} ` bullet under cursor's current Fact (or under "Unassigned" pseudo-Fact if cursor is outside any `##`)

### Tagging UX (three entry points, one underlying action)
All three open the FactPicker dialog which calls `tagSymbolsWithFact(symbolIds, factName)` — atomic update of notes + canvas state:
1. **Drag**: drag canvas symbol onto a `##` heading in notes panel
2. **Keyboard**: select symbol(s) → `F` → fuzzy-pick Fact (or type new name to create)
3. **Right-click**: context menu → "Tag with Fact..." → same picker

### Grouping
- `Cmd+G` over a multi-selection creates a Group; transformer now operates on the group
- `Cmd+Shift+G` ungroups (preserves member positions)
- Groups have optional names; orthogonal to Facts

## Study mode (Player)

Toggleable view. Two display modes:
- **Hotspot mode**: numbered circles drawn at each Fact's centroid (or user override). Click reveals Fact name + linked symbols glow. Numbers ordered by Section→Fact order in notes.
- **Sequential mode**: Prev / Next buttons step through Facts in order. Current Fact's symbols highlighted; non-current dimmed. Fact name + meaning shown in side rail.

Toggle modes with `M`. Esc returns to editor.

## Export
| Format | How |
|---|---|
| PNG | `Konva.toDataURL({ pixelRatio: 2 })` on the stage |
| Markdown | Copy `notes.md` to clipboard or download |
| Anki CSV | Parse `notes.md` → emit one row per Fact with columns: `picmonic_name, section, fact_name, symbol_descriptions (joined), image_path` |

## Edge cases & decisions
| Case | Behavior |
|---|---|
| Empty Fact (no symbols tagged) | Allowed. Renders as `##` heading with no bullets, no hotspot. |
| Symbol with no Fact tags | Allowed. Layer exists, no bullet anywhere; not in study mode. |
| Same symbol tagged with N Facts | N hotspots, all centroids may overlap visually; acceptable. |
| Custom backdrop upload | Image fills canvas; `object-fit: cover` semantics. |
| User types `{sym:NONEXISTENT}` | Chip widget renders in broken state (red border via `.eng-sym-chip-broken`); ignored in canvas-side sync. |
| Storage quota approaching limit | Warn user at 80%; suggest exporting or deleting old Picmonics. |
| Browser refresh mid-edit | Zustand persist + IndexedDB ensures survival to last save (debounced ~500ms). |
| Symbol moved on canvas | Recompute Fact centroids unless user has dragged hotspot (override flag). |
| Fact renamed in notes | Update all internal refs by canonical Fact ID, not name; rename is cosmetic. |

## Architecture-only fields (v2+ scaffolding)
Schemas include these now, no UI exposes them in v1:
- `SymbolLayer.animation`, `SymbolLayer.animationDelay`, `SymbolLayer.animationDuration`
- `canvas.factMeta[factId].audioRef` — per-Fact narration audio
- `canvas.timeline[]` — Fact playback ordering for video gen, entry shape `{ factId, startMs, durationMs }`

## Tests (non-trivial logic only)
- **Unit**: markdown parser (notes.md → structured representation, round-trip)
- **Unit**: canvas.json serialization round-trip
- **Integration**: `tagSymbolWithFact` updates both notes content and canvas state atomically
- **Integration**: hotspot centroid recompute on symbol move (and not on user-overridden hotspots)
- **E2E** (Playwright): author full Picmonic → export → re-import → render identical

## Performance budgets
- Canvas with 30 symbols: 60fps drag/transform
- Symbol library search: <50ms across 5000+ symbols
- Notes panel parse + sync on keystroke: <30ms
- Save (debounced): <200ms p95