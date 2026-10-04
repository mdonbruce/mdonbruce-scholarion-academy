import test_governed,agent_runtime
from governed_service import Denied,Conflict,Service
class RuntimeTests(test_governed.GovernedTests):
 def call(self,action,token=None,**data):return agent_runtime.command(self.s,token or self.student,'scholarion','AIM310',action,data,Denied,Conflict)
 def propose(self):return self.call('propose',tool='create_support_request',args={'title':'Demo lab issue','body':'Synthetic support request'},request_key='test-request-001')
 def test_recovery_and_idempotency(self):
  r=self.propose();self.assertEqual(self.propose()['id'],r['id'])
  self.call('approve',token=self.teacher,id=r['id'],version=1)
  self.s=Service(self.tmp.name)
  result=self.call('resume',id=r['id'],version=2)
  again=self.call('resume',id=r['id'],version=2)
  self.assertEqual(result['result_id'],again['result_id'])
  with self.s.connect('scholarion') as db:self.assertEqual(db.execute("SELECT count(*) FROM hub_records WHERE kind='help'").fetchone()[0],1)
 def test_approval_enforced(self):
  r=self.propose()
  with self.assertRaises(Denied):self.call('approve',id=r['id'],version=1)
  with self.assertRaises(Conflict):self.call('resume',id=r['id'],version=1)
 def test_strict_tool_inputs(self):
  with self.assertRaises(ValueError):self.call('propose',tool='shell',args={},request_key='test-request-002')
  with self.assertRaises(ValueError):self.call('propose',tool='create_support_request',args={'title':'x','body':'y','owner':'other'},request_key='test-request-003')
 def test_stale_review(self):
  r=self.propose();self.call('reject',token=self.teacher,id=r['id'],version=1)
  with self.assertRaises(Conflict):self.call('approve',token=self.teacher,id=r['id'],version=1)
 def test_revoked_owner_blocked(self):
  r=self.propose();self.call('approve',token=self.teacher,id=r['id'],version=1)
  with self.s.connect('scholarion') as db:db.execute("UPDATE enrollments SET status='inactive' WHERE user='student-demo'")
  with self.assertRaises(Denied):self.call('resume',token=self.teacher,id=r['id'],version=2)
