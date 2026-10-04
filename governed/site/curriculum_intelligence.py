"""Course-scoped curriculum graph drafts and review evidence. No external exchange."""
import datetime,hashlib,json,re,time,uuid
from catalog_review import findings as claim_findings
NODE_TYPES=['institution','program','course','module','topic','competency','outcome','skill','job_role','assessment','item','rubric','criterion','activity','lab','resource','tool','standard','credential','pathway_rule']
EDGES=['teaches','assesses','aligns_to','requires','builds_on','maps_to_standard','maps_to_skill','prepares_for_role','uses_tool','cites','derived_from_package','supersedes']
ATTRIBUTES={'description','weeks','hours','sequence','weight','verb','bloom','condition','criterion','license','citation','sourceVersion','verifiedDate','url','requirements','credentialType','executionStatus','accessibilityEvidence','prerequisites','delivery','audience','level','skills','rubric','creditStatus'}
BLOCKERS=['Specification section 5 (Curriculum Exchange) missing','Specification section 6 (approval roles) missing','Faculty content and accessibility review required']

def text(value,limit=2000):
 if not isinstance(value,str) or not 1<=len(value.strip())<=limit:raise ValueError('Nonempty text required')
 return value.strip()

def graph(value):
 if not isinstance(value,dict) or set(value)!={'nodes','edges'}:raise ValueError('Graph requires nodes and edges')
 nodes=value['nodes'];edges=value['edges']
 if not isinstance(nodes,list) or not isinstance(edges,list) or len(nodes)>3000 or len(edges)>12000:raise ValueError('Graph size invalid')
 ids=set()
 for n in nodes:
  if not isinstance(n,dict) or set(n)!={'id','type','title','attributes'}:raise ValueError('Node fields invalid; learner records are not accepted')
  key=text(n['id'],100)
  if key in ids or n['type'] not in NODE_TYPES:raise ValueError('Duplicate node or unknown type')
  ids.add(key);text(n['title'],250)
  a=n['attributes']
  if not isinstance(a,dict) or set(a)-ATTRIBUTES:raise ValueError('Unknown attributes; identities, grades and enrollments are not curriculum')
  for v in a.values():
   if not isinstance(v,(str,int,float,bool)) or isinstance(v,str) and len(v)>6000:raise ValueError('Attributes must be bounded scalar values')
  if n['type']=='course' and a.get('weeks')!=10:raise ValueError('Scholarion courses use ten weeks')
  if a.get('creditStatus','non-credit')!='non-credit':raise ValueError('Credit recognition requires an approved agreement workflow')
 for e in edges:
  if not isinstance(e,dict) or set(e)!={'from','to','type'} or e['from'] not in ids or e['to'] not in ids or e['type'] not in EDGES:raise ValueError('Invalid graph edge')
 return value

def evidence(g):
 findings=[];nodes={n['id']:n for n in g['nodes']};edges=g['edges'];today=datetime.date.today()
 def issue(node,code,reason):findings.append({'node':node,'code':code,'reason':reason,'source':'Saved curriculum graph','confidence':'rule-based'})
 for n in nodes.values():
  key=n['id'];kind=n['type'];a=n['attributes']
  if kind=='outcome' and not any(e['to']==key and e['type']=='assesses' and nodes[e['from']]['type'] in ['assessment','item'] for e in edges):issue(key,'unassessed_outcome','No assessment targets this outcome')
  if kind=='assessment' and not any(e['from']==key and e['type']=='assesses' and nodes[e['to']]['type']=='outcome' for e in edges):issue(key,'unaligned_assessment','No outcome is linked')
  if kind=='module' and not any(e['from']==key and e['type']=='teaches' and nodes[e['to']]['type']=='outcome' for e in edges):issue(key,'unaligned_module','No outcome is linked')
  if claim_findings(n['title'],str(a.get('description',''))) or re.search(r'\bcompliant\b',n['title'],re.I):issue(key,'claim_review','Unsupported claim language requires removal or human evidence review')
  if kind in ['resource','tool','standard','skill']:
   if not a.get('license') or not a.get('citation'):issue(key,'source_evidence','License and citation evidence are missing')
   try:
    age=(today-datetime.date.fromisoformat(a.get('verifiedDate',''))).days
    if age<0 or age>180:issue(key,'freshness','Verification date is future-dated or older than the pilot 180-day review interval')
   except ValueError:issue(key,'freshness','A valid verification date is missing')
  if kind in ['module','resource','activity','lab'] and not a.get('accessibilityEvidence'):issue(key,'accessibility_review','Accessibility evidence is missing; automated rules cannot establish WCAG conformance')
  if kind=='lab' and a.get('executionStatus')!='executed':issue(key,'lab_execution','Executed solution evidence is not recorded')
 return {'findings':findings,'nodeCount':len(nodes),'edgeCount':len(edges),'releaseAllowed':False,'blockers':BLOCKERS,'claims':'Review evidence only; no accreditation or credit recognition is asserted','analytics':'Curriculum metadata only; live learner health is not connected'}

