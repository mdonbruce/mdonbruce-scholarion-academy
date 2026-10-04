import json,sqlite3,tempfile,time,unittest
import curriculum_intelligence as cci
import curriculum_engine
from governed_service import Service,Denied,Conflict
from test_course_formats import fixture

class CurriculumIntelligenceTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.s=Service(self.tmp.name)
  self.tokens={v['role']:k for k,v in self.s.identities.items() if v['tenant']=='scholarion'}
  self.s.identities['reviewer']={'user':'peer','role':'instructor','tenant':'scholarion','expires':time.time()+1000}
  with self.s.connect('scholarion') as db:db.execute('INSERT INTO enrollments VALUES(?,?,?,?)',('peer','AIM310','instructor','active'))
 def tearDown(self):self.tmp.cleanup()
 def call(self,action,token=None,course='AIM310',**data):return cci.command(self.s,token or self.tokens['instructor'],'scholarion',course,action,data,Denied,Conflict)
 def create(self):return self.call('create',title='Evidence-led AI design',kind='course',audience='Working professionals')
 def test_version_history_and_immutable_storage(self):
  d=self.create();self.call('save',id=d['id'],revision=1,version='0.2.0',note='Refine design',graph=self.call('get',id=d['id'])['graph'])
  with self.assertRaises(Conflict):self.call('save',id=d['id'],revision=1)
  result=self.call('get',id=d['id']);self.assertEqual(len(result['history']),2)
  invalid=result['graph'];invalid['nodes']=[n for n in invalid['nodes'] if n['id']!='root'];invalid['edges']=[e for e in invalid['edges'] if e['from']!='root']
  with self.assertRaises(ValueError):self.call('save',id=d['id'],revision=2,version='0.3.0',note='Invalid root removal',graph=invalid)
  with self.s.connect('scholarion') as db:
   with self.assertRaises(sqlite3.IntegrityError):db.execute('DELETE FROM cci_versions')
 def test_authorization(self):
  d=self.create()
  with self.assertRaises(Denied):self.call('list',token=self.tokens['student'])
  with self.assertRaises(Denied):self.call('get',id=d['id'],course='OTHER')
 def test_independent_review_and_blocked_exchange(self):
  d=self.create();self.call('propose',id=d['id'],revision=1)
  with self.assertRaises(Denied):self.call('review',id=d['id'],revision=2,decision='reviewed',note='My own work')
  result=self.call('review',token='reviewer',id=d['id'],revision=2,decision='changes_requested',note='Supply executable lab evidence')
  self.assertEqual(result['state'],'changes_requested');self.assertFalse(result['releaseAllowed'])
  for action in ['publish','exchange']:
   with self.assertRaises(Denied):self.call(action,id=d['id'])
 def test_alignment_findings(self):
  g=cci.draft('Course','course','Adults');g['edges']=[]
  codes={f['code'] for f in cci.evidence(g)['findings']}
  self.assertTrue({'unassessed_outcome','unaligned_assessment','unaligned_module'}<=codes)
 def test_privacy_schema_and_credit(self):
  g=cci.draft('Course','course','Adults');g['nodes'][0]['attributes']['learners']=[]
  with self.assertRaises(ValueError):cci.graph(g)
  g=cci.draft('Course','course','Adults');g['nodes'][0]['attributes']['creditStatus']='recognized'
  with self.assertRaises(ValueError):cci.graph(g)
 def test_existing_package_projection(self):
  review=curriculum_engine.api(self.s,self.tokens['instructor'],'scholarion','AIM310','validate',{'package':fixture('standard')},Denied)
  result=self.call('from_review',review=review['id']);g=self.call('get',id=result['id'])['graph']
  self.assertEqual(sum(n['type']=='module' for n in g['nodes']),10)
  self.assertEqual(sum(n['type']=='item' for n in g['nodes']),400)
  self.assertFalse(any(f['code'] in ['unassessed_outcome','unaligned_module','unaligned_assessment'] for f in cci.evidence(g)['findings']))
 def test_claim_and_stale_evidence(self):
  g={'nodes':[{'id':'r','type':'resource','title':'Accredited learning','attributes':{'verifiedDate':'2000-01-01'}}],'edges':[]}
  codes={f['code'] for f in cci.evidence(cci.graph(g))['findings']}
  self.assertTrue({'claim_review','source_evidence','freshness','accessibility_review'}<=codes)

if __name__=='__main__':unittest.main()
