"""Original core-program design scaffolds and evidence-based readiness checks."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
TOPICS={
2:[['Bound a language application','Handle model inputs and outputs','Evaluate prompt contracts','Create a traceable document corpus','Compare retrieval baselines','Ground answers in evidence','Add one permissioned tool','Manage agent state and stopping','Measure task reliability','Defend the application baseline'],['Investigate retrieval failures','Validate tool arguments','Recover from repeated calls','Budget time and model cost','Test instruction attacks','Measure unsupported answers','Design an approval handoff','Prepare a reproducible package','Review privacy and limitations','Defend the single-agent assistant']],
3:[['Validate a synthetic dataset','Explain distributions and missingness','Train a simple predictive baseline','Compare validation splits','Diagnose classification errors','Evaluate groups and calibration','Compare clusters and features','Trace a neural training loop','Document a model boundary','Defend a model card'],['Specify generated output contracts','Measure prompt failures','Retrieve supporting evidence','Add bounded tool execution','Connect predictions to explanations','Test an agent workflow','Evaluate privacy and permission controls','Trace latency and cost','Assemble a reproducible demonstration','Defend the combined AI workflow']],
4:[['Scope a repository automation task','Protect secrets and project boundaries','Turn an issue into testable acceptance','Evaluate generated tests','Review an assisted code change','Build a constrained review agent','Gate a continuous integration run','Audit dependencies and tool access','Rehearse rollback and human approval','Defend the development pipeline']],
5:[['Frame a prediction decision','Inspect synthetic tabular quality','Build a visual prediction baseline','Compare classification errors','Evaluate forecasts without leakage','Explain uncertainty to a reviewer','Connect predictions to a workflow','Require approval before action','Measure errors across groups','Defend a predictive workflow']],
6:[['Define a grounded knowledge task','Compare reusable prompt patterns','Organize a licensed knowledge set','Build a visual retrieval flow','Check citation and refusal behavior','Connect a bounded workflow trigger','Design approval and exception paths','Test privacy and instruction attacks','Measure quality and operating effort','Defend a departmental assistant']],
7:[['Measure a personal workflow baseline','Protect information in assistant prompts','Build reusable output templates','Check generated summaries against sources','Organize a private knowledge workflow','Create a bounded task assistant','Review automation before sending','Measure time and correction effort','Document limits and disclosure','Demonstrate a productivity portfolio']],
8:[['Map an operational process','Measure delays and failure demand','Choose a bounded agent task','Specify inputs and approval owners','Prototype a triage workflow','Handle exceptions and escalation','Evaluate cost and quality tradeoffs','Plan monitoring and incident response','Test adoption assumptions','Defend an operations pilot']],
9:[['Prioritize organizational opportunities','Challenge vendor capability claims','Estimate total cost and value','Choose a human accountability model','Assess data and workforce readiness','Design governance and risk controls','Select build buy or partner criteria','Plan a measurable pilot','Prepare adoption and oversight milestones','Defend a board-level roadmap']],
10:[['Define a finance support boundary','Validate synthetic ledger records','Reconcile records and explain discrepancies','Design a monitoring triage rule','Ground a financial research summary','Trace exceptions to evidence','Test model risk and group effects','Protect data and tool permissions','Prepare an audit and escalation packet','Defend a finance operations assistant']],
11:[['Separate operations from clinical decisions','Validate synthetic scheduling records','Analyze queues and access patterns','Build a scheduling support workflow','Check claims-document completeness','Route administrative exceptions','Evaluate aggregate service metrics','Test privacy and permission boundaries','Prepare human review and governance','Defend a non-clinical operations assistant']]}
CAPSTONES={2:'Grounded domain assistant with one bounded tool and a reproducible evaluation report',3:'Predictive model connected to a generation feature and agent workflow, with model card',4:'Issue-to-review automation with test, security and human approval gates',5:'Visual predictive model and approval-gated workflow',6:'Grounded department knowledge assistant and exception-aware automation',7:'Personal productivity portfolio with measured baseline and correction effort',8:'Operational triage pilot with cost assumptions and accountable oversight',9:'AI adoption roadmap, operating model and risk register',10:'Synthetic reconciliation assistant with audit trail and model-risk memo',11:'Synthetic scheduling or documentation support with privacy review and human oversight'}
def designs():
 base={p['id']:p for p in json.loads((ROOT/'dist/data/programs.json').read_text(encoding='utf-8'))};result=[]
 for n,blocks in TOPICS.items():
  b=base[n];courses=[]
  comps=[{'id':f'C{i}','text':t} for i,t in enumerate([f'Analyze a bounded problem for {b["title"]}.','Build a reproducible artifact using synthetic or licensed evidence.','Evaluate output quality, failure cases and uncertainty.','Design privacy, security, bias checks and human-review controls.','Defend the resulting portfolio and its operational limitations.'],1)]
  for k,topics in enumerate(blocks,1):
   modules=[]
   for w,title in enumerate(topics,1):
    modules.append({'week':w,'title':title,'status':'draft design; teaching assets pending','outcomes':[{'id':f'P{n}-B{k}-W{w}-O1','competency':f'C{(w-1)%5+1}','text':f'Produce a testable artifact to {title.lower()}.'},{'id':f'P{n}-B{k}-W{w}-O2','competency':f'C{w%5+1}','text':'Compare a normal case with a failure case and explain the evidence.'}],'activity':{'student':f'{title} using fictional records. Define success, create the artifact, test one failure and document limitations. Detailed worksheet and assets pending.','instructor':'Inspect the evidence and assumptions, discuss failure handling and record feedback. Reviewed answer key pending.'}})
   courses.append({'id':f'P{n:02d}-B{k}','title':b['title']+f' — Block {k}','sequence':k,'weeks':10,'modules':modules,'finalAssessment':'Capstone defense' if k==len(blocks) else 'Foundation exam'})
  result.append({'program':n,'title':b['title'],'brand':'Scholarion Academy','faculty':'Dr. Martins Donbruce Idahosa','state':'draft','weeks':10,'totalWeeks':len(blocks)*10,'courses':courses,'modules':courses[0]['modules'],'sessions':[],'competencies':comps,'capstone':CAPSTONES[n],'rubric':[{'criterion':c,'points':v} for c,v in [('Scope and evidence',20),('Artifact quality',25),('Failure evaluation',25),('Human control and privacy',20),('Defense',10)]],'dependencyNotes':'Prerequisite and prior-learning mappings require reviewed evidence; no automatic transfer.','notes':'','publicationAllowed':False,'boundary':'No personalized investment advice or final credit decisions.' if n==10 else 'Operations and administration only. No diagnosis or treatment decisions.' if n==11 else 'Synthetic scenarios; no autonomous consequential actions.','gaps':['Complete student and instructor assets','Executable labs and no-code reference builds','Reviewed question banks and assessment policies','Verified tool versions and licenses','Accessibility and independent academic reviews']})
 return result

def audit(shell):
 """Only count linked completed artifacts, not prose promises or placeholder counts."""
 courses=shell.get('courses') or [{'id':str(shell['program']),'modules':shell.get('modules',[])}]
 reports=[]
 for c in courses:
  ms=c.get('modules',[]);outcomes={o['id'] for m in ms for o in m.get('outcomes',[])}
  assessments=c.get('assessmentPlan',[])
  mapped={o for a in assessments for o in a.get('outcomes',[])}
  errors=[]
  for kind,count in [('assignment',5),('lab',3),('project',2),('quiz',8),('midterm_exam',1),('final_exam',1)]:
   if sum(a.get('type')==kind for a in assessments)!=count:errors.append(f'{kind}: requires {count} planned assessments')
  if len(ms)!=10:errors.append('Ten weekly modules required')
  if outcomes-mapped:errors.append(f'{len(outcomes-mapped)} outcomes lack assessment mappings')
  if mapped-outcomes:errors.append('Assessment refers to unknown outcomes')
  for a in assessments:
   if not a.get('artifact'):errors.append(a['id']+': assessed content missing')
  for asset in ['notebooks','dataCards','walkthroughs','slides','scripts','instructorGuide']:
   if not c.get(asset):errors.append(asset+': evidence missing')
  reports.append({'course':c['id'],'plannedAssessments':len(assessments),'unmappedOutcomes':sorted(outcomes-mapped),'gaps':errors,'ready':False})
 return {'program':shell['program'],'courses':reports,'publicationAllowed':False,'reviewRequired':['Originality','Tool licensing and versions','Accessibility','Responsible AI','Independent instructional designer and SME'],'note':'Structural planning does not certify content quality or enable publication.'}

def enrich(shell):
 for c in shell.get('courses',[]):
  modules=c['modules'];plan=[];major=['assignment','lab','assignment','lab','project','assignment','lab','assignment','assignment','project'];counts={}
  for m,kind in zip(modules,major):
   w=m['week'];oids=[x['id'] for x in m['outcomes']]
   for typ in [kind]+(['quiz'] if w not in [5,10] else ['midterm_exam' if w==5 else 'final_exam']):
    counts[typ]=counts.get(typ,0)+1
    plan.append({'id':c['id']+'-'+typ+'-'+str(counts[typ]),'type':typ,'week':w,'outcomes':oids,'title':m['title']+' — '+typ.replace('_',' '),'artifact':None,'state':'planned','aiPolicy':'allowed with disclosure','assessmentMode':'capstone defense' if typ=='final_exam' and c.get('finalAssessment')=='Capstone defense' else typ})
   m['prerequisiteWeek']=w-1 if w>1 else None
   m['miniLabs']=[{'title':m['title']+' — baseline practice','state':'planned'},{'title':m['title']+' — failure analysis','state':'planned'}]
  c['assessmentPlan']=plan;c['announcements']=[{'week':m['week'],'text':'This week: '+m['title']+'. Review the objectives, practice, then submit evidence.','state':'draft; not scheduled'} for m in modules]
 shell['completionProposal']={'overallMinimumPercent':70,'allLabsSubmitted':True,'capstonePassRequired':True,'participationMinimumPercent':80,'approvedAsyncAlternativeAllowed':True,'approved':False,'reason':'Reconcile with existing course-grade eligibility policy before issuance.'}
 return shell

def build():
 from additional_programs import designs as additional
 items=[enrich(p) for p in [additional()[0],*designs()]]
 (ROOT/'dist/data/core-programs.json').write_text(json.dumps(items,indent=2),encoding='utf-8')
 path=ROOT/'dist/data/programs.json';catalog=json.loads(path.read_text(encoding='utf-8'))
 for p in items:
  row=next(x for x in catalog if x['id']==p['program']);row.update(length=f"{p['totalWeeks']} weeks ({len(p['courses'])} ten-week blocks)",format='Online; delivery schedule pending',weeks=[[f"B{c['sequence']} W{m['week']}",m['title']] for c in p['courses'] for m in c['modules']],capstone=p['capstone'],status='Draft curriculum')
 path.write_text(json.dumps(catalog,ensure_ascii=False),encoding='utf-8');(ROOT/'dist/catalog-data.js').write_text('const programCatalog = '+json.dumps(catalog,ensure_ascii=False)+';\n',encoding='utf-8')
if __name__=='__main__':build()
