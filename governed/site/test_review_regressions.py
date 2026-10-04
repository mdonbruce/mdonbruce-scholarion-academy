"""Regression evidence for the October review, using isolated records and real HTTP."""
import http.client,json,tempfile,threading,unittest,uuid
from http.server import ThreadingHTTPServer
from governed_service import Service,Handler,Denied,Conflict
from test_course_formats import fixture
import lms_service,live_dashboard,curriculum_engine
import model_planner
import hub_service

class ReviewRegressions(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.service=Service(self.tmp.name)
  self.tokens={v['role']:k for k,v in self.service.identities.items() if v['tenant']=='scholarion'}
 def tearDown(self):self.tmp.cleanup()
 def call(self,role,action,**data):return lms_service.command(self.service,self.tokens[role],'scholarion','AIM310',action,data,Denied,Conflict)
 def test_audit_filters_before_limit_and_excludes_legacy(self):
  self.service.query(self.tokens['student'],'scholarion','AIM310','baseline')
  with self.service.connect('scholarion') as db:
   for i in range(60):db.execute('INSERT INTO outbox VALUES(?,?)',(str(uuid.uuid4()),json.dumps({'tenant_id':'scholarion','course_id':'OTHER','secret':i})))
   db.execute('INSERT INTO outbox VALUES(?,?)',(str(uuid.uuid4()),json.dumps({'tenant_id':'scholarion','legacy':True})))
  rows=self.service.events(self.tokens['instructor'],'scholarion','AIM310')
  self.assertEqual(len(rows),1);self.assertEqual(rows[0]['course_id'],'AIM310')
 def test_published_grade_survives_draft_in_both_views(self):
  s=self.call('student','submit',assignment='AIM310-evidence',body='Evidence',request_key='regression-one')['id']
  self.call('instructor','grade',submission=s,version=0,score=80,feedback='Initial')
  self.call('instructor','post',submission=s,version=1,posted=True)
  self.call('instructor','grade',submission=s,version=2,score=90,feedback='Revised')
  self.assertEqual(self.call('student','list')['submissions'][0]['grade']['score'],80)
  snapshot=live_dashboard.snapshot(self.service,self.tokens['student'],'scholarion','',Denied)
  self.assertEqual(snapshot['submissions'][0]['grade']['score'],80)
  self.assertEqual(self.call('instructor','list')['submissions'][0]['grade']['score'],90)
  self.call('instructor','post',submission=s,version=3,posted=True)
  self.assertEqual(self.call('student','list')['submissions'][0]['grade']['score'],90)
 def test_nested_validation_and_alignment(self):
  for value in [1,None,{},['valid',{}]]:
   self.assertTrue(curriculum_engine.validate({'assessments':[{'id':'x','outcomes':value}]}))
  package=fixture('standard');package['assessments'][1]['bank'][0]['competency']='unknown'
  self.assertTrue(any('/bank/0/outcome' in e['path'] for e in curriculum_engine.validate(package)))
 def test_bounded_planner_observes_read_results(self):
  class Provider:
   def __init__(self):self.calls=0
   def generate(self,payload):
    self.calls+=1
    if self.calls==1:return {'action':'read_course_standard','summary':'Read standard'}
    self.assertion=payload['observations'][-1]['observation']['weeks']
    return {'action':'finish','summary':'Use ten weeks'}
  provider=Provider();result=model_planner.plan(provider,'Synthetic course plan',read_tool=lambda action:{'weeks':10})
  self.assertEqual(provider.calls,2);self.assertEqual(provider.assertion,10);self.assertEqual(result['state'],'completed');self.assertFalse(result['executed'])
 def test_support_reply_resolution_and_conflict(self):
  def call(role,action,**data):return hub_service.command(self.service,self.tokens[role],'scholarion','AIM310',action,dict(data,kind='help'),Denied,Conflict)
  key=call('student','create',title='Need feedback',body='Please explain the rubric')['id']
  with self.assertRaises(Denied):call('student','resolve',id=key,version=1)
  call('instructor','reply',id=key,version=1,body='Review criterion one')
  with self.assertRaises(Conflict):call('instructor','resolve',id=key,version=1)
  call('instructor','resolve',id=key,version=2)
  record=call('student','list')['records'][0]
  self.assertEqual(record['state'],'resolved');self.assertEqual(len(record['replies']),1);self.assertTrue(record['resolution']['resolved'])
  call('student','reopen',id=key,version=3)
  self.assertEqual(call('student','list')['records'][0]['state'],'active')
 def test_full_package_http_and_authorization(self):
  """Large packages validate for instructors only; over HTTP, local pilot tokens are refused
  (sign-in is username + password + authenticator), and the session endpoints keep their guards."""
  payload={'tenant':'scholarion','course':'AIM310','package':fixture('standard')}
  self.assertGreater(len(json.dumps(payload)),16000)
  body=curriculum_engine.api(self.service,self.tokens['instructor'],'scholarion','AIM310','validate',{'package':payload['package']},Denied)
  self.assertTrue(body['structuralChecksPassed']);self.assertFalse(body['publishAllowed'])
  with self.assertRaises(Denied):curriculum_engine.api(self.service,self.tokens['student'],'scholarion','AIM310','validate',{'package':payload['package']},Denied)
  server=ThreadingHTTPServer(('127.0.0.1',0),Handler);server.service=self.service
  worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
  try:
   raw=json.dumps(payload)
   for role in ['instructor','student']:
    client=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=10)
    client.request('POST','/api/curriculum/validate',raw,{'Host':'127.0.0.1:4180','Authorization':'Bearer '+self.tokens[role]})
    response=client.getresponse();body=json.loads(response.read());self.assertEqual(response.status,403,body)
    client.close()
   client=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=10)
   client.request('POST','/api/session/login',json.dumps({'token':self.tokens['student']}),{'Host':'127.0.0.1:4180'})
   response=client.getresponse();response.read();self.assertIn(response.status,(403,410))
   client.request('POST','/api/session','{}',{'Host':'127.0.0.1:4180','Origin':'https://untrusted.example'})
   response=client.getresponse();response.read();self.assertEqual(response.status,403);client.close()
  finally:server.shutdown();server.server_close();worker.join()

if __name__=='__main__':unittest.main()
