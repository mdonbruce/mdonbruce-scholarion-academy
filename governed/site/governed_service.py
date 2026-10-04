"""Loopback-only governed retrieval pilot. No live model, SIS or production identity."""
import argparse,hashlib,json,re,secrets,sqlite3,time,uuid
from http.cookies import SimpleCookie
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
import lms_service
import enterprise_orchestration
import curriculum_engine
import hub_service
import integration_registry
import department_service
import operational_acceptance
import live_dashboard
import readiness_check
import agent_runtime
import agent_workbench
import local_mcp
import curriculum_intelligence
import assessment_support
import platform_status
import recovery
import self_paced
import program_shells
import curriculum_commons
import voice_studio
import assignment_packages
import studio_sources
import studio_engine
import catalog_review
import accounts
import classroom_meetings
ROOT=Path(__file__).resolve().parent
FALLBACK='I cannot verify that from your approved course materials. Please ask your instructor.'
REFUSAL='I cannot assist with or complete active graded assessments. Please consult your instructor or review the published study materials.'
class Denied(Exception): pass
class Conflict(Exception): pass
class PilotServer(ThreadingHTTPServer):
 request_queue_size=64
class Connection(sqlite3.Connection):
 def __exit__(self,*args):
  try:return super().__exit__(*args)
  finally:self.close()
