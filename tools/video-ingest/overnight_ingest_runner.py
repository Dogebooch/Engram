"""Disk-backed overnight runner for Codex Engram video ingest.

This wrapper keeps long-running orchestration outside chat context. It prepares
bounded tranches of videos, launches one `codex exec` worker per video, records
every attempt to disk, verifies built bundles, and resumes from its state files.

Codex still owns medical judgment inside each worker. This script owns queue
selection, deadlines, retries, and durable bookkeeping.
"""

from __future__ import annotations

import argparse
import concurrent.futures as futures
import datetime as dt
import json
import os
import re
import subprocess
import sys
import threading
from pathlib import Path
from typing import Any

import codex_ingest_batch as batch

DEFAULT_STATE_ROOT = Path(r"P:\Python Projects\Engram\video-ingest-runs\_overnight")
DEFAULT_OUT_ROOT = batch.DEFAULT_OUT_ROOT
DEFAULT_MAX_CONCURRENT = batch.MAX_CONCURRENT
DEFAULT_PULL_BUFFER = 25
DEFAULT_WORKER_TIMEOUT_MINUTES = 45
DEFAULT_STOP_BEFORE_MINUTES = 20
DEFAULT_MAX_RUN_HOURS = 8.0
DEFAULT_MAX_ATTEMPTS = 2

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def utc_now() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


def stamp() -> str:
    return utc_now().strftime("%Y%m%d-%H%M%S")


def clean(value: object) -> str:
    return " ".join(str(value or "").split())


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(
        json.dumps(data, indent=2, ensure_ascii=False, default=str),
        encoding="utf-8",
    )
    tmp.replace(path)


def append_jsonl(path: Path, row: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False, default=str) + "\n")


def print_json(data: Any) -> None:
    print(json.dumps(data, indent=2, ensure_ascii=False, default=str))


def utf8_env() -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("PYTHONUTF8", "1")
    env.setdefault("PYTHONIOENCODING", "utf-8")
    return env


def parse_iso(value: str | None) -> dt.datetime | None:
    if not value:
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    parsed = dt.datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.astimezone()
    return parsed.astimezone(dt.UTC)


def make_deadline(args: argparse.Namespace) -> dt.datetime:
    explicit = parse_iso(args.stop_at)
    if explicit:
        return explicit
    return utc_now() + dt.timedelta(hours=float(args.max_run_hours))


def seconds_left(deadline: dt.datetime) -> float:
    return (deadline - utc_now()).total_seconds()


def enough_time_for_worker(deadline: dt.datetime, stop_before_minutes: int) -> bool:
    return seconds_left(deadline) > (stop_before_minutes * 60)


def coerce_int_set(values: list[Any]) -> set[int]:
    result: set[int] = set()
    for value in values:
        try:
            result.add(int(value))
        except (TypeError, ValueError):
            pass
    return result


def load_attempts_list(path: Path) -> list[dict[str, Any]]:
    data = read_json(path, {"attempts": []})
    raw = data.get("attempts", data) if isinstance(data, dict) else data
    return raw if isinstance(raw, list) else []


