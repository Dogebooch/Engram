import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ingest_workflow import (  # noqa: E402
    build_coverage_targets,
    compare_bundles,
    needs_wider_keyframes,
    parse_bundle,
    run_subprocess,
    scan_gold_root,
    validate_importable,
    write_author_packet,
    write_backdrop_candidates,
    write_coverage_targets,
    write_gold_index,
)


def uuid_for(offset: int) -> str:
    return f"00000000-0000-4000-8000-{offset:012d}"


def make_bundle(
    path: Path,
    title: str,
    facts: list[tuple[str, list[tuple[str, str]]]],
    *,
    uuid_offset: int = 0,
    omit_canvas_symbol: bool = False,
) -> Path:
    folder = path.stem
    notes = [f"# {title}", ""]
    canvas_symbols = []
    order = 0
    for fact, bullets in facts:
        notes.extend([f"## {fact}", ""])
        for description, meaning in bullets:
            sym_id = uuid_for(uuid_offset + order)
            notes.append(f"* {{sym:{sym_id}}} {description} -> {meaning}; Transcript \"evidence\" @ 0:01")
            if not omit_canvas_symbol or order > 0:
                canvas_symbols.append(
                    {
                        "id": sym_id,
                        "kind": "region",
                        "ref": None,
                        "shape": "rect",
                        "x": 10,
                        "y": 10,
                        "width": 100,
                        "height": 80,
                        "rotation": 0,
                        "layerIndex": order,
                        "groupId": None,
                    }
                )
            order += 1
        notes.append("")
    canvas = {"schemaVersion": 1, "backdrop": {"ref": None, "uploadedBlobId": None}, "symbols": canvas_symbols}
    meta = {"schemaVersion": 2, "name": title}
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr(f"{folder}/notes.md", "\n".join(notes))
        zf.writestr(f"{folder}/canvas.json", json.dumps(canvas))
        zf.writestr(f"{folder}/meta.json", json.dumps(meta))
    return path


