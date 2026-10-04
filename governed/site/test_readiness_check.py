import unittest
from readiness_check import QUESTIONS,public_questions,score
class ReadinessTests(unittest.TestCase):
 def test_question_contract(self):
  q=public_questions()['questions'];self.assertEqual(len(q),10);self.assertTrue(all('answer' not in x for x in q))
 def test_strong_agent_route(self):self.assertEqual(score([q[3] for q in QUESTIONS],'agents')['recommendedPrograms'],[15])
 def test_bridge_route(self):
  a=[q[3] for q in QUESTIONS];a[0]=(a[0]+1)%3
  self.assertEqual(score(a,'agents')['recommendedPrograms'],[16])
 def test_foundation_route(self):
  a=[(q[3]+1)%3 for q in QUESTIONS];d=score(a,'agents');self.assertEqual(d['recommendedPrograms'],[19,16]);self.assertFalse(d['admissionDecision']);self.assertFalse(d['creditAwarded'])
 def test_data_route(self):self.assertEqual(score([q[3] for q in QUESTIONS],'data')['recommendedPrograms'],[21,18])
 def test_invalid_answers(self):
  for a in [[],[True]*10,[3]*10,['1']*10,None]:
   with self.assertRaises(ValueError):score(a,'agents')
 def test_invalid_goal(self):
  with self.assertRaises(ValueError):score([0]*10,'admit')
if __name__=='__main__':unittest.main()
