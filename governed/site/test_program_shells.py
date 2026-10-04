import unittest,tempfile,sqlite3
from governed_service import Service,Denied,Conflict
import program_shells
class ShellTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.s=Service(self.tmp.name);self.tokens={v['role']:k for k,v in self.s.identities.items()}
 def tearDown(self):self.tmp.cleanup()
 def call(self,a,token=None,course='AIM310',**d):return program_shells.command(self.s,token or self.tokens['instructor'],'scholarion',course,a,d,Denied,Conflict)
 def test_complete_id_range_and_preserved_sessions(self):
  s=program_shells.shells();self.assertEqual([x['program'] for x in s],[*range(15,27),1,12,13,14,*range(2,12)]);self.assertEqual(len(s[0]['sessions']),20)
  for p in s:self.assertEqual(len(p['modules']),10);self.assertEqual(len(p['competencies']),5);self.assertFalse(p['publicationAllowed'])
 def test_load_idempotent_and_version_history(self):
  self.call('load');self.call('save',program=16,revision=1,notes='Review the lab evidence');self.call('load');p=next(x for x in self.call('list')['shells'] if x['program']==16);self.assertEqual(p['revision'],2);self.assertEqual(p['notes'],'Review the lab evidence')
  with self.assertRaises(Conflict):self.call('save',program=16,revision=1,notes='stale')
  with self.s.connect('scholarion') as db:
   with self.assertRaises(sqlite3.IntegrityError):db.execute('DELETE FROM program_shell_versions')
 def test_authorization_and_publish_block(self):
  with self.assertRaises(Denied):self.call('load',token=self.tokens['student'])
  with self.assertRaises(Denied):self.call('load',course='OTHER')
  with self.assertRaises(ValueError):self.call('publish',program=15)
if __name__=='__main__':unittest.main()
