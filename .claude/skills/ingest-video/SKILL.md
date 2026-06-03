---
name: ingest-video
description: Turn a Pixorize/Sketchy/Picmonic-style mnemonic study video into an Engram .engram.zip bundle and import it into the running dev app, with Claude acting as the vision model that identifies and describes every symbol from the narration. Default path is facts-only — Claude writes accurate fact/description/meaning/evidence per symbol and does NOT place boxes; each becomes an un-traced placeholder the user draws via the editor's "needs outline" walkthrough. Rough-box pre-placement and SAM auto-outlining are optional. Use when the user asks to "ingest", "import", "package", or "evaluate" a mnemonic/medical teaching video into Engram.
argument-hint: <video title or MVS path>
---

# Ingest a mnemonic video into Engram (Claude-as-VLM)

You are the vision model. Python handles the mechanical work (frame extraction, transcript,
zip assembly); **you** decide the symbols and write their description / meaning / evidence from
the transcript. **By default you do NOT place or draw boxes** — box placement is the model's
weakest dimension and the user draws outlines far better by hand.

**Three tiers — default is facts-only:**
- **Facts-only (default).** Author `fact → description → meaning → evidence` per symbol, no geometry.
  Each becomes an **un-traced placeholder region**; the editor lists them under **"N need outlines"**
  and the user draws each via the outline walkthrough. Fastest and most accurate (no coordinate work,
  no SAM), and drawing is good encoding for study. This is the path to use unless asked otherwise.
- **Rough boxes (optional).** Add a loose `bbox` per symbol so each lands as a roughly-placed `rect`
  the user reshapes instead of drawing from scratch. Costs a careful look at the backdrop per symbol;
  worth it only when the user wants the regions pre-positioned. See *Optional: rough-box placement*.
- **SAM auto-outline (optional, bulk).** SAM traces polygons automatically. Worth it only for
  unattended bulk ingest where loose auto-outlines are acceptable. See *Optional: auto-outline with SAM*.

The pipeline tool is `tools/video-ingest/ingest_video.py`; the MVS transcript bridge is
`mvs_transcript.py`. The bundle/canvas/notes format and the app import path are fixed — do **not**
change them (see `docs/PIPELINE-SCHEMA.md`). Run everything with the project venv:
`.\.venv-video-ingest\Scripts\python.exe`. Default out-root: `P:\Python Projects\Engram\video-ingest-runs`.

## Batch / resume (building the whole library)
For ingesting many videos across sessions, don't track progress by hand — it's **derived** by
`tools/video-ingest/ingest_queue.py` (pending = MVS index − built `.engram.zip`s − skiplist), so a
fresh session always continues where the last left off. The **`/ingest-next [N]`** skill wraps the loop:
it pulls the next `N` pending videos (`ingest_queue.py next`), runs each through the steps below
facts-only, prints `ingest_queue.py status`, and stops. Default `N`=5; a `dense` (long-transcript)
video counts as ~2–3 toward the cap. Use `ingest_queue.py skip/flag/reset` for exceptions. Order is
source → course → title (course-by-course). For a single ad-hoc video, just run the steps below directly.

## Workflow (facts-only — the default fast path)

### 1. Extract frames (Python, mechanical) — no transcription
Frames only; the transcript comes from the Medicine Video Searcher index in step 2, not Whisper:
```
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\ingest_video.py `
  --video "<mp4>" --out-root "P:\Python Projects\Engram\video-ingest-runs" --skip-transcript
```
Yields `frames/`, `keyframes.json`, `video_info.json` under `<out-root>\<slug>\` (slug = video stem).
**Static scenes (Picmonic especially) defeat the diff-based sampler** — it can emit only 1 keyframe
(the intro). If `keyframes.json` has ≤2 frames, re-extract a spread:
`--sample-seconds 2 --min-gap-seconds 3 --diff-threshold 0 --max-keyframes 18`.

### 2. Pull the transcript from the MVS index (Python, ~0s)
Most of the library is already indexed by Medicine Video Searcher, so the ~60s Whisper stage becomes
a DB read:
```
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\mvs_transcript.py `
  --run-dir "<out-root>\<slug>" --query "<title words>"
```
An ambiguous `--query` prints candidates (exit 2) — re-run with `--video-id <id>` (or `--path "<exact mvs path>"`).
**Not in the MVS library?** Re-run step 1 with `--prefer-captions` (sidecar `<name>.srt/.vtt` or embedded
track; Whisper otherwise) and skip this step.

### 3. Transcript is the SPINE (you — completeness)
`Read` `transcript.json`. The narration enumerates **every** symbol and its meaning in order
("that's a pirate… pyruvate dehydrogenase"). List every symbol the narrator names — you cannot miss a
symbol the narrator names. The transcript is the source of truth for facts; sanity-check the medicine
and silently fix obvious ASR slips (e.g. "tetrahydrofluoric" → tetrahydrofolate).

### 4. Pick the backdrop frame — and check its kind
`Read` candidate keyframes in `frames/`. Note the keyframe `index` and pixel dims, and classify the scene:
- **Single tableau** (most Sketchy/Pixorize, e.g. folate, Gaucher) — one late frame holds every symbol.
  For Sketchy/Pixorize pick the most complete late frame; that's your backdrop.
- **Picmonic** — the illustration shows mid-playback and the video *ends on a text review page*, so the
  last frames are the wrong pick. Choose the mid/late frame showing the full illustration.
