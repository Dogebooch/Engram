# Video Ingest Sandbox

Local-first sandbox for turning medical mnemonic videos into Engram import
bundles. Python does the mechanical work (frame extraction, transcription, SAM
segmentation, zip assembly); Claude is the vision model that names/describes/
locates symbols (see `.claude/skills/ingest-video/SKILL.md`).

## Setup

```powershell
uv venv --python 3.12 .venv-video-ingest
.\.venv-video-ingest\Scripts\python.exe -m pip install -r tools\video-ingest\requirements.txt

# SAM-assisted outlines: ROCm torch FIRST, then sam2 + the checkpoint.
.\.venv-video-ingest\Scripts\python.exe -m pip install --pre torch torchvision `
  --index-url https://rocm.nightlies.amd.com/v2/gfx110X-dgpu/
.\.venv-video-ingest\Scripts\python.exe -m pip install -r tools\video-ingest\requirements-sam.txt
# checkpoint -> tools\video-ingest\models\sam2\sam2.1_hiera_large.pt  (~898 MB)
curl.exe -L -o tools\video-ingest\models\sam2\sam2.1_hiera_large.pt `
  https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt
```

### SAM device note (verified 2026-05-28)
On this machine (RX 7900 XTX, ROCm 7.10 nightly, torch 2.10) SAM2's Hiera image
encoder SDPA is numerically broken / crashes on the **GPU** (garbage masks, IoU
scores like 13073, or a hard abort). SAM therefore runs on **CPU** by default
(`sam_segment.py --device cpu`): correct, pixel-perfect masks; ~50s `set_image`
once per video, instant per-symbol predicts. Re-test `--device cuda` when ROCm /
AOTRITON flash attention stabilises for gfx1100. (CPU SAM works with any torch.)

## Run

The full interactive workflow lives in `.claude/skills/ingest-video/SKILL.md`.
Outputs are written outside the repo (default out-root
`P:\Python Projects\Engram\video-ingest-runs`).

```powershell
# 0. Batch-extract a folder overnight (keyframes + transcript), resumable.
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\batch_extract.py `
  --folder "P:\Medicine Videos\Pixorize\Pixorize Biochemistry" `
  --out-root "P:\Python Projects\Engram\video-ingest-runs" --prefer-captions

# 1. (Claude) author <slug>\draft_symbols.json: bbox (+ point) per symbol.
# 2. SAM outlines + verification overlay.
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\sam_segment.py `
  --draft  <run>\draft_symbols.json `
  --backdrop <run>\frames\keyframe_<N>_*.jpg `
  --device cpu --out-overlay <run>\sam_overlay.jpg
#    re-segment only the ones that don't hug:  --only-orders 3,5
# 3. Build the bundle.
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\ingest_video.py `
  --video "<path.mp4>" --out-root "P:\Python Projects\Engram\video-ingest-runs" `
  --reuse-run --draft-symbols <run>\draft_symbols.json [--backdrop-index N]
```

Outputs per run: `transcript.json`/`.srt`, `keyframes.json`, `intro_frames.json`
(optional), `timing.json`, `draft_symbols.json`, `sam_overlay.jpg`, `review.md`,
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
The legacy local Ollama VLM path still exists (`--ollama-model`) but Claude-as-VLM
+ SAM is the supported route.

## Tests

```powershell
.\.venv-video-ingest\Scripts\python.exe -m unittest discover -s tools\video-ingest -p "*_test.py" -t tools\video-ingest
```
