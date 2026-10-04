"""Local fictional-persona storyboard service. No biometric capture or media inference."""
import json,time,uuid,hashlib
PERSONAS=[{'id':n,'name':n.title(),'classification':'fictional','voice':n+'-synthetic-design','languages':[],'status':'PLANNED','note':'Design identity only; no served voice, renderer or evaluated languages.'} for n in ['amara','tunde']]
STATUS=[{'capability':k,'status':s,'blocker':b} for k,s,b in [('Storyboard editor','SIMULATED','Persists scene drafts; no generated media.'),('Amara and Tunde media','PLANNED','Licensed model assets and cultural evaluation required.'),('TTS, STT and voice chat','PLANNED','No approved served models or streaming pipeline.'),('Digital Double capture and training','DISABLED','Identity, consent, two-person approval and biometric storage controls unavailable.'),('External provider routing','DISABLED','Legal, contract, data-processing and credentials review required.'),('Lip-sync and rendering','PLANNED','No renderer, viseme models or measured quality results.'),('Provenance and watermarks','PLANNED','Draft hashes are not media watermarks or signed provenance.'),('Billing and marketplace payouts','DISABLED','No real payments or payouts.'),('Kiosk, telephony and other Haven systems','PLANNED','Single-Academy local scope; integrations absent.'),('Dataset and model registry','PLANNED','License, consent and evaluation enforcement needed before inference.')]]
def pairing(avatar,voice,language):
 p=next((x for x in PERSONAS if x['id']==avatar),None)
 if not p:return {'valid':False,'code':'avatar_restricted','alternatives':[]}
 if voice!=p['voice']:return {'valid':False,'code':'pairing_incompatible','alternatives':[p['voice']]}
 if language!='en':return {'valid':False,'code':'language_unsupported','alternatives':[]}
 return {'valid':True,'code':'draft_pairing_only','generationAllowed':False,'note':'English script planning only; no speech or lip-sync verified.'}
def command(service,token,tenant,course,action,data,Denied,Conflict):
 ctx=service.identity(token,tenant)
 if ctx['role']!='instructor':raise Denied('Instructor draft studio access required')
 with service.connect(tenant) as db:
  service.membership(db,ctx,course)
  db.executescript('''CREATE TABLE IF NOT EXISTS voice_story_versions(id TEXT,course TEXT,owner TEXT,revision INTEGER,payload TEXT,created REAL,PRIMARY KEY(id,revision));
CREATE TRIGGER IF NOT EXISTS story_no_update BEFORE UPDATE ON voice_story_versions BEGIN SELECT RAISE(ABORT,'Immutable storyboard history'); END;
CREATE TRIGGER IF NOT EXISTS story_no_delete BEFORE DELETE ON voice_story_versions BEGIN SELECT RAISE(ABORT,'Immutable storyboard history'); END;''')
  if action=='status':return {'personas':PERSONAS,'capabilities':STATUS,'disclosure':'AI persona design workspace. No audio or video is generated.','scope':'Scholarion Academy only'}
  if action=='pairing':return pairing(data.get('avatar'),data.get('voice'),data.get('language'))
  if action in ['generate','clone','capture','train','publish']:
   service.emit(db,ctx,'voice.blocked.'+action,course=course)
   return {'status':'DISABLED','code':'consent_required' if action in ['clone','capture','train'] else 'provider_disabled','output':None}
  if action=='list':return {'projects':[dict(json.loads(r['payload']),id=r['id'],revision=r['revision']) for r in db.execute('SELECT v.* FROM voice_story_versions v WHERE course=? AND owner=? AND revision=(SELECT max(revision) FROM voice_story_versions WHERE id=v.id) ORDER BY created DESC',(course,ctx['user']))]}
  if action=='create':
   title=data.get('title','')
   if not isinstance(title,str) or not 1<=len(title.strip())<=160:raise ValueError('Title must contain 1–160 characters')
   key=str(uuid.uuid4());payload={'title':title.strip(),'scenes':[],'archived':False,'disclosure':'AI-generated persona design; storyboard only','status':'SIMULATED'}
   db.execute('INSERT INTO voice_story_versions VALUES(?,?,?,?,?,?)',(key,course,ctx['user'],1,json.dumps(payload),time.time()));service.emit(db,ctx,'voice.story.created',sources=[key],course=course)
   return {'id':key,'revision':1,**payload}
  key=data.get('id')
  if not isinstance(key,str):raise ValueError('Project id required')
  db.execute('BEGIN IMMEDIATE')
  row=db.execute('SELECT * FROM voice_story_versions WHERE id=? AND course=? AND owner=? ORDER BY revision DESC LIMIT 1',(key,course,ctx['user'])).fetchone()
  if not row:raise Denied('Project unavailable')
  payload=json.loads(row['payload'])
  if action=='history':return {'versions':[{'revision':r['revision'],'created':r['created']} for r in db.execute('SELECT revision,created FROM voice_story_versions WHERE id=? ORDER BY revision DESC',(key,))]}
  if action=='export':return {'project':payload,'revision':row['revision'],'sha256':hashlib.sha256(row['payload'].encode()).hexdigest(),'mediaGenerated':False,'signedProvenance':False}
  if data.get('revision')!=row['revision']:raise Conflict('Project changed; reload before editing')
  if action=='restore':
   target=data.get('targetRevision')
   old=db.execute('SELECT payload FROM voice_story_versions WHERE id=? AND revision=?',(key,target)).fetchone()
   if not old:raise ValueError('Version unavailable')
   payload=json.loads(old['payload'])
  elif action=='archive':payload['archived']=True
  else:
   if payload['archived']:raise ValueError('Restore a prior active version before editing')
   if action=='scene':
    fields={k:data.get(k) for k in ['speaker','avatar','voice','language','script']}
    if any(not isinstance(v,str) for v in fields.values()) or not 1<=len(fields['speaker'])<=80 or not 1<=len(fields['script'].strip())<=4000:raise ValueError('Bounded speaker and script required')
    valid=pairing(fields['avatar'],fields['voice'],fields['language'])
    if not valid['valid']:raise ValueError(valid['code'])
    if len(payload['scenes'])>=30:raise ValueError('Local draft limit: 30 scenes')
    payload['scenes'].append({'id':str(uuid.uuid4()),**fields,'state':'draft'})
   elif action=='change-all':
    speaker=data.get('speaker');valid=pairing(data.get('avatar'),data.get('voice'),data.get('language'))
    if not valid['valid']:raise ValueError(valid['code'])
    affected=[s['id'] for s in payload['scenes'] if s['speaker']==speaker]
    if not affected:raise ValueError('Speaker has no scenes')
    if data.get('dryRun') is True:return {'affected':affected,'count':len(affected),'revision':row['revision']}
    if data.get('confirmed') is not True:raise ValueError('Confirm the affected scenes before applying')
    for s in payload['scenes']:
     if s['speaker']==speaker:s.update(avatar=data['avatar'],voice=data['voice'],language=data['language'],state='draft')
   else:raise ValueError('Unsupported operation')
  rev=row['revision']+1;db.execute('INSERT INTO voice_story_versions VALUES(?,?,?,?,?,?)',(key,course,ctx['user'],rev,json.dumps(payload),time.time()));service.emit(db,ctx,'voice.story.'+action,sources=[key,'revision:'+str(rev)],course=course)
  return {'id':key,'revision':rev,**payload}