class Service:
 def __init__(self,root):
  self.root=Path(root);self.root.mkdir(parents=True,exist_ok=True)
  config=self.root/'identities.json'
  if not config.exists():
   identities={secrets.token_urlsafe(32):{'tenant':tenant,'user':role+'-demo','role':role,'realm':'local-pilot','expires':time.time()+86400*7} for tenant in ['scholarion'] for role in ['student','instructor']}
   config.write_text(json.dumps(identities,indent=2))
  self.identities={k:v for k,v in json.loads(config.read_text()).items() if v.get('tenant')=='scholarion'};self.db_accesses=0
  for tenant in ['scholarion']:
   with self.connect(tenant) as db:
    db.execute('PRAGMA journal_mode=WAL')
    db.executescript((ROOT/'migrations/001_governed.sql').read_text())
    db.execute('INSERT OR IGNORE INTO enrollments VALUES(?,?,?,?)',('student-demo','AIM310','student','active'))
    db.execute('INSERT OR IGNORE INTO enrollments VALUES(?,?,?,?)',('instructor-demo','AIM310','instructor','active'))
    db.execute('INSERT OR IGNORE INTO sources VALUES(?,?,?,?,?,?,?,?,?)',('study-1','AIM310','Study guide','module-1','Use a baseline to compare a workflow before and after a change.','published',0,1,'student,instructor'))
    db.execute('INSERT OR IGNORE INTO sources VALUES(?,?,?,?,?,?,?,?,?)',('private-1','AIM310','Instructor key','key','Private assessment answer.','draft',0,1,'instructor'))
  lms_service.initialize(self,ROOT)
  enterprise_orchestration.initialize(self)
  accounts.initialize(self)
 def connect(self,tenant):
  if tenant not in ['scholarion']:raise Denied('Unknown tenant')
  self.db_accesses+=1
  db=sqlite3.connect(self.root/(tenant+'.sqlite3'),timeout=10,factory=Connection);db.row_factory=sqlite3.Row;return db
 def identity(self,token,tenant):
  if tenant!='scholarion':raise Denied('Academy-only platform')
  account=accounts.identity(self,token)
  if account:return account
  with self.connect('scholarion') as db:
   if db.execute("SELECT 1 FROM accounts WHERE kind='super_admin' AND active=1").fetchone():raise Denied('Sign in using username, password and authenticator code')
  ctx=self.identities.get(token)
  if not ctx or ctx['expires']<time.time() or ctx['tenant']!=tenant:raise Denied('Invalid, expired or cross-tenant identity')
  return ctx
 def membership(self,db,ctx,course):
  row=db.execute('SELECT role FROM enrollments WHERE user=? AND course=? AND status=?',(ctx['user'],course,'active')).fetchone()
  if not row or row['role']!=ctx['role']:raise Denied('Active course membership required')
 def emit(self,db,ctx,decision,prompt='',sources=None,reviewer=None,course=None):
  payload={'timestamp':time.time(),'user_id':ctx['user'],'session_id':hashlib.sha256((ctx['tenant']+ctx['user']).encode()).hexdigest()[:16],'tenant_id':ctx['tenant'],'prompt_hash':hashlib.sha256(prompt.encode()).hexdigest(),'source_doc_ids':sources or [],'model_version':'extractive-local-v1','decision_code':decision,'reviewer_id':reviewer}
  payload['course_id']=course
  db.execute('INSERT INTO outbox(id,payload) VALUES(?,?)',(str(uuid.uuid4()),json.dumps(payload)))
 def query(self,token,tenant,course,prompt):
  ctx=self.identity(token,tenant)
  if not isinstance(prompt,str) or not prompt.strip() or len(prompt)>4000:raise ValueError('Question must contain 1–4000 characters')
  clean=re.sub(r'[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}|\b\d{3}-\d{2}-\d{4}\b','[redacted]',prompt)
  with self.connect(tenant) as db:
   self.membership(db,ctx,course)
   refusal=bool(re.search(r'graded|exam|answer key|unreleased|change.*grade|another.*tenant|other.*student',clean,re.I))
   # Published learner-safe material only, even in instructor query mode.
   rows=db.execute("SELECT * FROM sources WHERE course=? AND state='published' AND release_at<=? AND unlocked=1",(course,time.time())).fetchall()
   words=set(re.findall(r'[a-z]{3,}',clean.lower()))
   candidates=[r for r in rows if ctx['role'] in r['roles'].split(',') and 'student' in r['roles'].split(',')]
   ranked=sorted(candidates,key=lambda r:len(words & set(re.findall(r'[a-z]{3,}',r['body'].lower()))),reverse=True)
   found=ranked[0] if ranked and words & set(re.findall(r'[a-z]{3,}',ranked[0]['body'].lower())) else None
   sources=[];decision='refused' if refusal else 'answered' if found else 'unverified';answer=REFUSAL if refusal else FALLBACK
   if found and not refusal:
    sources=[{'id':found['id'],'version':1}]
    anchor=f"[Source: {found['title']}, Section: {found['anchor']}]"
    answer=' '.join(s.strip()+' '+anchor for s in re.split(r'(?<=[.!?])\s+',found['body']) if s.strip())
   self.emit(db,ctx,decision,clean,sources,course=course)
   return {'decision':decision,'answer':answer,'sources':sources,'mode':'Extractive local pilot; no generative model'}
 def drafts(self,token,tenant,course,body=None):
  ctx=self.identity(token,tenant)
  if ctx['role']!='instructor':raise Denied('Instructor required')
  with self.connect(tenant) as db:
   self.membership(db,ctx,course)
   if body is not None:
    if not isinstance(body,str) or not body.strip() or len(body)>5000:raise ValueError('Draft must contain 1–5000 characters')
    key=str(uuid.uuid4());db.execute('INSERT INTO drafts VALUES(?,?,?,?,?,?)',(key,course,body,'draft',1,ctx['user']));self.emit(db,ctx,'draft_created',course=course)
   return [dict(r) for r in db.execute('SELECT * FROM drafts WHERE course=?',(course,))]
 def approve(self,token,tenant,course,key,version):
  ctx=self.identity(token,tenant)
  if ctx['role']!='instructor':raise Denied('Instructor required')
  with self.connect(tenant) as db:
   self.membership(db,ctx,course)
   cursor=db.execute("UPDATE drafts SET state='approved',version=version+1 WHERE id=? AND course=? AND version=? AND state='draft'",(key,course,version))
   if cursor.rowcount!=1:raise Conflict('Draft changed or was already reviewed')
   self.emit(db,ctx,'draft_approved',reviewer=ctx['user'],course=course)
   return {'state':'approved','published':False,'message':'Approved for review records only. No grade or content publication occurred.'}
 def events(self,token,tenant,course):
  ctx=self.identity(token,tenant)
  if ctx['role']!='instructor':raise Denied('Instructor required')
  with self.connect(tenant) as db:
   self.membership(db,ctx,course)
   # Legacy unscoped events remain in the ledger but cannot be exposed to course staff.
   return [json.loads(r['payload']) for r in db.execute("SELECT payload FROM outbox WHERE json_extract(payload,'$.course_id')=? AND json_extract(payload,'$.tenant_id')=? ORDER BY rowid DESC LIMIT 50",(course,tenant))]

