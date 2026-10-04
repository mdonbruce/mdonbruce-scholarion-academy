import tempfile,unittest,uuid
import assessment_support as a
from governed_service import Service,Denied,Conflict
class AssessmentSupportTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.s=Service(self.tmp.name);self.tokens={v['role']:k for k,v in self.s.identities.items() if v['tenant']=='scholarion'}
 def tearDown(self):self.tmp.cleanup()
 def call(self,action,course='AIM310',token=None,**data):return a.command(self.s,token or self.tokens['student'],'scholarion',course,action,data,Denied,Conflict)
 def test_saved_self_report_and_conflict(self):
  self.call('save',checks=[0,1],revision=0);d=self.call('get');self.assertEqual(d['checks'],[0,1]);self.assertFalse(d['approved'])
  with self.assertRaises(Conflict):self.call('save',checks=[],revision=0)
  with self.assertRaises(ValueError):self.call('save',checks=[True],revision=1)
 def test_isolation(self):
  self.call('save',checks=[0],revision=0);self.assertEqual(self.call('get',token=self.tokens['instructor'])['checks'],[])
  with self.assertRaises(Denied):self.call('get',course='OTHER')
 def test_ticket_idempotency_and_no_raw_text(self):
  key=str(uuid.uuid4());x=self.call('escalate',topic='Accessibility',requestKey=key,question='PRIVATE MEDICAL DATA')
  self.assertEqual(x['id'],self.call('escalate',topic='Accessibility',requestKey=key)['id']);self.assertFalse(x['externalForwarded'])
  with self.s.connect('scholarion') as db:
   rows=db.execute('SELECT * FROM hub_records').fetchall();self.assertEqual(len(rows),1);self.assertNotIn('PRIVATE',str([dict(r) for r in rows]))
  with self.assertRaises(Conflict):self.call('escalate',topic='Exception',requestKey=key)
 def test_boundaries_and_configuration(self):
  d=self.call('get');self.assertFalse(d['policyConfigured']);self.assertIsNone(d['responseSLA']);self.assertIn('cannot approve or deny',d['answers']['Accessibility']);self.assertIn('cannot discuss',d['answers']['Incident or results'])
  with self.assertRaises(ValueError):self.call('escalate',topic='Approve my exception',requestKey=str(uuid.uuid4()))
if __name__=='__main__':unittest.main()
