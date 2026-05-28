---
name: ingest-video
description: Turn a Pixorize/Sketchy-style mnemonic study video into an Engram .engram.zip bundle and import it into the running dev app, with Claude acting as the vision model that identifies, describes, and locates every symbol. SAM segments the outlines; Claude drives the prompts. Use when the user asks to "ingest", "import", or "evaluate" a mnemonic/medical teaching video into Engram.
---

# Ingest a mnemonic video into Engram (Claude-as-VLM + SAM outlines)

You are the vision model. Python handles mechanical work (frame extraction, transcription,
SAM segmentation, zip assembly); **you** decide the symbols, write their descriptions/meanings/
evidence from the transcript, and place a rough prompt (box + a point) on each object. **SAM turns
your prompt into a pixel-perfect polygon outline** — you no longer hand-trace vertices.

The pipeline tool is `tools/video-ingest/ingest_video.py`; segmentation is `sam_segment.py`. The
bundle/canvas/notes format and the app import path are fixed — do **not** change them. See
`docs/PIPELINE-SCHEMA.md` for the contract. Run everything with the project venv:
`.\.venv-video-ingest\Scripts\python.exe`. Default out-root: `P:\Python Projects\Engram\video-ingest-runs`.

## Setup (one-time)
See `tools/video-ingest/README.md`. You need the base requirements **plus** `requirements-sam.txt`
(SAM2 + ROCm torch) and the SAM2.1 checkpoint under `tools/video-ingest/models/sam2/`. SAM runs on
**CPU by default** (`--device cpu`) — correct and pixel-perfect; ~50s `set_image` once per video,
instant per-symbol predicts. (GPU/ROCm SAM2 is currently numerically broken on gfx1100; revisit later.)

## Workflow

### 1. Extract — batch, offline (Python, mechanical)
For a whole series, batch-extract overnight so the interactive loop has zero transcription:
```
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\batch_extract.py `
  --folder "<videos folder>" --out-root "P:\Python Projects\Engram\video-ingest-runs" --prefer-captions
```
For a single video: `ingest_video.py --video "<mp4>" --out-root <root> --skip-vlm --prefer-captions`.
`--prefer-captions` uses a real caption track when present (sidecar `<name>.srt/.vtt` or embedded),
which is faster and fixes pun mishears; it falls back to Whisper otherwise. To grab captions at
download time: `yt-dlp --list-subs <url>` then `--write-subs --sub-langs en --convert-subs srt` (the
sidecar lands next to the video and is auto-detected). Each run yields `frames/`, `transcript.json`,
`keyframes.json`, `video_info.json`, `timing.json` under `<out-root>/<slug>/`.

### 2. Transcript is the SPINE (you — completeness)
`Read` `transcript.json`. The narration enumerates **every** symbol and its meaning in order
("that's a pirate… pyruvate dehydrogenase"). List every symbol the narrator names — the image only
locates them, it does not decide what exists. You cannot miss a symbol the narrator names.

### 3. Pick the backdrop frame
`Read` candidate keyframes in `frames/`. Choose the **most complete assembled scene** (Pixorize: a
late frame where every symbol is on screen). Note its keyframe `index` and pixel dims (e.g. 1280×720
from `video_info.json`). Override the auto-pick with `--backdrop-index N` at build time if needed.

### 4. Author `draft_symbols.json` (you — the judgment step)
Write `<out-root>/<slug>/draft_symbols.json` as `{ "model": "...", "symbols": [ ... ] }`. One record
per symbol the narrator names. Per-symbol schema:
```json
{
  "order": 0,
  "fact": "Short clinical fact this symbol encodes",
  "symbol_key": "kebab-handle",
  "symbol_description": "Concrete visible object + where it is on the backdrop",
  "meaning": "what it encodes",
  "evidence": "Transcript @m:ss \"quote\" — why this mapping holds",
  "timestamp_ms": 54000,
  "bbox": { "x": 815, "y": 255, "width": 340, "height": 460 },
  "point": { "x": 915, "y": 430 },
  "neg_points": [ { "x": 760, "y": 700 } ],
  "intro_phrases": ["B-themed gun", "Vitamin B1"],
  "vlm_width": 1280, "vlm_height": 720,
  "localized_to_backdrop": true, "source_keyframe_index": 8
}
```
Rules:
- **`bbox` (required, backdrop-frame pixels, top-left origin)** loosely around the object — it is the
  SAM box prompt, the rect fallback, and drives the placeability filter. `make_bundle` scales it onto
  the 1920×1080 stage.
- **`point` (optional, strongly preferred)**: one foreground pixel **on** the object, in the same
  backdrop-frame space. With a point, SAM uses box+point (best masks). `neg_points` are background
  pixels to exclude (only honored alongside a point). Do **not** hand-trace polygons — SAM produces them.
- Consult `tools/video-ingest/glossary.json` for consistent `symbol_key`/`meaning` on recurring puns.
- One symbol can encode **two facts**: reuse the same `symbol_key` in two records (different `fact`/
  `meaning`). The builder makes one shared canvas layer referenced by both bullets.
- Ground `evidence` in the transcript (quote + timestamp). Sanity-check the medicine. If you skip a
  symbol the video teaches, say so in your summary — don't silently drop.

### 5. Identify on intro frames (when an object is subtle)
Pixorize zooms/ring-highlights each symbol as introduced. If a backdrop object is small or ambiguous,
cut its intro frame and `Read` it to confirm identity (coordinates still come from the backdrop):
```
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\intro_frames.py `
  --out-dir <out-root>\<slug> --draft <out-root>\<slug>\draft_symbols.json --mode fresh
```
Resolution per symbol: matched `intro_phrases` → `timestamp_ms` → order. Refine `symbol_description`/
`point` from what the zoom shows, then continue.

