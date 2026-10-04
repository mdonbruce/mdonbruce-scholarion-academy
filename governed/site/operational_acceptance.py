"""Local evidence register. It cannot authorize production deployment."""
import json,time,uuid
AREAS={'functional':'End-to-end learner journey','performance':'Load at three times expected peak','resilience':'Service and dependency failure recovery','recovery':'RPO 15 minutes / RTO 4 hours restore drill','security':'Security assessment and no high/critical findings','integrity':'SIS/LMS reconciliation','accessibility':'Automated and manual accessibility checks','observability':'Owned alerts, dashboards and traces','operations':'On-call, runbooks and trained staff','compliance':'Published privacy, consent, retention and financial policies'}
CAPABILITIES={'grpc':'Contracts only; no gRPC runtime or service mesh','identity':'Username/password and authenticator MFA with HttpOnly sessions; enterprise SSO not configured','sis_sync':'No Canvas or SIS connector','inference':'Hosted planning adapter with local read tools; live provider acceptance unverified','acceptance':'Local evidence register; no full acceptance runner'}
def command(service,token,tenant,course,action,data,Denied,Conflict):
 ctx=service.identity(token,tenant)
 if tenant!='scholarion' or ctx['role']!='instructor':raise Denied('Scholarion pilot instructor required')
 with service.connect(tenant) as db:
  service.membership(db,ctx,course)
  db.execute('CREATE TABLE IF NOT EXISTS acceptance_evidence(id TEXT PRIMARY KEY,area TEXT,release TEXT,owner TEXT,reference TEXT,note TEXT,created REAL,author TEXT)')
  if 'course' not in {r['name'] for r in db.execute('PRAGMA table_info(acceptance_evidence)')}:db.execute('ALTER TABLE acceptance_evidence ADD COLUMN course TEXT')
  if action=='record':
   if data.get('area') not in AREAS:raise ValueError('Unknown acceptance area')
   for field,limit in [('release',120),('owner',120),('reference',1000),('note',2000)]:
    if not isinstance(data.get(field),str) or not 1<=len(data[field].strip())<=limit:raise ValueError('Evidence fields required')
   key=str(uuid.uuid4())
   db.execute('INSERT INTO acceptance_evidence VALUES(?,?,?,?,?,?,?,?,?)',(key,data['area'],data['release'],data['owner'],data['reference'],data['note'],time.time(),ctx['user'],course))
   db.execute('INSERT INTO outbox VALUES(?,?)',(str(uuid.uuid4()),json.dumps({'timestamp':time.time(),'user_id':ctx['user'],'tenant_id':tenant,'course_id':course,'decision_code':'acceptance.evidence.submitted','evidence_id':key,'agent':'oat-register','agent_version':'1','release':data['release']})))
   return {'id':key,'status':'submitted_unverified','production_allowed':False}
  if action=='status':
   return {'liveness':'running','readiness':'blocked','production_allowed':False,'capabilities':CAPABILITIES,'areas':[{'id':key,'name':name,'status':'not_verified'} for key,name in AREAS.items()],'evidence':[dict(r) for r in db.execute('SELECT * FROM acceptance_evidence WHERE course=? ORDER BY created DESC LIMIT 100',(course,))],'blockers':['Full learner journey unavailable','No independent evidence verification','No platform owner, security lead or academic operations sign-off','Expected peak concurrency not configured']}
  raise ValueError('Unknown acceptance operation')
