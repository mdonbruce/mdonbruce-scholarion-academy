import tempfile,unittest
from governed_service import Service,Denied,Conflict
import assignment_packages as a
class AssignmentPackageTests(unittest.TestCase):
 def test_seven_templates_and_required_findings(self):
  self.assertEqual(len(a.FORMATS),7)
  for k in a.FORMATS:
   p=a.template(k,'AIM310');self.assertEqual(p['label'],a.LABEL);self.assertTrue(a.validate(p))
  p=a.template('mini_project','AIM310');p['pillars']['constraints']=['one']
  self.assertTrue(any(x['path']=='pillars/constraints' for x in a.validate(p)))
 def test_alignment_and_quiz_ratio(self):
  p=a.template('quiz','AIM310');p['context']['level']='Advanced';p['quizSize']=1
  p['outcomes']=[{'id':'LO1','text':'Analyze failure','competency':'C1','bloom':'Analyze'}]
  p['items']=[{'id':str(i),'text':'Choose','scenario':'Failure under a rate limit','lo':'LO1','competency':'C1','bloom':'Remember'} for i in range(3)]
  errors=a.validate(p);self.assertTrue(any(x['path']=='items/bloom' for x in errors));self.assertTrue(any('Bloom demand' in x['message'] for x in errors))
 def test_projection_removes_answers(self):
  p=a.template('quiz','AIM310');p['instructor']['keys']=['secret'];p['items']=[{'id':'q','text':'Question','correct':['b'],'answer':'secret','explanation':'key','solution':'key','distractor_rationale':{'a':'key'}}]
  out=a.student(p);self.assertNotIn('instructor',out);self.assertEqual(out['items'],[{'id':'q','text':'Question'}])
 def test_version_scope_and_export(self):
  with tempfile.TemporaryDirectory() as tmp:
   s=Service(tmp);tokens={v['role']:k for k,v in s.identities.items()}
   def call(action,token=None,course='AIM310',**data):return a.command(s,token or tokens['instructor'],'scholarion',course,action,data,Denied,Conflict)
   p=a.template('lab','AIM310');r=call('save',package=p);self.assertEqual(r['revision'],1);self.assertFalse(r['publicationAllowed'])
   call('save',package=p,id=r['id'],revision=1)
   with self.assertRaises(Conflict):call('save',package=p,id=r['id'],revision=1)
   with self.assertRaises(Denied):call('list',token=tokens['student'])
   with self.assertRaises(Denied):call('export',course='OTHER',id=r['id'],edition='instructor')
   self.assertNotIn('instructor',call('export',id=r['id'],edition='student'))
   p['context']['course']='OTHER'
   with self.assertRaises(Denied):call('save',package=p)
 def test_malformed_identifiers_return_findings(self):
  p=a.template('quiz','AIM310');p['outcomes']=[{'id':[],'competency':{},'bloom':[]}]
  self.assertTrue(a.validate(p))
if __name__=='__main__':unittest.main()
