import unittest,tempfile
from collections import Counter
import core_programs,program_shells
from governed_service import Service,Denied,Conflict
class CoreProgramsTests(unittest.TestCase):
 def test_structure_and_alignment(self):
  rows=[p for p in program_shells.shells() if p['program']<=11]
  self.assertEqual(set(p['program'] for p in rows),set(range(1,12)))
  for p in rows:
   self.assertFalse(p['completionProposal']['approved'])
   for c in p['courses']:
    self.assertEqual(len(c['modules']),10)
    self.assertEqual(Counter(a['type'] for a in c['assessmentPlan']),{'assignment':5,'lab':3,'project':2,'quiz':8,'midterm_exam':1,'final_exam':1})
    outcomes={o['id'] for m in c['modules'] for o in m['outcomes']}
    self.assertEqual(outcomes,{o for a in c['assessmentPlan'] for o in a['outcomes']})
    self.assertEqual([m['prerequisiteWeek'] for m in c['modules']],[None,*range(1,10)])
    self.assertTrue(all(a['artifact'] is None for a in c['assessmentPlan']))
   self.assertFalse(core_programs.audit(p)['publicationAllowed'])
 def test_audit_missing_evidence_and_counts(self):
  p=core_programs.enrich(core_programs.designs()[0]);p['courses'][0]['assessmentPlan']=[]
  gaps=core_programs.audit(p)['courses'][0]['gaps']
  self.assertTrue(any('requires 5' in g for g in gaps));self.assertTrue(any('notebooks' in g for g in gaps))
 def test_persisted_audit_and_revision(self):
  with tempfile.TemporaryDirectory() as tmp:
   s=Service(tmp);tokens={v['role']:k for k,v in s.identities.items()}
   def call(a,token=None,course='AIM310',**d):return program_shells.command(s,token or tokens['instructor'],'scholarion',course,a,d,Denied,Conflict)
   call('load');call('save',program=2,revision=1,notes='Preserve these notes')
   call('refresh-design',program=2,revision=2)
   p=next(p for p in call('list')['shells'] if p['program']==2);self.assertEqual(p['notes'],'Preserve these notes');self.assertEqual(p['revision'],3)
   self.assertFalse(call('audit',program=2)['publicationAllowed'])
   with self.assertRaises(Conflict):call('refresh-design',program=2,revision=2)
   with self.assertRaises(Denied):call('audit',token=tokens['student'],program=2)
   with self.assertRaises(Denied):call('audit',course='OTHER',program=2)
if __name__=='__main__':unittest.main()
