import test_governed
from governed_service import Denied,Conflict
import lms_service,unittest,sqlite3
class CourseworkTests(test_governed.GovernedTests):
 def call(self,role,action,**data):return lms_service.command(self.s,self.student if role=='student' else self.teacher,'scholarion','AIM310',action,data,Denied,Conflict)
 def submit(self):return self.call('student','submit',assignment='AIM310-evidence',body='Synthetic evidence',request_key='request-one')
 def test_workflow(self):
  s=self.submit();self.call('teacher','grade',submission=s['id'],version=0,score=82,feedback='Explain baseline')
  self.assertIsNone(self.call('student','list')['submissions'][0]['grade'])
  self.call('teacher','post',submission=s['id'],version=1,posted=True)
  self.assertEqual(self.call('student','list')['submissions'][0]['grade']['score'],82)
  self.call('teacher','post',submission=s['id'],version=2,posted=False)
  self.assertIsNone(self.call('student','list')['submissions'][0]['grade'])
  self.assertEqual(3,len(self.call('teacher','history',submission=s['id'])))
 def test_stale(self):
  s=self.submit();self.call('teacher','grade',submission=s['id'],version=0,score=82,feedback='test')
  with self.assertRaises(Conflict):self.call('teacher','grade',submission=s['id'],version=0,score=83,feedback='stale')
 def test_idempotent(self):
  self.assertEqual(self.submit()['id'],self.submit()['id'])
  self.assertEqual(1,len(self.call('student','list')['submissions']))
 def test_student_cannot_grade(self):
  s=self.submit()
  with self.assertRaises(Denied):self.call('student','grade',submission=s['id'],version=0,score=100,feedback='invalid')
 def test_immutable(self):
  self.submit()
  with self.s.connect('scholarion') as db:
   with self.assertRaises(sqlite3.IntegrityError):db.execute("UPDATE submissions SET body='changed'")
 def test_nan(self):
  s=self.submit()
  with self.assertRaises(ValueError):self.call('teacher','grade',submission=s['id'],version=0,score=float('nan'),feedback='invalid')
if __name__=='__main__':unittest.main()