### 6. Segment with SAM (Python) — outlines, not hand-traces
```
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\sam_segment.py `
  --draft <out-root>\<slug>\draft_symbols.json `
  --backdrop <out-root>\<slug>\frames\keyframe_<N>_*.jpg `
  --device cpu --out-overlay <out-root>\<slug>\sam_overlay.jpg
```
This merges a `polygon` (8–24 vertices, backdrop-frame pixels) and a `sam:{mask_score,status,...}`
block into each symbol, and renders the overlay. `make_bundle` emits `shape:"polygon"` regions from
these automatically.

### 7. Verification loop (required, before building)
`Read` `sam_overlay.jpg`. For every outline that doesn't hug its object — or any symbol with
`sam.status != "ok"` / a low `mask_score` — edit **only** that symbol's `point` / `neg_points` /
`sam_prompt`, then re-run just those:
```
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\sam_segment.py --draft ... --backdrop ... --only-orders 3,5 --out-overlay ...
```
Repeat (≤3 passes) until every outline hugs. Only then build. **Fallback** (SAM verification fails or
a mask is hopeless): hand-author a `polygon` for that symbol — a list of ≥3 `[x,y]` backdrop-frame
pairs — and SAM will leave it alone.

### 8. Build the bundle (Python, mechanical)
```
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\ingest_video.py `
  --video "<mp4>" --out-root "P:\Python Projects\Engram\video-ingest-runs" `
  --reuse-run --draft-symbols <out-root>\<slug>\draft_symbols.json [--backdrop-index N]
```
Output: `<out-root>\<slug>\<slug>.engram.zip`. `--draft-symbols` uses your JSON verbatim; `--reuse-run`
reuses extracted frames/transcript.

### 9. Import into the dev app + verify
Drive the real import path (`useBundleImport.onFile` → `importBundle` → `hydratePicmonic` →
`setCurrentPicmonic`):
1. `preview_start` the Next dev server and open the app.
2. Copy the zip to `public/_ingest/<name>.engram.zip` (dev-only temp).
3. `preview_eval`: `fetch('/_ingest/<name>.engram.zip')` → `Blob` → `new File([blob], 'x.engram.zip',
   {type:'application/zip'})`; assign to the hidden `input[type=file][accept=".zip"]` via a
   `DataTransfer`; dispatch a native `change` event so React runs the genuine import.
4. Verify: `preview_screenshot` the canvas (each polygon hugs its object); `preview_snapshot` the notes
   panel (every fact + bullet present); `preview_console_logs` clean. A toast "Imported …" confirms it.
5. Remove the temp `public/_ingest/` file. In-app, the drag-to-outline tool and draggable vertices let
   the user nudge any close-enough outline.

### 10. Glossary upkeep
If the video introduces a recurring visual pun not in `tools/video-ingest/glossary.json`, propose the
new entry in your summary and add it only after the user confirms.
