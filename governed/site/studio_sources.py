"""Source-grounded studio orchestration. No inference, media rendering or URL fetching."""
import hashlib,json,time,uuid
LABEL='AI-assisted content.'
OUTPUTS=['cover','slides','audio_overview','audio_lecture','overview','notes','study_guide','mind_map','infographic','flashcards','practice_quizzes','readings','mini_labs','lab_environment','programming_environment','devops_environment','assessments','rubrics','requirement_videos']
def bounded(v,limit):
 if not isinstance(v,str) or not v.strip() or len(v)>limit:raise ValueError('Nonempty bounded text required')
 return v.strip()
def manifest(p,revision):
 refs=[{'id':s['id'],'title':s['title'],'sha256':s['sha256'],'citation':s['citation'],'verification':'needs verification'} for s in p['sources']]
 outputs=[]
 for kind in OUTPUTS:
  topics=p['topics'] if kind in ['flashcards','practice_quizzes','readings','mini_labs'] else [None]
  for t in topics:
   key=kind+(':'+t['id'] if t else '')
   edited=p['edits'].get(key)
   outputs.append({'id':key,'kind':kind,'topic':t['id'] if t else None,'outcomes':t['outcomes'] if t else [o['id'] for o in p['outcomes']],'sourceIds':t['sourceIds'] if t else [s['id'] for s in p['sources']],'status':'instructor_draft' if edited else 'blocked','reason':None if edited else 'Requires content authoring or an approved generator; no completed output exists.','instructorEdited':bool(edited),'sourceRevision':edited['sourceRevision'] if edited else revision,'needsSourceReview':bool(edited and edited['sourceRevision']<p['sourceRevision']),'requiredCount':10 if kind=='practice_quizzes' else 2 if kind=='mini_labs' else 10 if kind=='slides' else None})
 return {'label':LABEL,'course':p['course'],'module':p['module'],'revision':revision,'sourceRevision':p['sourceRevision'],'sources':refs,'outputs':outputs,'releaseAllowed':False,'instructorReviewRequired':False,'releaseNote':'Source manifest only; build outputs before release','generationMode':'Deterministic planning only; no model-generated teaching content','qa':{'citations':'needs verification','execution':'not run','accessibility':'not audited','studentEdition':'not released','loCoverage':'mapping only; teaching/practice/assessment evidence pending'}}
