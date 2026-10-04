import unittest,tempfile,sqlite3
from governed_service import Service,Denied,Conflict
import curriculum_commons as commons,program_shells
class CommonsTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.s=Service(self.tmp.name);self.tokens={v['role']:k for k,v in self.s.identities.items()}
  program_shells.command(self.s,self.tokens['instructor'],'scholarion','AIM310','load',{},Denied,Conflict)
  self.call('load');self.m=next(m for m in self.call('list')['modules'] if 15 in m['programs'])
 def tearDown(self):self.tmp.cleanup()
 def call(self,a,token=None,course='AIM310',**d):return commons.command(self.s,token or self.tokens['instructor'],'scholarion',course,a,d,Denied,Conflict)
 def test_revision_preserves_pin_and_explicit_upgrade(self):
  self.call('pin',module=self.m['module'],version=1,program=15,revision=0)
  self.call('revise',module=self.m['module'],version=1,title='Revised design',body='Original reviewed outline')
  self.assertEqual(self.call('list')['pins'][0]['version'],1)
  self.call('pin',module=self.m['module'],version=2,program=15,revision=1)
  self.assertEqual(self.call('list')['pins'][0]['version'],2)
  with self.assertRaises(Conflict):self.call('pin',module=self.m['module'],version=1,program=15,revision=1)
  with self.s.connect('scholarion') as db:self.assertEqual(db.execute('SELECT count(*) FROM commons_pin_history').fetchone()[0],2)
 def test_immutable_versions_and_history(self):
  self.call('pin',module=self.m['module'],version=1,program=15,revision=0)
  with self.s.connect('scholarion') as db:
   for table in ['commons_versions','commons_pin_history']:
    with self.assertRaises(sqlite3.IntegrityError):db.execute('DELETE FROM '+table)
 def test_idempotency_stale_revision_and_invalid_mapping(self):
  n=len(self.call('list')['modules']);self.call('load');self.assertEqual(len(self.call('list')['modules']),n)
  self.call('revise',module=self.m['module'],version=1,title='New',body='Design')
  with self.assertRaises(Conflict):self.call('revise',module=self.m['module'],version=1,title='Old',body='Design')
  with self.assertRaises(ValueError):self.call('pin',module=self.m['module'],version=1,program=26,revision=0)
 def test_permissions_and_publish(self):
  with self.assertRaises(Denied):self.call('list',token=self.tokens['student'])
  with self.assertRaises(Denied):self.call('list',course='OTHER')
  with self.assertRaises(ValueError):self.call('publish',module=self.m['module'],version=1)
if __name__=='__main__':unittest.main()
