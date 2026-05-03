# PIPELINE-SCHEMA — Pipeline Export

Single-file JSON contract for one exported mnemonic, consumed by the downstream animation/video exporter. This document is the authoritative shape; the lint rules in [TODO §8.1b](TODO.md) and any future `exportPipelineJson()` implementation are derived from it.

## Purpose & scope

The Engram editor stores per-Picmonic data across `notes.md` (prose) and `canvas.json` (machine-state). The downstream pipeline doesn't want two files; it wants one JSON object with a stable, uniform shape. This schema defines that object.

**In scope.** The minimum information needed to (a) render the static scene, (b) render per-Fact reveal/animation timing, and (c) attach narration. Self-sufficient — a consumer never has to read `notes.md` or `canvas.json` directly.

**Out of scope.** This is **not** a re-import format. Round-tripping back into the editor uses `notes.md` + `canvas.json`. The export is lossy on purpose: it flattens the markdown tree and discards source offsets, comments, and any non-bullet prose.

## Top-level shape

```jsonc
{
  "schemaVersion": 1,
  "exportedAt": "2026-05-03T00:00:00.000Z",

  "picmonic": {
    "id": "8e1c…",
    "name": "Tityus the Scorpion",
    "tags": ["pharm", "antibiotics"],
    "createdAt": 1714694400000,
    "updatedAt": 1714780800000
  },

  "backdrop": {
    "ref": "openmoji:beach-1",
    "uploadedBlobId": null
  },

  "symbols": [
    {
      "chipUuid": "a4f2…",
      "ref": "openmoji:1F982",
      "x": 1248, "y": 832,
      "width": 360, "height": 250,
      "rotation": 0,
      "layerIndex": 3,
      "groupId": null,
      "animation": {
        "kind": null,
        "delayMs": null,
        "durationMs": null
      }
    }
  ],

  "groups": [
    { "id": "9b1d…", "name": "Tityus character", "symbolIds": ["a4f2…", "…"] }
  ],

  "sections": [
    {
      "sectionId": "sec:mechanism#0",
      "name": "Mechanism",
      "order": 0,
      "factIds": ["mechanism::stasis#0", "mechanism::immobility#1"]
    }
  ],

  "facts": [
    {
      "factId": "mechanism::stasis#0",
      "name": "Stasis",
      "sectionId": "sec:mechanism#0",
      "order": 0,
      "hotspot": { "x": 1100, "y": 700, "userOverride": true },
      "audioRef": null,
      "timing": { "startMs": null, "durationMs": null },
      "symbols": [
        {
          "chipUuid": "a4f2…",
          "description": "Wheelchair",
          "meaning": "stasis",
          "encoding": "immobile = blood pools"
        }
      ]
    }
  ]
}
```

### Why this shape

- **Top-level `symbols[]` is keyed by `chipUuid`** and carries canvas geometry exactly once. Each Fact's `symbols[]` references back via `chipUuid` and carries only the *per-Fact bullet text*. This matches the multi-tag reality: one symbol layer, N bullets across N Facts, one geometry.
- **Sections + facts as parallel arrays** with `factIds[]` cross-reference. Avoids deep nesting; `order` is the single source of truth for sequence.
- **v2 fields are first-class but nullable.** `animation`, `audioRef`, `timing` are documented now so consumer code is shape-stable when v2 ships.

## Field reference

### Root

| Field | Type | Required | Source | Notes |
|---|---|---|---|---|
| `schemaVersion` | `1` | yes | constant | Bumps only on breaking change. |
| `exportedAt` | ISO-8601 string | yes | export-time | UTC; ms precision. |
| `picmonic` | object | yes | `meta.json` | See below. |
| `backdrop` | object | yes | `canvas.json` | See below. |
| `symbols` | array | yes | `canvas.json` | One entry per `SymbolLayer`. |
| `groups` | array | yes | `canvas.json` | Empty array if none. |
| `sections` | array | yes | parsed `notes.md` | Empty array if flat picmonic. |
| `facts` | array | yes | parsed `notes.md` + `canvas.json` | Order-independent at file level; consumers should sort by `facts[].order`. |

### `picmonic`