def attempts_by_slug(attempts: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for attempt in attempts:
        if isinstance(attempt, dict) and clean(attempt.get("slug")):
            grouped.setdefault(clean(attempt.get("slug")), []).append(attempt)
    return grouped


def parse_final_json(text: str) -> dict[str, Any] | None:
    stripped = text.strip()
    if not stripped:
        return None
    try:
        data = json.loads(stripped)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        pass
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", stripped, re.DOTALL)
    if fence:
        try:
            data = json.loads(fence.group(1))
            return data if isinstance(data, dict) else None
        except json.JSONDecodeError:
            pass
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start >= 0 and end > start:
        try:
            data = json.loads(stripped[start : end + 1])
            return data if isinstance(data, dict) else None
        except json.JSONDecodeError:
            return None
    return None


def state_paths(state_dir: Path) -> dict[str, Path]:
    return {
        "state": state_dir / "state.json",
        "attempts": state_dir / "attempts.json",
        "events": state_dir / "events.jsonl",
        "summary": state_dir / "summary.json",
    }


def init_state_dir(args: argparse.Namespace) -> Path:
    if args.resume:
        state_dir = Path(args.resume).resolve()
        if not state_dir.exists():
            raise FileNotFoundError(state_dir)
        return state_dir
    state_root = Path(args.state_root)
    return (state_root / stamp()).resolve()


def load_or_create_state(args: argparse.Namespace, state_dir: Path, deadline: dt.datetime) -> dict[str, Any]:
    paths = state_paths(state_dir)
    if paths["state"].exists():
        state = read_json(paths["state"], {})
        state["resumedAt"] = utc_now().isoformat()
        state["deadlineUtc"] = deadline.isoformat()
        if args.ids:
            state["targetVideoIds"] = [int(v) for v in args.ids]
        return state
    state = {
        "schemaVersion": 1,
        "kind": "codex-engram-overnight-run",
        "runId": state_dir.name,
        "createdAt": utc_now().isoformat(),
        "deadlineUtc": deadline.isoformat(),
        "project": str(batch.PROJECT),
        "outRoot": str(Path(args.out_root)),
        "source": args.source,
        "course": args.course,
        "targetVideoIds": [int(v) for v in (args.ids or [])],
        "maxConcurrent": int(args.max_concurrent),
        "pullBuffer": int(args.pull_buffer),
        "maxAttempts": int(args.max_attempts),
        "workerTimeoutMinutes": int(args.worker_timeout_minutes),
        "stopBeforeMinutes": int(args.stop_before_minutes),
        "maxVideos": args.max_videos,
        "completedVideoIds": [],
        "failedVideoIds": [],
        "reviewVideoIds": [],
        "skippedThisRunVideoIds": [],
        "tranches": [],
    }
    write_json(paths["state"], state)
    write_json(paths["attempts"], {"attempts": []})
    return state


def save_state(state_dir: Path, state: dict[str, Any]) -> None:
    state["updatedAt"] = utc_now().isoformat()
    write_json(state_paths(state_dir)["state"], state)


def job_zip_path(job: dict[str, Any]) -> Path:
    run_dir = Path(job["runDir"])
    return run_dir / f"{job['slug']}.engram.zip"


def runnable_videos(
    *,
    count: int,
    source: str | None,
    course: str | None,
    out_root: Path,
    already_seen: set[int],
    pull_buffer: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    pulled = batch.pull_batch_videos(max(count, pull_buffer), source, course, out_root)
    videos = [
        video
        for video in pulled.get("videos", [])
        if int(video.get("id", -1)) not in already_seen
    ]
    return videos[:count], pulled


def explicit_videos(ids: list[int], *, already_seen: set[int], count: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    resolved = batch.resolve_explicit_videos(ids)
    videos = [video for video in resolved if int(video.get("id", -1)) not in already_seen]
    return videos[:count], {"ok": True, "mode": "explicit", "ids": ids, "videos": videos}


def worker_prompt(job: dict[str, Any], prompt: str) -> str:
    guard = [
        "OVERNIGHT RUN SAFETY",
        "- This is one isolated worker. Do not process another video.",
        "- Keep context small: do not paste the full transcript, OCR, keyframes, or logs into your final answer.",
        "- Persist work only in the run dir named below.",
        "- If unsure or if the scene is a pan, build the best grounded facts-only bundle and list caveats.",
        "- Final answer must be compact JSON only.",
        "",
    ]
    return "\n".join(guard) + prompt


def codex_command(
    *,
    codex_bin: str,
    sandbox: str,
    model: str,
    reasoning_effort: str,
    output_file: Path,
    output_schema: Path,
    prompt: str,
    extra_args: list[str],
) -> list[str]:
    return [
        codex_bin,
        "exec",
        "--sandbox",
        sandbox,
        "--skip-git-repo-check",
        "-m",
        model,
        "-c",
        f'model_reasoning_effort="{reasoning_effort}"',
        "--output-schema",
        str(output_schema),
        "-o",
        str(output_file),
        *extra_args,
        prompt,
    ]


def run_worker(
    *,
    state_dir: Path,
    job: dict[str, Any],
    prompt: str,
    attempt_no: int,
    codex_bin: str,
    sandbox: str,
    extra_args: list[str],
    timeout_minutes: int,
    dry_run: bool,
) -> dict[str, Any]:
    slug = str(job["slug"])
    attempt_dir = state_dir / "workers" / slug / f"attempt-{attempt_no}"
    attempt_dir.mkdir(parents=True, exist_ok=True)
    prompt_text = worker_prompt(job, prompt)
    prompt_path = attempt_dir / "prompt.txt"
    stdout_path = attempt_dir / "stdout.txt"
    stderr_path = attempt_dir / "stderr.txt"
    final_path = attempt_dir / "final.json"
    prompt_path.write_text(prompt_text, encoding="utf-8")

    started = utc_now()
    worker_model = clean(job.get("initialModel")) or batch.MODEL_LADDER[0]["model"]
    worker_reasoning = clean(job.get("initialReasoningEffort")) or batch.MODEL_LADDER[0]["reasoning_effort"]
    base = {
        "videoId": int(job["videoId"]),
        "slug": slug,
        "title": job.get("title"),
        "runDir": job.get("runDir"),
        "attempt": attempt_no,
        "model": worker_model,
        "workerModel": worker_model,
        "workerReasoningEffort": worker_reasoning,
        "startedAt": started.isoformat(),
        "promptPath": str(prompt_path),
        "stdoutPath": str(stdout_path),
        "stderrPath": str(stderr_path),
        "finalPath": str(final_path),
        "dryRun": dry_run,
    }
    if dry_run:
        command = codex_command(
            codex_bin=codex_bin,
            sandbox=sandbox,
            model=worker_model,
            reasoning_effort=worker_reasoning,
            output_file=final_path,
            output_schema=batch.WORKER_FINAL_SCHEMA,
            prompt=prompt_text,
            extra_args=extra_args,
        )
        return {
            **base,
            "status": "planned",
            "built": job_zip_path(job).exists(),
            "zipPath": str(job_zip_path(job)) if job_zip_path(job).exists() else None,
            "command": command,
            "finishedAt": utc_now().isoformat(),
            "elapsedSeconds": 0,
        }

    command = codex_command(
        codex_bin=codex_bin,
        sandbox=sandbox,
        model=worker_model,
        reasoning_effort=worker_reasoning,
        output_file=final_path,
        output_schema=batch.WORKER_FINAL_SCHEMA,
        prompt=prompt_text,
        extra_args=extra_args,
    )
    stdout = ""
    stderr = ""
    timed_out = False
    returncode: int | None = None
    try:
        proc = subprocess.run(
            command,
            cwd=batch.PROJECT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=utf8_env(),
            timeout=timeout_minutes * 60,
        )
        stdout = proc.stdout
        stderr = proc.stderr
        returncode = proc.returncode
    except subprocess.TimeoutExpired as exc:
        timed_out = True
        stdout = exc.stdout or ""
        stderr = exc.stderr or ""
        returncode = None
    except OSError as exc:
        stderr = str(exc)
        returncode = None

    stdout_path.write_text(stdout, encoding="utf-8")
    stderr_path.write_text(stderr, encoding="utf-8")
    final_text = final_path.read_text(encoding="utf-8") if final_path.exists() else stdout
    parsed = parse_final_json(final_text)
    finished = utc_now()
    zip_path = job_zip_path(job)
    attempt: dict[str, Any] = {
        **base,
        "finishedAt": finished.isoformat(),
        "elapsedSeconds": round((finished - started).total_seconds(), 3),
        "returncode": returncode,
        "timedOut": timed_out,
        "status": "timeout" if timed_out else ("ok" if returncode == 0 else "failed"),
        "built": zip_path.exists(),
        "zipPath": str(zip_path) if zip_path.exists() else None,
    }
    if parsed:
        if clean(parsed.get("model")):
            attempt["draftModel"] = clean(parsed.get("model"))
        protected = {"videoId", "slug", "model", "workerModel", "workerReasoningEffort"}
        attempt.update({k: v for k, v in parsed.items() if k not in protected})
        attempt["parsedFinal"] = True
    else:
        attempt["parsedFinal"] = False
        attempt["rawFinalPreview"] = clean(final_text)[:1000]
    return attempt


def persist_attempt(state_dir: Path, attempt: dict[str, Any], lock: threading.Lock) -> None:
    paths = state_paths(state_dir)
    with lock:
        attempts = load_attempts_list(paths["attempts"])
        attempts.append(attempt)
        write_json(paths["attempts"], {"attempts": attempts})
        append_jsonl(paths["events"], {"type": "attempt.completed", **attempt})


def run_jobs_parallel(
    *,
    state_dir: Path,
    jobs: list[dict[str, Any]],
    prompts_by_slug: dict[str, str],
    attempt_counts: dict[str, int],
    args: argparse.Namespace,
) -> list[dict[str, Any]]:
    lock = threading.Lock()
    results: list[dict[str, Any]] = []
    max_workers = min(max(1, int(args.max_concurrent)), DEFAULT_MAX_CONCURRENT, len(jobs))
    with futures.ThreadPoolExecutor(max_workers=max_workers) as pool:
        pending = []
        for job in jobs:
            slug = str(job["slug"])
            attempt_no = attempt_counts.get(slug, 0) + 1
            attempt_counts[slug] = attempt_no
            pending.append(
                pool.submit(
                    run_worker,
                    state_dir=state_dir,
                    job=job,
                    prompt=prompts_by_slug[slug],
                    attempt_no=attempt_no,
                    codex_bin=args.codex_bin,
                    sandbox=args.sandbox,
                    extra_args=args.codex_arg or [],
                    timeout_minutes=int(args.worker_timeout_minutes),
                    dry_run=bool(args.dry_run),
                )
            )
        for future in futures.as_completed(pending):
            attempt = future.result()
            persist_attempt(state_dir, attempt, lock)
            results.append(attempt)
    return results


def verify_and_write(
    *,
    state_dir: Path,
    manifest: dict[str, Any],
    tranche_id: str,
) -> dict[str, Any]:
    attempts_path = state_paths(state_dir)["attempts"]
    attempts = batch.load_attempts(attempts_path)
    ledger = batch.verify_manifest(manifest, attempts)
    ledger_path = state_dir / "ledgers" / f"{tranche_id}.json"
    write_json(ledger_path, ledger)
    return ledger


def update_state_from_ledger(state: dict[str, Any], ledger: dict[str, Any]) -> None:
    completed = coerce_int_set(state.get("completedVideoIds", []))
    failed = coerce_int_set(state.get("failedVideoIds", []))
    review = coerce_int_set(state.get("reviewVideoIds", []))
    for row in ledger.get("ledger", []):
        vid = int(row["videoId"])
        if row.get("status") == "ok":
            completed.add(vid)
            failed.discard(vid)
            review.discard(vid)
        elif row.get("status") == "review":
            review.add(vid)
            completed.discard(vid)
            failed.discard(vid)
        elif not row.get("needsEscalation"):
            failed.add(vid)
            completed.discard(vid)
    state["completedVideoIds"] = sorted(completed)
    state["failedVideoIds"] = sorted(failed)
    state["reviewVideoIds"] = sorted(review)


def tranche_summary(ledger: dict[str, Any]) -> dict[str, Any]:
    rows = ledger.get("ledger", [])
    return {
        "built": ledger.get("built", 0),
        "ok": ledger.get("ok", 0),
        "review": ledger.get("review", 0),
        "failed": ledger.get("failed", 0),
        "needsEscalation": ledger.get("needsEscalation", 0),
        "jobs": len(rows),
    }


def run_tranche(
    *,
    state_dir: Path,
    state: dict[str, Any],
    tranche_index: int,
    videos: list[dict[str, Any]],
    args: argparse.Namespace,
    deadline: dt.datetime,
) -> dict[str, Any]:
    tranche_id = f"tranche-{tranche_index:03d}"
    manifest = batch.build_manifest(videos, Path(args.out_root), prepare=not args.no_prepare)
    manifest["overnightRunId"] = state["runId"]
    manifest["trancheId"] = tranche_id
    manifest_path = state_dir / "manifests" / f"{tranche_id}.json"
    write_json(manifest_path, manifest)

    attempts = load_attempts_list(state_paths(state_dir)["attempts"])
    attempt_counts = {slug: len(items) for slug, items in attempts_by_slug(attempts).items()}

    jobs = [job for job in manifest.get("jobs", []) if not job.get("prepareError")]
    prompts = {str(job["slug"]): str(job["prompt"]) for job in jobs}
    run_jobs_parallel(
        state_dir=state_dir,
        jobs=jobs,
        prompts_by_slug=prompts,
        attempt_counts=attempt_counts,
        args=args,
    )
    ledger = verify_and_write(state_dir=state_dir, manifest=manifest, tranche_id=tranche_id)

    while (
        not args.dry_run
        and enough_time_for_worker(deadline, int(args.stop_before_minutes))
        and int(args.max_attempts) > 1
    ):
        retry_rows = [
            row
            for row in ledger.get("ledger", [])
            if row.get("needsEscalation")
            and clean(row.get("retryPrompt"))
            and attempt_counts.get(clean(row.get("slug")), 0) < int(args.max_attempts)
        ]
        if not retry_rows:
            break
        jobs_by_slug = {str(job["slug"]): job for job in jobs}
        retry_jobs: list[dict[str, Any]] = []
        retry_prompts: dict[str, str] = {}
        for row in retry_rows:
            slug = clean(row.get("slug"))
            job = dict(jobs_by_slug[slug])
            job["initialModel"] = row.get("nextModel") or job.get("initialModel")
            job["initialReasoningEffort"] = row.get("nextReasoningEffort") or job.get("initialReasoningEffort")
            retry_jobs.append(job)
            retry_prompts[slug] = str(row["retryPrompt"])
        run_jobs_parallel(
            state_dir=state_dir,
            jobs=retry_jobs,
            prompts_by_slug=retry_prompts,
            attempt_counts=attempt_counts,
            args=args,
        )
        ledger = verify_and_write(state_dir=state_dir, manifest=manifest, tranche_id=tranche_id)

    summary = {
        "trancheId": tranche_id,
        "manifestPath": str(manifest_path),
        "videoIds": [int(v["id"]) for v in videos],
        "slugs": [v["slug"] for v in videos],
        **tranche_summary(ledger),
    }
    state.setdefault("tranches", []).append(summary)
    update_state_from_ledger(state, ledger)
    save_state(state_dir, state)
    return summary


def write_summary(state_dir: Path, state: dict[str, Any]) -> dict[str, Any]:
    attempts = load_attempts_list(state_paths(state_dir)["attempts"])
    summary = {
        "runId": state.get("runId"),
        "stateDir": str(state_dir),
        "createdAt": state.get("createdAt"),
        "updatedAt": state.get("updatedAt"),
        "deadlineUtc": state.get("deadlineUtc"),
        "attempts": len(attempts),
        "completed": len(state.get("completedVideoIds", [])),
        "review": len(state.get("reviewVideoIds", [])),
        "failed": len(state.get("failedVideoIds", [])),
        "tranches": state.get("tranches", []),
        "attemptsPath": str(state_paths(state_dir)["attempts"]),
        "eventsPath": str(state_paths(state_dir)["events"]),
    }
    write_json(state_paths(state_dir)["summary"], summary)
    return summary


def cmd_run(args: argparse.Namespace) -> int:
    if int(args.max_concurrent) > DEFAULT_MAX_CONCURRENT:
        raise ValueError(f"--max-concurrent cannot exceed {DEFAULT_MAX_CONCURRENT}")
    deadline = make_deadline(args)
    state_dir = init_state_dir(args)
    state = load_or_create_state(args, state_dir, deadline)
    paths = state_paths(state_dir)
    append_jsonl(paths["events"], {"type": "run.started", "stateDir": str(state_dir), "deadlineUtc": deadline.isoformat()})
    target_ids = [int(v) for v in (args.ids or state.get("targetVideoIds") or [])]

    tranche_index = len(state.get("tranches", [])) + 1
    processed_this_invocation = 0
    while enough_time_for_worker(deadline, int(args.stop_before_minutes)):
        max_videos = args.max_videos
        already_seen = (
            coerce_int_set(state.get("completedVideoIds", []))
            | coerce_int_set(state.get("failedVideoIds", []))
            | coerce_int_set(state.get("reviewVideoIds", []))
            | coerce_int_set(state.get("skippedThisRunVideoIds", []))
        )
        if max_videos is not None and len(already_seen) >= int(max_videos):
            break
        remaining = int(args.tranche_size)
        if max_videos is not None:
            remaining = min(remaining, max(0, int(max_videos) - len(already_seen)))
        if remaining <= 0:
            break
        if target_ids:
            videos, pulled = explicit_videos(target_ids, already_seen=already_seen, count=remaining)
        else:
            videos, pulled = runnable_videos(
                count=remaining,
                source=args.source,
                course=args.course,
                out_root=Path(args.out_root),
                already_seen=already_seen,
                pull_buffer=int(args.pull_buffer),
            )
        if not videos:
            state["lastPull"] = pulled
            break
        summary = run_tranche(
            state_dir=state_dir,
            state=state,
            tranche_index=tranche_index,
            videos=videos,
            args=args,
            deadline=deadline,
        )
        processed_this_invocation += len(videos)
        append_jsonl(paths["events"], {"type": "tranche.completed", **summary})
        tranche_index += 1
        if args.once:
            break
    state["finishedAt"] = utc_now().isoformat()
    state["processedThisInvocation"] = processed_this_invocation
    save_state(state_dir, state)
    summary = write_summary(state_dir, state)
    print_json(summary)
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    state_dir = Path(args.resume).resolve()
    state = read_json(state_paths(state_dir)["state"], {})
    summary = write_summary(state_dir, state)
    print_json(summary)
    return 0


def cmd_finalize(args: argparse.Namespace) -> int:
    state_dir = Path(args.resume).resolve()
    ledgers = sorted((state_dir / "ledgers").glob("*.json"))
    results = []
    for ledger_path in ledgers:
        ledger = read_json(ledger_path, {})
        result = batch.finalize_ledger(ledger, dry_run=args.dry_run)
        results.append({"ledger": str(ledger_path), **result})
    print_json({"ok": all(r.get("ok") for r in results), "results": results})
    return 0 if all(r.get("ok") for r in results) else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run disk-backed overnight Codex ingest workers.")
    sub = parser.add_subparsers(dest="cmd", required=True)

    run = sub.add_parser("run", help="Run or resume an overnight ingest session.")
    run.add_argument("--resume", type=str, default=None, help="Existing overnight state dir.")
    run.add_argument("--state-root", type=Path, default=DEFAULT_STATE_ROOT)
    run.add_argument("--out-root", type=Path, default=DEFAULT_OUT_ROOT)
    run.add_argument("--source", type=str, default=None)
    run.add_argument("--course", type=str, default=None)
    run.add_argument("--ids", nargs="*", type=int, default=None, help="Exact MVS video IDs to run.")
    run.add_argument("--max-run-hours", type=float, default=DEFAULT_MAX_RUN_HOURS)
    run.add_argument("--stop-at", type=str, default=None, help="ISO timestamp; local or offset-aware.")
    run.add_argument("--stop-before-minutes", type=int, default=DEFAULT_STOP_BEFORE_MINUTES)
    run.add_argument("--max-videos", type=int, default=None)
    run.add_argument("--tranche-size", type=int, default=DEFAULT_MAX_CONCURRENT)
    run.add_argument("--max-concurrent", type=int, default=DEFAULT_MAX_CONCURRENT)
    run.add_argument("--pull-buffer", type=int, default=DEFAULT_PULL_BUFFER)
    run.add_argument("--max-attempts", type=int, default=DEFAULT_MAX_ATTEMPTS)
    run.add_argument("--worker-timeout-minutes", type=int, default=DEFAULT_WORKER_TIMEOUT_MINUTES)
    run.add_argument("--codex-bin", type=str, default=os.environ.get("CODEX_BIN", "codex"))
    run.add_argument("--sandbox", type=str, default="danger-full-access")
    run.add_argument("--codex-arg", action="append", default=None, help="Extra arg passed to codex exec; repeatable.")
    run.add_argument("--no-prepare", action="store_true")
    run.add_argument("--dry-run", action="store_true", help="Prepare state/prompts but do not launch Codex.")
    run.add_argument("--once", action="store_true", help="Run one tranche, then stop.")
    run.set_defaults(func=cmd_run)

    status = sub.add_parser("status", help="Summarize an overnight state dir.")
    status.add_argument("--resume", type=str, required=True)
    status.set_defaults(func=cmd_status)

    finalize = sub.add_parser("finalize", help="Apply ready/flag queue updates from ledgers.")
    finalize.add_argument("--resume", type=str, required=True)
    finalize.add_argument("--dry-run", action="store_true")
    finalize.set_defaults(func=cmd_finalize)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except Exception as exc:
        print_json({"ok": False, "error": str(exc)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
