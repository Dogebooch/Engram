---
name: ingest-next
description: Resume building the Engram library — ingest the next batch of pending mnemonic videos via the autopilot workflow and stop. Alias for `ingest-videos`: launches the .claude/workflows/ingest-library.mjs Workflow (cheap Haiku author per video, free lint+OCR gate, Sonnet→Opus escalation ladder, one fresh subagent per video in parallel). Progress is DERIVED from the MVS index minus already-built .engram.zips, so it always continues where the last run left off, even in a fresh session. Use when the user says "/ingest-next", "ingest the next batch", "continue the library", "do the next N videos", or "keep ingesting".
argument-hint: "[count, default 10] [--source X] [--course Y]"
---

# Ingest the next batch (resumable library build)

This is a **thin alias for the `ingest-videos` skill** — it launches the autopilot
**Workflow**, it does NOT author videos in this context. (The old in-context per-video loop
that ran on the main model is retired; bulk authoring must go through the cheap Haiku workflow.)

## Launch the workflow

`N` = the count argument if given, else **10**. Pass through any `--source` / `--course` scope.

Launch `.claude/workflows/ingest-library.mjs` via the **Workflow tool** — the workflow pulls the
next N pending from `ingest_queue.py` itself, spawns one fresh Haiku subagent per video (parallel),
runs the `lint_draft.py` + OCR completeness gate, escalates only the failing tail up the
`haiku → sonnet → opus` ladder, builds each `.engram.zip`, and updates the queue:

```
Workflow({
  scriptPath: "P:\\Python Projects\\Engram\\engram\\.claude\\workflows\\ingest-library.mjs",
  args: { batch: { count: N, source: "X"?, course: "Y"? } }
})
```

For an explicit set of MVS ids, resolve each to `{ id, source, title, path, slug, dense }`
(via `ingest_queue.py`) and pass `args: { videos: [ ... ] }` instead.

## Report and STOP

The workflow runs in the background and returns a ledger. Report it concisely: `built / ok /
review / failed`, `costUnits`, `modelMix`, `escalatedCount`, `outputTokens`, and any `review` /
`failed` videos by slug with their `unresolvedReason`. Then **STOP** — the user re-invokes to
continue. Builds steps 1–6 only (`.engram.zip`); dev-app import (step 7) stays manual.

## Queue housekeeping (as needed)
- A failed build (no zip) re-appears automatically — nothing to do.
- Not a mnemonic / duplicate → `ingest_queue.py skip <id>` so it never re-queues.
- Built but worth revisiting (still counts done) → `ingest_queue.py flag <id> --note "..."`.
- Force a redo → `ingest_queue.py reset <id> [--purge]` (deletes its zip/run-dir so it re-queues).
- Scope a campaign → add `--source Pixorize --course "Biochemistry"` to the batch args.
