"""Regression checks for staging integrity and publication boundaries."""

import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from build_research_data import ROOT, RAW_PATH, canonical, prepare, read

REVISION = "6777af9a0e6b12c9f328d102b63d6cf87f0eadb1"


class ResearchImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in (RAW_PATH, "data/processed/region_config.json", "data/processed/crop_catalog.json",
                     "data/processed/climate_daily_clean.json", "docs/SOURCES.md"):
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, target)

    def edit(self, name, change):
        value = read(self.root, name)
        change(value)
        (self.root / name).write_text(json.dumps(value))

    def test_reproducible_complete_unapproved_package(self):
        outputs = prepare(self.root, REVISION)
        self.assertEqual(outputs, prepare(self.root, REVISION))
        catalog = json.loads(outputs["data/processed/mongodb/crop_catalog_document.json"])
        manifest = json.loads(outputs["data/processed/mongodb/climate_dataset_document.json"])
        rows = [json.loads(line) for line in outputs["data/processed/mongodb/climate_daily.jsonl"].splitlines()]
        climate = json.loads(outputs["data/processed/climate_daily_clean.json"])
        for doc in (catalog, manifest):
            self.assertEqual(doc["status"], "staging")
            self.assertIsNone(doc["approval"])
            self.assertEqual(doc["decision_revision"], REVISION)
        self.assertEqual(manifest["provenance"]["time_standard"], "LST")
        self.assertEqual(manifest["raw_artifact"]["sha256"], hashlib.sha256((self.root / RAW_PATH).read_bytes()).hexdigest())
        self.assertEqual(len(rows), 3653)
        self.assertEqual(len({r["date"] for r in rows}), 3653)
        self.assertTrue(all(r["dataset_id"] == manifest["_id"] and r["schema_version"] == 1 for r in rows))
        self.assertTrue(all(s["title"] for s in catalog["sources"]))
        metadata = {k: v for k, v in climate.items() if k != "daily"}
        normalized = {"metadata": metadata, "daily": climate["daily"], "parameters": manifest["parameters"],
                      "method_ref": manifest["validation"]["method_ref"]}
        self.assertEqual(hashlib.sha256(canonical(normalized)).hexdigest(), manifest["validation"]["normalized_sha256"])
        fixture = json.loads(outputs["data/fixtures/mock_crop_catalog.json"])
        ids = {s["id"] for s in fixture["sources"]}
        self.assertTrue(all(set(c["source_ids"]) <= ids for c in fixture["crops"]))
        self.assertTrue(all(c["eligible_for_live"] is False for c in fixture["crops"]))
        self.assertEqual(fixture["evidence_status"], "pending_research_and_lead_review")

    def test_missing_date_rejected(self):
        self.edit(RAW_PATH, lambda x: x["properties"]["parameter"]["T2M_MAX"].pop("20240229"))
        with self.assertRaisesRegex(ValueError, "dates"):
            prepare(self.root, REVISION)

    def test_plain_source_titles_with_optional_blank_lines(self):
        ledger_path = self.root / "docs/SOURCES.md"
        original = ledger_path.read_text().replace("- Title:", "- **Title:**")
        expected = prepare(self.root, REVISION)
        plain = original.replace("- **Title:**", "- Title:")
        for ledger in (original, plain, plain.replace("`\n- Title:", "`\n\n- Title:")):
            with self.subTest(blank_line="`\n\n- Title:" in ledger):
                ledger_path.write_text(ledger)
                self.assertEqual(prepare(self.root, REVISION), expected)

    def test_missing_title_does_not_use_next_sources_title(self):
        ledger_path = self.root / "docs/SOURCES.md"
        lines = ledger_path.read_text().replace("- **Title:**", "- Title:").splitlines(keepends=True)
        first_title = next(i for i, line in enumerate(lines) if line.startswith("- Title:"))
        del lines[first_title]
        ledger_path.write_text("".join(lines))
        with self.assertRaisesRegex(ValueError, "Missing ledger title for SRC-NASA-POWER-DAILY"):
            prepare(self.root, REVISION)

    def test_sentinel_rejected(self):
        self.edit(RAW_PATH, lambda x: x["properties"]["parameter"]["RH2M"].update({"20240229": -999}))
        with self.assertRaisesRegex(ValueError, "measurement"):
            prepare(self.root, REVISION)

    def test_wrong_region_rejected(self):
        self.edit(RAW_PATH, lambda x: x["geometry"].update({"coordinates": [30.9388, 31.1107, 0]}))
        with self.assertRaisesRegex(ValueError, "coordinates"):
            prepare(self.root, REVISION)

    def test_unresolved_crop_source_rejected(self):
        self.edit("data/processed/crop_catalog.json", lambda x: x["crops"][0]["source_ids"].append("unknown"))
        with self.assertRaisesRegex(ValueError, "Unresolved"):
            prepare(self.root, REVISION)

    def test_mutable_revision_rejected(self):
        with self.assertRaisesRegex(ValueError, "exact"):
            prepare(self.root, "HEAD")

    def test_approved_manifest_rejected_without_validator_writes(self):
        for name, data in prepare(self.root, REVISION).items():
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        shutil.copytree(ROOT / "scripts", self.root / "scripts", ignore=shutil.ignore_patterns("__pycache__"))
        command = [sys.executable, str(self.root / "scripts/verify_schema_compliance.py")]
        valid = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(valid.returncode, 0, valid.stdout + valid.stderr)
        manifest = "data/processed/mongodb/climate_dataset_document.json"
        self.edit(manifest, lambda x: x.update({"status": "approved"}))
        before = {p: p.read_bytes() for p in (self.root / "data").rglob("*") if p.is_file()}
        invalid = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(invalid.returncode, 1, invalid.stdout + invalid.stderr)
        self.assertIn("Stale generated files", invalid.stdout)
        self.assertEqual(before, {p: p.read_bytes() for p in before})


if __name__ == "__main__":
    unittest.main()
