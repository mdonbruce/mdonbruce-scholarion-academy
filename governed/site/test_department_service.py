import test_governed,department_service
from governed_service import Denied,Conflict
from department_rules import PolicyMissing
class DepartmentTests(test_governed.GovernedTests):
 def call(self,action,token=None,tenant='scholarion',**data):return department_service.command(self.s,token or self.teacher,tenant,'AIM310',action,data,Denied,Conflict)
 def test_missing_policy_blocks_preview(self):
  self.assertEqual(len(self.call('status')['missing']),4)
  with self.assertRaises(PolicyMissing):self.call('preview_holds',synthetic=True)
 def test_student_cannot_preview(self):
  with self.assertRaises(Denied):self.call('preview_refund',token=self.student,synthetic=True)
 def test_other_platform_denied(self):
  token='outside-platform-token'
  with self.assertRaises(Denied):self.call('status',token=token,tenant='devtech')
