import test_governed,operational_acceptance
from governed_service import Denied,Conflict
class AcceptanceTests(test_governed.GovernedTests):
 def call(self,action,token=None,**data):return operational_acceptance.command(self.s,token or self.teacher,'scholarion','AIM310',action,data,Denied,Conflict)
 def test_no_unverified_promotion(self):
  self.call('record',area='security',release='demo',owner='Demo reviewer',reference='local test report',note='Synthetic evidence',status='pass',production_allowed=True)
  status=self.call('status')
  self.assertFalse(status['production_allowed'])
  self.assertEqual(len(status['evidence']),1)
  self.assertTrue(all(a['status']=='not_verified' for a in status['areas']))
 def test_student_denied(self):
  with self.assertRaises(Denied):self.call('status',token=self.student)
 def test_invalid_evidence(self):
  with self.assertRaises(ValueError):self.call('record',area='unknown')
 def test_evidence_audited(self):
  r=self.call('record',area='functional',release='demo',owner='Demo owner',reference='test report',note='Pending review')
  self.assertTrue(any(e.get('evidence_id')==r['id'] for e in self.s.events(self.teacher,'scholarion','AIM310')))
