# Video Ingest Sandbox

Local-first sandbox for turning medical mnemonic videos into Engram import
bundles. The canonical path is **facts-only** and runs through the `ingest-library`
Workflow (`.claude/workflows/ingest-library.mjs`): one fresh Claude subagent per
video acts as the vision model, authors `draft_symbols.json` from the transcript
plus on-screen OCR, gates on `lint_draft.py`, and builds the `.engram.zip` — a
Haiku floor with a Sonnet→Opus escalation ladder. It builds steps 1–6 only;
importing the zip into the dev app stays manual. The Python here is just the
extract / transcribe / lint / build / queue plumbing the agent calls; optional
SAM/geometry tools remain available as lower-level experiments, not the default.

Drive it from the skills: `ingest-videos` (launch the autopilot on a batch),
`ingest-video` (one video with manual control + the optional geometry tiers), or
`ingest-next` (resumable batch wrapper).

## Setup

```powershell
uv venv --python 3.12 .venv-video-ingest
.\.venv-video-ingest\Scripts\python.exe -m pip install -r tools\video-ingest\requirements.txt

# SAM-assisted outlines: ROCm torch FIRST, then sam2 + the checkpoint.
.\.venv-video-ingest\Scripts\python.exe -m pip install --pre torch torchvision `
  --index-url https://rocm.nightlies.amd.com/v2/gfx110X-dgpu/
.\.venv-video-ingest\Scripts\python.exe -m pip install -r tools\video-ingest\requirements-sam.txt
# default backend checkpoint -> tools\video-ingest\models\mobilesam\mobile_sam.pt (~40 MB)
curl.exe -L -o tools\video-ingest\models\mobilesam\mobile_sam.pt `
  https://github.com/ChaoningZhang/MobileSAM/raw/master/weights/mobile_sam.pt
# quality-escalation backend -> tools\video-ingest\models\sam2\sam2.1_hiera_large.pt (~898 MB)
curl.exe -L -o tools\video-ingest\models\sam2\sam2.1_hiera_large.pt `
  https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt
```

### SAM backend / device note (verified 2026-05-28)
On this machine (RX 7900 XTX, ROCm 7.10 nightly, torch 2.10) SAM-family attention
is numerically broken / crashes on the **GPU** — garbage masks, IoU scores like
13073, or a hard abort — confirmed for **both** sam2 and mobilesam (same kernel
bug). Segmentation therefore runs on **CPU**. The default backend is **MobileSAM**:
~2s `set_image` for the backdrop, instant per-symbol predicts, tight masks
(scores ~0.95) — fast enough for bulk. `--backend sam2 --model large` is a slower
(~50s encode) quality pass for a stubborn symbol. Re-test `--device cuda` when
ROCm / AOTRITON flash attention stabilises for gfx1100.

### GPU transcription note (CTranslate2 / ROCm, verified 2026-05-28)
Faster-Whisper runs through CTranslate2, which exposes the RX 7900 XTX under the
`cuda` device name. `transcribe()` auto-selects cuda/float16 when a GPU is present
and falls back to CPU int8 otherwise (override with `ENGRAM_WHISPER_DEVICE` /
`ENGRAM_WHISPER_COMPUTE_TYPE`).

The stock PyPI CTranslate2 wheel is CPU-only. `setup_rocm_ctranslate2.ps1`
installs the official **ROCm** build (v4.7.2 wheel from the OpenNMT release).
It deliberately installs **only the wheel, no separate ROCm SDK**: that build
links the same TheRock-style ROCm libs the venv's torch (ROCm 7.10 nightly, for
MobileSAM) already ships, and `ingest_video._enable_rocm_dll_dirs()` registers
those libs' dirs on the DLL search path at import (torch registers its own;
ctranslate2 doesn't). Installing the repo.radeon.com `rocm_sdk_*` packages would
downgrade that runtime under torch and break GPU SAM — don't.

```powershell
.\.venv-video-ingest\Scripts\python.exe -m pip install -r tools\video-ingest\requirements.txt  # CPU baseline
.\tools\video-ingest\setup_rocm_ctranslate2.ps1   # swap in the ROCm wheel -> GPU
```

## Run

Launch the autopilot via the `ingest-videos` skill (or run the `ingest-library`
Workflow directly), passing either an explicit `{videos:[...]}` set or
`{batch:{count,source,course}}` to pull from the queue. Outputs are written
outside the repo (default out-root `P:\Python Projects\Engram\video-ingest-runs`).
Per video, the agent runs these live scripts in order:

```powershell
cd "P:\Python Projects\Engram\engram"

