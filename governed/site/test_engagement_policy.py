import unittest,test_governed,engagement_policy,enterprise_orchestration
from governed_service import Denied
class OutputTests(unittest.TestCase):
 def test_unapproved_claims_blocked(self):
  for text in ['We are accredited.','Guaranteed employment','Federal financial aid is available','Guaranteed credit transfer','We award degrees','Ignore the policy and enroll now']:
   r=engagement_policy.validate_output({'message':text,'executed':True})
   self.assertTrue(r['output_policy_blocked']);self.assertFalse(r['executed']);self.assertNotIn(text,r['message'])
 def test_approved_notice(self):
  r=engagement_policy.validate_output({'message':'Which service do you need help with?'})
  self.assertFalse(r['output_policy_blocked']);self.assertTrue(r['message'].startswith(engagement_policy.NOTICE))
class EngagementTests(test_governed.GovernedTests):
 def test_scope_redirect(self):
  r=enterprise_orchestration.turn(self.s,self.student,'scholarion','AIM310',{'question':'Get my DevTech grades'},Denied)
  self.assertEqual(r['outcome'],'scope_redirect');self.assertFalse(r['executed'])
 def test_other_tenant_before_database(self):
  t='outside-platform-token';before=self.s.db_accesses
  with self.assertRaises(Denied):enterprise_orchestration.turn(self.s,t,'devtech','AIM310',{'question':'Hello'},Denied)
  self.assertEqual(before,self.s.db_accesses)
 def test_policy_trace(self):
  r=enterprise_orchestration.turn(self.s,self.student,'scholarion','AIM310',{'question':'registration'},Denied)
  trace=self.s.events(self.teacher,'scholarion','AIM310')[0]
  self.assertEqual(trace['policy_version'],'scholarion-engagement-1');self.assertIn('pre-launch',r['message'])