class BundleParsingTest(unittest.TestCase):
    def test_extracts_notes_and_ignores_uuid_for_content(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            gold = parse_bundle(
                make_bundle(
                    root / "gold" / "abducens.engram.zip",
                    "Abducens",
                    [("Abducens nerve is CN VI", [("six flags sign", "cranial nerve VI")])],
                    uuid_offset=0,
                )
            )
            generated = parse_bundle(
                make_bundle(
                    root / "gen" / "abducens.engram.zip",
                    "Abducens",
                    [("Abducens nerve is CN VI", [("six flags sign", "cranial nerve VI")])],
                    uuid_offset=50,
                )
            )

            result = compare_bundles(generated, gold, require_lint=False)

        self.assertEqual(result["status"], "pass")
        self.assertEqual(result["metrics"]["symbolRecall"], 1.0)
        self.assertEqual(result["metrics"]["symbolPrecision"], 1.0)

    def test_import_check_rejects_unknown_symbol_uuid(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            bundle = parse_bundle(
                make_bundle(
                    Path(d) / "bad.engram.zip",
                    "Bad",
                    [("Fact", [("visible object", "meaning")])],
                    omit_canvas_symbol=True,
                )
            )

            result = validate_importable(bundle)

        self.assertFalse(result["ok"])
        self.assertEqual(result["issues"][0]["code"], "unknown-symbol-uuid")


class ScoringRegressionTest(unittest.TestCase):
    def test_missing_symbol_lowers_recall_and_fails(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            gold = parse_bundle(
                make_bundle(
                    root / "gold.engram.zip",
                    "Two Symbols",
                    [("Fact", [("first object", "first meaning"), ("second object", "second meaning")])],
                )
            )
            generated = parse_bundle(
                make_bundle(
                    root / "generated.engram.zip",
                    "Two Symbols",
                    [("Fact", [("first object", "first meaning")])],
                    uuid_offset=20,
                )
            )

            result = compare_bundles(generated, gold, require_lint=False)

        self.assertEqual(result["status"], "fail")
        self.assertEqual(result["metrics"]["symbolRecall"], 0.5)
        self.assertEqual(len(result["missingSymbols"]), 1)

    def test_wrong_meaning_lowers_meaning_similarity_and_fails(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            gold = parse_bundle(
                make_bundle(
                    root / "gold.engram.zip",
                    "Wrong Meaning",
                    [("Fact", [("same visible object", "correct medical meaning")])],
                )
            )
            generated = parse_bundle(
                make_bundle(
                    root / "generated.engram.zip",
                    "Wrong Meaning",
                    [("Fact", [("same visible object", "incorrect unrelated meaning")])],
                    uuid_offset=20,
                )
            )

            result = compare_bundles(generated, gold, require_lint=False)

        self.assertEqual(result["status"], "fail")
        self.assertLess(result["metrics"]["meaningSimilarity"], 0.9)

    def test_local_semantic_judge_handles_configured_synonym(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            gold = parse_bundle(
                make_bundle(
                    root / "gold.engram.zip",
                    "MI",
                    [("Myocardial infarction", [("broken heart", "myocardial infarction")])],
                )
            )
            generated = parse_bundle(
                make_bundle(
                    root / "generated.engram.zip",
                    "MI",
                    [("Heart attack", [("broken heart", "heart attack")])],
                    uuid_offset=20,
                )
            )

            plain = compare_bundles(generated, gold, require_lint=False)
            judged = compare_bundles(generated, gold, require_lint=False, semantic_judge=True)

        self.assertEqual(plain["status"], "fail")
        self.assertEqual(judged["status"], "pass")


class GoldIndexTest(unittest.TestCase):
    def test_scans_only_slug_named_gold_bundles(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            make_bundle(root / "match" / "match.engram.zip", "Match", [("Fact", [("object", "meaning")])])
            make_bundle(root / "other" / "wrong-name.engram.zip", "Wrong", [("Fact", [("object", "meaning")])])

            entries = scan_gold_root(root)

        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["slug"], "match")

    def test_writes_cache_outside_gold_root(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            base = Path(d)
            gold_root = base / "gold"
            cache = base / "eval" / "gold_index.json"
            make_bundle(gold_root / "match" / "match.engram.zip", "Match", [("Fact", [("object", "meaning")])])

            index = write_gold_index(gold_root, cache)

            self.assertTrue(cache.exists())
            self.assertEqual(index["entries"][0]["slug"], "match")


class AuthorPacketTest(unittest.TestCase):
    def test_coverage_targets_and_backdrop_candidates_are_written(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            run_dir = Path(d)
            (run_dir / "video_info.json").write_text(
                json.dumps({"title": "Levetiracetam", "course": "Pharmacology", "path": "video.mp4"}),
                encoding="utf-8",
            )
            (run_dir / "keyframes.json").write_text(
                json.dumps(
                    [
                        {"index": 0, "timestamp_ms": 0, "image": "intro.jpg", "selected_as_backdrop": False},
                        {"index": 1, "timestamp_ms": 42000, "image": "scene.jpg", "selected_as_backdrop": True},
                    ]
                ),
                encoding="utf-8",
            )
            transcript = {
                "segments": [
                    {"start_ms": 1000, "text": "The Keppra captain treats seizures."},
                    {"start_ms": 2000, "text": "Side effects include somnolence."},
                ]
            }
            ocr = {"segments": [{"start_ms": 2000, "text": "Somnolence Seizures"}]}
            (run_dir / "transcript.json").write_text(json.dumps(transcript), encoding="utf-8")
            (run_dir / "ocr.json").write_text(json.dumps(ocr), encoding="utf-8")

            coverage_path = write_coverage_targets(run_dir)
            backdrop_path = write_backdrop_candidates(run_dir)
            packet = write_author_packet(run_dir)
            coverage = json.loads(coverage_path.read_text(encoding="utf-8"))
            backdrop = json.loads(backdrop_path.read_text(encoding="utf-8"))
            packet_text = packet.read_text(encoding="utf-8")

        self.assertGreaterEqual(len(coverage["targets"]), 2)
        self.assertEqual(len(backdrop["candidates"]), 2)
        self.assertIn("coverage_targets.json", packet_text)
        self.assertIn("backdrop_candidates.json", packet_text)
        self.assertIn("recall contract", packet_text)
        self.assertIn("blocking recall failures", packet_text)

    def test_coverage_captures_abducens_damage_consequence_window(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            run_dir = Path(d)
            transcript = {
                "segments": [
                    {"start_ms": 181000, "text": "It should be easy to reason that damage to one of the Abducens nerves would lead"},
                    {
                        "start_ms": 186000,
                        "text": "to inward deviation of the affected eye towards the midline, manifesting as horizontal double",
                    },
                    {"start_ms": 191000, "text": "vision or horizontal deplopia."},
                ]
            }
            (run_dir / "transcript.json").write_text(json.dumps(transcript), encoding="utf-8")

            coverage = build_coverage_targets(run_dir)

        critical = [t for t in coverage["targets"] if t["source"] == "critical-consequence"]
        self.assertTrue(critical)
        terms = set(critical[0]["critical_terms"])
        self.assertTrue({"damage", "deviation", "midline", "horizontal", "diplopia"} <= terms)

    def test_coverage_captures_anterior_lesion_hyperthermia_window(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            run_dir = Path(d)
            transcript = {
                "segments": [
                    {"start_ms": 151000, "text": "the patient with lesions in the anterior nucleus would experience"},
                    {"start_ms": 156000, "text": "hyperthemia or overheating since they are less able to cool down their bodies."},
                ]
            }
            ocr = {"segments": [{"start_ms": 150000, "text": "Lesions cause Hyperthermia"}]}
            (run_dir / "transcript.json").write_text(json.dumps(transcript), encoding="utf-8")
            (run_dir / "ocr.json").write_text(json.dumps(ocr), encoding="utf-8")

            coverage = build_coverage_targets(run_dir)

        critical_terms = {
            term
            for target in coverage["targets"]
            if target["priority"] == "high"
            for term in target["critical_terms"]
        }
        self.assertIn("lesions", critical_terms)
        self.assertIn("hyperthermia", critical_terms)

    def test_sparse_or_early_backdrop_requests_wider_keyframes(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            run_dir = Path(d)
            (run_dir / "keyframes.json").write_text(
                json.dumps([{"index": 0, "timestamp_ms": 0, "selected_as_backdrop": True}]),
                encoding="utf-8",
            )

            self.assertTrue(needs_wider_keyframes(run_dir))

    def test_author_packet_prioritizes_mvs_cue_segments_and_truncates_long_transcript(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            run_dir = Path(d)
            (run_dir / "video_info.json").write_text(
                json.dumps({"title": "Dense", "path": "video.mp4"}), encoding="utf-8"
            )
            (run_dir / "keyframes.json").write_text("[]", encoding="utf-8")
            transcript = {
                "segments": [
                    {"start_ms": i * 1000, "text": f"ordinary transcript row {i}"}
                    for i in range(130)
                ]
            }
            transcript["segments"][125] = {
                "start_ms": 125000,
                "text": "The broken heart represents myocardial infarction.",
            }
            (run_dir / "transcript.json").write_text(json.dumps(transcript), encoding="utf-8")

            packet = write_author_packet(run_dir)
            text = packet.read_text(encoding="utf-8")

        self.assertIn("## MVS Cue Segments", text)
        self.assertIn("broken heart represents myocardial infarction", text)
        self.assertIn("additional transcript rows omitted", text)
        self.assertIn("ordinary transcript row 119", text)
        self.assertNotIn("ordinary transcript row 120", text)


class Utf8SubprocessTest(unittest.TestCase):
    def test_run_subprocess_handles_non_latin_output(self) -> None:
        proc = run_subprocess([sys.executable, "-c", "print('≈')"])

        self.assertEqual(proc.returncode, 0)
        self.assertIn("≈", proc.stdout)


if __name__ == "__main__":
    unittest.main()
