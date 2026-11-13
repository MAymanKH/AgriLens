"""Integration checks against real local MongoDB in disposable *_fixtures databases.

Run: python -m unittest discover -s scripts -p test_mongodb_import.py
"""

import copy
import datetime as dt
import os
import subprocess
import sys
import unittest
import uuid

from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError, WriteError

from import_research_data import (ROOT, collections, environment, import_lock,
                                  import_package, inspect_stored, load_package, settings)


class MongoImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = environment()
        settings(cls.env)
        cls.client = MongoClient(cls.env["MONGODB_URI"], tz_aware=True, serverSelectionTimeoutMS=2000)
        cls.client.admin.command("ping")
        cls.package = load_package()

    @classmethod
    def tearDownClass(cls):
        cls.client.close()

    def setUp(self):
        tag = uuid.uuid4().hex[:16]
        self.names = [f"agrilens_import_{tag}_{owner}_fixtures" for owner in ("crops", "climate")]
        for name in self.names:
            self.addCleanup(self.client.drop_database, name)
        self.stores = collections(self.client, self.names, install=True)

    def test_actual_import_dates_and_repeat_are_unchanged(self):
        self.assertEqual(import_package(self.stores, self.package), 3653)
        first = [list(store.find().sort("_id", 1)) for store in self.stores]
        self.assertEqual(import_package(self.stores, self.package), 0)
        self.assertEqual(first, [list(store.find().sort("_id", 1)) for store in self.stores])
        self.assertEqual(inspect_stored(self.stores, self.package, complete=True), 3653)
        crop = self.stores[0].find_one()
        climate = self.stores[1].find_one()
        self.assertIsInstance(crop["created_at"], dt.datetime)
        self.assertIsInstance(climate["provenance"]["retrieved_at"], dt.datetime)
        self.assertIsNone(crop["approval"])
        self.assertEqual(climate["status"], "staging")
        self.assertEqual(self.stores[1].count_documents({"status": "approved"}), 0)

    def test_partial_import_resumes(self):
        self.stores[2].insert_many(copy.deepcopy(self.package[2][:100]))
        self.assertEqual(import_package(self.stores, self.package), 3553)
        inspect_stored(self.stores, self.package, complete=True)

    def test_conflict_is_rejected_before_other_data_writes(self):
        changed = dict(self.package[2][0], tmax_c=55)
        self.stores[2].insert_one(changed)
        with self.assertRaisesRegex(ValueError, "conflicts with source"):
            import_package(self.stores, self.package)
        self.assertEqual(self.stores[0].count_documents({}), 0)
        self.assertEqual(self.stores[1].count_documents({}), 0)
        self.assertEqual(self.stores[2].find_one()["tmax_c"], 55)

    def test_published_revision_is_not_changed(self):
        self.stores[0].insert_one(dict(self.package[0], status="approved", approval={}))
        with self.assertRaisesRegex(ValueError, "conflicts with source"):
            import_package(self.stores, self.package)
        self.assertEqual(self.stores[0].find_one()["status"], "approved")
        self.assertEqual(self.stores[2].count_documents({}), 0)

    def test_unique_index_and_schema_are_enforced(self):
        row = self.package[2][0]
        self.stores[2].insert_one(copy.deepcopy(row))
        with self.assertRaises(DuplicateKeyError):
            self.stores[2].insert_one(copy.deepcopy(row))
        with self.assertRaises(WriteError):
            self.stores[0].insert_one(dict(self.package[0], created_at="not a BSON date"))
        with self.assertRaises(WriteError):
            self.stores[2].insert_one(dict(row, date="2016-01-02", schema_version=2))

    def test_incompatible_schema_is_not_replaced(self):
        self.client[self.names[0]].command("collMod", "crop_catalogs", validator={})
        with self.assertRaisesRegex(ValueError, "Incompatible collection validator"):
            collections(self.client, self.names, install=True)
        self.assertEqual(self.stores[0].options().get("validator", {}), {})

    def test_import_lock_prevents_second_process(self):
        identity = "regression-" + uuid.uuid4().hex
        code = "from import_research_data import import_lock\nwith import_lock(" + repr(identity) + "):\n print('acquired')"
        env = dict(os.environ, PYTHONPATH=str(ROOT / "scripts"))
        with import_lock(identity):
            result = subprocess.run([sys.executable, "-c", code], env=env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Another import", result.stderr)
        with import_lock(identity):
            pass

    def test_remote_connection_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "loopback"):
            settings(dict(self.env, MONGODB_URI="mongodb://example.com:27017"))


if __name__ == "__main__":
    unittest.main()
