# SPEC — Mnemonic Editor

## Stack
Next.js 16 (App Router) + TS · Konva.js + react-konva · Zustand (+ persist) · IndexedDB via `idb-keyval` · CodeMirror 6 · `unified` + `remark-parse` + custom plugin · Tailwind + shadcn/ui · `@tanstack/react-virtual` · `crypto.randomUUID()` · Vercel deploy · Supabase for v2+ cloud.

### Decisions (don't relitigate without cause)
- **Konva** over tldraw (whiteboarding) and Polotno ($100+/mo + Canva-style abstractions fight bespoke Fact/hotspot model).
- **Markdown-as-source** over relational tables: matches Obsidian workflow, single source of truth, free Markdown export.
- **IndexedDB** over localStorage: blobs + quota.
- **Zustand** over Redux/Jotai: scope.
- **Lint + selection-bound form** over a parallel structured panel: bullet structure is enforced via a CodeMirror linter and a selection-bound mini-form rendered *inside* notes-panel — never by promoting bullet content into `canvas.json` or by building a parallel right-column properties panel. Markdown stays canonical; structured editing is a presentation layer over the same text.

## Data model

### Per-Picmonic layout
Stored as one IDB record per Picmonic with these fields (named so future export-as-folder is trivial):
- `notes.md` — source of truth: Sections, Facts, Symbol bullets
- `canvas.json` — symbol positions, transforms, layer order, fact hotspot overrides
- `meta.json` — name, tags, createdAt, updatedAt, backdropRef
- `assets/` — uploaded backdrop & symbols (library refs are external)

### `notes.md`
```markdown
# Section Heading
## Fact name (testable claim)

* {sym:UUID} Visual description → meaning; encoding-note (why)
```
- `#` → Section (optional; flat Picmonics omit).
- `##` → Fact (a tagged unit).
- Bullet under a Fact → symbol linked to it. Same `{sym:UUID}` may appear under multiple Facts (multi-tag).
- Only `{sym:UUID}` is structurally required; the `Visual → meaning; encoding` shape is parsed for display but freeform.

### `canvas.json`
```json
{
  "schemaVersion": 1,
  "backdrop": { "ref": "openmoji:beach-1", "uploadedBlobId": null },
  "symbols": [
    { "id": "uuid", "ref": "openmoji:scorpion",
      "x": 1248, "y": 832, "width": 360, "height": 250,
      "rotation": 0, "layerIndex": 3, "groupId": null,
      "animation": null, "animationDelay": null, "animationDuration": null }
  ],
  "groups": [{ "id": "uuid", "name": "Tityus character", "symbolIds": ["..."] }],
  "factHotspots": { "factId": { "x": 1100, "y": 700, "userOverride": true } },
  "factMeta": { "factId": { "audioRef": null } },
  "timeline": []
}
```
`factMeta` and `timeline` are v2 scaffolding: schema reserves them, no v1 UI writes. `factMeta` is keyed parallel to `factHotspots` and currently only carries `audioRef`. `timeline` entries are `{ factId, startMs, durationMs }`. Older bundles run through `normalizeCanvas()` on load/import.

### Symbol library entry (separate index)
```json
{ "id": "openmoji:1F982", "displayName": "Scorpion",
  "aliases": ["arachnid", "tityus"], "tags": ["animal", "venomous"],
  "source": "openmoji", "qualityRank": 1,
  "imageUrl": "/symbols/openmoji/1F982.svg" }
```
Source ranks: user-uploaded (0) > OpenMoji (1) > Game-Icons (2) > Twemoji (3, optional).

## Bullet validation & structured editing
Downstream animation/video pipeline needs uniform bullet output, but markdown stays canonical. Resolution: **lint + selection-bound form**, both inside notes-panel. No parallel structured state, no third panel, no bullet content in `canvas.json`.

- **Pipeline export schema** ([docs/PIPELINE-SCHEMA.md](PIPELINE-SCHEMA.md)) defines the JSON shape one exported mnemonic produces and which fields are mandatory; drives the lint rule list. Authoring rule: prose-shaped → bullet; machine-state (timing, animation cues, scene roles, narration refs) → `canvas.json` alongside `animation*` / `factMeta` / `timeline`.
- **CodeMirror linter** validates each bullet on edit: malformed `{sym:UUID}`, missing `→` or `;`, empty meaning, unknown symbol UUIDs, untagged symbols. Surfaces as gutter markers, tooltips, header-badge count.
- **Selection-bound mini-form** renders in notes-panel when exactly one canvas symbol is selected and bound to ≥1 Facts. Inputs expose `description / meaning / encoding` for the active Fact's bullet. Edits round-trip through existing notes write helpers (`tag`, `bullet`, `insert`); form repopulates from re-parsed bullet on external change.

