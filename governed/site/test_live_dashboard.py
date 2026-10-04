import test_governed,live_dashboard,lms_service
from governed_service import Denied,Conflict
class DashboardTests(test_governed.GovernedTests):
 def snap(self,token=None):return live_dashboard.snapshot(self.s,token or self.student,'scholarion','AIM310',Denied)
 def test_saved_submission_changes_metrics(self):
  before=self.snap();self.assertEqual(before['metrics'][1]['value'],0)
  lms_service.command(self.s,self.student,'scholarion','AIM310','submit',{'assignment':'AIM310-evidence','body':'Demo evidence','request_key':'demo-test-001'},Denied,Conflict)
  after=self.snap();self.assertEqual(after['metrics'][1]['value'],1);self.assertEqual(after['metrics'][3]['value'],0)
 def test_other_user_receipt_hidden(self):
  with self.s.connect('scholarion') as db:db.execute('INSERT INTO submissions VALUES(?,?,?,?,?,?)',('other','AIM310-evidence','another-student','secret',1,'other-key'))
  self.assertEqual(self.snap()['submissions'],[])
  self.assertEqual(len(self.snap(self.teacher)['submissions']),1)
 def test_unpublished_grade_hidden(self):
  with self.s.connect('scholarion') as db:
   db.execute('INSERT INTO submissions VALUES(?,?,?,?,?,?)',('own','AIM310-evidence','student-demo','demo',1,'own-key'))
   db.execute('INSERT INTO grade_versions VALUES(?,?,?,?,?,?,?)',('own',1,80,'draft',0,'instructor-demo',2))
  self.assertIsNone(self.snap()['submissions'][0]['grade'])
  self.assertEqual(self.snap(self.teacher)['submissions'][0]['grade']['score'],80)
 def test_unavailable_not_invented(self):
  d=self.snap();self.assertTrue(d['demo']);self.assertEqual(len(d['unavailable']),4)
