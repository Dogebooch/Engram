---
name: ingest-next
description: Resume building the Engram library — ingest the next batch of pending mnemonic videos and stop. Pulls the next N from ingest_queue.py (progress is DERIVED from the MVS index minus already-built .engram.zips, so it always continues where the last run left off, even in a fresh session), runs each through the facts-only ingest-video flow, reports progress, and never exceeds the batch cap. Use when the user says "/ingest-next", "ingest the next batch", "continue the library", "do the next N videos", or "keep ingesting".
argument-hint: "[count, default 5] [--source X] [--course Y]"
---

# Ingest the next batch (resumable library build)

A thin, repeatable loop over the **ingest-video** skill. Progress lives on disk (built
`.engram.zip`s) and is recomputed every run, so this is safe to invoke in any new session —
it never loses its place and never re-does a finished video.

`N` = the count argument if given, else **5**. Pass through any `--source` / `--course` scope.

## 1. Pull the next batch from the queue
From `P:\Python Projects\Engram\engram`, with the project venv:
```
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\ingest_queue.py next --count N [--source S] [--course C]
```
Returns up to `N` pending videos as JSON — `id`, `path`, `title`, `slug`, `transcriptSegments`,
`dense`, `flagged` — already excluding anything with a built zip or on the skiplist. If
`returned` is `0`, report "nothing pending for this scope" and stop.

**Honor density (the per-turn guard):** count a `"dense": true` video (long Sketchy SOAP-style
transcript) as ~2–3 normal videos toward the cap. If the batch contains dense ones, process fewer
this turn so context stays healthy. Never exceed `N` normal-equivalents.

## 2. Ingest each video — facts-only, via the ingest-video skill
For each video in the batch, run the **ingest-video** skill's per-video steps 1–6 (facts-only):
- `ingest_video.py --video "<path>" --out-root "P:\Python Projects\Engram\video-ingest-runs" --skip-transcript`
  (spread re-extract if the scene is static and only 1 keyframe comes out),
- `mvs_transcript.py --run-dir "<out-root>\<slug>" --video-id <id>`,
- read the transcript, pick the backdrop (tableau vs pan), author `draft_symbols.json` with **no
  geometry** (fact / description / meaning / evidence per symbol),
- `ingest_video.py ... --reuse-run --draft-symbols ... [--backdrop-index N]` to build the zip.

Use the queue's `path` for `--video` and `id` for `--video-id`. **Do NOT place boxes. Do NOT import
into the dev app.** The deliverable is one `.engram.zip` per video; the user imports and outlines them.

## 3. Report progress and STOP
After the batch:
```
.\.venv-video-ingest\Scripts\python.exe tools\video-ingest\ingest_queue.py status
```
Report, concisely: each video built (slug + symbol count + any caveat like "pan: 6/9 on backdrop" or
"SOAP: covered presentation only"), the new `.engram.zip` paths, and the queue line ("X / 1813 done").
Then **STOP** — do not pull another batch. The user re-invokes `/ingest-next` to continue.

## Queue housekeeping (as needed)
- Re-appears automatically if a build failed (no zip written) — nothing to do.
- Not a mnemonic / duplicate → `ingest_queue.py skip <id> --reason "..."` so it never re-queues.
- Did a partial worth revisiting (still counts done) → `ingest_queue.py flag <id> --note "..."`.
- Force a redo → `ingest_queue.py reset <id>` (deletes its zip so it re-queues).
- Scope a campaign → add `--source Pixorize --course "Biochemistry"` to `next` (and to `status`).
