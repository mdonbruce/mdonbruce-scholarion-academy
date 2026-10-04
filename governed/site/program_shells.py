"""Versioned, course-scoped program design shells. Not academic publication."""
import json,time,uuid
import program26,additional_programs,core_programs
from pathlib import Path
from catalog_review import findings
ROOT=Path(__file__).resolve().parent
TOPICS={
16:['Reproducible development','Application boundaries','Language-model interfaces','Prompt evaluation','Retrieval baselines','Grounded answers','Typed tools','State and graph routing','Protocol permissions','Single-agent evidence defense'],
17:['Data preparation','Data exploration','Model training','Model evaluation','Prompt contracts','Retrieval applications','Multimodal consent','Model adaptation decisions','Bounded tool use','Product prototype defense'],
18:['Python search and problem solving','Data preparation pipelines','Supervised learning','Model evaluation and calibration','Unsupervised learning','Neural training in two frameworks','Vision and transfer learning','Language representations','Responsible model review','Model-card defense'],
19:['Model context and limitations','Prompt contracts','Structured responses','Evaluation datasets','Prompt security','Retrieval-backed prompts','Reusable prompt libraries','Programmatic prompting','Multimodal safeguards','Application evidence defense'],
20:['Process and opportunity mapping','Stakeholder needs','Generative capability limits','Use-case prioritization','Data readiness','Human oversight','Cost assumptions','Pilot measures','Change management','Opportunity portfolio defense'],
21:['Python data foundations','Tabular preparation','Data validation','Exploratory analysis','Visual explanation','Statistical reasoning','Hypothesis limitations','Predictive baselines','Model evaluation','Analysis portfolio defense'],
22:['SQL and data contracts','Data models','Batch ingestion','Streaming design','Pipeline orchestration','Quality and lineage','Document ingestion','Embedding and index operations','Retrieval freshness and privacy','Pipeline evidence defense'],
23:['Opportunity discovery','User research','Data and feasibility','Product requirements','Evaluation design','Metrics and experimentation','Responsible lifecycle','Unit economics','Launch and monitoring','Product specification defense'],
24:['Data evidence','Predictive baselines','Model evaluation','Prompt contracts','Retrieval pipelines','Tool boundaries','Agent orchestration','Deployment and monitoring','Industry capstone development','Portfolio and handover defense'],
25:['Governance responsibilities','Vendor assessment','Risk and evidence','Pilot charter','Operating controls','Pilot execution review','KPI interpretation','Organizational adoption','Board communication','Leadership practicum defense']}

def shells():
 base={p['id']:p for p in json.loads((ROOT/'dist/data/programs.json').read_text(encoding='utf-8'))};p15=json.loads((ROOT/'dist/data/program15-curriculum.json').read_text(encoding='utf-8'));result=[]
 for n in range(15,26):
  p=base[n];topics=TOPICS.get(n,[p15['sessions'][i]['title']+' / '+p15['sessions'][i+1]['title'] for i in range(0,20,2)])
  competencies=p15['competencies'] if n==15 else [{'id':'C'+str(i+1),'text':text} for i,text in enumerate(['Frame a bounded problem in '+p['title']+'.','Develop reproducible evidence using synthetic or licensed data.','Evaluate alternatives and explain failure cases.','Apply privacy, human review and operational safeguards.','Defend conclusions with evidence and explicit limitations.'])]
  result.append({'program':n,'title':p['title'].replace('\ufffd','—'),'brand':'Scholarion Academy','faculty':'Dr. Martins Donbruce Idahosa','state':'draft','weeks':10,'competencies':competencies,'modules':[{'week':i,'title':t,'outcomes':[{'id':f'P{n}-W{i}-O1','competency':'C'+str((i-1)%5+1),'text':'Demonstrate '+t.lower()+' using a reproducible example.'},{'id':f'P{n}-W{i}-O2','competency':'C4','text':'Test a failure case and justify the human-review boundary.'}],'activity':{'student':'Produce a bounded synthetic example, record evidence and explain limitations. Detailed worksheet pending.','instructor':'Review assumptions, test evidence and reasoning. Detailed solution and textbook mapping pending.'},'status':'outline; materials pending'} for i,t in enumerate(topics,1)],'sessions':p15['sessions'] if n==15 else [],'capstone':p.get('capstone','Faculty brief required'),'rubric':[{'criterion':c,'points':v} for c,v in [('Scope and assumptions',15),('Reproducible implementation',25),('Evaluation and failure analysis',30),('Privacy and human control',20),('Defense and communication',10)]],'dependencyNotes':('#13 course definitions missing; no equivalence or eligibility inferred.' if n in (20,25) else 'Bundle sequences and transfer require approved module-level equivalence; a ten-week shell does not compress the full multi-course pathway.' if n in (17,24) else 'Transfer remains proposed; no automatic credit.'),'notes':'','publicationAllowed':False,'gaps':['Faculty-authored lessons and licensed readings','Starter and executed domain labs; dual frameworks for deep learning','Complete assessment banks and scoring rules','Captioned media and accessibility review','Approved completion, finance and transfer policies','Academic release authority and workflow']})
 result.append(program26.design())
 result.extend(additional_programs.designs())
 result.extend(core_programs.designs())
 return [core_programs.enrich(p) if p['program']<=11 else p for p in result]

