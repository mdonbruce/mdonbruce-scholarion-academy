"""Structural curriculum validation for the local pilot; not a quality certification."""
import json,time,uuid,math
from pathlib import Path
FORMATS=json.loads((Path(__file__).parent/'course_formats.json').read_text())
def validate(p):
 errors=[]
 def check(ok,path,message):
  if not ok:errors.append({'path':path,'message':message})
 if not isinstance(p,dict):return [{'path':'$','message':'Course package must be an object'}]
 # Validate nested types before alignment checks use hashing or iteration.
 for collection in ['competencies','outcomes','topics','modules','assessments']:
  rows=p.get(collection,[])
  if not isinstance(rows,list):continue
  for i,row in enumerate(rows):
   if not isinstance(row,dict):continue
   for key in ['id','competency','topic','type']:
    if key in row:check(isinstance(row[key],str) and bool(row[key].strip()),f'{collection}/{i}/{key}','Must be a nonempty string')
   if collection=='assessments':
    aligned=row.get('outcomes',[])
    check(isinstance(aligned,list) and all(isinstance(x,str) and x.strip() for x in aligned),f'assessments/{i}/outcomes','Must be an array of outcome identifiers')
    for field in ['rubric','bank']:
     values=row.get(field,[])
     check(isinstance(values,list),f'assessments/{i}/{field}','Must be an array')
     for j,value in enumerate(values if isinstance(values,list) else []):
      check(isinstance(value,dict),f'assessments/{i}/{field}/{j}','Must be an object')
      if isinstance(value,dict):
       for key in ['outcome','competency']:
        check(isinstance(value.get(key),str),f'assessments/{i}/{field}/{j}/{key}','Must be an identifier')
 if errors:return errors
 if not isinstance(p.get('format','standard'),str):return [{'path':'format','message':'Must be a format identifier'}]
 profile=FORMATS.get(p.get('format','standard'))
 if profile is None:return [{'path':'format','message':'All courses use the standard 10-week format'}]
 term_weeks=profile['weeks'];counts=profile['counts']
 workload=p.get('weeklyHours',{})
 if not isinstance(workload,dict):workload={}
 low=workload.get('min');high=workload.get('max')
 valid_range=type(low) in [int,float] and type(high) in [int,float] and math.isfinite(low) and math.isfinite(high) and 0<low<=high
 check(valid_range,'weeklyHours','Declare positive finite min/max weekly hours')
 def records(key):
  value=p.get(key,[])
  if not isinstance(value,list) or not all(isinstance(x,dict) for x in value):check(False,key,'Must be an array of objects');return []
  return value
 competencies=records('competencies');outcomes=records('outcomes');topics=records('topics');modules=records('modules');items=records('assessments')
 check(p.get('termWeeks')==term_weeks,'termWeeks',f'The declared format requires {term_weeks} weeks')
 check(bool(p.get('facultyOwner')),'facultyOwner','An accountable faculty owner is required')
 check(120<=len(str(p.get('description','')).split())<=200,'description','Description must contain 120–200 words')
 for key in ['title','code','delivery','prerequisites','policyVersion']:
  check(bool(p.get(key)),key,'Required syllabus field or approved policy reference missing')
 for name,rows,count in [('competencies',competencies,5),('topics',topics,term_weeks),('modules',modules,term_weeks)]:check(len(rows)==count,name,f'Exactly {count} required')
 check(term_weeks*2<=len(outcomes)<=term_weeks*3,'outcomes',f'{term_weeks*2} to {term_weeks*3} outcomes required')
 ids={name:{x.get('id') for x in rows if isinstance(x.get('id'),str)} for name,rows in [('competencies',competencies),('outcomes',outcomes),('topics',topics),('assessments',items)]}
 for name,rows in [('competencies',competencies),('outcomes',outcomes),('topics',topics),('assessments',items)]:check(len(ids[name])==len(rows),name,'Unique nonempty string identifiers required')
 for c in competencies:
  check(str(c.get('statement','')).split(' ')[0].lower() in ['analyze','build','evaluate','design','create','apply','implement','compare','develop','assess'],f"competencies/{c.get('id')}",'Start with an observable action verb')
  check(bool(c.get('programOutcomes')),f"competencies/{c.get('id')}/programOutcomes",'Map to a program outcome')
 for o in outcomes:check(o.get('competency') in ids['competencies'],f"outcomes/{o.get('id')}",'Exactly one valid primary competency required')
 for t in topics:
  tid=t.get('id');os=[o for o in outcomes if o.get('topic')==tid]
  check(2<=len(os)<=3,f'topics/{tid}/outcomes','Each topic needs 2–3 outcomes')
  for key in ['title','summary','activity','appliedFocus','competencyApplications']:check(bool(t.get(key)),f'topics/{tid}/{key}','Required topic content missing')
 for o in outcomes:check(o.get('topic') in ids['topics'],f"outcomes/{o.get('id')}/topic",'Unknown topic')
 check(sorted(m.get('week',0) for m in modules if type(m.get('week')) is int)==list(range(1,term_weeks+1)),'modules/week','One module per week required')
 expected=profile['major']
 for m in modules:
  week=m.get('week');path=f'modules/{week}';check(m.get('topic') in ids['topics'],path+'/topic','Valid topic required')
  for key in ['overview','pages','activity']:check(bool(m.get(key)),path+'/'+key,'Required module content missing')
  hours=m.get('hours');check(type(hours) in [int,float] and math.isfinite(hours) and valid_range and low<=hours<=high,path+'/hours','Pilot workload range is 6–12 hours; tenant policy must confirm')
  if type(week) is int and 1<=week<=term_weeks:
   weekly=[a for a in items if a.get('week')==week];check(sum(a.get('type')==expected[week-1] for a in weekly)==1,path+'/deliverable','Major deliverable does not match standard week map')
   check(sum(a.get('type')=='quiz' for a in weekly)==(0 if week in profile['examWeeks'] else 1),path+'/quiz','Quiz required in non-exam weeks only')
 for kind,count in counts.items():check(sum(a.get('type')==kind for a in items)==count,'assessments/'+kind,f'Exactly {count} required')
 weights=[]
 for a in items:
  path='assessments/'+str(a.get('id'));w=a.get('weight');check(type(w) in [int,float] and math.isfinite(w) and w>0,path+'/weight','Positive finite weight required')
  check(type(a.get('week')) is int and 1<=a['week']<=term_weeks,path+'/week','Assessment must fall within the course')
  if a.get('type') in ['midterm_exam','final_exam']:
   check(a.get('week')==profile['examWeeks'][0 if a['type']=='midterm_exam' else -1],path+'/week','Exam does not match the required week')
  if type(w) in [int,float]:weights.append(w)
  check(a.get('type') in counts,path+'/type','Unknown assessment type')
  check(bool(a.get('outcomes')) and all(o in ids['outcomes'] for o in a.get('outcomes',[])),path+'/outcomes','Valid outcome alignment required')
  if a.get('type')=='quiz':
   bank=a.get('bank',[]);check(isinstance(bank,list) and len(bank)>=50,path+'/bank','At least 50 questions required');check(a.get('delivered')==25,path+'/delivered','Deliver exactly 25 questions')
   question_ids=set()
   for i,q in enumerate(bank if isinstance(bank,list) else []):
    qp=path+f'/bank/{i}'
    check(all(q.get(k) is not None for k in ['id','prompt','answer','rationale','outcome','competency']),qp,'Question fields, answer and rationale required')
    qid=q.get('id');check(isinstance(qid,str) and bool(qid) and qid not in question_ids,qp+'/id','Unique question identifier required')
    if isinstance(qid,str):question_ids.add(qid)
    check(q.get('outcome') in a.get('outcomes',[]) and any(o.get('id')==q.get('outcome') and o.get('competency')==q.get('competency') for o in outcomes),qp+'/outcome','Question must align with its assessment and competency')
  elif a.get('type') in ['midterm_exam','final_exam']:check(bool(a.get('blueprint')) and bool(a.get('appliedScenario')) and bool(a.get('answerKey')),path,'Exam blueprint, scenario and answer key required')
  else:
   rubric=a.get('rubric',[]);check(isinstance(rubric,list) and 4<=len(rubric)<=5,path+'/rubric','4–5 analytic criteria required')
   for r in rubric if isinstance(rubric,list) else []:check(isinstance(r,dict) and r.get('competency') in ids['competencies'] and r.get('outcome') in ids['outcomes'] and isinstance(r.get('levels'),list) and len(r['levels'])==4,path+'/rubric','Each criterion needs outcome, competency and four performance levels')
   for r in rubric:check(r.get('outcome') in a.get('outcomes',[]) and any(o.get('id')==r.get('outcome') and o.get('competency')==r.get('competency') for o in outcomes),path+'/rubric','Criterion alignment must match its assessment and competency')
 check(len(weights)==len(items) and abs(sum(weights)-100)<.00001,'assessments/weights','Weights must total 100%')
 for c in competencies:
  cid=c.get('id');related={o.get('id') for o in outcomes if o.get('competency')==cid}
  check(len({o.get('topic') for o in outcomes if o.get('competency')==cid})>=2,'coverage/'+str(cid),'Competency must span at least two topics')
  check(sum(a.get('type') in ['assignment','lab','project'] and bool(related.intersection(a.get('outcomes',[]))) for a in items)>=2,'coverage/'+str(cid),'Two major deliverables per competency required')
  check(any(a.get('type') in ['midterm_exam','final_exam'] and related.intersection(a.get('outcomes',[])) for a in items),'coverage/'+str(cid),'Exam coverage per competency required')
 announcements=p.get('announcements',[])
 check(isinstance(announcements,list) and len(announcements)==term_weeks,'announcements',f'Exactly {term_weeks} announcements required')
 for key in ['alignmentMatrix','outcomeWeekMap','assessmentBlueprint','announcements']:check(bool(p.get(key)),key,'Required alignment or announcement artifact missing')
 check(not p.get('termConflicts'), 'termConflicts','Resolve term-length conflicts')
 return errors