| Field | Type | Required | Source | Notes |
|---|---|---|---|---|
| `id` | string (uuid) | yes | `Picmonic.id` | |
| `name` | string | yes | `PicmonicMeta.name` | |
| `tags` | string[] | yes | `PicmonicMeta.tags` | May be empty. |
| `createdAt` | number (ms) | yes | `PicmonicMeta.createdAt` | Unix epoch ms. |
| `updatedAt` | number (ms) | yes | `PicmonicMeta.updatedAt` | Unix epoch ms. |

### `backdrop`

| Field | Type | Required | Source | Notes |
|---|---|---|---|---|
| `ref` | string \| null | yes | `Backdrop.ref` | Library asset ref (e.g. `openmoji:beach-1`) or null when uploaded. |
| `uploadedBlobId` | string \| null | yes | `Backdrop.uploadedBlobId` | IDB blob id when user-uploaded; null when library-ref'd. Exactly one of `ref`/`uploadedBlobId` is non-null in a populated picmonic; both null is allowed (no backdrop). |

### `symbols[]` (top-level, one per layer)

| Field | Type | Required | Source | Notes |
|---|---|---|---|---|
| `chipUuid` | string (uuid) | yes | `SymbolLayer.id` | The UUID written into `{sym:UUID}` in bullets. Foreign key target. |
| `ref` | string | yes | `SymbolLayer.ref` | Library asset ref (e.g. `openmoji:1F982`). |
| `x` | number | yes | `SymbolLayer.x` | Stage coordinates. |
| `y` | number | yes | `SymbolLayer.y` | |
| `width` | number | yes | `SymbolLayer.width` | |
| `height` | number | yes | `SymbolLayer.height` | |
| `rotation` | number | yes | `SymbolLayer.rotation` | Degrees. |
| `layerIndex` | number | yes | `SymbolLayer.layerIndex` | Higher = drawn later (on top). |
| `groupId` | string \| null | yes | `SymbolLayer.groupId` | FK to `groups[].id` when grouped. |
| `animation.kind` | string \| null | yes | `SymbolLayer.animation` | v2; v1 exports always null. |
| `animation.delayMs` | number \| null | yes | `SymbolLayer.animationDelay` | v2; v1 exports always null. |
| `animation.durationMs` | number \| null | yes | `SymbolLayer.animationDuration` | v2; v1 exports always null. |

### `groups[]`

| Field | Type | Required | Source | Notes |
|---|---|---|---|---|
| `id` | string (uuid) | yes | `Group.id` | |
| `name` | string \| null | yes | `Group.name` | Optional user label. |
| `symbolIds` | string[] | yes | `Group.symbolIds` | FKs to `symbols[].chipUuid`. |

### `sections[]`

| Field | Type | Required | Source | Notes |
|---|---|---|---|---|
| `sectionId` | string | yes | `synthesizeSectionId(name, occurrence)` | Form: `sec:<slug>#<n>`. Stable across renames within one parse. |
| `name` | string | yes | `ParsedSection.name` | Display label. |
| `order` | number | yes | derived | 0-indexed across sections. |
| `factIds` | string[] | yes | `ParsedSection.facts[].factId` | Ordered list; FKs to `facts[].factId`. |

### `facts[]`

| Field | Type | Required | Source | Notes |
|---|---|---|---|---|
| `factId` | string | yes | `synthesizeFactId(section, fact, occurrence)` | Form: `<sec>::<fact>#<n>`. Canonical handle for hotspots, timeline, audio. |
| `name` | string | yes | `ParsedFact.name` | Display label; cosmetic, may be renamed without changing `factId`. |
| `sectionId` | string \| null | yes | `ParsedFact.sectionId` | null for root-level Facts. |
| `order` | number | yes | derived | 0-indexed sequential across the whole picmonic, in render order. |
| `hotspot` | object \| null | yes | `canvas.factHotspots[factId]` | null when no hotspot has been computed yet (empty Fact). |
| `hotspot.x` | number | when present | `FactHotspot.x` | |
| `hotspot.y` | number | when present | `FactHotspot.y` | |
| `hotspot.userOverride` | boolean | when present | `FactHotspot.userOverride` | If true, do not recompute on symbol move. |
| `audioRef` | string \| null | yes | `canvas.factMeta[factId].audioRef` | v2; v1 exports always null. |
| `timing.startMs` | number \| null | yes | `canvas.timeline[].startMs` (matched by `factId`) | v2; v1 exports always null. |
| `timing.durationMs` | number \| null | yes | `canvas.timeline[].durationMs` (matched by `factId`) | v2; v1 exports always null. |
| `symbols` | array | yes | parsed bullets under this Fact | Order matches markdown bullet order. |

