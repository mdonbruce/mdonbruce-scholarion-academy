"""Assignment package authoring and structural review; no automatic academic approval."""
import json,time,uuid,math
LABEL='AI DRAFT — requires SME and instructional-designer approval.'
BLOOM=['Remember','Understand','Apply','Analyze','Evaluate','Create']
FORMATS={
'lab':{'sections':['Purpose','Setup','Background','Data card','Part 1','Part 2','Part 3','Part 4','Part 5','Challenge','Autograder','Troubleshooting','Reflection'],'minutes':[60,120],'rubricPoints':100},
'exercises':{'sections':['Warm-up (4)','Core (5)','Stretch (3)','Transfer (1–2)','Hint ladders','Common mistakes'],'rubricPoints':None},
'activity':{'sections':['Title','Objective','Activity Overview','Step 1','Step 2: Hands-On Implementation','Step 3: Task','Step 4: Research, Discussion & Reflection','Step 5: Wrap-Up','Instructor Emphasizes','Reflection Questions','Submission','Reminders'],'rubricPoints':None},
'quiz':{'sections':['Blueprint','Student quiz','Settings','Accommodations','LMS import note'],'rubricPoints':None},
'mini_project':{'sections':['Brief','Concept mapping','Starter structure','Data card','Definition of done','Rubric'],'rubricPoints':50},
'scenario_project':{'sections':['Scenario brief','Requirements','Constraints','Data card','Milestones','Alignment','Rubric','Team mechanics','Alternate scenarios'],'rubricPoints':100},
'capstone':{'sections':['Overview','Five options','Proposal template','Compliance and budget','Eight phases','Rubric','Competency evidence','Supervision kit','Portfolio and career outputs'],'rubricPoints':100}}
def template(kind,course):
 if not isinstance(kind,str) or kind not in FORMATS:raise ValueError('Unknown assignment format')
 return {'label':LABEL,'kind':kind,'context':{'program':'','course':course,'week':1,'topic':'','level':'Beginner','learners':'','delivery':'','prerequisites':''},'competencies':[{'id':f'C{i}','text':''} for i in range(1,6)],'outcomes':[],'pillars':{'problem':'','constraints':[],'tools':[],'done':[]},'sections':[{'heading':x,'text':''} for x in FORMATS[kind]['sections']],'tasks':[],'items':[],'criteria':[],'deliverables':[],'readings':[],'tools':[],'dataCards':[],'aiPolicy':'Allowed with disclosure','quizSize':None,'minutes':None,'instructor':{'keys':[],'solutions':[],'gradingNotes':'','timing':'','commonMistakes':[]},'reviewEvidence':{'sme':None,'instructionalDesigner':None,'accessibility':None,'execution':None}}
