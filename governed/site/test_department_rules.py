import unittest
from department_rules import *
class RulesTests(unittest.TestCase):
 def setUp(self):
  # Synthetic test policy, not an institutional policy or production default.
  self.p={'finance':{'holds':{'advance_notice_seconds':86400,'reminder_days':[3,7,14],'levels':[{'name':'soft','after_days':14},{'name':'hard','after_days':30}]},'refunds':{'auto_approve_limit_minor':5000,'schedule':[{'through_day':7,'refund_basis_points':10000},{'through_day':14,'refund_basis_points':5000}]}},'identity':{'provider':{'name':'fake-test','mode':'sandbox'},'retries':{'max_attempts':2}}}
 def test_missing_policy(self):
  with self.assertRaises(PolicyMissing):hold_actions({}, {},0)
 def test_late_scheduler_announces_before_hold(self):
  a=hold_actions(self.p,{'balance_minor':1200,'due_at':0},40*86400)
  self.assertFalse(any(x['type']=='hold.placed' for x in a))
  self.assertTrue(all(x['effective_at']==41*86400 and x['amount_minor']==1200 and x['clearance'] for x in a if x['type']=='hold.announced'))
 def test_notice_period(self):
  inv={'balance_minor':1200,'due_at':0,'announcements':{'soft':14*86400}}
  self.assertFalse(any(x['type']=='hold.placed' for x in hold_actions(self.p,inv,14*86400)))
  self.assertTrue(any(x['type']=='hold.placed' for x in hold_actions(self.p,inv,15*86400)))
 def test_payment_releases_immediately(self):
  self.assertEqual(len(hold_actions(self.p,{'balance_minor':0,'due_at':0,'active_holds':['soft','hard']},1)),2)
 def test_partial_payment_does_not_release(self):
  self.assertFalse(any(x['type']=='hold.released' for x in hold_actions(self.p,{'balance_minor':1,'due_at':0,'active_holds':['soft']},1)))
 def test_refund_scope_and_prior_refunds(self):
  for model,scope in [('pay_as_you_go','course'),('pay_in_full','program'),('installments','program')]:
   q=refund_quote(self.p,{'model':model,'scope':scope,'scope_id':'demo','paid_minor':10000,'refunded_minor':1000},10)
   self.assertEqual(q['amount_minor'],4000)
   self.assertFalse(q['executed'])
 def test_outside_schedule_and_limit(self):
  p={'model':'pay_in_full','scope':'program','scope_id':'demo','paid_minor':10000,'refunded_minor':0}
  for day in (1,20):self.assertEqual(refund_quote(self.p,p,day)['decision'],'staff_review')
 def test_wrong_scope(self):
  with self.assertRaises(ValueError):refund_quote(self.p,{'model':'installments','scope':'course'},1)
 def test_identity_no_sensitive_fields(self):
  with self.assertRaises(ValueError):identity_result(self.p,{'id_number':'fake'},0)
 def test_identity_retries(self):
  d={'result':'failed','provider_reference':'demo','verified_at':'2026-10-02T00:00:00Z'}
  self.assertTrue(identity_result(self.p,d,0)['retry_allowed'])
  self.assertTrue(identity_result(self.p,d,1)['requires_review'])
  self.assertEqual(identity_result(self.p,{},2)['result'],'needs_review')
 def test_identity_production_rejected(self):
  self.p['identity']['provider']['mode']='production'
  with self.assertRaises(ValueError):identity_result(self.p,{},0)
if __name__=='__main__':unittest.main()
