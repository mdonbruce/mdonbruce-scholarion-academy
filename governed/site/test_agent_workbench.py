import test_governed,agent_workbench,local_mcp,model_planner
from governed_service import Denied,Conflict,Service
class WorkbenchTests(test_governed.GovernedTests):
 def call(self,a,token=None,**d):return agent_workbench.command(self.s,token or self.student,'scholarion','AIM310',a,d,Denied,Conflict)
 def test_memory_private_persistent(self):
  self.call('remember',body='retrieval evidence citations');self.s=Service(self.tmp.name)
  self.assertEqual(len(self.call('search',query='citations')['matches']),1)
  self.assertEqual(self.call('search',token=self.teacher,query='citations')['matches'],[])
 def test_scenario(self):
  c={'title':'Demo','situation':'Review','goal':'Pilot','rubric':['Evidence'],'character':'Sponsor','traits':['Cautious'],'background':'Private fear','condition':'rollback','resistance':'Explain recovery','agreement':'Agreed'}
  r=self.call('scenario_create',token=self.teacher,config=c)
  self.assertNotIn('background',self.call('scenarios')['scenarios'][0])
  with self.assertRaises(Denied):self.call('scenario_create',config=c)
  s=self.call('scenario_start',id=r['id'])['session']
  self.assertEqual(self.call('scenario_turn',session=s,answer='please')['state'],'resisting')
  self.assertEqual(self.call('scenario_turn',session=s,answer='a rollback plan')['state'],'agreed')
 def test_mcp_real_process(self):
  self.assertEqual(local_mcp.call_local('tools/list')['tools'][0]['name'],'course_standard')
  self.assertIn('10-week',local_mcp.call_local('tools/call',{'name':'course_standard','arguments':{}})['content'][0]['text'])
 def test_model_cannot_execute(self):
  class Provider:
   def generate(self,p):return {'action':'propose_support_request','summary':'Support needed'}
  self.assertFalse(model_planner.plan(Provider(),'Help')['executed'])
 def test_model_invalid_tool(self):
  class Provider:
   def generate(self,p):return {'action':'delete_database','summary':'x'}
  with self.assertRaises(ValueError):model_planner.plan(Provider(),'Help')