def validate(p):
 errors=[]
 def issue(path,msg):errors.append({'path':path,'message':msg})
 if not isinstance(p,dict):return [{'path':'$','message':'Package must be an object'}]
 kind=p.get('kind')
 if not isinstance(kind,str) or kind not in FORMATS:return [{'path':'kind','message':'Select one of the seven supported formats'}]
 if p.get('label')!=LABEL:issue('label','Required AI-draft label missing')
 for key in ['competencies','outcomes','tasks','items','criteria','deliverables']:
  rr=p.get(key,[])
  if not isinstance(rr,list) or not all(isinstance(r,dict) for r in rr):return [{'path':key,'message':'Expected records'}]
  for r in rr:
   if any(k in r and not isinstance(r[k],str) for k in ['id','lo','competency','bloom']):return [{'path':key,'message':'Identifiers and Bloom values must be strings'}]
 ctx=p.get('context',{})
 if not isinstance(ctx,dict):ctx={}
 for k in ['program','course','topic','level','learners','delivery','prerequisites']:
  if not isinstance(ctx.get(k),str) or not ctx[k].strip():issue('context/'+k,'Required placement field')
 if type(ctx.get('week')) is not int or not 1<=ctx['week']<=10:issue('context/week','Week must be 1–10')
 def rows(key):
  r=p.get(key,[])
  if not isinstance(r,list) or not all(isinstance(x,dict) for x in r):issue(key,'Expected an array of objects');return []
  return r
 comps=rows('competencies');outs=rows('outcomes');cids={c.get('id') for c in comps if isinstance(c.get('id'),str)};oids={o.get('id'):o for o in outs if isinstance(o.get('id'),str)}
 if len(comps)!=5 or len(cids)!=5 or any(not c.get('text') for c in comps):issue('competencies','Five distinct, written competencies required')
 if not outs or len(oids)!=len(outs):issue('outcomes','Unique learning outcomes required')
 for o in outs:
  if o.get('competency') not in cids or o.get('bloom') not in BLOOM or not o.get('text'):issue('outcomes','Each outcome needs text, a competency and Bloom level')
 pillars=p.get('pillars',{})
 if not isinstance(pillars,dict):pillars={}
 for key in ['problem','constraints','tools','done']:
  if not pillars.get(key):issue('pillars/'+key,'Project pillar evidence required')
 if kind=='mini_project' and (not isinstance(pillars.get('constraints'),list) or not 2<=len(pillars['constraints'])<=3):issue('pillars/constraints','Mini-project requires 2–3 constraints')
 sections=rows('sections')
 if [s.get('heading') for s in sections]!=FORMATS[kind]['sections']:issue('sections','Use all required headings in order')
 for s in sections:
  if not isinstance(s.get('text'),str) or not s['text'].strip():issue('sections/'+str(s.get('heading')),'Authored content missing')
 mapped=set()
 for key in ['tasks','items','criteria','deliverables']:
  rr=rows(key)
  if not rr and key!='items':issue(key,'At least one aligned entry required')
  for r in rr:
   lo=r.get('lo');out=oids.get(lo) if isinstance(lo,str) else None
   if not out or r.get('competency')!=out.get('competency'):issue(key+'/'+str(r.get('id')),'LO and competency mapping mismatch')
   else:
    mapped.add(lo)
    if r.get('bloom')!=out.get('bloom'):issue(key+'/'+str(r.get('id')),'Bloom demand must match the mapped outcome; semantic review still required')
   if not r.get('text'):issue(key,'Entry text missing')
 for key in oids.keys()-mapped:issue('outcomes/'+key,'No task/item/criterion/deliverable mapped')
 points=FORMATS[kind]['rubricPoints']
 if points:
  cr=rows('criteria');values=[r.get('points') for r in cr]
  if not values or any(type(v) not in [int,float] or not math.isfinite(v) or v<=0 for v in values) or sum(values)!=points:issue('criteria','Rubric must total '+str(points)+' points')
  for r in cr:
   if not isinstance(r.get('levels'),list) or len(r['levels'])!=4:issue('criteria','Four rating bands required')
 if p.get('aiPolicy') not in ['Not allowed','Allowed with disclosure','Allowed']:issue('aiPolicy','Select an explicit AI-use policy')
 if kind=='lab' and (type(p.get('minutes')) is not int or not 60<=p['minutes']<=120):issue('minutes','Lab duration must be 60–120 minutes')
 if kind=='quiz':
  instructor=p.get('instructor',{})
  keys=instructor.get('keys',[]) if isinstance(instructor,dict) else []
  if not isinstance(keys,list) or not all(isinstance(k,dict) for k in keys):keys=[]
  keyed={k.get('id'):k for k in keys if isinstance(k.get('id'),str)}
  for item in rows('items'):
   key=keyed.get(item.get('id'))
   if not key or not key.get('correct') or not key.get('explanation'):issue('instructor/keys','Each quiz item needs a separate answer and explanation')
   elif isinstance(item.get('options'),dict):
    correct=key['correct'];rationale=key.get('distractor_rationale',{})
    if not isinstance(correct,list) or not all(isinstance(x,str) and x in item['options'] for x in correct):issue('instructor/keys','Correct options must exist in the item')
    elif not isinstance(rationale,dict) or any(not rationale.get(o) for o in item['options'] if o not in correct):issue('instructor/keys','Explain every distractor')
  size=p.get('quizSize');items=rows('items')
  if type(size) is not int or size<1 or len(items)!=3*size:issue('items','Bank must contain exactly 3 × delivered quiz size')
  threshold=.75 if ctx.get('level') in ['Advanced','Senior/Capstone'] else .6
  if not items or sum(i.get('bloom') in ['Apply','Analyze','Evaluate'] for i in items)/len(items)<threshold:issue('items/bloom','Required proportion of Apply/Analyze/Evaluate scenarios missing')
  for i in items:
   if not i.get('scenario'):issue('items/scenario','Every item needs a scenario')
 for t in rows('tools'):
  if not all(t.get(k) for k in ['name','version','license','verifiedDate']):issue('tools','Pinned version, license and verification date required')
 if not p.get('tools'):issue('tools','Verified tool records missing')
 for d in rows('dataCards'):
  if d.get('sourceType') not in ['synthetic','licensed'] or not all(d.get(k) for k in ['source','license','fields','intendedUse','knownBiases']):issue('dataCards','Data card must document synthetic/licensed provenance, fields, use and biases')
 if not p.get('dataCards'):issue('dataCards','Data cards missing')
 if not p.get('readings'):issue('readings','APA references missing; never fabricate them')
 for key in ['sme','instructionalDesigner','accessibility','execution']:
  if not isinstance(p.get('reviewEvidence'),dict) or not p['reviewEvidence'].get(key):issue('reviewEvidence/'+key,'Review or execution evidence missing')
 return errors