def draft(title,kind,audience):
 def node(i,t,label,**attrs):return {'id':i,'type':t,'title':label,'attributes':attrs}
 nodes=[node('root',kind,title,audience=audience,creditStatus='non-credit',**({'weeks':10} if kind=='course' else {}))];edges=[]
 if kind=='course':
  for i in range(1,6):nodes.append(node(f'c{i}','competency',f'Design a measurable competency {i}',description='Faculty must define performance criteria'))
  kinds=['assignment','lab','assignment','lab','project','assignment','lab','assignment','assignment','project']
  for week,assessment in enumerate(kinds,1):
   nodes.extend([node(f'm{week}','module',f'Week {week}: {title}',sequence=week),node(f'o{week}','outcome',f'Apply and demonstrate week {week} learning',verb='Apply',criterion='Faculty definition required'),node(f'a{week}','assessment',f'Week {week} {assessment}',description='Faculty must author instructions, rubric and evidence')])
   edges.extend([{'from':f'm{week}','to':f'o{week}','type':'teaches'},{'from':f'a{week}','to':f'o{week}','type':'assesses'},{'from':f'o{week}','to':f'c{(week-1)%5+1}','type':'aligns_to'},{'from':'root','to':f'm{week}','type':'requires'}])
 else:
  nodes.append(node('capstone','assessment','Applied capstone concept',description='Define a contextual problem and observable evidence'))
  edges.append({'from':'root','to':'capstone','type':'requires'})
 return {'nodes':nodes,'edges':edges}

def from_package(p,review):
 """Project known curriculum fields only; never copy arbitrary package attributes."""
 nodes=[];edges=[]
 def add(key,kind,title,**attributes):nodes.append({'id':key,'type':kind,'title':str(title)[:250] or key,'attributes':attributes})
 add('root','course',p['title'],weeks=10,sourceVersion=review,creditStatus='non-credit')
 for c in p['competencies']:add('competency:'+c['id'],'competency',c['statement'])
 for t in p['topics']:add('topic:'+t['id'],'topic',t['title'],description=str(t['summary'])[:6000])
 for o in p['outcomes']:
  key='outcome:'+o['id'];add(key,'outcome',o.get('statement',o['id']))
  edges.extend([{'from':key,'to':'competency:'+o['competency'],'type':'aligns_to'},{'from':'topic:'+o['topic'],'to':key,'type':'teaches'}])
 for m in p['modules']:
  key='module:'+str(m['week']);add(key,'module','Week '+str(m['week']),sequence=m['week'],hours=m['hours'],description=str(m['overview'])[:6000])
  edges.append({'from':'root','to':key,'type':'requires'})
  for o in p['outcomes']:
   if o['topic']==m['topic']:edges.append({'from':key,'to':'outcome:'+o['id'],'type':'teaches'})
 for a in p['assessments']:
  key='assessment:'+a['id'];add(key,'assessment',a.get('title',a['type']),weight=a['weight'])
  for outcome in a['outcomes']:edges.append({'from':key,'to':'outcome:'+outcome,'type':'assesses'})
  for i,r in enumerate(a.get('rubric',[])):
   rk=key+':criterion:'+str(i);add(rk,'criterion',r.get('title','Criterion '+str(i+1)),rubric=json.dumps(r['levels']))
   edges.extend([{'from':key,'to':rk,'type':'requires'},{'from':rk,'to':'outcome:'+r['outcome'],'type':'aligns_to'}])
  for q in a.get('bank',[]):
   qk=key+':item:'+q['id'];add(qk,'item',q['prompt'],description=str(q['rationale'])[:6000]);edges.append({'from':qk,'to':'outcome:'+q['outcome'],'type':'assesses'});edges.append({'from':key,'to':qk,'type':'requires'})
 return graph({'nodes':nodes,'edges':edges})

