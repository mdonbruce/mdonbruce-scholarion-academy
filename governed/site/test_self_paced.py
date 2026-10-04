import unittest,tempfile
from governed_service import Service,Denied,Conflict
import self_paced
class SelfPacedTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.s=Service(self.tmp.name);self.tokens={v['role']:k for k,v in self.s.identities.items()}
 def tearDown(self):self.tmp.cleanup()
 def call(self,action,token=None,course='AIM310',**data):return self_paced.command(self.s,token or self.tokens['student'],'scholarion',course,action,data,Denied,Conflict)
 def test_eleven_offerings_and_shared_courses(self):
  p={p['id']:p for p in self_paced.catalog()};self.assertEqual(set(p),set(range(28,39)))
  self.assertEqual(p[30]['courses'],p[31]['courses'][:3]);self.assertTrue(all(c['weeks']==10 for x in p.values() for c in x['courses']))
  self.assertTrue(all(x['price'] is None and not x['checkoutEnabled'] for x in p.values()))
  for x in p.values():self.assertEqual(sum(r['points'] for r in x['capstone']['rubric']),100)
 def test_plan_reset_and_conflict(self):
  a=self.call('plan',program=32,start='2026-10-02',revision=0);self.assertEqual(a['deadlines'][-1]['suggestedDue'],'2026-12-11');self.assertFalse(a['enrollment'])
  with self.assertRaises(Conflict):self.call('plan',program=32,start='2026-10-03',revision=0)
  b=self.call('plan',program=32,start='2026-10-09',revision=1);self.assertEqual(b['deadlines'][-1]['suggestedDue'],'2026-12-18')
 def test_private_plans_and_course_scope(self):
  self.call('plan',program=32,start='2026-10-02',revision=0)
  self.assertEqual(self.call('list',token=self.tokens['instructor'])['plans'],[])
  with self.assertRaises(Denied):self.call('list',course='OTHER')
 def test_payment_and_invalid_program_blocked(self):
  with self.assertRaises(ValueError):self.call('checkout',program=32)
  with self.assertRaises(ValueError):self.call('plan',program=100,start='2026-10-02',revision=0)
 def test_instructor_notebooks_not_learner_accessible(self):
  with self.assertRaises(Denied):self.call('instructor_notebook',id='32-1')
  with self.assertRaises(ValueError):self.call('instructor_notebook',token=self.tokens['instructor'],id='../secrets')
  r=self.call('instructor_notebook',token=self.tokens['instructor'],id='32-1');self.assertIn('All supplied practice checks passed',str(r['notebook']))
 def test_no_automatic_transfer(self):self.assertTrue(all(not r['approval'] for r in self_paced.consolidation()['rules']))
if __name__=='__main__':unittest.main()
