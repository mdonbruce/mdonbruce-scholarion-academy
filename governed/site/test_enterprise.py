import unittest,test_governed,enterprise_orchestration as eo
from governed_service import Denied
class EnterpriseTests(test_governed.GovernedTests):
 def turn(self,q,session=None,**extra):return eo.turn(self.s,self.student,'scholarion','AIM310',{'question':q,'session':session,**extra},Denied)
 def test_two_clarifications(self):
  a=self.turn('unclear');b=self.turn('unclear',a['session']);c=self.turn('unclear',a['session']);d=self.turn('unclear',a['session'])
  self.assertEqual((a['clarifications'],b['clarifications']),(1,2));self.assertEqual(c['outcome'],'queued');self.assertEqual(c['case_id'],d['case_id'])
 def test_blocked_payment(self):
  r=self.turn('pay tuition',verified_identity=True,verified_billed_amount=True);self.assertFalse(r['executed']);self.assertTrue(all(not g['passed'] for g in r['gate_results']))
 def test_registration(self):self.assertEqual(8,len(self.turn('register for a section')['gate_results']))
 def test_card(self):self.assertEqual('payment_data_refused',self.turn('card 4111 1111 1111 1111')['outcome'])
 def test_human(self):self.assertEqual('queued',self.turn('speak to a human')['outcome'])
 def test_legal(self):self.assertEqual('queued',self.turn('formal complaint')['outcome'])
 def test_status(self):self.assertEqual('unverified_status',self.turn('accreditation')['outcome'])
 def test_voice(self):self.assertEqual('Scholarion Academy is in pre-launch. Records are demonstration data. Which service do you need help with?',self.turn('unclear',channel='voice')['message'])
 def test_forged_session(self):
  with self.assertRaises(Denied):self.turn('register',session='foreign-session')
 def test_queue_permissions(self):
  with self.assertRaises(Denied):eo.cases(self.s,self.student,'scholarion','AIM310',Denied)
if __name__=='__main__':unittest.main()
