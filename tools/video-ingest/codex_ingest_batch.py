"""Codex batch helper for Engram video ingest.

This script keeps the repeatable parts of the Codex autopilot outside the model:
queue selection, run preparation, verification, and queue finalization. Codex
still owns subagent spawning and escalation.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import ingest_queue
import ingest_workflow

TOOL_DIR = Path(__file__).resolve().parent
PROJECT = TOOL_DIR.parents[1]
PY = PROJECT / ".venv-video-ingest" / "Scripts" / "python.exe"
DEFAULT_OUT_ROOT = Path(r"P:\Python Projects\Engram\video-ingest-runs")
INGEST_QUEUE = TOOL_DIR / "ingest_queue.py"
INGEST_WORKFLOW = TOOL_DIR / "ingest_workflow.py"
LINT_DRAFT = TOOL_DIR / "lint_draft.py"
WORKER_FINAL_SCHEMA = TOOL_DIR / "codex_worker_final_schema.json"

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

MAX_CONCURRENT = 5
MODEL_LADDER = [
    {"model": "gpt-5.4", "reasoning_effort": "medium", "costUnits": 3},
    {"model": "gpt-5.5", "reasoning_effort": "high", "costUnits": 15},
]

FIXABLE_CODES = {
    "missing-field",
    "ungrounded-evidence",
    "duplicate-bullet",
    "no-symbols",
    "bad-symbol",
    "bad-timestamp",
    "bad-evidence-timestamp",
    "no-draft",
    "no-quote",
    "missing-target-ids",
    "unknown-target-id",
    "invalid-omission",
    "uncovered-target",
    "possible-under-extraction",
    "weak-fact",
}
REAUTHORABLE_REVIEW_REASONS = {"pan-coverage"}


def clean(value: object) -> str:
    return " ".join(str(value or "").split())


def json_default(value: object) -> str:
    if isinstance(value, Path):
        return str(value)
    return str(value)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False, default=json_default),
        encoding="utf-8",
    )


def print_json(data: Any) -> None:
    print(json.dumps(data, indent=2, ensure_ascii=False, default=json_default))


def utf8_env() -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("PYTHONUTF8", "1")
    env.setdefault("PYTHONIOENCODING", "utf-8")
    return env


def run_command(command: list[str], *, cwd: Path = PROJECT) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=utf8_env(),
    )


def run_json_command(command: list[str]) -> dict[str, Any]:
    proc = run_command(command)
    if proc.returncode != 0:
        return {
            "ok": False,
            "returncode": proc.returncode,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
        }
    try:
        parsed = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {
            "ok": False,
            "returncode": proc.returncode,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "error": "stdout was not JSON",
        }
    if isinstance(parsed, dict):
        parsed.setdefault("ok", True)
        return parsed
    return {"ok": True, "value": parsed}


def python_exe() -> str:
    return str(PY if PY.exists() else Path(sys.executable))


def select_initial_model(video: dict[str, Any]) -> dict[str, Any]:
    if video.get("forceModel") == "gpt-5.5":
        return MODEL_LADDER[-1]
    return MODEL_LADDER[0]


def next_model(current: str | None) -> dict[str, Any] | None:
    if not current:
        return MODEL_LADDER[0]
    for idx, entry in enumerate(MODEL_LADDER):
        if entry["model"] == current:
            if idx + 1 < len(MODEL_LADDER):
                return MODEL_LADDER[idx + 1]
            return None
    return None


def strong_verifier_model(current: str | None) -> dict[str, Any] | None:
    strongest = MODEL_LADDER[-1]
    if current == strongest["model"]:
        return None
    return strongest


def resolve_out_root(value: str | None) -> Path:
    return Path(value) if value else DEFAULT_OUT_ROOT


def video_from_row(row: Any, *, transcript_segments: int) -> dict[str, Any]:
    path = str(row["path"])
    return {
        "id": int(row["id"]),
        "source": row["source"],
        "course": row["course"],
        "title": row["title"],
        "path": path,
        "slug": ingest_queue.slugify(Path(path).stem),
        "transcriptSegments": transcript_segments,
        "dense": transcript_segments >= ingest_queue.DENSE_SEGMENTS,
        "flagged": False,
    }


def resolve_explicit_videos(ids: list[int]) -> list[dict[str, Any]]:
    conn = ingest_queue.connect()
    videos: list[dict[str, Any]] = []
    for video_id in ids:
        row = ingest_queue.resolve_one(conn, video_id)
        if row is None:
            raise ValueError(f"no MVS video with id {video_id}")
        videos.append(
            video_from_row(
                row,
                transcript_segments=ingest_queue.seg_count(conn, video_id),
            )
        )
    return videos


def pull_batch_videos(count: int, source: str | None, course: str | None, out_root: Path) -> dict[str, Any]:
    command = [
        python_exe(),
        str(INGEST_QUEUE),
        "next",
        "--count",
        str(count),
        "--out-root",
        str(out_root),
    ]
    if source:
        command += ["--source", source]
    if course:
        command += ["--course", course]
    pulled = run_json_command(command)
    if not pulled.get("ok"):
        raise RuntimeError(clean(pulled.get("stderr") or pulled.get("stdout") or pulled.get("error")))
    return pulled


def prepare_video(video: dict[str, Any], out_root: Path) -> dict[str, Any]:
    command = [
        python_exe(),
        str(INGEST_WORKFLOW),
        "prepare",
        "--video",
        str(video["path"]),
        "--out-root",
        str(out_root),
    ]
    prepared = run_json_command(command)
    if not prepared.get("ok"):
        return {
            "ok": False,
            "error": clean(prepared.get("stderr") or prepared.get("stdout") or prepared.get("error")),
        }
    return prepared


def author_prompt(job: dict[str, Any], critique: str | None = None) -> str:
    model_tag = "codex-escalated" if critique else "codex-facts-only"
    py = python_exe()
    run_dir = job["runDir"]
    lines = [
        "You are authoring exactly ONE Engram mnemonic video, facts-only.",
        f"Work from {PROJECT}. You are not alone in the codebase; do not touch other run dirs or unrelated files.",
        "",
        "VIDEO",
        f"- title: {job['title']}",
        f"- source: {job.get('source')}",
        f"- course: {job.get('course')}",
        f"- mvs id: {job['videoId']}",
        f"- file: {job['path']}",
        f"- slug: {job['slug']}",
        f"- run dir: {run_dir}",
        "",
        "Use the prepared run artifacts. Do not rerun queue selection.",
        f"1. Read {job['authorPacket']}.",
        f"2. Read {run_dir}\\transcript.json as the source of truth.",
        f"3. Read {run_dir}\\ocr.json only as a completeness cross-check, never as evidence.",
        f"4. Read {run_dir}\\keyframes.json and only the selected backdrop frame unless it is clearly wrong.",
        f"5. Read {run_dir}\\workflow\\coverage_targets.json and cover every required target.",
        f"6. Read {run_dir}\\workflow\\backdrop_candidates.json before accepting the selected backdrop.",
        f"7. Consult {TOOL_DIR}\\glossary.json for recurring puns.",
        "8. Build a target checklist first: each required target must end as covered by symbol.target_ids or explicitly omitted.",
        "",
        f"Write {job['draftPath']} as:",
        f'{{"model":"{model_tag}","symbols":[...],"omissions":[...]}}',
        "Each symbol needs order, fact, symbol_key, symbol_description, meaning, evidence, timestamp_ms, target_ids, evidence_quote, evidence_start_ms.",
        "The fact must be a full board-relevant medical statement, not a cue label like 'title cue', 'name cue', 'pons', or 'motor fiber type'.",
        "Keep fact text atomic and gold-style: one concise tested statement per symbol. Do not merge multiple pathway nodes, indications, or adverse effects into one broad mechanism summary.",
        "For dense pathways and drug MOA videos, split every named intermediate, enzyme, product, inhibitor, indication, and adverse effect into its own symbol unless the target is a true duplicate or OCR noise.",
        "The meaning must explain the mnemonic why, e.g. 'Abu sounds like Abducens' or 'Six Flags = cranial nerve six'; never use bare slash labels like 'Abducens nerve / cranial nerve VI'.",
        "Keep meaning terse: visible object -> encoded concept. Do not write paragraph-style physiology in meaning; put the study fact in fact.",
        "The symbol_description must describe one concrete visual object with spatial staging. Do not mash another symbol object into it; keep poncho/pons separate from a dizzy guest/VOR symbol, etc.",
        "Keep symbol_description concise and locator-focused: one object plus where it sits. Avoid including other symbols' object words or the medical meaning in the description.",
        "target_ids must come from coverage_targets.json. Do not invent target ids.",
        "Every required coverage target must be represented by a symbol or listed in omissions[]. One symbol may cover multiple target_ids when it truly accounts for each target.",
        "Do not omit a narrated, visible mnemonic symbol. If the target is visible but medically ambiguous, write a conservative symbol instead of hiding it in omissions.",
        "High-priority targets and their critical_terms are mandatory study facts; do not replace them with lower-yield duplicates.",
        "Valid omission reasons: not-visible-on-backdrop, panning-scene, duplicate-title, not-mnemonic-fact, ocr-noise, outside-scope.",
        "Uncovered targets, missing target_ids, unknown target_ids, missing critical terms, and possible-under-extraction are blocking recall failures.",
        "Facts-only only: do not add bbox, polygon, point, vlm_width, vlm_height, or SAM fields.",
        'Evidence must be formatted as Transcript @m:ss "clean quote" and evidence_quote must be the same exact transcript span.',
        "Curate evidence to one or two tight quotes. Do not start with filler like 'You know', 'By the way', or 'Anyways', and do not stop mid-clause.",
        "Use ASCII house style in generated text; do not emit approximately-equals or arrow glyphs.",
        "Capture every narrated symbol visible on the chosen backdrop. If this is a panning scene, author only visible symbols and list omitted target_ids in omissions[].",
        "Do not hide under-extraction in caveats. Caveats are for true visual/backdrop limitations only.",
        "",
        "Then run the gate:",
        f'{py} {LINT_DRAFT} --run-dir "{run_dir}"',
        "If lint fails, fix draft_symbols.json and rerun lint at most once.",
        "If lint reports suspicious-symbol-overlap, revise the descriptions before building unless the overlap is unavoidable and explain it in notes.",
        "If final lint is ok, build once:",
        f'{py} {INGEST_WORKFLOW} build --run-dir "{run_dir}"',
        "Do not import into the dev app.",
        "",
        "Return concise structured JSON in your final message:",
        '{"videoId":0,"slug":"","model":"","built":false,"backdropUsable":true,'
        '"zipPath":null,"backdropIndex":0,"symbolCount":0,"factCount":0,'
        '"sceneKind":"tableau|picmonic|pan|unknown","caveats":[],'
        '"lint":{"ok":false,"errorCodes":[],"warningCodes":[],"symbols":0,"segments":0},'
        '"notes":""}',
    ]
    if critique:
        lines += ["", "ESCALATION CRITIQUE", critique]
    return "\n".join(lines)


def job_from_video(
    video: dict[str, Any],
    out_root: Path,
    *,
    prepared: dict[str, Any] | None,
    prepare_enabled: bool,
) -> dict[str, Any]:
    slug = str(video["slug"])
    run_dir = Path(out_root) / slug
    model = select_initial_model(video)
    job = {
        "videoId": int(video["id"]),
        "source": video.get("source"),
        "course": video.get("course"),
        "title": video.get("title"),
        "path": video.get("path"),
        "slug": slug,
        "transcriptSegments": int(video.get("transcriptSegments") or 0),
        "dense": bool(video.get("dense")),
        "flagged": bool(video.get("flagged")),
        "runDir": str(run_dir),
        "draftPath": str(run_dir / "draft_symbols.json"),
        "authorPacket": str(run_dir / "workflow" / "author_packet.md"),
        "initialModel": model["model"],
        "initialReasoningEffort": model["reasoning_effort"],
        "costUnits": model["costUnits"],
        "prepared": bool(prepared and prepared.get("ok")) if prepare_enabled else False,
        "prepareEnabled": prepare_enabled,
        "prepareError": None,
    }
    if prepared and prepared.get("ok"):
        job["runDir"] = str(prepared.get("runDir") or job["runDir"])
        job["authorPacket"] = str(prepared.get("authorPacket") or job["authorPacket"])
        job["coverageTargets"] = str(prepared.get("coverageTargets") or (Path(job["runDir"]) / "workflow" / "coverage_targets.json"))
        job["backdropCandidates"] = str(prepared.get("backdropCandidates") or (Path(job["runDir"]) / "workflow" / "backdrop_candidates.json"))
        job["draftPath"] = str(prepared.get("draft") or job["draftPath"])
    elif prepare_enabled and prepared:
        job["prepareError"] = prepared.get("error") or "prepare failed"
    else:
        job["coverageTargets"] = str(Path(job["runDir"]) / "workflow" / "coverage_targets.json")
        job["backdropCandidates"] = str(Path(job["runDir"]) / "workflow" / "backdrop_candidates.json")
    job["prompt"] = author_prompt(job)
    return job


def build_manifest(
    videos: list[dict[str, Any]],
    out_root: Path,
    *,
    prepare: bool = True,
) -> dict[str, Any]:
    jobs = []
    for video in videos:
        prepared = prepare_video(video, out_root) if prepare else None
        jobs.append(
            job_from_video(
                video,
                out_root,
                prepared=prepared,
                prepare_enabled=prepare,
            )
        )
    return {
        "schemaVersion": 1,
        "kind": "codex-engram-ingest-manifest",
        "generatedAt": dt.datetime.now(dt.UTC).isoformat(),
        "project": str(PROJECT),
        "outRoot": str(out_root),
        "maxConcurrent": MAX_CONCURRENT,
        "modelLadder": MODEL_LADDER,
        "jobs": jobs,
    }


def load_attempts(path: Path | None) -> dict[str, list[dict[str, Any]]]:
    if path is None or not path.exists():
        return {}
    data = read_json(path)
    raw = data.get("attempts", data) if isinstance(data, dict) else data
    attempts = raw if isinstance(raw, list) else []
    by_slug: dict[str, list[dict[str, Any]]] = {}
    for attempt in attempts:
        if not isinstance(attempt, dict):
            continue
        slug = clean(attempt.get("slug"))
        if slug:
            by_slug.setdefault(slug, []).append(attempt)
    return by_slug


def run_lint(run_dir: Path) -> dict[str, Any]:
    command = [python_exe(), str(LINT_DRAFT), "--run-dir", str(run_dir)]
    proc = run_command(command)
    try:
        result = json.loads(proc.stdout)
    except json.JSONDecodeError:
        result = {
            "ok": False,
            "errors": [{"code": "lint-failed", "msg": clean(proc.stderr or proc.stdout)}],
            "warnings": [],
            "stats": {},
        }
    workflow = run_dir / "workflow"
    workflow.mkdir(parents=True, exist_ok=True)
    write_json(workflow / "codex_lint_verify.json", result)
    return result


def lint_codes(lint: dict[str, Any], bucket: str) -> list[str]:
    items = lint.get(bucket, [])
    if not isinstance(items, list):
        return []
    return [clean(item.get("code")) for item in items if isinstance(item, dict) and clean(item.get("code"))]


def has_under_extraction(lint: dict[str, Any]) -> bool:
    return "possible-under-extraction" in (lint_codes(lint, "warnings") + lint_codes(lint, "errors"))


def has_quality_warning(lint: dict[str, Any]) -> bool:
    return bool({"suspicious-symbol-overlap"} & set(lint_codes(lint, "warnings")))


def review_reason(attempt: dict[str, Any] | None) -> str | None:
    if not attempt:
        return None
    if attempt.get("backdropUsable") is False:
        return "backdrop-unusable"
    scene = clean(attempt.get("sceneKind")).lower()
    if scene == "pan":
        return "pan-coverage"
    caveats = " ".join(clean(c) for c in attempt.get("caveats", []) if c)
    if caveats:
        return "caveats"
    if "pan" in caveats.lower() or "not visible" in caveats.lower():
        return "pan-coverage"
    return None


def import_check_for_zip(zip_path: Path) -> dict[str, Any]:
    if not zip_path.exists():
        return {"ok": False, "issues": [{"code": "missing-zip", "msg": str(zip_path)}]}
    try:
        parsed = ingest_workflow.parse_bundle(zip_path)
        return ingest_workflow.validate_importable(parsed)
    except Exception as exc:
        return {"ok": False, "issues": [{"code": "import-check-failed", "msg": str(exc)}]}


def build_critique(entry: dict[str, Any]) -> str:
    parts = [f"Reason: {entry['unresolvedReason']}."]
    if entry.get("lintErrorCodes"):
        parts.append(f"Lint errors to clear: {', '.join(entry['lintErrorCodes'])}.")
    if entry.get("lintWarningCodes"):
        parts.append(f"Warnings to address: {', '.join(entry['lintWarningCodes'])}.")
    missing_terms = entry.get("missingTerms") or []
    if missing_terms:
        parts.append(f"OCR/transcript terms missing from draft: {', '.join(missing_terms[:12])}.")
    uncovered = (entry.get("coverage") or {}).get("uncoveredTargetIds") or []
    if uncovered:
        parts.append(f"Coverage target_ids still uncovered: {', '.join(uncovered[:12])}.")
    missing_critical = (entry.get("coverage") or {}).get("missingCriticalTerms") or []
    if missing_critical:
        target_ids = [
            clean(item.get("target_id"))
            for item in missing_critical
            if isinstance(item, dict) and clean(item.get("target_id"))
        ]
        if target_ids:
            parts.append(f"High-priority targets missing critical terms: {', '.join(target_ids[:12])}.")
    if entry.get("notes"):
        parts.append(f"Prior notes: {entry['notes']}")
    return " ".join(parts)


def import_issue_codes(import_check: dict[str, Any]) -> list[str]:
    issues = import_check.get("issues", [])
    if not isinstance(issues, list):
        return []
    return [
        clean(issue.get("code"))
        for issue in issues
        if isinstance(issue, dict) and clean(issue.get("code"))
    ]


def lint_int(stats: dict[str, Any], key: str) -> int:
    try:
        return int(stats.get(key) or 0)
    except (TypeError, ValueError):
        return 0


def coverage_contract_from_file(run_dir: Path) -> dict[str, Any]:
    path = run_dir / "workflow" / "coverage_targets.json"
    if not path.exists():
        return {
            "targets": 0,
            "covered": 0,
            "omitted": 0,
            "uncovered": 0,
            "uncoveredTargetIds": [],
            "missingCriticalTerms": [],
        }
    try:
        data = read_json(path)
    except (OSError, json.JSONDecodeError):
        return {
            "targets": 0,
            "covered": 0,
            "omitted": 0,
            "uncovered": 0,
            "uncoveredTargetIds": [],
            "missingCriticalTerms": [],
        }
    targets = [
        clean(target.get("target_id"))
        for target in data.get("targets", [])
        if isinstance(target, dict)
        and target.get("required", True)
        and clean(target.get("target_id"))
    ]
    return {
        "targets": len(targets),
        "covered": 0,
        "omitted": 0,
        "uncovered": len(targets),
        "uncoveredTargetIds": targets[:25],
        "missingCriticalTerms": [],
    }


def coverage_contract(run_dir: Path, stats: dict[str, Any]) -> dict[str, Any]:
    if "coverage_targets" not in stats:
        return coverage_contract_from_file(run_dir)
    return {
        "targets": lint_int(stats, "coverage_targets"),
        "covered": lint_int(stats, "coverage_covered"),
        "omitted": lint_int(stats, "coverage_omitted"),
        "uncovered": lint_int(stats, "coverage_uncovered"),
        "uncoveredTargetIds": list(stats.get("uncovered_targets") or []),
        "missingCriticalTerms": list(stats.get("missing_critical_terms") or []),
    }


def classify_job(
    job: dict[str, Any],
    *,
    lint: dict[str, Any],
    zip_path: Path,
    import_check: dict[str, Any],
    attempts: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    attempts = attempts or []
    attempt = attempts[-1] if attempts else None
    current_model = clean((attempt or {}).get("workerModel") or (attempt or {}).get("model")) or job.get("initialModel")
    errors = lint_codes(lint, "errors")
    warnings = lint_codes(lint, "warnings")
    stats = lint.get("stats", {}) if isinstance(lint.get("stats"), dict) else {}
    zip_exists = zip_path.exists()
    review = review_reason(attempt)
    import_ok = bool(import_check.get("ok"))
    lint_ok = bool(lint.get("ok"))
    under = has_under_extraction(lint)
    quality_warning = has_quality_warning(lint)

    reason = None
    needs_escalation = False
    if not lint_ok:
        reason = f"lint-errors:{'|'.join(errors) or 'unknown'}"
        needs_escalation = any(code in FIXABLE_CODES for code in errors) or not errors
    elif under:
        reason = "under-extraction"
        needs_escalation = True
    elif quality_warning:
        reason = "quality-warning"
        needs_escalation = True
    elif not zip_exists:
        reason = "not-built"
    elif not import_ok:
        issue_codes = [
            clean(issue.get("code"))
            for issue in import_check.get("issues", [])
            if isinstance(issue, dict)
        ]
        reason = f"import-check:{'|'.join(c for c in issue_codes if c) or 'failed'}"
    elif review:
        reason = review

    if review in REAUTHORABLE_REVIEW_REASONS and current_model != MODEL_LADDER[-1]["model"]:
        needs_escalation = True

    next_entry = strong_verifier_model(current_model) if needs_escalation else None
    if needs_escalation and not next_entry:
        needs_escalation = False

    if zip_exists and lint_ok and import_ok and not under and not quality_warning and not review:
        status = "ok"
    elif zip_exists and lint_ok and import_ok and review:
        status = "review"
    else:
        status = "failed"

    coverage = coverage_contract(Path(job["runDir"]), stats)
    ocr = {
        "terms": lint_int(stats, "ocr_terms"),
        "coverage": stats.get("ocr_coverage"),
        "missingTerms": list(stats.get("missing_terms") or []),
    }
    entry = {
        "slug": job["slug"],
        "videoId": job["videoId"],
        "source": job.get("source"),
        "title": job.get("title"),
        "status": status,
        "built": zip_exists,
        "zipPath": str(zip_path) if zip_exists else None,
        "runDir": job["runDir"],
        "symbolCount": int(stats.get("symbols") or (attempt or {}).get("symbolCount") or 0),
        "factCount": int(stats.get("facts") or (attempt or {}).get("factCount") or 0),
        "sceneKind": clean((attempt or {}).get("sceneKind")) or "unknown",
        "caveats": (attempt or {}).get("caveats", []) or [],
        "notes": clean((attempt or {}).get("notes")),
        "finalModel": current_model,
        "models": [clean(a.get("workerModel") or a.get("model")) for a in attempts if clean(a.get("workerModel") or a.get("model"))],
        "draftModels": [clean(a.get("draftModel")) for a in attempts if clean(a.get("draftModel"))],
        "lintOk": lint_ok,
        "lintErrorCodes": errors,
        "lintWarningCodes": warnings,
        "lint": {"ok": lint_ok, "errorCodes": errors, "warningCodes": warnings},
        "coverage": coverage,
        "ocr": ocr,
        "missingTerms": ocr["missingTerms"],
        "importOk": import_ok,
        "importIssueCodes": import_issue_codes(import_check),
        "importCheck": import_check,
        "unresolvedReason": reason,
        "retryReason": None,
        "needsEscalation": needs_escalation,
        "nextModel": next_entry["model"] if next_entry else None,
        "nextReasoningEffort": next_entry["reasoning_effort"] if next_entry else None,
    }
    if needs_escalation and next_entry:
        entry["retryReason"] = build_critique(entry)
        entry["retryPrompt"] = author_prompt(job, entry["retryReason"])
    return entry


def verify_manifest(manifest: dict[str, Any], attempts: dict[str, list[dict[str, Any]]] | None = None) -> dict[str, Any]:
    attempts = attempts or {}
    ledger = []
    for job in manifest.get("jobs", []):
        run_dir = Path(job["runDir"])
        lint = run_lint(run_dir)
        zip_path = run_dir / f"{job['slug']}.engram.zip"
        import_check = import_check_for_zip(zip_path)
        ledger.append(
            classify_job(
                job,
                lint=lint,
                zip_path=zip_path,
                import_check=import_check,
                attempts=attempts.get(job["slug"], []),
            )
        )
    ok = [r for r in ledger if r["status"] == "ok"]
    review = [r for r in ledger if r["status"] == "review"]
    failed = [r for r in ledger if r["status"] == "failed"]
    model_mix: dict[str, int] = {}
    for row in ledger:
        for model in row.get("models") or [row.get("finalModel")]:
            if model:
                model_mix[model] = model_mix.get(model, 0) + 1
    result = {
        "schemaVersion": 1,
        "kind": "codex-engram-ingest-ledger",
        "generatedAt": dt.datetime.now(dt.UTC).isoformat(),
        "built": sum(1 for r in ledger if r["built"]),
        "ok": len(ok),
        "review": len(review),
        "failed": len(failed),
        "needsEscalation": sum(1 for r in ledger if r.get("needsEscalation")),
        "modelMix": model_mix,
        "ledger": ledger,
    }
    blockers = finalize_blockers(result)
    result["finalizable"] = not blockers
    result["finalizeBlockers"] = blockers
    return result


def hard_blocker_codes(row: dict[str, Any]) -> list[str]:
    codes = set(row.get("lintErrorCodes") or []) | set(row.get("lintWarningCodes") or [])
    hard = {
        "uncovered-target",
        "missing-target-ids",
        "unknown-target-id",
        "missing-critical-terms",
        "possible-under-extraction",
    }
    return sorted(codes & hard)


def finalize_blockers(ledger: dict[str, Any]) -> list[str]:
    rows = ledger.get("ledger", [])
    if not isinstance(rows, list) or not rows:
        return ["ledger has no rows"]

    blockers: list[str] = []
    for row in rows:
        video_id = row.get("videoId", "?")
        slug = clean(row.get("slug"))
        label = f"{video_id}:{slug}" if slug else str(video_id)
        reason = clean(row.get("unresolvedReason"))
        if row.get("status") != "ok":
            blockers.append(f"{label} status={row.get('status')} reason={reason or 'none'}")
            continue
        if not row.get("built"):
            blockers.append(f"{label} missing built zip")
        if row.get("lintOk") is not True:
            blockers.append(f"{label} lint not ok")
        if row.get("importOk") is not True:
            blockers.append(f"{label} import not ok")
        coverage = row.get("coverage") if isinstance(row.get("coverage"), dict) else {}
        if int(coverage.get("uncovered") or 0) > 0:
            blockers.append(f"{label} has uncovered coverage targets")
        hard = hard_blocker_codes(row)
        if hard:
            blockers.append(f"{label} has hard recall blockers: {','.join(hard)}")
        if row.get("needsEscalation"):
            blockers.append(f"{label} still needs escalation")
    return blockers


def ledger_note(row: dict[str, Any]) -> str:
    if row["status"] == "ok":
        return f"codex candidate: strict-pass; human review required ({row.get('symbolCount', 0)} symbols)"[:140]
    reason = clean(row.get("unresolvedReason") or row["status"])
    return f"codex candidate: {row['status']}: {reason}; human review required"[:140]


def finalize_actions(ledger: dict[str, Any]) -> list[list[str]]:
    commands: list[list[str]] = []
    for row in ledger.get("ledger", []):
        commands.append([python_exe(), str(INGEST_QUEUE), "unready", str(row["videoId"])])
        commands.append(
            [
                python_exe(),
                str(INGEST_QUEUE),
                "flag",
                str(row["videoId"]),
                "--note",
                ledger_note(row),
            ]
        )
    commands.append([python_exe(), str(INGEST_QUEUE), "ready-list", "--write"])
    commands.append([python_exe(), str(INGEST_QUEUE), "status"])
    return commands


def finalize_ledger(
    ledger: dict[str, Any], *, dry_run: bool = False, require_strict_pass: bool = True
) -> dict[str, Any]:
    blockers = finalize_blockers(ledger) if require_strict_pass else []
    if blockers:
        return {
            "ok": False,
            "blocked": True,
            "reason": "ledger is not strict-pass; queue state was not changed",
            "blockers": blockers,
        }
    commands = finalize_actions(ledger)
    results = []
    for command in commands:
        if dry_run:
            results.append({"command": command, "returncode": None, "dryRun": True})
            continue
        proc = run_command(command)
        results.append(
            {
                "command": command,
                "returncode": proc.returncode,
                "stdout": proc.stdout,
                "stderr": proc.stderr,
            }
        )
    return {"ok": all(r.get("returncode") in (0, None) for r in results), "results": results}


def quarantine_codex_ready_entries(ledger: dict[str, Any]) -> dict[str, Any]:
    updated = json.loads(json.dumps(ledger))
    ready = updated.setdefault("ready", {})
    flags = updated.setdefault("flags", {})
    affected = []
    for video_id, note in list(ready.items()):
        if "codex autopilot ok" not in clean(note).lower():
            continue
        ready.pop(video_id, None)
        flags[video_id] = "codex candidate: prior autopilot ready quarantined; human review required"
        affected.append({"videoId": int(video_id), "previousReadyNote": note, "flagNote": flags[video_id]})
    return {"ledger": updated, "affected": affected}


def cmd_quarantine_codex_ready(args: argparse.Namespace) -> int:
    result = quarantine_codex_ready_entries(ingest_queue.load_ledger())
    if not args.dry_run:
        ingest_queue.save_ledger(result["ledger"])
        run_command([python_exe(), str(INGEST_QUEUE), "ready-list", "--write"])
    print_json({"ok": True, "dryRun": args.dry_run, "affected": len(result["affected"]), "rows": result["affected"]})
    return 0


def cmd_plan(args: argparse.Namespace) -> int:
    out_root = resolve_out_root(args.out_root)
    if args.ids:
        videos = resolve_explicit_videos([int(v) for v in args.ids])
        mode = {"type": "explicit", "ids": [int(v) for v in args.ids]}
    else:
        pulled = pull_batch_videos(args.count, args.source, args.course, out_root)
        videos = pulled.get("videos", [])
        mode = {
            "type": "batch",
            "count": args.count,
            "source": args.source,
            "course": args.course,
            "pendingTotal": pulled.get("pendingTotal"),
        }
    manifest = build_manifest(videos, out_root, prepare=not args.no_prepare)
    manifest["mode"] = mode
    if args.out:
        write_json(args.out, manifest)
    print_json(manifest)
    return 0


def cmd_verify(args: argparse.Namespace) -> int:
    manifest = read_json(args.manifest)
    attempts = load_attempts(args.attempts)
    ledger = verify_manifest(manifest, attempts)
    if args.out:
        write_json(args.out, ledger)
    print_json(ledger)
    return 0


def cmd_finalize(args: argparse.Namespace) -> int:
    ledger = read_json(args.ledger)
    result = finalize_ledger(
        ledger,
        dry_run=args.dry_run,
        require_strict_pass=not args.allow_incomplete,
    )
    print_json(result)
    return 0 if result["ok"] else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Codex helper for Engram ingest batches.")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("plan", help="Pull/resolve videos, prepare runs, emit a job manifest.")
    p.add_argument("--count", type=int, default=10)
    p.add_argument("--source", type=str, default=None)
    p.add_argument("--course", type=str, default=None)
    p.add_argument("--ids", nargs="*", type=int, default=None)
    p.add_argument("--out-root", type=str, default=None)
    p.add_argument("--out", type=Path, default=None)
    p.add_argument("--no-prepare", action="store_true", help="Emit jobs without running prepare.")
    p.set_defaults(func=cmd_plan)

    p = sub.add_parser("verify", help="Rerun lint/import checks and emit a ledger.")
    p.add_argument("--manifest", type=Path, required=True)
    p.add_argument("--attempts", type=Path, default=None)
    p.add_argument("--out", type=Path, default=None)
    p.set_defaults(func=cmd_verify)

    p = sub.add_parser("finalize", help="Update ready/flag queue state from a ledger.")
    p.add_argument("--ledger", type=Path, required=True)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument(
        "--allow-incomplete",
        action="store_true",
        help="Override the strict-pass guard and flag rows even when validation failed.",
    )
    p.set_defaults(func=cmd_finalize)

    p = sub.add_parser("quarantine-codex-ready", help="Unready+flag prior codex autopilot ready rows.")
    p.add_argument("--dry-run", action="store_true")
    p.set_defaults(func=cmd_quarantine_codex_ready)
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