def api(service,token,tenant,course,action,data,Denied):
 ctx=service.identity(token,tenant)
 if tenant!='scholarion':raise Denied('Scholarion curriculum only')
 if ctx['role']!='instructor':raise Denied('Instructor identity required')
 with service.connect(tenant) as db:
  service.membership(db,ctx,course)
  db.execute('CREATE TABLE IF NOT EXISTS curriculum_reviews(id TEXT PRIMARY KEY,course TEXT,created REAL,author TEXT,package TEXT,validation TEXT)')
  if action=='history':return [dict(r) for r in db.execute('SELECT id,course,created,author,validation FROM curriculum_reviews WHERE course=? ORDER BY created DESC LIMIT 25',(course,))]
  if action!='validate':raise ValueError('Unknown curriculum operation')
  package=data.get('package');errors=validate(package);key=str(uuid.uuid4())
  db.execute('INSERT INTO curriculum_reviews VALUES(?,?,?,?,?,?)',(key,course,time.time(),ctx['user'],json.dumps(package),json.dumps(errors)))
  service.emit(db,ctx,'course.version.proposed',course=course)
  return {'id':key,'errors':errors,'structuralChecksPassed':not errors,'publishAllowed':False,'remainingReviews':['Approved tenant policy verification','Alignment semantic consistency','Question originality and answer accuracy','Accessibility and faculty review','Canvas publisher and rollback integration','SIS and avatar export integration']}