### `facts[].symbols[]` (per-Fact bullet entries)

| Field | Type | Required | Source | Notes |
|---|---|---|---|---|
| `chipUuid` | string (uuid) | yes | bullet `{sym:UUID}` | FK to top-level `symbols[].chipUuid`. |
| `description` | string | **yes (mandatory)** | `parseBullet(line).description` | Non-empty after token strip. Floor field — empty is a lint error. |
| `meaning` | string \| null | yes | `parseBullet(line).meaning` | null when bullet has no `→`/`->`. |
| `encoding` | string \| null | yes | `parseBullet(line).encoding` | null when bullet has no `;` after arrow. |

## Field categorization (prose vs machine-state)

This table is the source of truth for the rule "new prose fields go in the bullet, new machine-state fields go in `canvas.json`."

| Field | Source file | Category |
|---|---|---|
| `schemaVersion`, `exportedAt` | export-time | meta |
| `picmonic.{id,name,tags,createdAt,updatedAt}` | `meta.json` | machine-state |
| `backdrop.{ref,uploadedBlobId}` | `canvas.json` | machine-state |
| `symbols[].{chipUuid,ref,x,y,width,height,rotation,layerIndex,groupId}` | `canvas.json` (`SymbolLayer`) | machine-state |
| `symbols[].animation.*` | `canvas.json` (`SymbolLayer.animation*`) | machine-state (v2) |
| `groups[].*` | `canvas.json` (`Group`) | machine-state |
| `sections[].{sectionId,name,order,factIds}` | parsed `notes.md` | derived (prose-shaped, IDs canonical) |
| `facts[].{factId,name,sectionId,order}` | parsed `notes.md` | derived |
| `facts[].hotspot` | `canvas.json` (`factHotspots`) | machine-state |
| `facts[].audioRef` | `canvas.json` (`factMeta`) | machine-state (v2) |
| `facts[].timing` | `canvas.json` (`timeline`) | machine-state (v2) |
| `facts[].symbols[].description` | `notes.md` bullet (`parseBullet`) | **prose → bullet** |
| `facts[].symbols[].meaning` | `notes.md` bullet | **prose → bullet** |
| `facts[].symbols[].encoding` | `notes.md` bullet | **prose → bullet** |

**Authoring rule (codified).** New prose-shaped fields belong in the bullet. New machine-state fields belong in `canvas.json` alongside `animation*` / `factMeta` / `timeline`. **Never** put machine-state in bullet text; **never** put prose in `canvas.json`.

## Lint contract

The mandatory/optional split above maps directly to lint severity. Errors block the export pipeline; warnings do not.

| Issue code | Severity | When it fires | Mandatory? |
|---|---|---|---|
| `missing-symbol-token` | **error** | Bullet line under a Fact has no `{sym:UUID}`. | yes |
| `malformed-symbol-token` | **error** | `{sym:...}` present but the UUID isn't a valid v4 form. | yes |
| `empty-description` | **error** | After stripping the token and surrounding whitespace, the description is empty. | yes |
| `unknown-symbol-uuid` | warning | UUID parses but no canvas symbol with that `id` exists. | no |
| `missing-arrow` | warning | No `→` (or `->`) → `meaning` is null. | no |
| `missing-semicolon` | warning | No `;` after the arrow → `encoding` is null. | no |
| `untagged-symbol` | warning | A canvas symbol has no bullet under any Fact. (Requires Fact context across the whole document.) | no |

> The TODO §8.1b draft listed `empty-meaning`. It is renamed here to `empty-description` because `description`, not `meaning`, is the mandatory floor. An empty `meaning` is a warning (`missing-arrow` covers the common case where `meaning` is null because no arrow was typed).

## Versioning

- `schemaVersion` is an integer. It bumps **only** on breaking changes (renamed/removed fields, type changes, mandatory→optional flips).
- Adding a new optional field is **not** a breaking change and does not bump the version.
- v2 fields (`symbols[].animation.*`, `facts[].audioRef`, `facts[].timing.*`) are committed to this shape now. When v2 ships, those fields populate; consumer code does not change.
- Consumers should treat any unknown field as forward-compatible noise and ignore it.
- The Engram editor's `canvas.json` carries its own internal `schemaVersion` (currently `1`) and runs through `normalizeCanvas()` on load. That is independent of this pipeline export `schemaVersion`.
