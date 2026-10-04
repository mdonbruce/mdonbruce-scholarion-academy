import unittest
from curriculum_engine import validate,FORMATS
def fixture(fmt):
 f=FORMATS[fmt];n=f['weeks']
 p={'format':fmt,'termWeeks':n,'weeklyHours':{'min':8,'max':10},'facultyOwner':'Demo faculty','description':' '.join(['Demonstration']*120),'title':'Structural test only','code':'TEST','delivery':'cohort','prerequisites':'Python','policyVersion':'test-only','competencies':[{'id':f'c{i}','statement':'Build test artifacts','programOutcomes':['test']} for i in range(5)],'topics':[],'outcomes':[],'modules':[],'assessments':[],'announcements':[{'week':i} for i in range(1,n+1)],'alignmentMatrix':['test'],'outcomeWeekMap':['test'],'assessmentBlueprint':['test']}
 for i in range(n):
  p['topics'].append({'id':f't{i}','title':'Test','summary':'Test','activity':'Test','appliedFocus':'Test','competencyApplications':'Test'})
  for j in range(2):p['outcomes'].append({'id':f'o{i}-{j}','topic':f't{i}','competency':f'c{(i+j)%5}'})
  p['modules'].append({'week':i+1,'topic':f't{i}','overview':'Test','pages':['Test'],'activity':'Test','hours':9})
 outs=[o['id'] for o in p['outcomes']]
 for i,kind in enumerate(f['major'],1):
  p['assessments'].append({'id':f'a{i}','type':kind,'week':i,'outcomes':outs,'rubric':[{'competency':'c0','outcome':'o0-0','levels':['a','b','c','d']} for _ in range(4)]})
  if i not in f['examWeeks']:p['assessments'].append({'id':f'q{i}','type':'quiz','week':i,'outcomes':outs,'delivered':25,'bank':[{'id':str(k),'prompt':'test','answer':'test','rationale':'test','outcome':'o0-0','competency':'c0'} for k in range(50)]})
  else:p['assessments'].append({'id':f'e{i}','type':'final_exam' if i==n else 'midterm_exam','week':i,'outcomes':outs,'blueprint':['test'],'appliedScenario':'test','answerKey':'test'})
 for a in p['assessments']:a['weight']=100/len(p['assessments'])
 return p
class FormatTests(unittest.TestCase):
 def test_both_profiles(self):
  for fmt in FORMATS:self.assertEqual(validate(fixture(fmt)),[])
 def test_wrong_length(self):
  p=fixture('standard');p['termWeeks']=5;self.assertIn('termWeeks',[e['path'] for e in validate(p)])
 def test_workload(self):
  p=fixture('standard');p['modules'][0]['hours']=11;self.assertIn('modules/1/hours',[e['path'] for e in validate(p)])
 def test_announcements(self):
  p=fixture('standard');p['announcements'].pop();self.assertIn('announcements',[e['path'] for e in validate(p)])
 def test_unknown_format(self):self.assertEqual(validate({'format':'eight'})[0]['path'],'format')
 def test_short_count(self):
  p=fixture('standard');p['assessments'].pop();self.assertTrue(validate(p))

class TenWeekPolicyTests(unittest.TestCase):
 def test_only_standard_allowed(self):
  self.assertEqual(set(FORMATS), {'standard'})
  self.assertEqual(FORMATS['standard']['weeks'],10)
  self.assertEqual(validate({'format':'short'})[0]['path'],'format')