- **Panning scene** (some Pixorize, e.g. Fabry's fabric-store walk) — no single frame holds everything.
  Pick the most-complete frame and **only author symbols actually visible in it**; note in your summary
  which narrated symbols live on other pans (they'd otherwise send the user to outline something absent).

Override the auto-pick (last keyframe) with `--backdrop-index N` at build time.

### 5. Author `draft_symbols.json` (you — the judgment step)
Write `<out-root>\<slug>\draft_symbols.json` as `{ "model": "claude-facts-only", "symbols": [ ... ] }`,
one record per symbol the narrator names. **Facts-only schema — no `bbox`, no `polygon`, no geometry:**
```json
{
  "order": 0,
  "fact": "Short clinical fact this symbol encodes",
  "symbol_key": "kebab-handle",
  "symbol_description": "Concrete visible object + where it sits on the backdrop",
  "meaning": "what it encodes",
  "evidence": "Transcript @m:ss \"quote\" — why this mapping holds",
  "timestamp_ms": 54000
}
```
Rules:
- **No geometry.** Omit `bbox`/`polygon`. `make_bundle` emits each symbol as an un-traced placeholder
  the user outlines in the app. (A glance at the backdrop in step 4 to confirm the symbol is *visible*
  there is enough — you are not placing pixels.)
- Make `symbol_description` name the object **and** where it sits ("B-gun in the thigh holster, right
  side") so the user can find it while drawing.
- One symbol can encode **two facts**: reuse the same `symbol_key` in two records (different `fact`/
  `meaning`). The builder makes one shared placeholder referenced by both bullets.
- Ground `evidence` in the transcript (quote + timestamp). Consult `tools/video-ingest/glossary.json`
  for consistent `symbol_key`/`meaning` on recurring puns. If you skip a symbol the video teaches (e.g.
  it's on another pan), say so in your summary — don't silently drop.
- **Dense Sketchy SOAP scenes name 40+ symbols across S/O/A/P** — too many for one pass. Either author
  the full set deliberately or tell the user which section you covered; don't silently truncate.

### 6. Build the bundle (Python, mechanical)
```
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\ingest_video.py `
  --video "<mp4>" --out-root "P:\Python Projects\Engram\video-ingest-runs" `
  --reuse-run --draft-symbols "<out-root>\<slug>\draft_symbols.json" [--backdrop-index N]
```
Output: `<out-root>\<slug>\<slug>.engram.zip`. Geometry-less symbols become staggered un-traced
placeholder `rect`s; `notes.md` links each fact bullet to its placeholder by `{sym:UUID}`. `--reuse-run`
reuses the extracted frames + MVS transcript.

### 7. Import into the dev app + draw the outlines
Drive the real import path (`useBundleImport.onFile` → `importBundle` → `hydratePicmonic` →
`setCurrentPicmonic`):
1. `preview_start` the Next dev server and open the app.
2. Copy the zip to `public/_ingest/<name>.engram.zip` (dev-only temp).
3. `preview_eval`: `fetch('/_ingest/<name>.engram.zip')` → `Blob` → `new File([blob], 'x.engram.zip',
   {type:'application/zip'})`; assign to the hidden `input[type=file][accept=".zip"]` via a
   `DataTransfer`; dispatch a native `change` event so React runs the genuine import.
4. Verify: `preview_snapshot` the notes panel (every fact + bullet present), and the header shows
   **"N need outlines"**; `preview_console_logs` clean. Toast "Imported …" confirms.
5. Remove the temp `public/_ingest/` file. **Then the user draws:** the "N need outlines" walkthrough
   (`findMissingOutlines` → `startOutlineWalkthrough`) steps through each placeholder; the `notes.md`
   bullet tells them what each one is and where to draw it.

### 8. Glossary upkeep
If the video introduces a recurring visual pun not in `tools/video-ingest/glossary.json`, propose the
new entry in your summary and add it only after the user confirms.

---

## Optional: rough-box placement
If the user wants regions pre-positioned (so they reshape instead of drawing from scratch), add a loose
backdrop-frame `bbox` (top-left origin) per symbol, plus `"vlm_width"`/`"vlm_height"` (the backdrop's
pixel dims) and `"localized_to_backdrop": true`. `make_bundle` scales the box onto the 1920×1080 stage
as a `rect`. A symbol with a box that's missing or covers the whole frame, or that isn't localized,
falls back to a placeholder. Box placement by eye is rough on dense scenes — it's a starting rect, not
a final outline.

## Optional: auto-outline with SAM (bulk)
For unattended bulk ingest where loose polygons are acceptable, add `"point": {"x","y"}` (a foreground
pixel on the object, plus optional `"neg_points"`) alongside a `bbox`, then between steps 5 and 6:
```
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\sam_segment.py `
  --draft "<out-root>\<slug>\draft_symbols.json" `
  --backdrop "<out-root>\<slug>\frames\keyframe_<N>_*.jpg" `
  --out-overlay "<out-root>\<slug>\sam_overlay.jpg"
```
This merges a `polygon` + `sam:{...}` block into each symbol; `make_bundle` then emits `shape:"polygon"`
regions. **Default backend MobileSAM on GPU** (sub-second). `--backend sam2 --model large` is a slower
(~50s encode, **CPU-only** — SAM2's Hiera encoder is broken on ROCm gfx1100) quality-escalation pass.
Then **verify**: `Read` `sam_overlay.jpg`, and for any outline that doesn't hug its object edit only that
symbol's `point`/`neg_points` and re-run with `--only-orders 3,5` (≤3 passes). Build only once every
outline hugs. Fallback for a hopeless mask: hand-author a `polygon` (≥3 `[x,y]` pairs) and SAM leaves it alone.
