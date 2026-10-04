import unittest
import program26,program_shells
class Program26Tests(unittest.TestCase):
 def test_ten_week_adaptation_preserves_core_lab_design(self):
  d=program26.design();self.assertEqual(len(d['modules']),10);self.assertEqual(len(d['labs']),12);self.assertEqual(len({l['id'] for l in d['labs']}),12);self.assertEqual(len(d['stretch']),6)
  self.assertEqual(sum(r['points'] for r in d['rubric']),100)
 def test_unknown_policy_never_becomes_eligibility(self):
  d=program26.design();self.assertIsNone(d['requirements']['capstoneThreshold']);self.assertIsNone(d['requirements']['issueWithinDays']);self.assertIsNone(d['requirements']['accessMonths']);self.assertFalse(d['publicationAllowed']);self.assertTrue(all(not r['approved'] for r in d['transfer']))
 def test_integrated_shell_uses_detailed_design(self):
  shell=next(x for x in program_shells.shells() if x['program']==26);self.assertEqual(shell,program26.design())
if __name__=='__main__':unittest.main()