## Editor UX

### Layout
Three resizable panels: **Left** (~280px, collapsible) symbol library + layer tree (tabbed) · **Center** Konva stage (zoom/pan, fixed 16:9 authoring) · **Right** (~360px, collapsible) CodeMirror notes.

### Keyboard shortcuts
See `src/lib/keybindings.ts` (live table); press `?` in-app for the help overlay. SPEC doesn't duplicate — it drifts.

### Symbol library
Aggregated, ranked, virtualized grid (5–6 cols). Search across name+aliases+tags across all sources. Drag onto canvas spawns at drop point; click adds at center. "Recently used" pinned above results.

### Bidirectional sync (canvas ↔ notes)
- Click canvas symbol → notes scrolls to + highlights matching `{sym:id}`.
- Click bullet line → matching symbol(s) glow.
- Edit `##` heading → renames Fact (cosmetic; refs use canonical Fact ID).
- Delete `* {sym:id}` line → untags from that Fact only; layer remains.
- Drop from library → adds layer + appends `* {sym:id} ` bullet under cursor's current Fact (or "Unassigned" pseudo-Fact).

### Tagging UX (three entry points, one action)
All open FactPicker → `tagSymbolsWithFact(symbolIds, factName)` (atomic notes+canvas update):
1. Drag canvas symbol onto a `##` heading.
2. Select symbol(s) → `F` → fuzzy-pick (or type new name).
3. Right-click → "Tag with Fact...".

### Grouping
`Cmd+G` groups multi-selection (transformer operates on group). `Cmd+Shift+G` ungroups (preserves positions). Optional names; orthogonal to Facts.

## Study mode (Player)
Toggle view. **Hotspot mode**: numbered circles at each Fact's centroid (or user override), ordered by Section→Fact; click reveals Fact name + glows symbols. **Sequential mode**: Prev/Next steps through Facts; current symbols highlighted, others dimmed; Fact name + meaning in side rail. `M` toggles modes; Esc returns to editor.

## Export
- **PNG**: `Konva.toDataURL({ pixelRatio: 2 })` on stage.
- **Markdown**: copy/download `notes.md`.
- **Anki CSV**: parse `notes.md` → one row per Fact: `picmonic_name, section, fact_name, symbol_descriptions (joined), image_path`.

## Edge cases
| Case | Behavior |
|---|---|
| Empty Fact (no symbols) | Allowed. `##` with no bullets, no hotspot. |
| Untagged symbol | Allowed. Layer exists, no bullet, absent from study mode. |
| Same symbol on N Facts | N hotspots, centroids may overlap; acceptable. |
| Custom backdrop upload | Fills canvas, `object-fit: cover`. |
| `{sym:NONEXISTENT}` | Chip renders broken (`.eng-sym-chip-broken`); ignored in canvas sync. |
| Storage ≥80% quota | Warn; suggest export/delete. |
| Refresh mid-edit | Zustand persist + IDB; survives to last save (debounced ~500ms). |
| Symbol moved | Recompute Fact centroids unless hotspot has `userOverride`. |
| Fact renamed in notes | Refs use canonical Fact ID; rename is cosmetic. |

## Architecture-only fields (v2+ scaffolding, no v1 UI)
- `SymbolLayer.animation` / `animationDelay` / `animationDuration`
- `canvas.factMeta[factId].audioRef` — per-Fact narration audio
- `canvas.timeline[]` — `{ factId, startMs, durationMs }` for video export

## Tests (non-trivial logic only)
- **Unit**: markdown parser round-trip; canvas.json serialization round-trip.
- **Integration**: `tagSymbolWithFact` updates notes+canvas atomically; hotspot recompute on move (skipped when overridden).
- **E2E** (Playwright): author → export → re-import → render identical.

## Performance budgets
30 symbols: 60fps drag/transform · library search <50ms over 5000+ · notes parse+sync <30ms/keystroke · save (debounced) <200ms p95.