def command(service,token,tenant,course,action,data,Denied,Conflict):
 ctx=service.identity(token,tenant)
 if ctx['role']!='instructor':raise Denied('Instructor studio access required')
 with service.connect(tenant) as db:
  service.membership(db,ctx,course)
  db.executescript('''CREATE TABLE IF NOT EXISTS studio_source_versions(id TEXT,course TEXT,revision INTEGER,payload TEXT,author TEXT,created REAL,PRIMARY KEY(id,revision));
CREATE TRIGGER IF NOT EXISTS studio_source_no_update BEFORE UPDATE ON studio_source_versions BEGIN SELECT RAISE(ABORT,'Immutable studio version'); END;
CREATE TRIGGER IF NOT EXISTS studio_source_no_delete BEFORE DELETE ON studio_source_versions BEGIN SELECT RAISE(ABORT,'Immutable studio version'); END;''')
  if action=='list':return {'modules':[{'id':r['id'],'revision':r['revision'],'title':json.loads(r['payload'])['title'],'module':json.loads(r['payload'])['module']} for r in db.execute('SELECT v.* FROM studio_source_versions v WHERE course=? AND revision=(SELECT max(revision) FROM studio_source_versions WHERE id=v.id) ORDER BY created DESC',(course,))]}
  if action=='create':
   title=bounded(data.get('title'),200);number=data.get('module')
   if type(number) is not int or not 1<=number<=10:raise ValueError('Module must be 1–10')
   p={'title':title,'module':number,'course':course,'sources':[],'topics':[],'outcomes':[],'edits':{},'sourceRevision':0};key=str(uuid.uuid4());revision=1
  else:
   key=bounded(data.get('id'),100);db.execute('BEGIN IMMEDIATE');row=db.execute('SELECT * FROM studio_source_versions WHERE id=? AND course=? ORDER BY revision DESC LIMIT 1',(key,course)).fetchone()
   if not row:raise Denied('Studio module unavailable')
   p=json.loads(row['payload']);revision=row['revision']
   if action=='get':return {'id':key,'revision':revision,'package':p,'manifest':manifest(p,revision)}
   if action=='history':return {'versions':[{'revision':r['revision'],'created':r['created']} for r in db.execute('SELECT revision,created FROM studio_source_versions WHERE id=? ORDER BY revision DESC',(key,))]}
   if action=='export':return {'label':LABEL,'manifest':manifest(p,revision),'topicMap':p['topics'],'outcomes':p['outcomes'],'instructorDrafts':p['edits'],'sourceTextsIncluded':False,'note':'Planning JSON, not a generated course or LMS cartridge.'}
   if data.get('revision')!=revision:raise Conflict('Reload current studio version before editing')
   if action=='source':
    text=bounded(data.get('text'),50000);title=bounded(data.get('title'),200);citation=bounded(data.get('citation'),1000)
    if data.get('rights') not in ['owned','licensed','permission']:raise ValueError('Source rights declaration required')
    digest=hashlib.sha256(text.encode()).hexdigest()
    if any(s['sha256']==digest for s in p['sources']):return {'id':key,'revision':revision,'duplicate':True,'manifest':manifest(p,revision)}
    if len(p['sources'])>=20:raise ValueError('Local limit: 20 sources per module')
    p['sources'].append({'id':'src-'+uuid.uuid4().hex,'title':title,'text':text,'citation':citation,'rights':data['rights'],'sha256':digest,'verification':'needs verification'})
    p['sourceRevision']+=1
   elif action=='mapping':
    topics=data.get('topics');outcomes=data.get('outcomes')
    if not isinstance(topics,list) or not 1<=len(topics)<=20 or not isinstance(outcomes,list) or not 1<=len(outcomes)<=30:raise ValueError('Bounded topics and outcomes required')
    ids=set();sids={s['id'] for s in p['sources']}
    for o in outcomes:
     if not isinstance(o,dict):raise ValueError('Outcome object required')
     oid=bounded(o.get('id'),80);bounded(o.get('text'),1000)
     if oid in ids or o.get('competency') not in ['C1','C2','C3','C4','C5']:raise ValueError('Unique outcome and valid competency required')
     ids.add(oid)
    tids=set()
    for t in topics:
     if not isinstance(t,dict):raise ValueError('Topic object required')
     tid=bounded(t.get('id'),80);bounded(t.get('title'),200)
     if tid in tids:raise ValueError('Unique topic identifiers required')
     tids.add(tid)
     for field,allowed in [('sourceIds',sids),('outcomes',ids)]:
      if not isinstance(t.get(field),list) or not t[field] or any(not isinstance(x,str) or x not in allowed for x in t[field]):raise ValueError('Topic must map to existing sources and outcomes')
    if ids!={o for t in topics for o in t['outcomes']}:raise ValueError('Every outcome must be mapped to a topic')
    p['topics']=topics;p['outcomes']=outcomes;p['sourceRevision']+=1
   elif action=='edit':
    output=bounded(data.get('output'),200);body=bounded(data.get('body'),30000)
    if output not in {x['id'] for x in manifest(p,revision)['outputs']}:raise ValueError('Unknown output identifier')
    if output in p['edits'] and data.get('confirmOverwrite') is not True:raise ValueError('Explicit confirmation required to replace an instructor edit')
    p['edits'][output]={'body':body,'label':LABEL,'author':ctx['user'],'sourceRevision':p['sourceRevision']}
   elif action=='regenerate':
    # Refresh plan only; authored edits are preserved, never replaced by placeholders.
    pass
   else:raise ValueError('Unsupported operation; media rendering and publication unavailable')
   revision+=1
  db.execute('INSERT INTO studio_source_versions VALUES(?,?,?,?,?,?)',(key,course,revision,json.dumps(p),ctx['user'],time.time()));service.emit(db,ctx,'studio.sources.'+action,sources=[key],course=course)
  return {'id':key,'revision':revision,'manifest':manifest(p,revision),'package':p}
