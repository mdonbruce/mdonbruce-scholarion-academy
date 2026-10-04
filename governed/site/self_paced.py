"""Data-driven self-paced outlines; no academic publication or paid entitlement."""
import json,datetime,uuid,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent
COURSES={
28:['Reliable language-model interfaces','Orchestrating a grounded assistant','Semantic indexing and retrieval stores','Retrieval evidence pipelines','Adaptive retrieval and graph evidence','Typed tools and bounded agents','Coordinating agents through secure tool protocols','Retrieval-agent portfolio studio'],
29:['Designing bounded autonomy','Portable agent adapters','Permission-aware agent integrations','Operating an accountable agent service'],
30:['A Python agent loop from scratch','Choosing and testing agent architectures','A multi-step Python work assistant'],
31:['Agent prompting and instruction contracts','Validated computational analysis','Reliability, fairness and disclosure'],
32:['Agent decisions: patterns and evidence'],33:['Validated agent pipelines','Recoverable graph execution','Secure interoperable tool services'],
34:['Leading an accountable agent initiative'],35:['An approval-gated routing graph'],36:['Comparing specialist agent teams'],
37:['Python data preparation for learning systems','Training and validating predictive models','Evaluating model decisions','Neural models across two frameworks'],
38:['Training stable neural systems','Adapting visual representations','Representing language and attention','Connecting language models to retrieval tools']}
SKILLS={28:['RAG','agents','evaluation','MCP'],29:['agents','governance','multi-agent'],30:['Python','agents','evaluation'],31:['Python','agents','governance'],32:['agents','evaluation'],33:['MCP','agents','multi-agent'],34:['governance'],35:['agents'],36:['multi-agent','evaluation'],37:['ML','Python','TensorFlow','PyTorch','evaluation'],38:['deep learning','NLP','TensorFlow','PyTorch','RAG']}
TOPICS={32:['Autonomy and decision boundaries','Reflection and evidence checks','Typed tools and safe invocation','Plans, dependencies and recovery','Collaboration and error analysis'],34:['Capabilities and limits','Use-case and process redesign','Risk and human oversight','Build or buy and cost assumptions','Adoption and measurable outcomes']}
TRANSFERS={28:[2],29:[],30:[31],31:[],32:[],33:[15],34:[9,13,20],35:[1,15],36:[1,14,15],37:[18],38:[18]}

def catalog():
 base={p['id']:p for p in json.loads((ROOT/'dist/data/programs.json').read_text(encoding='utf-8'))};offerings=[]
 for n in range(28,39):
  source=base[n];courses=[]
  if n==31:courses=[dict(c) for c in next(p for p in offerings if p['id']==30)['courses']]
  for i,title in enumerate(COURSES[n],len(courses)+1):
   guided=n in (35,36);topics=TOPICS.get(n,[title+': scope and assumptions',title+': build the baseline',title+': compare alternatives',title+': test failures',title+': evaluate and communicate'])
   courses.append({'id':f'SP{n}-C{i}','title':title,'weeks':10,'hours':2 if guided else 15,'status':'draft outline','modules':[{'id':f'SP{n}-C{i}-M{j}','title':topic,'weeks':[2*j-1,2*j],'outcome':f'Demonstrate {topic.lower()} with reproducible evidence and stated limitations.','deliverables':['Original lesson notes and captioned media pending','Starter and executed lab pending','Quiz bank and rubric-based assignment pending','Student and instructor activity editions pending']} for j,topic in enumerate(topics,1)]})
  offerings.append({'id':n,'title':source['title'],'type':source['type'],'level':source['level'],'summary':source['summary'],'skills':SKILLS[n],'coding':n!=34,'format':'Self-paced','courses':courses,'courseCount':len(courses),'hours':sum(c['hours'] for c in courses),'weeksPerCourse':10,'sequentialWeeks':len(courses)*10,'paceNote':'Every course uses a ten-week suggested schedule. Guided project build effort is estimated at two hours within that window. Bundle duration depends on course sequencing.','access':'Paid per course or credential · sandbox only','price':None,'checkoutEnabled':False,'faculty':'Dr. Martins Donbruce Idahosa','credential':('Completion badge' if n in (35,36) else 'Course Certificate' if n in (32,34) else source['type']+' plus badge'),'credentialIssued':False,'status':'Drafted · needs SME review','prerequisite':('No formal prerequisite; Python support will be needed for labs.' if n==32 else 'No coding required.' if n==34 else 'Check Python functions, data structures and relevant prior concepts before starting.'),'capstone':{'brief':source['capstone'] if not source['capstone'].startswith('See supplied') else 'Build an evidence portfolio for the course topics, including a baseline, failure analysis, limitations and a reproducible handover.','review':'Minimum three rubric-based peer reviews or a verified autograder; neither is connected yet.','rubric':[{'criterion':k,'points':v} for k,v in [('Problem and assumptions',15),('Implementation evidence',30),('Evaluation and failure analysis',30),('Privacy and human control',15),('Communication',10)]]},'transfer':[{'to':target,'status':'proposed — no automatic waiver','kind':'shared courses' if n==30 else 'candidate mapping','approval':False} for target in TRANSFERS[n]],'gates':{'outline':'drafted','videos':'blocked: media not produced','notebooks':('partial: deterministic practice starter/solutions executed locally; full Cloud Lab labs pending' if n in (32,35,36) else 'blocked: course-specific executed notebooks pending'),'quizzes':'blocked: banks and cooldown policy pending','Cloud Lab':'blocked: LTI and sandbox infrastructure missing','tools':'blocked: version and license verification pending','payments':'blocked: price, provider and policy not configured','issuance':'blocked: approved rules and signing service missing','claims':'no partner, accreditation, salary or popularity claims'}})
 return offerings

