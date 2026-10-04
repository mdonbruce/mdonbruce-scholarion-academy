import unittest,tempfile
from governed_service import Service,Denied,Conflict
import voice_studio as v
class VoiceTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.s=Service(self.tmp.name);self.tokens={x['role']:k for k,x in self.s.identities.items()}
 def tearDown(self):self.tmp.cleanup()
 def call(self,a,token=None,course='AIM310',**d):return v.command(self.s,token or self.tokens['instructor'],'scholarion',course,a,d,Denied,Conflict)
 def test_speaker_change_and_restore(self):
  p=self.call('create',title='Two speakers')
  for speaker in ['one','two','one','two','one','two']:p=self.call('scene',id=p['id'],revision=p['revision'],speaker=speaker,avatar='amara',voice='amara-synthetic-design',language='en',script='Fictional AI introduction')
  data=dict(id=p['id'],revision=p['revision'],speaker='one',avatar='tunde',voice='tunde-synthetic-design',language='en')
  self.assertEqual(self.call('change-all',**data,dryRun=True)['count'],3)
  changed=self.call('change-all',**data,confirmed=True)
  self.assertEqual([s['avatar'] for s in changed['scenes']],['tunde','amara']*3)
  with self.assertRaises(Conflict):self.call('change-all',**data,confirmed=True)
  restored=self.call('restore',id=p['id'],revision=changed['revision'],targetRevision=p['revision'])
  self.assertTrue(all(s['avatar']=='amara' for s in restored['scenes']))
 def test_pairing_and_generation_blocks(self):
  self.assertEqual(self.call('pairing',avatar='amara',voice='tunde-synthetic-design',language='en')['code'],'pairing_incompatible')
  self.assertFalse(self.call('pairing',avatar='amara',voice='amara-synthetic-design',language='pcm')['valid'])
  for a in ['generate','clone','capture','train','publish']:self.assertEqual(self.call(a)['status'],'DISABLED')
 def test_authorization_and_archive(self):
  with self.assertRaises(Denied):self.call('list',token=self.tokens['student'])
  with self.assertRaises(Denied):self.call('list',course='OTHER')
  p=self.call('create',title='Archive');p=self.call('archive',id=p['id'],revision=1)
  with self.assertRaises(ValueError):self.call('scene',id=p['id'],revision=p['revision'],speaker='one',avatar='amara',voice='amara-synthetic-design',language='en',script='Test')
  self.assertFalse(self.call('export',id=p['id'])['mediaGenerated'])
if __name__=='__main__':unittest.main()
