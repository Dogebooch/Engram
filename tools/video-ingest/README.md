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

The full interactive workflow lives in `.claude/skills/ingest-video/SKILL.md`.
Outputs are written outside the repo (default out-root
`P:\Python Projects\Engram\video-ingest-runs`).

```powershell
# 0. Batch-extract a folder overnight (keyframes + transcript), resumable.
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\batch_extract.py `
  --folder "P:\Medicine Videos\Pixorize\Pixorize Biochemistry" `
  --out-root "P:\Python Projects\Engram\video-ingest-runs" --prefer-captions

# 1. (Claude) author <slug>\draft_symbols.json: bbox (+ point) per symbol.
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
Claude-as-VLM + SAM is the route: Claude authors `draft_symbols.json` and the
builder consumes it via `--draft-symbols`. Without that flag a run is
extract-only (frames + transcript, no symbols).

## Tests

```powershell
.\.venv-video-ingest\Scripts\python.exe -m unittest discover -s tools\video-ingest -p "*_test.py" -t tools\video-ingest
```
