import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from collect_bundles import (
    build_basename,
    classify,
    collect,
    dedupe_name,
    sanitize_component,
)


class SanitizeTest(unittest.TestCase):
    def test_replaces_course_path_separator(self):
        self.assertEqual(
            sanitize_component("Pixorize Biochemistry / 25. In Progress (4)"),
            "Pixorize Biochemistry - 25. In Progress (4)",
        )

    def test_strips_illegal_windows_chars(self):
        self.assertEqual(sanitize_component('a:b*c?"d<e>f|g'), "a-b-c--d-e-f-g")

    def test_keeps_inline_hyphen_without_spaces(self):
        self.assertEqual(sanitize_component("Hand-Foot-Mouth"), "Hand-Foot-Mouth")

    def test_collapses_whitespace_and_trims_edges(self):
        self.assertEqual(sanitize_component("  spaced   out . "), "spaced out")


class BasenameTest(unittest.TestCase):
    def test_joins_source_course_name(self):
        self.assertEqual(
            build_basename(
                "Pixorize", "Pixorize Biochemistry / 25. In Progress (4)", "1. ABG"
            ),
            "Pixorize - Pixorize Biochemistry - 25. In Progress (4) - 1. ABG",
        )

    def test_drops_empty_parts(self):
        self.assertEqual(
            build_basename("Picmonic", "", "Penicillin"), "Picmonic - Penicillin"
        )

    def test_collapses_duplicate_source_and_course(self):
        self.assertEqual(
            build_basename("Picmonic", "Picmonic", "Penicillin"),
            "Picmonic - Penicillin",
        )

    def test_caps_length(self):
        base = build_basename("S", "C", "x" * 300)
        self.assertLessEqual(len(base), 150)


class DedupeTest(unittest.TestCase):
    def test_suffixes_on_collision(self):
        used: set[str] = set()
        self.assertEqual(dedupe_name("Foo", used), "Foo.engram.zip")
        self.assertEqual(dedupe_name("Foo", used), "Foo (2).engram.zip")
        self.assertEqual(dedupe_name("Foo", used), "Foo (3).engram.zip")

    def test_case_insensitive_collision(self):
        used: set[str] = set()
        dedupe_name("Bar", used)
        self.assertEqual(dedupe_name("bar", used), "bar (2).engram.zip")


class ClassifyTest(unittest.TestCase):
    def test_ready_id_matches_ledger(self):
        self.assertEqual(classify(382, {"382"}), "study-ready")

    def test_unready_id(self):
        self.assertEqual(classify(99, {"382"}), "built-unvetted")

    def test_none_id_is_unvetted(self):
        self.assertEqual(classify(None, {"382"}), "built-unvetted")


def _make_run(root: Path, dirname: str, *, meta=None, draft=False):
    run = root / dirname
    run.mkdir(parents=True)
    if meta is not None:
        zpath = run / f"{dirname}.engram.zip"
        with zipfile.ZipFile(zpath, "w") as zf:
            zf.writestr(f"{dirname}/meta.json", json.dumps(meta))
            zf.writestr(f"{dirname}/notes.md", "# x")
    if draft:
        (run / "draft_symbols.json").write_text("{}", encoding="utf-8")
    return run


class CollectTest(unittest.TestCase):
    def test_splits_buckets_copies_and_reports_gaps(self):
        with tempfile.TemporaryDirectory() as tmp:
            out_root = Path(tmp)
            _make_run(
                out_root,
                "1-abg",
                meta={
                    "name": "1. ABG",
                    "sourceVideo": {
                        "id": 382,
                        "source": "Pixorize",
                        "course": "Biochem / 25",
                    },
                },
            )
            _make_run(
                out_root,
                "penicillin",
                meta={
                    "name": "Penicillin",
                    "sourceVideo": {"id": 5, "source": "Picmonic", "course": None},
                },
            )
            _make_run(out_root, "authored-only", draft=True)  # gap: no zip
            _make_run(out_root, "extraction-only")  # gap: nothing
            (out_root / "_overnight").mkdir()  # management dir, skipped

            dest = out_root / "_engram-import"
            summary = collect(out_root, dest, ready_keys={"382"}, dry_run=False)

            self.assertEqual(summary["copied"]["study-ready"], 1)
            self.assertEqual(summary["copied"]["built-unvetted"], 1)
            self.assertEqual(summary["total"], 2)
            self.assertEqual(summary["gaps"]["authoredNotPackaged"], 1)
            self.assertEqual(summary["gaps"]["extractionOnly"], 1)

            ready = list((dest / "study-ready").glob("*.engram.zip"))
            unvetted = list((dest / "built-unvetted").glob("*.engram.zip"))
            self.assertEqual(
                [p.name for p in ready], ["Pixorize - Biochem - 25 - 1. ABG.engram.zip"]
            )
            self.assertEqual(
                [p.name for p in unvetted], ["Picmonic - Penicillin.engram.zip"]
            )
            self.assertTrue((dest / "GAPS.md").exists())

    def test_dry_run_copies_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            out_root = Path(tmp)
            _make_run(
                out_root,
                "1-abg",
                meta={
                    "name": "1. ABG",
                    "sourceVideo": {
                        "id": 382,
                        "source": "Pixorize",
                        "course": "Biochem",
                    },
                },
            )
            dest = out_root / "_engram-import"
            summary = collect(out_root, dest, ready_keys={"382"}, dry_run=True)
            self.assertEqual(summary["total"], 1)
            self.assertFalse(dest.exists())


if __name__ == "__main__":
    unittest.main()
