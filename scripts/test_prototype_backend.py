"""Real MongoDB + all-service release, recovery, backup/restore and rollback acceptance."""
import copy
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import uuid

from pymongo import MongoClient
from prototype_release import (backup, build, check_runtime, import_release, read_bundle,
                               validate_bundle, verify_stored, write_bundle)
from import_research_data import collections, import_package, environment
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from backend import Stack, check, request


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


class PrototypeBackendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bundle = build()

    def test_release_rejects_changed_payloads_artifacts_and_snapshot_states(self):
        self.assertEqual(build()['manifest'], self.bundle['manifest'])
        check_runtime(self.bundle)
        for mutate in [
            lambda b: b['package'][0]['crops'][0]['water_need_mm'].update(min=0),
            lambda b: b['package'][1].update(status='approved'),
            lambda b: b['package'][2].pop(),
            lambda b: b['manifest'].update(release_id='another-release'),
            lambda b: b['artifacts'].update({'docs/METHOD.md':'Y29ycnVwdA=='}),
        ]:
            broken=copy.deepcopy(self.bundle)
            mutate(broken)
            with self.assertRaises(ValueError):
                validate_bundle(broken)

    def test_real_backend_import_restart_outage_restore_and_rollback(self):
        env=environment()
        binary=shutil.which(env.get('MONGOD_BIN','mongod'))
        self.assertIsNotNone(binary,'Install MongoDB Community 8.0 and set MONGOD_BIN')
        with tempfile.TemporaryDirectory(prefix='agrilens-backend-') as temp:
            folder=Path(temp)
            mongo_port=free_port()
            mongo=None
            log=(folder/'mongo.log').open('a')
            uri=f'mongodb://127.0.0.1:{mongo_port}'
            tag=uuid.uuid4().hex[:16]
            names=[f'backend_{tag}_{owner}_fixtures' for owner in ('crops','climate')]
            restored_names=[f'restored_{tag}_{owner}_fixtures' for owner in ('crops','climate')]
            partial_names=[f'partial_{tag}_{owner}_fixtures' for owner in ('crops','climate')]
            env.update(HOST='127.0.0.1',MONGODB_URI=uri,CROP_DB_NAME=names[0],CLIMATE_DB_NAME=names[1],
                       CROP_PORT=str(free_port()),CLIMATE_PORT=str(free_port()),COMPARISON_PORT=str(free_port()))
            def start_mongo():
                process=subprocess.Popen([binary,'--dbpath',str(folder/'mongo'),'--port',str(mongo_port),
                                          '--bind_ip','127.0.0.1','--wiredTigerCacheSizeGB','0.25','--nounixsocket'],
                                         stdout=log,stderr=subprocess.STDOUT)
                deadline=time.monotonic()+20
                while time.monotonic()<deadline:
                    self.assertIsNone(process.poll(),'Private MongoDB failed to start')
                    try:
                        with MongoClient(uri,serverSelectionTimeoutMS=100,connectTimeoutMS=100) as probe:
                            probe.admin.command('ping')
                            return process
                    except Exception:
                        time.sleep(.1)
                process.terminate();process.wait(timeout=10)
                self.fail('Private MongoDB startup timed out')
            def stop_mongo(process):
                process.terminate();process.wait(timeout=15)
            (folder/'mongo').mkdir()
            try:
                mongo=start_mongo()
                with MongoClient(uri,tz_aware=True,serverSelectionTimeoutMS=2000) as client:
                    self.assertTrue(client.server_info()['version'].startswith('8.0.'))
                    import_release(client,names,self.bundle)
                    original=backup(client,names,self.bundle)
                    import_release(client,names,self.bundle)
                    self.assertEqual(backup(client,names,self.bundle),original,'Repeated import must not change stored evidence')
                    # Simulate interruption after a partial daily import. It must be unreadable until resumed.
                    stores=collections(client,partial_names,install=True)
                    crop,climate,rows=copy.deepcopy(self.bundle['package'])
                    climate['status']='staging'
                    stores[0].insert_one(crop);stores[1].insert_one(climate)
                    stores[2].insert_many(rows[:100])
                    with self.assertRaises(ValueError):
                        verify_stored(client,partial_names,self.bundle)
                    import_release(client,partial_names,self.bundle)
                    verify_stored(client,partial_names,self.bundle)
                    file=folder/'backup.json'
                    write_bundle(file,original)
                    recovered=read_bundle(file)
                    self.assertEqual(recovered['manifest'],self.bundle['manifest'])
                    import_release(client,restored_names,recovered)
                    verify_stored(client,restored_names,recovered)
                    for collection,document in zip(collections(client,restored_names),recovered['package'][:2]):
                        self.assertIsNone(collection.find_one({'_id':document['_id']})['approval'])
                    with Stack(self.bundle,env,folder/'services') as stack:
                        first=check(stack)
                        self.assertEqual(first['baseline_water_mm'],{'min':1900,'max':2900})
                        self.assertEqual(first['baseline_hot_days'],279.125)
                        self.assertEqual(first['valid_baselines_checked'],16)
                        with self.assertRaisesRegex(ValueError, 'already in use'):
                            with Stack(self.bundle,env,folder/'conflicting-services'):
                                self.fail('Occupied ports must not be adopted as this process stack')
                        before=request(stack.urls['comparison'],'/api/config')[1]
                        stack.stop('climate')
                        payload={'region_id':before['region']['id'],'baseline':before['sample_baseline'],'priority':'water','scenario':'average'}
                        code,error,_=request(stack.urls['comparison'],'/api/compare',payload)
                        self.assertEqual((code,error['error']['code']),(503,'SERVICE_UNAVAILABLE'))
                        stack.start('climate');stack.ready('climate');stack.ready('comparison')
                        self.assertEqual(check(stack),first,'Service restart changed the selected result')
                        stop_mongo(mongo);mongo=None
                        code,error,_=request(stack.urls['comparison'],'/api/compare',payload)
                        self.assertEqual((code,error['error']['code']),(503,'SERVICE_UNAVAILABLE'))
                        mongo=start_mongo()
                        for owner in ('crops','climate','comparison'):
                            stack.ready(owner)
                        self.assertEqual(check(stack),first,'Database recovery changed the selected result')
                    # Verify HTTP behavior after restore into fresh databases.
                    restored_env={**env,'CROP_DB_NAME':restored_names[0],'CLIMATE_DB_NAME':restored_names[1]}
                    with Stack(recovered,restored_env,folder/'restored-services') as stack:
                        self.assertEqual(check(stack),first,'Restored release differs over real HTTP')
                    # Two distinct content-addressed releases coexist; select one, then explicitly roll back.
                    next_bundle=build(['soybean','wheat','maize','wheat'])
                    self.assertNotEqual(next_bundle['manifest']['release_id'],self.bundle['manifest']['release_id'])
                    import_release(client,names,next_bundle)
                    with Stack(next_bundle,env,folder/'next-services') as stack:
                        self.assertNotEqual(check(stack)['baseline_water_mm'],first['baseline_water_mm'])
                    with Stack(self.bundle,env,folder/'rollback-services') as stack:
                        self.assertEqual(check(stack),first,'Rollback did not restore exact previous release')
                    # A conflicting sealed revision is rejected, never repaired by overwriting it.
                    stores=collections(client,partial_names)
                    stores[0].update_one({'_id':self.bundle['manifest']['crop_catalog_id']},{'$set':{'crops.0.water_need_mm.min':123}})
                    with self.assertRaises(ValueError):
                        import_release(client,partial_names,self.bundle)
            finally:
                if mongo is not None and mongo.poll() is None:
                    stop_mongo(mongo)
                log.close()


if __name__=='__main__':
    unittest.main()
