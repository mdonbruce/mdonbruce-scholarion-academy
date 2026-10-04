import unittest
from curriculum_engine import validate
class CurriculumTests(unittest.TestCase):
 def test_nonobject(self):self.assertEqual(validate([])[0]['path'],'$')
 def test_empty(self):
  paths={e['path'] for e in validate({})}
  for path in ['termWeeks','description','facultyOwner','competencies','topics','modules','outcomes','assessments/weights']:self.assertIn(path,paths)
 def test_bad_records(self):self.assertTrue(any(e['path']=='topics' for e in validate({'topics':'bad'})))
 def test_weights(self):self.assertTrue(any(e['path']=='assessments/weights' for e in validate({'assessments':[{'id':'a','weight':20}]})))
 def test_question_count(self):self.assertTrue(any(e['path']=='assessments/q/bank' for e in validate({'assessments':[{'id':'q','type':'quiz','weight':100,'bank':[],'delivered':20}]})))
 def test_term_conflict(self):self.assertTrue(any(e['path']=='termConflicts' for e in validate({'termConflicts':['eight week copy']})))
if __name__=='__main__':unittest.main()
