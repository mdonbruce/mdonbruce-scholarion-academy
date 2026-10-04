import json,tempfile,time,unittest
from pathlib import Path
from governed_service import Service,Denied,Conflict
import catalog_review,platform_status
class PlatformBoundaryTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.s=Service(self.tmp.name);self.tokens={v['role']:k for k,v in self.s.identities.items()}
 def tearDown(self):self.tmp.cleanup()
 def test_single_database_and_identity_plane(self):
  self.assertEqual([p.name for p in Path(self.tmp.name).glob('*.sqlite3')],['scholarion.sqlite3'])
  self.assertEqual({v['tenant'] for v in self.s.identities.values()},{'scholarion'})
  before=self.s.db_accesses
  with self.assertRaises(Denied):self.s.connect('outside')
  with self.assertRaises(Denied):self.s.identity(self.tokens['student'],'outside')
  self.assertEqual(before,self.s.db_accesses)
 def test_old_identity_ignored_without_deleting_files(self):
  p=Path(self.tmp.name)/'identities.json';config=json.loads(p.read_text());config['legacy']={'tenant':'outside','expires':time.time()+1000,'role':'student','user':'legacy'};p.write_text(json.dumps(config));s=Service(self.tmp.name)
  self.assertNotIn('legacy',s.identities);self.assertIn('legacy',json.loads(p.read_text()))
 def test_claim_gate_and_roles(self):
  args=(self.s,self.tokens['instructor'],'scholarion','AIM310')
  r=catalog_review.command(*args,'review',{'title':'Accredited degree','body':'University partner program'},Denied,Conflict)
  self.assertEqual(r['status'],'BLOCKED');self.assertFalse(r['published'])
  with self.assertRaises(Denied):catalog_review.command(self.s,self.tokens['student'],'scholarion','AIM310','review',{},Denied,Conflict)
  with self.assertRaises(Denied):catalog_review.command(self.s,self.tokens['instructor'],'scholarion','OTHER','list',{},Denied,Conflict)
  with self.assertRaises(ValueError):catalog_review.command(*args,'publish',{},Denied,Conflict)
  self.assertTrue(catalog_review.findings('ＡＣＣＲＥＤＩＴＥＤ','course'))
 def test_status_never_asserts_acceptance(self):
  s=platform_status.snapshot();self.assertFalse(s['productionAllowed']);self.assertTrue(all(x['status']=='NOT VERIFIED' for x in s['acceptance']))
if __name__=='__main__':unittest.main()
