"""Local retrieval and structured scenario service; learner-safe projections."""
import json,re,math,hashlib,time,uuid
def vector(text):
 v=[0.0]*256
 for word in re.findall(r'[a-z0-9]+',text.lower()):
  h=int(hashlib.sha256(word.encode()).hexdigest()[:8],16);v[h%256]+=1
 norm=math.sqrt(sum(x*x for x in v)) or 1
 return [x/norm for x in v]
def text(value,limit):
 if not isinstance(value,str) or not 1<=len(value.strip())<=limit:raise ValueError('Invalid text')
 return value.strip()
def command(service,token,tenant,course,action,data,Denied,Conflict):
 ctx=service.identity(token,tenant)
 if tenant!='scholarion':raise Denied('Scholarion only')
 with service.connect(tenant) as db:
  service.membership(db,ctx,course)
  db.executescript('''CREATE TABLE IF NOT EXISTS agent_memory(id TEXT PRIMARY KEY,course TEXT,owner TEXT,body TEXT,embedding TEXT);
CREATE TABLE IF NOT EXISTS avatar_scenarios(id TEXT PRIMARY KEY,course TEXT,config TEXT);
CREATE TABLE IF NOT EXISTS avatar_sessions(id TEXT PRIMARY KEY,scenario TEXT,owner TEXT,turns INTEGER,state TEXT);''')
  db.execute('CREATE TABLE IF NOT EXISTS planner_runs(id TEXT PRIMARY KEY,course TEXT,owner TEXT,state TEXT,result TEXT,created REAL)')
  def audit(kind,key):db.execute('INSERT INTO outbox VALUES(?,?)',(str(uuid.uuid4()),json.dumps({'timestamp':time.time(),'tenant_id':tenant,'course_id':course,'user_id':ctx['user'],'decision_code':kind,'record_id':key})))
  if action=='planner_status':
   import hosted_planner
   result=hosted_planner.status()
   last=db.execute("SELECT MAX(created) FROM planner_runs WHERE state IN ('completed','action_review_required','budget_exhausted')").fetchone()[0]
   result.update({'lastSuccessfulCall':last,'dailyRunLimit':hosted_planner.CAPACITY['dailyRunsPerInstructor'],'maxDecisionsPerRun':hosted_planner.CAPACITY['maxDecisionsPerRun'],'maxConcurrentCalls':hosted_planner.CAPACITY['maxConcurrentCallsPerProcess']})
   return result
  if action=='plans':
   return {'plans':[dict(r,result=json.loads(r['result'])) for r in db.execute('SELECT * FROM planner_runs WHERE course=? AND owner=? ORDER BY created DESC LIMIT 25',(course,ctx['user']))]}
  if action=='plan':
   if ctx['role']!='instructor':raise Denied('Instructor required for hosted planning')
   if data.get('synthetic') is not True:raise ValueError('Synthetic goals only')
   import hosted_planner,model_planner
   goal=text(data.get('goal'),2000)
   db.execute('BEGIN IMMEDIATE')
   used=db.execute('SELECT COUNT(*) FROM planner_runs WHERE owner=? AND created>?',(ctx['user'],time.time()-86400)).fetchone()[0]
   if used>=hosted_planner.CAPACITY['dailyRunsPerInstructor']:raise ValueError('Daily planning limit reached')
   key=str(uuid.uuid4());db.execute('INSERT INTO planner_runs VALUES(?,?,?,?,?,?)',(key,course,ctx['user'],'running','{}',time.time()));db.commit()
   def read_tool(tool):
    if tool=='read_course_standard':return {'weeks':10,'source':'course_formats.json','mode':'Read-only local standard'}
    # Private note text never leaves the local service in tool observations.
    return {'privateNoteCount':db.execute('SELECT COUNT(*) FROM agent_memory WHERE owner=? AND course=?',(ctx['user'],course)).fetchone()[0],'contentExcluded':True}
   try:result=model_planner.plan(hosted_planner.Provider(),goal,max_steps=hosted_planner.CAPACITY['maxDecisionsPerRun'],read_tool=read_tool)
   except Exception:
    db.execute("UPDATE planner_runs SET state='failed' WHERE id=?",(key,));audit('planner.failed',key);db.commit();raise
   db.execute('UPDATE planner_runs SET state=?,result=? WHERE id=?',(result['state'],json.dumps(result),key));audit('planner.proposed',key)
   return dict(result,id=key)
  if action=='mcp_tools':
   import local_mcp
   return local_mcp.call_local('tools/list')
  if action=='mcp_call':
   import local_mcp
   return local_mcp.call_local('tools/call',{'name':'course_standard','arguments':{}})
  if action=='remember':
   body=text(data.get('body'),4000);key=str(uuid.uuid4());db.execute('INSERT INTO agent_memory VALUES(?,?,?,?,?)',(key,course,ctx['user'],body,json.dumps(vector(body))));audit('memory.created',key);return {'id':key}
  if action=='search':
   q=vector(text(data.get('query'),1000));rows=[]
   for r in db.execute('SELECT * FROM agent_memory WHERE course=? AND owner=?',(course,ctx['user'])):
    similarity=sum(a*b for a,b in zip(q,json.loads(r['embedding'])))
    if similarity>0:rows.append({'id':r['id'],'body':r['body'],'score':similarity})
   return {'method':'Local hashed token vectors with cosine similarity; not semantic model embeddings','matches':sorted(rows,key=lambda r:r['score'],reverse=True)[:5]}
  if action=='forget':
   db.execute('DELETE FROM agent_memory WHERE id=? AND course=? AND owner=?',(data.get('id'),course,ctx['user']));audit('memory.deleted',data.get('id'));return {'deleted':True}
  if action=='scenario_create':
   if ctx['role']!='instructor':raise Denied('Instructor required')
   c=data.get('config')
   if not isinstance(c,dict) or set(c)!={'title','situation','goal','rubric','character','traits','background','condition','resistance','agreement'}:raise ValueError('Scenario fields required')
   for k in set(c)-{'traits','rubric'}:c[k]=text(c[k],2000)
   if not isinstance(c['traits'],list) or not 1<=len(c['traits'])<=3:raise ValueError('One to three traits required')
   if not isinstance(c['rubric'],list) or not 1<=len(c['rubric'])<=5:raise ValueError('Rubric required')
   c['traits']=[text(v,100) for v in c['traits']];c['rubric']=[text(v,300) for v in c['rubric']]
   key=str(uuid.uuid4());db.execute('INSERT INTO avatar_scenarios VALUES(?,?,?)',(key,course,json.dumps(c)));audit('scenario.created',key);return {'id':key}
  if action=='scenarios':
   return {'scenarios':[{'id':r['id'],**{k:v for k,v in json.loads(r['config']).items() if k in ('title','situation','goal','rubric','character')}} for r in db.execute('SELECT * FROM avatar_scenarios WHERE course=?',(course,))]}
  if action=='scenario_start':
   r=db.execute('SELECT * FROM avatar_scenarios WHERE id=? AND course=?',(data.get('id'),course)).fetchone()
   if not r:raise Denied('Scenario unavailable')
   key=str(uuid.uuid4());db.execute('INSERT INTO avatar_sessions VALUES(?,?,?,?,?)',(key,r['id'],ctx['user'],0,'resisting'));return {'session':key,'message':json.loads(r['config'])['resistance'],'mode':'Rule-based text roleplay'}
  if action=='scenario_turn':
   db.execute('BEGIN IMMEDIATE')
   r=db.execute('SELECT s.*,c.config FROM avatar_sessions s JOIN avatar_scenarios c ON c.id=s.scenario WHERE s.id=? AND s.owner=? AND c.course=?',(data.get('session'),ctx['user'],course)).fetchone()
   if not r:raise Denied('Session unavailable')
   if r['turns']>=20:raise ValueError('Session turn limit reached')
   answer=text(data.get('answer'),2000);c=json.loads(r['config']);agreed=r['state']=='agreed' or c['condition'].casefold() in answer.casefold();state='agreed' if agreed else 'resisting'
   db.execute('UPDATE avatar_sessions SET turns=turns+1,state=? WHERE id=?',(state,r['id']));audit('scenario.turn',r['id'])
   return {'session':r['id'],'state':state,'message':c['agreement'] if agreed else c['resistance'],'mode':'Rule-based phrase condition; no automated grade'}
  raise ValueError('Unknown workbench operation')