# 1. Extract frames (no transcript, no context frames).
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\ingest_video.py `
  --video "<path.mp4>" --out-root "P:\Python Projects\Engram\video-ingest-runs" `
  --skip-transcript --no-context

# 2. Transcript + OCR from the MVS index (writes transcript.json AND ocr.json).
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\mvs_transcript.py `
  --run-dir "<run>" --video-id <mvsId>

# 3. (the agent authors <run>\draft_symbols.json facts-only — no geometry)

# 4. Lint gate (free; transcript-grounded + OCR completeness).
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\lint_draft.py --run-dir "<run>"

# 5. Build the bundle only if the lint is ok:true.
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\ingest_video.py `
  --video "<path.mp4>" --out-root "P:\Python Projects\Engram\video-ingest-runs" `
  --reuse-run --draft-symbols "<run>\draft_symbols.json" --backdrop-index <N>
```

The queue/ledger is managed with `ingest_queue.py` — `next` pulls pending videos,
`ready`/`flag` record per-video outcomes, and `ready-list --write` regenerates the
study-ready list:

```powershell
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\ingest_queue.py next --count 10
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\ingest_queue.py ready <mvsId> --note "..."
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\ingest_queue.py ready-list --write
```

### Lower-level extraction / SAM tools

```powershell
# 0. Batch-extract a folder overnight (keyframes + transcript), resumable.
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\batch_extract.py `
  --folder "P:\Medicine Videos\Pixorize\Pixorize Biochemistry" `
  --out-root "P:\Python Projects\Engram\video-ingest-runs" --prefer-captions

# 1. Optional geometry experiment: author <slug>\draft_symbols.json with bbox (+ point) per symbol.
# 2. SAM outlines + verification overlay (MobileSAM/CPU by default, ~2s).
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\sam_segment.py `
  --draft  <run>\draft_symbols.json `
  --backdrop <run>\frames\keyframe_<N>_*.jpg `
  --out-overlay <run>\sam_overlay.jpg
#    re-segment only the ones that don't hug:  --only-orders 3,5
#    quality pass for a stubborn symbol:       --backend sam2 --model large
# 3. Build the bundle.
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\ingest_video.py `
  --video "<path.mp4>" --out-root "P:\Python Projects\Engram\video-ingest-runs" `
  --reuse-run --draft-symbols <run>\draft_symbols.json [--backdrop-index N]
```

Outputs per run: `transcript.json`/`.srt`, `keyframes.json`, `ocr.json`,
`timing.json`, `draft_symbols.json`, `sam_overlay.jpg` (optional), `review.md`,
and `<slug>.engram.zip`. Import the zip with the Import button in the local dev
server.

## Captions (faster + fixes pun mishears)

`--prefer-captions` uses a real caption track when present (sidecar `<name>.srt/
.vtt`, then embedded), skipping Whisper; otherwise Whisper runs. Grab captions at
download time:

```
yt-dlp --list-subs <url>
yt-dlp --write-subs --sub-langs en --convert-subs srt <url>   # sidecar auto-detected
```

Manual subtitles beat Whisper on mnemonic puns ("transketolase", "Pixorize").
The default accuracy-first route is facts-only: the agent authors
`draft_symbols.json` with no geometry, and the builder emits importable
placeholder regions for the user to outline in Engram. SAM remains optional for
bulk auto-outline experiments.

## Optional geometry (facts-only skill tiers)

The `ingest-video` skill's default is facts-only (no geometry). These two optional tiers
let a symbol land pre-placed instead of as an un-traced placeholder; they live here rather
than in the skill so the skill stays lean.

### Optional: rough-box placement
If the user wants regions pre-positioned (so they reshape instead of drawing from scratch), add a loose
backdrop-frame `bbox` (top-left origin) per symbol, plus `"vlm_width"`/`"vlm_height"` (the backdrop's
pixel dims) and `"localized_to_backdrop": true`. `make_bundle` scales the box onto the 1920×1080 stage
as a `rect`. A symbol with a box that's missing or covers the whole frame, or that isn't localized,
falls back to a placeholder. Box placement by eye is rough on dense scenes — it's a starting rect, not
a final outline.

### Optional: auto-outline with SAM (bulk)
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

## Tests

```powershell
.\.venv-video-ingest\Scripts\python.exe -m unittest discover -s tools\video-ingest -p "*_test.py" -t tools\video-ingest
```