def command(service,token,tenant,course,action,data,Denied,Conflict):
 ctx=service.identity(token,tenant)
 if ctx['role']!='instructor':raise Denied('Instructor design access required')
 with service.connect(tenant) as db:
  service.membership(db,ctx,course)
  db.execute('CREATE TABLE IF NOT EXISTS program_shell_versions(scope_course TEXT,program INTEGER,revision INTEGER,payload TEXT,author TEXT,created REAL,PRIMARY KEY(scope_course,program,revision))')
  db.executescript("CREATE TRIGGER IF NOT EXISTS shell_no_update BEFORE UPDATE ON program_shell_versions BEGIN SELECT RAISE(ABORT,'Immutable shell versions'); END; CREATE TRIGGER IF NOT EXISTS shell_no_delete BEFORE DELETE ON program_shell_versions BEGIN SELECT RAISE(ABORT,'Immutable shell versions'); END;")
  if action=='load':
   db.execute('BEGIN IMMEDIATE')
   for shell in shells():db.execute('INSERT OR IGNORE INTO program_shell_versions VALUES(?,?,?,?,?,?)',(course,shell['program'],1,json.dumps(shell),ctx['user'],time.time()))
   service.emit(db,ctx,'program.shells.loaded',course=course)
   return {'loaded':len(shells()),'published':False}
  if action=='list':return {'shells':[dict(json.loads(r['payload']),revision=r['revision']) for r in db.execute('SELECT v.* FROM program_shell_versions v WHERE scope_course=? AND revision=(SELECT max(revision) FROM program_shell_versions WHERE scope_course=v.scope_course AND program=v.program) ORDER BY program',(course,))]}
  if action=='audit':
   n=data.get('program')
   if type(n) is not int:raise ValueError('Program identifier required')
   row=db.execute('SELECT payload FROM program_shell_versions WHERE scope_course=? AND program=? ORDER BY revision DESC LIMIT 1',(course,n)).fetchone()
   if not row:raise Denied('Program unavailable in this course')
   return core_programs.audit(json.loads(row['payload']))
  if action=='refresh-design':
   n=data.get('program');revision=data.get('revision')
   if type(n) is not int or n not in range(1,12) or type(revision) is not int:raise ValueError('Core program and current revision required')
   db.execute('BEGIN IMMEDIATE')
   row=db.execute('SELECT * FROM program_shell_versions WHERE scope_course=? AND program=? ORDER BY revision DESC LIMIT 1',(course,n)).fetchone()
   if not row or row['revision']!=revision:raise Conflict('Reload the current design first')
   shell=next(p for p in shells() if p['program']==n);shell['notes']=json.loads(row['payload']).get('notes','')
   db.execute('INSERT INTO program_shell_versions VALUES(?,?,?,?,?,?)',(course,n,revision+1,json.dumps(shell),ctx['user'],time.time()))
   service.emit(db,ctx,'program.design.refreshed',course=course)
   return {'revision':revision+1,'published':False}
  if action=='save':
   n=data.get('program');revision=data.get('revision');notes=data.get('notes')
   if type(n) is not int or n not in range(1,27) or type(revision) is not int or not isinstance(notes,str) or len(notes)>8000:raise ValueError('Invalid design notes')
   db.execute('BEGIN IMMEDIATE');row=db.execute('SELECT * FROM program_shell_versions WHERE scope_course=? AND program=? ORDER BY revision DESC LIMIT 1',(course,n)).fetchone()
   if not row or row['revision']!=revision:raise Conflict('Shell changed; reload first')
   shell=json.loads(row['payload']);shell['notes']=notes;shell['claimFindings']=findings(shell['title'],notes)
   db.execute('INSERT INTO program_shell_versions VALUES(?,?,?,?,?,?)',(course,n,revision+1,json.dumps(shell),ctx['user'],time.time()));service.emit(db,ctx,'program.shell.revised',course=course)
   return {'revision':revision+1,'published':False}
  raise ValueError('Publication disabled; complete design gates and academic release workflow first')
