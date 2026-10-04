"""Deterministic, resumable local action runner. No LLM or arbitrary code execution."""
import json,time,uuid
TOOLS={'create_support_request':{'description':'Create one local course support record after instructor review. No external notification.','inputSchema':{'type':'object','additionalProperties':False,'required':['title','body'],'properties':{'title':{'type':'string','minLength':1,'maxLength':150},'body':{'type':'string','minLength':1,'maxLength':5000}}},'approvalRequired':True}}
def validate_arguments(args):
 if not isinstance(args,dict) or set(args)!={'title','body'}:raise ValueError('Expected only title and body')
 for key,limit in [('title',150),('body',5000)]:
  if not isinstance(args[key],str) or not 1<=len(args[key].strip())<=limit:raise ValueError('Invalid '+key)
 return {k:v.strip() for k,v in args.items()}
def command(service,token,tenant,course,action,data,Denied,Conflict):
 ctx=service.identity(token,tenant)
 if tenant!='scholarion':raise Denied('Scholarion runtime only')
 with service.connect(tenant) as db:
  db.execute('BEGIN IMMEDIATE');service.membership(db,ctx,course)
  db.execute('CREATE TABLE IF NOT EXISTS agent_runs(id TEXT PRIMARY KEY,course TEXT NOT NULL,owner TEXT NOT NULL,tool TEXT NOT NULL,args TEXT NOT NULL,state TEXT NOT NULL,version INTEGER NOT NULL,reviewer TEXT,result_id TEXT,created REAL NOT NULL,request_key TEXT NOT NULL,UNIQUE(course,owner,request_key))')
  def event(name,key):
   db.execute('INSERT INTO outbox VALUES(?,?)',(str(uuid.uuid4()),json.dumps({'timestamp':time.time(),'tenant_id':tenant,'course_id':course,'user_id':ctx['user'],'decision_code':name,'run_id':key,'agent':'bounded-action-runner','agent_version':'1'})))
  if action=='list':
   rows=db.execute('SELECT * FROM agent_runs WHERE course=? AND (owner=? OR ?=?) ORDER BY created DESC LIMIT 100',(course,ctx['user'],ctx['role'],'instructor')).fetchall()
   return {'role':ctx['role'],'tools':TOOLS,'runs':[dict(r,args=json.loads(r['args'])) for r in rows],'mode':'Deterministic local runner; no live AI inference'}
  if action=='propose':
   if data.get('tool') not in TOOLS:raise ValueError('Tool not registered')
   args=validate_arguments(data.get('args'));encoded=json.dumps(args,sort_keys=True)
   key=data.get('request_key')
   if not isinstance(key,str) or not 8<=len(key)<=100:raise ValueError('Request key required')
   old=db.execute('SELECT * FROM agent_runs WHERE course=? AND owner=? AND request_key=?',(course,ctx['user'],key)).fetchone()
   if old:
    if old['args']!=encoded or old['tool']!=data['tool']:raise Conflict('Request key used for another proposal')
    return {'id':old['id'],'state':old['state'],'version':old['version']}
   count=db.execute('SELECT COUNT(*) FROM agent_runs WHERE owner=? AND created>?',(ctx['user'],time.time()-60)).fetchone()[0]
   if count>=10:raise ValueError('Proposal rate limit exceeded; retry after one minute')
   ident=str(uuid.uuid4());db.execute('INSERT INTO agent_runs VALUES(?,?,?,?,?,?,?,?,?,?,?)',(ident,course,ctx['user'],data['tool'],encoded,'awaiting_approval',1,None,None,time.time(),key));event('agent.action.proposed',ident)
   return {'id':ident,'state':'awaiting_approval','version':1}
  row=db.execute('SELECT * FROM agent_runs WHERE id=? AND course=?',(data.get('id'),course)).fetchone()
  if not row or not(row['owner']==ctx['user'] or ctx['role']=='instructor'):raise Denied('Run unavailable')
  if action=='resume' and row['state']=='completed':return {'id':row['id'],'state':'completed','result_id':row['result_id'],'replayed':True}
  if type(data.get('version')) is not int or data['version']!=row['version']:raise Conflict('Run changed; refresh before acting')
  if action in ('approve','reject'):
   if ctx['role']!='instructor':raise Denied('Instructor review required')
   if row['state']!='awaiting_approval':raise Conflict('Run is not awaiting review')
   state='approved' if action=='approve' else 'rejected'
   db.execute('UPDATE agent_runs SET state=?,reviewer=?,version=version+1 WHERE id=?',(state,ctx['user'],row['id']));event('agent.action.'+state,row['id'])
   return {'id':row['id'],'state':state,'version':row['version']+1}
  if action!='resume':raise ValueError('Unknown runtime operation')
  if row['state']!='approved':raise Conflict('Approval required before execution')
  # Recheck the action owner's active membership immediately before execution.
  if not db.execute("SELECT 1 FROM enrollments WHERE user=? AND course=? AND status='active'",(row['owner'],course)).fetchone():raise Denied('Action owner no longer enrolled')
  args=validate_arguments(json.loads(row['args']))
  db.execute('CREATE TABLE IF NOT EXISTS hub_records(id TEXT PRIMARY KEY,course TEXT,kind TEXT,owner TEXT,title TEXT,body TEXT,event_date TEXT,state TEXT,version INTEGER,created REAL)')
  result=str(uuid.uuid4());db.execute('INSERT INTO hub_records VALUES(?,?,?,?,?,?,?,?,?,?)',(result,course,'help',row['owner'],args['title'],args['body'],'','active',1,time.time()))
  db.execute("UPDATE agent_runs SET state='completed',result_id=?,version=version+1 WHERE id=?",(result,row['id']));event('agent.action.completed',row['id'])
  return {'id':row['id'],'state':'completed','result_id':result,'version':row['version']+1,'externalNotification':False}
