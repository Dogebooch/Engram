# Video Ingest Sandbox

Local-first sandbox for turning medical mnemonic videos into draft Engram import
bundles.

## Setup

```powershell
uv venv --python 3.12 .venv-video-ingest
.\.venv-video-ingest\Scripts\python.exe -m pip install -r tools\video-ingest\requirements.txt
ollama pull qwen2.5vl:7b
```

## Run

```powershell
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\ingest_video.py `
  --video "P:\Medicine Videos\Pixorize\Pixorize Biochemistry\1. Vitamins (23)\1. Thiamine (Vitamin B1) Biochemistry.mp4" `
  --out-root "P:\Python Projects\Engram\video-ingest-runs" `
  --whisper-model small.en `
  --ollama-model gemma3:4b
```

Outputs are written outside the repo:

- `transcript.json` and `transcript.srt`
- `keyframes.json`
- `draft_symbols.json`
- `review.md`
- `<video-slug>.engram.zip`

The zip is a normal Engram bundle. Import it with the existing Import button in
the local dev server.

`gemma3:4b` is the current recommended local Ollama model for this Windows/AMD
sandbox. `qwen2.5vl:7b` and `qwen2.5vl:3b` were too memory-heavy/slow in local
testing.
