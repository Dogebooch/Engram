---
name: ingest-videos
description: Launch the Haiku-floor ingest autopilot (the .claude/workflows/ingest-library.mjs Workflow) on a batch of pending mnemonic videos, or on an explicit set of MVS video ids. Cheap Haiku author per video with a free lint+OCR completeness gate and a Sonnet→Opus escalation ladder; one fresh subagent per video, run in parallel. Use when the user says "/ingest-videos", "ingest the next N videos", "run the ingest workflow", "ingest the next batch", "keep ingesting", or names specific video ids to ingest. For ONE video with manual control (rough boxes / SAM outlining) use the `ingest-video` skill instead.
argument-hint: "[count, default 10] [--source X] [--course Y]   — or explicit ids, e.g. 4 233 786"
---

# Ingest videos — autopilot workflow launcher

A **thin wrapper**: launch `.claude/workflows/ingest-library.mjs` via the **Workflow tool** and report its ledger. Do NOT author videos in this context. The workflow spawns one fresh **Haiku** subagent per video (in parallel), runs the free `lint_draft.py` + OCR completeness gate, escalates only the failing tail up the `haiku → sonnet → opus` ladder, builds the `.engram.zip`, and updates the queue. This is the cheap, scalable path — never fall back to an in-context per-video loop.

## How to launch

1. **Parse the argument** (`$ARGUMENTS`):
   - Bare number (default `10`) plus optional `--source X` / `--course Y` → **batch mode**.
   - A list of integer MVS video ids → **explicit mode**.

2. **Launch the Workflow** (`scriptPath` is the absolute path; the workflow runs in the background and notifies on completion):

   - **Batch mode** — the workflow pulls the next N pending from `ingest_queue.py` itself, so just pass the batch:
     ```
     Workflow({
       scriptPath: "P:\\Python Projects\\Engram\\engram\\.claude\\workflows\\ingest-library.mjs",
       args: { batch: { count: N, source: "X"?, course: "Y"? } }
     })
     ```
   - **Explicit mode** — the workflow needs full video objects, so first resolve each id with the project venv, then pass them:
     ```
     .\.venv-video-ingest\Scripts\python.exe tools\video-ingest\ingest_queue.py next ...   # or resolve_one per id
     ```
     Build `{ id, source, title, path, slug, dense }` for each id (dense = transcriptSegments ≥ 250) and launch:
     ```
     Workflow({
       scriptPath: "P:\\Python Projects\\Engram\\engram\\.claude\\workflows\\ingest-library.mjs",
       args: { videos: [ { id, source, title, path, slug, dense }, ... ] }
     })
     ```

3. **Report the returned ledger**: `built / ok / review / failed`, `costUnits`, `modelMix`, `escalatedCount`, `outputTokens`, and the per-video `models[]`. Call out any `review` or `failed` videos by slug with their `unresolvedReason`.

## Notes

- Progress is derived from the MVS index minus built `.engram.zip`s, so this is safe to re-run any time — it never re-does a finished video and always continues where the last run left off.
- Builds **steps 1–6 only** (produce `.engram.zip`). Dev-app import (step 7) stays manual.
- Density guard: the workflow handles dense videos itself (dense starts on Opus); no need to throttle the count for density here.
- Keep the batch modest (e.g. 10–25) for the first runs so you can spot-check quality (notably Haiku's over-extraction tendency) before committing the whole library.
