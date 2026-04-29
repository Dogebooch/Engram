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
  }
}
```

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

## Editor UX

### Layout
Three resizable panels:
- **Left** (~280px, collapsible): Symbol library + Layer tree (tabbed)
- **Center**: Konva stage (zoomable, pannable, fixed authoring aspect 16:9)
- **Right** (~360px, collapsible): CodeMirror notes panel

### Keyboard shortcuts
| Key | Action |
|---|---|
| `/` | Open symbol library search |
| `T` | Add text overlay |
| `F` | Tag selected symbols with Fact (open picker) |
| `Cmd+G` | Group selection |
| `Cmd+Shift+G` | Ungroup |
| `Delete` | Remove selected layer |
| `Cmd+D` | Duplicate selected layer |
| `[` / `]` | Send back / Bring forward |
| `Cmd+S` | Save (also auto-saves) |
| `Cmd+Scroll` | Zoom canvas |
| `Space+Drag` | Pan canvas |
| `M` | Toggle study mode |

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
All three call `tagSymbolWithFact(symbolId, factName)`:
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
| User types `{sym:NONEXISTENT}` | Render with red underline warning in CodeMirror; ignored in canvas-side sync. |
| Storage quota approaching limit | Warn user at 80%; suggest exporting or deleting old Picmonics. |
| Browser refresh mid-edit | Zustand persist + IndexedDB ensures survival to last save (debounced ~500ms). |
| Symbol moved on canvas | Recompute Fact centroids unless user has dragged hotspot (override flag). |
| Fact renamed in notes | Update all internal refs by canonical Fact ID, not name; rename is cosmetic. |

## Architecture-only fields (v2+ scaffolding)
Schemas include these now, no UI exposes them in v1:
- `Symbol.animation`, `Symbol.animationDelay`, `Symbol.animationDuration`
- `Fact.audioRef` (per-Fact narration audio)
- Top-level `timeline` array in canvas.json (Fact playback ordering for video gen)

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