def consolidation():
 p=catalog();a={x['id']:{c['id'] for c in x['courses']} for x in p}
 return {'basis':'Exact shared course IDs in draft outlines only; not assessed outcome equivalence or credit','automaticCredit':False,'pairs':[{'from':x,'to':y,'sharedCourses':len(a[x]&a[y]),'coverageOfTarget':round(100*len(a[x]&a[y])/len(a[y]),1)} for x in a for y in a if x!=y and a[x]&a[y]],'rules':[{'from':x['id'],**r} for x in p for r in x['transfer']],'legacyOverlap':'Unmeasured: approved module-level mappings for programs #1–#27 missing','mergeRetire':'None; retain offerings pending academic review'}

def command(service,token,tenant,course,action,data,Denied,Conflict):
 ctx=service.identity(token,tenant)
 with service.connect(tenant) as db:
  service.membership(db,ctx,course)
  db.execute('CREATE TABLE IF NOT EXISTS self_paced_plans(owner TEXT,scope_course TEXT,program INTEGER,start TEXT,revision INTEGER,PRIMARY KEY(owner,scope_course,program))')
  if action=='instructor_notebook':
   if ctx['role']!='instructor':raise Denied('Instructor required; learner release policy not configured')
   key=data.get('id')
   if key not in ['32-1','32-2','32-3','32-4','32-5','35','36']:raise ValueError('Unknown practice notebook')
   service.emit(db,ctx,'self_paced.instructor_notebook.download',course=course)
   return {'filename':key+'-executed.ipynb','notebook':json.loads((ROOT/'self-paced-review'/(key+'-executed.ipynb')).read_text())}
  if action=='list':return {'plans':[dict(r) for r in db.execute('SELECT * FROM self_paced_plans WHERE owner=? AND scope_course=?',(ctx['user'],course))],'enrollment':False}
  if action=='checkout':raise ValueError('Sandbox checkout disabled: approved price, provider and policies required')
  if action!='plan':raise ValueError('Unknown operation')
  n=data.get('program');start=data.get('start');revision=data.get('revision')
  if type(n) is not int or n not in range(28,39) or type(revision) is not int or revision<0 or not isinstance(start,str):raise ValueError('Invalid study plan')
  date=datetime.date.fromisoformat(start)
  if not datetime.date(2020,1,1)<=date<=datetime.date(2100,1,1):raise ValueError('Invalid study start')
  db.execute('INSERT OR IGNORE INTO self_paced_plans VALUES(?,?,?,?,0)',(ctx['user'],course,n,start))
  changed=db.execute('UPDATE self_paced_plans SET start=?,revision=revision+1 WHERE owner=? AND scope_course=? AND program=? AND revision=?',(start,ctx['user'],course,n,revision))
  if changed.rowcount!=1:raise Conflict('Plan changed; reload saved plans before retrying')
  p=next(p for p in catalog() if p['id']==n)
  deadlines=[{'course':c['id'],'module':m['id'],'suggestedDue':(date+datetime.timedelta(weeks=ci*10+m['weeks'][-1])).isoformat()} for ci,c in enumerate(p['courses']) for m in c['modules']]
  service.emit(db,ctx,'self_paced.plan.saved',course=course)
  return {'revision':revision+1,'deadlines':deadlines,'enrollment':False,'paid':False,'note':'Planning only; no course access, grades, payment or credential changed.'}

def build():
 offerings=catalog();mapping=consolidation()
 path=ROOT/'dist/data/programs.json';records=json.loads(path.read_text(encoding='utf-8'))
 for offering in offerings:
  row=next(p for p in records if p['id']==offering['id'])
  row.update(courses=offering['courses'],courseCount=offering['courseCount'],weeksPerCourse=10,sequentialWeeks=offering['sequentialWeeks'],length=f"{offering['courseCount']} course(s); 10 weeks each; {offering['sequentialWeeks']} weeks sequentially",format='Self-paced',discoveryRoute='#self-paced/'+str(offering['id']),transfer=offering['transfer'],stacking='Proposed mappings only; no approved waiver, automatic credit or guaranteed progression.',waiverApproved=False)
  # Replace old free-text specifications with an explicit structured curriculum summary.
  row['specification']='Draft course sequence: '+ ' → '.join(c['title'] for c in offering['courses'])+'. Ten weeks per course. Transfer proposals require academic approval; none is approved.'
 path.write_text(json.dumps(records,ensure_ascii=False),encoding='utf-8')
 (ROOT/'dist/catalog-data.js').write_text('const programCatalog = '+json.dumps(records,ensure_ascii=False)+';\n',encoding='utf-8')
 (ROOT/'dist/data/self-paced.json').write_text(json.dumps({'offerings':offerings,'consolidation':mapping},indent=2,ensure_ascii=False),encoding='utf-8')
 return offerings

if __name__=='__main__':
 build()
 print('11 self-paced offerings synchronized across catalog, course lists, pacing and proposed transfers.')