class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT/'dist'),**kwargs)
 def end_headers(self):
  # App-shell and script updates must not leave obsolete sign-in forms cached.
  self.send_header('Cache-Control','no-store, max-age=0')
  super().end_headers()
 def log_message(self,*args):pass
 def send_json(self,status,data):
  value=json.dumps(data).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(value)))
  if hasattr(self,'session_cookie'):self.send_header('Set-Cookie',self.session_cookie)
  self.end_headers();self.wfile.write(value)
 def do_POST(self):
  if self.headers.get('Host') not in ['127.0.0.1:4180','localhost:4180']:return self.send_json(403,{'error':'Host denied'})
  if self.headers.get('Origin') not in [None,'http://127.0.0.1:4180','http://localhost:4180']:return self.send_json(403,{'error':'Origin denied'})
  try:
   size=int(self.headers.get('Content-Length','0'))
   cookies=SimpleCookie(self.headers.get('Cookie',''))
   token=self.headers.get('Authorization','').removeprefix('Bearer ') or (cookies['scholarion_session'].value if 'scholarion_session' in cookies else '')
   limit=16000
   if self.path in ['/api/curriculum/validate','/api/cci/save','/api/assignment-packages/save','/api/studio-sources/source','/api/studio-sources/edit']:
    ctx=self.server.service.identity(token,'scholarion')
    if ctx['role']!='instructor':raise Denied('Instructor required')
    limit=2*1024*1024
   if size<1 or size>limit:return self.send_json(413,{'error':'Request exceeds the permitted size','maxBytes':limit})
   data=json.loads(self.rfile.read(size))
   if not isinstance(data,dict):raise ValueError('Object required')
   tenant=data.get('tenant','');course=data.get('course','');service=self.server.service
   if token in service.identities:
    if self.path.startswith('/api/accounts/') or self.path=='/api/session/logout':token=''
    else:raise Denied('Sign in with username, password and two-factor authentication.')
   args=(token,tenant,course)
   if self.path.startswith('/api/accounts/'):
    result=accounts.command(service,token,self.path.rsplit('/',1)[-1],data,Denied)
    if result.get('sessionToken'):
     issued=result.pop('sessionToken');self.session_cookie='scholarion_session='+issued+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800'
   elif self.path.startswith('/api/classroom-meetings/'):
    result=classroom_meetings.command(service,*args,self.path.rsplit('/',1)[-1],data,Denied)
   elif self.path=='/api/session/login':
    return self.send_json(410,{'error':'Use the username/password and authenticator sign-in page.'})
   elif self.path=='/api/session/logout':
    accounts.command(service,token,'logout',{},Denied)
    self.session_cookie='scholarion_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0';result={'signedOut':True}
   elif self.path=='/api/session':
    ctx=service.identity(token,'scholarion')
    with service.connect('scholarion') as db:courses=[r['course'] for r in db.execute("SELECT course FROM enrollments WHERE user=? AND role=? AND status='active' ORDER BY course",(ctx['user'],ctx['role']))]
    result={'user':ctx['user'],'role':ctx['role'],'accountType':ctx.get('accountType'),'courses':courses,'mode':ctx.get('realm','Local pilot')}
   elif self.path=='/api/platform/status':
    service.identity(token,tenant);result=platform_status.snapshot();result['recovery']=recovery.status(service.root)
   elif self.path.startswith('/api/studio-sources/'):result=studio_sources.command(service,*args,self.path.rsplit('/',1)[-1],data,Denied,Conflict)
   elif self.path.startswith('/api/studio-builds/'):result=studio_engine.command(service,*args,self.path.rsplit('/',1)[-1],data,Denied,Conflict)
   elif self.path.startswith('/api/assignment-packages/'):result=assignment_packages.command(service,*args,self.path.rsplit('/',1)[-1],data,Denied,Conflict)
   elif self.path.startswith('/api/voice-studio/'):result=voice_studio.command(service,*args,self.path.rsplit('/',1)[-1],data,Denied,Conflict)
   elif self.path.startswith('/api/commons/'):result=curriculum_commons.command(service,*args,self.path.rsplit('/',1)[-1],data,Denied,Conflict)
   elif self.path.startswith('/api/program-shells/'):result=program_shells.command(service,*args,self.path.rsplit('/',1)[-1],data,Denied,Conflict)
   elif self.path.startswith('/api/self-paced/'):result=self_paced.command(service,*args,self.path.rsplit('/',1)[-1],data,Denied,Conflict)
   elif self.path.startswith('/api/catalog-review/'):result=catalog_review.command(service,*args,self.path.rsplit('/',1)[-1],data,Denied,Conflict)
   elif self.path.startswith('/api/assessment-support/'):result=assessment_support.command(service,*args,self.path.rsplit('/',1)[-1],data,Denied,Conflict)
   elif self.path.startswith('/api/cci/'):result=curriculum_intelligence.command(service,*args,self.path.rsplit('/',1)[-1],data,Denied,Conflict)
   elif self.path.startswith('/api/workbench/'):result=agent_workbench.command(service,*args,self.path.rsplit('/',1)[-1],data,Denied,Conflict)
   elif self.path.startswith('/api/runtime/'):result=agent_runtime.command(service,*args,self.path.rsplit('/',1)[-1],data,Denied,Conflict)
   elif self.path=='/api/readiness/questions':result=readiness_check.public_questions()
   elif self.path=='/api/readiness/score':result=readiness_check.score(data.get('answers'),data.get('goal'))
   elif self.path=='/api/dashboard':result=live_dashboard.snapshot(service,*args,Denied)
   elif self.path.startswith('/api/acceptance/'):result=operational_acceptance.command(service,*args,self.path.rsplit('/',1)[-1],data,Denied,Conflict)
   elif self.path.startswith('/api/departments/'):result=department_service.command(service,*args,self.path.rsplit('/',1)[-1],data,Denied,Conflict)
   elif self.path.startswith('/api/integrations/'):result=integration_registry.command(service,*args,self.path.rsplit('/',1)[-1],data,Denied,Conflict)
   elif self.path.startswith('/api/hub/'):result=hub_service.command(service,*args,self.path.rsplit('/',1)[-1],data,Denied,Conflict)
   elif self.path.startswith('/api/curriculum/'):result=curriculum_engine.api(service,*args,self.path.rsplit('/',1)[-1],data,Denied)
   elif self.path=='/api/enterprise/turn':result=enterprise_orchestration.turn(service,*args,data,Denied)
   elif self.path=='/api/enterprise/cases':result=enterprise_orchestration.cases(service,*args,Denied)
   elif self.path.startswith('/api/coursework/'):result=lms_service.command(service,*args,self.path.rsplit('/',1)[-1],data,Denied,Conflict)
   elif self.path=='/api/governed/query':result=service.query(*args,data.get('question'))
   elif self.path=='/api/governed/drafts':result=service.drafts(*args,data.get('body'))
   elif self.path=='/api/governed/approve':result=service.approve(*args,data.get('id'),data.get('version'))
   elif self.path=='/api/governed/audit':result=service.events(*args)
   else:return self.send_json(404,{'error':'Unknown API'})
   self.send_json(200,result)
  except Denied as e:self.send_json(403,{'error':str(e)})
  except Conflict as e:self.send_json(412,{'error':str(e)})
  except (ValueError,TypeError,AttributeError):self.send_json(400,{'error':'Invalid request'})
  except Exception:self.send_json(500,{'error':'Service error'})

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--data',default=str(ROOT/'private-governed'));args=parser.parse_args()
 service=Service(args.data);server=PilotServer(('127.0.0.1',4180),Handler);server.service=service
 print('Governed local pilot: http://127.0.0.1:4180/#governed-agent',flush=True);server.serve_forever()