def command(service,token,tenant,course,action,data,Denied,Conflict):
 ctx=service.identity(token,tenant)
 if tenant!='scholarion' or ctx['role']!='instructor':raise Denied('Authorized Scholarion instructor required')
 with service.connect(tenant) as db:
  service.membership(db,ctx,course)
  db.executescript('''CREATE TABLE IF NOT EXISTS cci_versions(id TEXT,revision INTEGER,course TEXT,version TEXT,title TEXT,state TEXT,graph TEXT,author TEXT,created REAL,note TEXT,PRIMARY KEY(id,revision));
CREATE TRIGGER IF NOT EXISTS cci_immutable_update BEFORE UPDATE ON cci_versions BEGIN SELECT RAISE(ABORT,'Curriculum history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS cci_immutable_delete BEFORE DELETE ON cci_versions BEGIN SELECT RAISE(ABORT,'Curriculum history is immutable'); END;''')
  if action=='list':return {'drafts':[dict(r) for r in db.execute('SELECT id,revision,version,title,state,created FROM cci_versions v WHERE course=? AND revision=(SELECT MAX(revision) FROM cci_versions WHERE id=v.id) ORDER BY created DESC',(course,))],'nodeTypes':NODE_TYPES,'edgeTypes':EDGES,'blockers':BLOCKERS}
  if action in ['exchange','publish']:raise Denied('Exchange and publication require the missing approval policy; no transfer was performed')
  db.execute('BEGIN IMMEDIATE')
  if action=='from_review':
   if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='curriculum_reviews'").fetchone():raise ValueError('Validate a course package first')
   review=db.execute('SELECT * FROM curriculum_reviews WHERE id=? AND course=?',(data.get('review'),course)).fetchone()
   if not review:raise Denied('Course review unavailable')
   import curriculum_engine
   p=json.loads(review['package'])
   if curriculum_engine.validate(p):raise ValueError('Resolve structural errors before graph conversion')
   g=from_package(p,review['id']);title=p['title'];key=str(uuid.uuid4());revision=1;version='0.1.0';state='draft';note='AI DRAFT — projected from local curriculum review '+review['id']+'; no external package transfer'
  elif action=='create':
   title=text(data.get('title'),250);kind=data.get('kind')
   if kind not in ['program','course']:raise ValueError('Program or course required')
   g=draft(title,kind,text(data.get('audience'),500));key=str(uuid.uuid4());revision=1;version='0.1.0';state='draft';note='AI DRAFT — template scaffold, not a full generated course; human educator review required'
  else:
   old=db.execute('SELECT * FROM cci_versions WHERE id=? AND course=? ORDER BY revision DESC LIMIT 1',(data.get('id'),course)).fetchone()
   if not old:raise Denied('Curriculum draft unavailable')
   g=json.loads(old['graph']);key=old['id'];title=old['title'];revision=old['revision'];version=old['version'];state=old['state'];note=old['note']
   if action in ['get','evidence']:
    result=dict(old,graph=g);result['evidence']=evidence(g);result['sha256']=hashlib.sha256(old['graph'].encode()).hexdigest()
    result['history']=[dict(r) for r in db.execute('SELECT revision,version,state,author,created,note FROM cci_versions WHERE id=? ORDER BY revision',(key,))];return result
   if data.get('revision')!=revision:raise Conflict('Draft changed; refresh before saving')
   if action=='save':
    g=graph(data.get('graph'));version=text(data.get('version'),30)
    root=next((n for n in g['nodes'] if n['id']=='root' and n['type'] in ['program','course']),None)
    if not root:raise ValueError('Preserve the root program or course node')
    title=root['title']
    if not re.fullmatch(r'\d+\.\d+\.\d+',version) or tuple(map(int,version.split('.')))<=tuple(map(int,old['version'].split('.'))):raise ValueError('Supply a higher semantic version')
    state='draft';note=text(data.get('note'),1000)
   elif action=='propose':
    if state not in ['draft','changes_requested']:raise Conflict('Draft is not ready for submission')
    state='in_review';note='Submitted for human review; release remains blocked'
   elif action=='review':
    if state!='in_review':raise Conflict('Not awaiting review')
    if db.execute("SELECT 1 FROM cci_versions WHERE id=? AND state='draft' AND author=?",(key,ctx['user'])).fetchone():raise Denied('A different authorized instructor must review')
    if data.get('decision') not in ['reviewed','changes_requested']:raise ValueError('Review decision required')
    state=data['decision'];note=text(data.get('note'),1000)
   else:raise ValueError('Unknown curriculum operation')
   revision+=1
  encoded=json.dumps(graph(g),sort_keys=True,allow_nan=False)
  db.execute('INSERT INTO cci_versions VALUES(?,?,?,?,?,?,?,?,?,?)',(key,revision,course,version,title,state,encoded,ctx['user'],time.time(),note));service.emit(db,ctx,'cci.'+action,course=course)
  return {'id':key,'revision':revision,'state':state,'version':version,'releaseAllowed':False}
