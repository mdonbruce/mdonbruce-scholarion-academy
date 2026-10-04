import tempfile,unittest,json,sqlite3
from pathlib import Path
from governed_service import Service
import recovery
class RecoveryTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.s=Service(self.root)
 def tearDown(self):self.tmp.cleanup()
 def test_snapshot_survives_live_changes_and_drill_never_overwrites(self):
  key=recovery.backup(self.root)
  with self.s.connect('scholarion') as db:db.execute("UPDATE sources SET title='Changed after backup' WHERE id='study-1'")
  result=recovery.drill(self.root,key);self.assertEqual(result['status'],'PASSED')
  with self.s.connect('scholarion') as db:self.assertEqual(db.execute("SELECT title FROM sources WHERE id='study-1'").fetchone()[0],'Changed after backup')
  self.assertNotIn('tables',recovery.status(self.root));self.assertFalse(result['productionRestore'])
 def test_tamper_rejected(self):
  key=recovery.backup(self.root);p=self.root/'recovery'/key/'snapshot.sqlite3'
  with p.open('ab') as f:f.write(b'tampered')
  with self.assertRaises(ValueError):recovery.drill(self.root,key)
  self.assertEqual(recovery.status(self.root)['status'],'NOT RUN')
 def test_path_rejected(self):
  with self.assertRaises(ValueError):recovery.drill(self.root,'../../scholarion')
 def test_manifest_counts_verified(self):
  key=recovery.backup(self.root);p=self.root/'recovery'/key/'manifest.json';m=json.loads(p.read_text());m['tables']['sources']=999;p.write_text(json.dumps(m))
  with self.assertRaises(ValueError):recovery.drill(self.root,key)
if __name__=='__main__':unittest.main()
