import unittest,tempfile
from governed_service import Service,Denied,Conflict
import additional_programs,program_shells
class AdditionalProgramsTests(unittest.TestCase):
 def test_course_lengths_and_safety(self):
  d={x['program']:x for x in additional_programs.designs()}
  self.assertEqual(set(d),{1,12,13,14})
  for p in d.values():
   self.assertEqual(p['totalWeeks'],len(p['courses'])*10)
   self.assertEqual(len(p['competencies']),5)
   self.assertEqual(sum(x['points'] for x in p['rubric']),100)
   self.assertFalse(p['publicationAllowed']);self.assertFalse(p['commercial']['applicationsEnabled']);self.assertFalse(p['credential']['issuanceEnabled'])
   for c in p['courses']:self.assertEqual([m['week'] for m in c['modules']],list(range(1,11)))
  self.assertEqual(d[1]['courses'][1]['finalAssessment'],'Capstone defense')
  self.assertIn('Never make a final credit decision',d[1]['capstone'])
  self.assertIn('Retain #9',d[13]['dependencyNotes'])
 def test_added_shells_persist_and_revise(self):
  with tempfile.TemporaryDirectory() as temp:
   s=Service(temp);token=next(k for k,v in s.identities.items() if v['role']=='instructor')
   def call(a,**d):return program_shells.command(s,token,'scholarion','AIM310',a,d,Denied,Conflict)
   self.assertEqual(call('load')['loaded'],26)
   for n in [1,12,13,14]:call('save',program=n,revision=1,notes='Review course sequence')
   call('load');rows={x['program']:x for x in call('list')['shells']}
   for n in [1,12,13,14]:self.assertEqual(rows[n]['revision'],2);self.assertTrue(rows[n]['courses'])
   with self.assertRaises(Conflict):call('save',program=13,revision=1,notes='Stale')
if __name__=='__main__':unittest.main()