def student(p):
 # Strict projection removes instructor-only and item-key fields at every structured boundary.
 result={k:p.get(k) for k in ['label','kind','context','competencies','outcomes','pillars','sections','readings','tools','dataCards','aiPolicy','quizSize','minutes']}
 for key in ['tasks','items','criteria','deliverables']:
  result[key]=[{k:r[k] for k in ['id','text','scenario','options','lo','competency','bloom','points','levels'] if k in r} for r in p.get(key,[])]
 result['edition']='student';result['notice']='Draft projection: educator must review free-text content for accidental answer disclosure.'
 return result

def command(service,token,tenant,course,action,data,Denied,Conflict):
 ctx=service.identity(token,tenant)
 if ctx['role']!='instructor':raise Denied('Instructor authoring access required')
 with service.connect(tenant) as db:
  service.membership(db,ctx,course)
  db.executescript('''CREATE TABLE IF NOT EXISTS assignment_packages(id TEXT,course TEXT,revision INTEGER,payload TEXT,author TEXT,created REAL,PRIMARY KEY(id,revision));
CREATE TRIGGER IF NOT EXISTS package_no_update BEFORE UPDATE ON assignment_packages BEGIN SELECT RAISE(ABORT,'Immutable package'); END;
CREATE TRIGGER IF NOT EXISTS package_no_delete BEFORE DELETE ON assignment_packages BEGIN SELECT RAISE(ABORT,'Immutable package'); END;''')
  if action=='template':return template(data.get('kind'),course)
  if action=='list':return {'packages':[{'id':r['id'],'revision':r['revision'],'package':json.loads(r['payload'])} for r in db.execute('SELECT p.* FROM assignment_packages p WHERE course=? AND revision=(SELECT max(revision) FROM assignment_packages WHERE id=p.id) ORDER BY created DESC',(course,))]}
  if action=='save':
   p=data.get('package')
   if not isinstance(p,dict) or not isinstance(p.get('kind'),str) or p.get('kind') not in FORMATS or len(json.dumps(p))>200000:raise ValueError('Bounded assignment package required')
   if not isinstance(p.get('context'),dict) or p['context'].get('course')!=course:raise Denied('Package course mismatch')
   # Reject malformed collections before saving; incomplete text remains a review finding.
   for k in ['tasks','items','criteria','deliverables','sections','competencies','outcomes','tools','dataCards']:
    if not isinstance(p.get(k),list) or not all(isinstance(x,dict) for x in p[k]):raise ValueError('Malformed '+k)
   key=data.get('id') or str(uuid.uuid4());rev=data.get('revision',0)
   db.execute('BEGIN IMMEDIATE');row=db.execute('SELECT * FROM assignment_packages WHERE id=? ORDER BY revision DESC LIMIT 1',(key,)).fetchone()
   if row and row['course']!=course:raise Denied('Package unavailable')
   if type(rev) is not int or rev!=(row['revision'] if row else 0):raise Conflict('Reload current package revision')
   errors=validate(p);db.execute('INSERT INTO assignment_packages VALUES(?,?,?,?,?,?)',(key,course,rev+1,json.dumps(p),ctx['user'],time.time()));service.emit(db,ctx,'assignment.package.saved',sources=[key],course=course)
   return {'id':key,'revision':rev+1,'findings':errors,'publicationAllowed':False}
  if action=='export':
   row=db.execute('SELECT * FROM assignment_packages WHERE id=? AND course=? ORDER BY revision DESC LIMIT 1',(data.get('id'),course)).fetchone()
   if not row:raise Denied('Package unavailable')
   p=json.loads(row['payload']);edition=data.get('edition')
   if edition not in ['student','instructor']:raise ValueError('Choose student or instructor edition')
   service.emit(db,ctx,'assignment.package.exported',sources=[row['id'],edition],course=course)
   return student(p) if edition=='student' else dict(p,edition='instructor')
  raise ValueError('Unsupported operation; publication unavailable')
