"""Source-derived mapping, not an outcome equivalence or publication approval."""

import json

from pathlib import Path

ROOT=Path(__file__).resolve().parent

RAW='''Python development environment|15,16,17,18,21,22,24

Python foundations|17,18,21,24

Data preparation and visualization|17,18,21,22,24

Machine learning foundations|3,17,18,21,24

Deep learning and language foundations|3,17,18,24

Language models and prompting|2,15,16,17,19,24

AI application delivery|15,16,17,22,24

Embeddings and hybrid retrieval|1,2,15,16,17,22,24

Retrieval chains and memory|1,2,15,16,17,24

Agents and typed tools|1,2,15,16,17,24

Persistent graph workflows|1,15,24

MCP integrations|1,4,14,15,24

Multi-agent orchestration|1,14,15,24

Agentic and graph retrieval|1,15,22,24

Evaluation and regression testing|1,14,15,23,24

Monitoring and model adaptation|15,24

AI security and red teaming|1,15,22,24

Container delivery and CI/CD|1,15,22,24

Workflow automation|5,6,7,14,15,24

Responsible AI and governance|all

AI strategy and organizational change|9,13,20,23,25'''

modules=[]

for i,line in enumerate(filter(str.strip,RAW.splitlines()),1):

 title,ids=line.split('|');modules.append({'id':f'commons-{i:02}','version':'0.1.0-draft','title':title,'programs':list(range(1,26)) if ids=='all' else list(map(int,ids.split(','))),'state':'mapping_only','contentApproved':False})

rules=[{'from':26,'to':1,'type':'proposed_recognition','detail':'Candidate source Weeks 1–8 mapping; assessed equivalence and approval required.'},{'from':26,'to':15,'type':'proposed_recognition','detail':'Candidate Weekends 3–5 mapping; no automatic waiver.'},{'from':16,'to':15,'type':'proposed_recognition','detail':'Modules 1–6 / weekends 1–3; requires assessed equivalence.'},

 {'from':15,'to':1,'type':'mutually_exclusive_credit','detail':'Retain both formats; do not award duplicate credit.'},

 {'from':20,'to':13,'type':'dependency_tbc','detail':'Short-form Course 1 recognition; program 13 missing.'},

 {'from':23,'to':12,'type':'no_double_credit','detail':'Shared content requires module-level equivalence; distinct product focus.'},

 {'from':21,'to':18,'type':'prerequisite_path','detail':'Data foundations before AI with Python.'},

 {'from':21,'to':22,'type':'prerequisite_path','detail':'Data foundations before data engineering.'}]

catalog={p['id']:p for p in json.loads((ROOT/'dist/data/programs.json').read_text(encoding='utf-8'))}

rows=[]

for i in range(1,27):

 p=catalog.get(i,{})

 rows.append({'id':i,'title':p.get('title','Specification missing — TBC'),'length':p.get('length','TBC'),'catalogPresent':bool(p),'moduleIds':[m['id'] for m in modules if i in m['programs']],'relationships':[r for r in rules if i in (r['from'],r['to'])],'decision':'Retain for review; no merge or retirement authorized' if p else 'Recover specification before dependent build','overlap':'Not measured: approved weighted outcomes and assessments unavailable','weeksInCatalog':len(p.get('weeks',[]))})

modules.append({'id':'commons-22','version':'0.1.0-draft','title':'Language representations and transformer evaluation','programs':[17,18,19,24],'state':'mapping_only','contentApproved':False})

for row in rows:

 if row['id'] in [17,18,19,24]:row['moduleIds'].append('commons-22')

rows.append({'id':27,'title':'Proposed Certificate in MLOps and LLMOps','length':'Proposal only; ten-week course rule applies if approved','catalogPresent':False,'moduleIds':['commons-16','commons-18'],'relationships':[],'decision':'Proposal only — no build or publication approval','overlap':'Unmeasured; assessed equivalence required','weeksInCatalog':0})

result={'brand':'Scholarion Academy','status':'Draft for product-owner review','published':False,'automaticCredit':False,'leadFaculty':'Dr. Martins Donbruce Idahosa','modules':modules,'programs':rows,'rules':rules,'cohortDecision':'Retain all existing offerings. Courses use ten-week blocks; bundled pathways require separate sequencing review.','blockers':['Programs 13 and 14 absent from catalog','Weighted outcome equivalence unavailable; no verified >60% overlap claim','Faculty and product-owner approval not recorded','Canvas, Cloud Lab and Zoom integrations unavailable','Policy Part E missing','Tool versions, educational licensing and textbook chapter references not verified'],'versionRule':'New module versions are proposed for new cohorts only. Running-cohort pinning is not implemented.'}

result['productOwnerApproval']={'date':'2026-10-02','scope':'Retain all programs; proceed with program 15 first','source':'Explicit YES in current conversation','facultyPublicationApproved':False}

result['status']='Build scope approved; academic equivalence and publication pending'

(ROOT/'dist/data/consolidation.json').write_text(json.dumps(result,indent=2))

lines=['SCHOLARION PROGRAM CONSOLIDATION — DRAFT','No program is merged, retired, published or granted credit by this report.',result['cohortDecision'],'','ID | Existing title | Duration | Shared module references | Decision']

lines += [f"{r['id']} | {r['title']} | {r['length']} | {', '.join(r['moduleIds'])} | {r['decision']}" for r in rows]

lines += ['','PROPOSED RELATIONSHIPS']+[f"#{r['from']} -> #{r['to']}: {r['type']} — {r['detail']}" for r in rules]

lines += ['','COMMONS INDEX — mapping only, not full learning content']+[f"{m['id']} {m['version']} | {m['title']} | programs {m['programs']}" for m in modules]

lines += ['','GAPS']+result['blockers']+['Catalog weeks are outlines, not evidence of full curricula. Program 15 has 10 weekend rows; its required 20 session packages, executed domain labs and approval records have not been verified. Existing generated notebooks are generic simulations. Programs 17/24/25 require bundle-duration reconciliation. Preserve all existing badges; no credential eligibility is changed.']

(ROOT/'CONSOLIDATION-15-25.txt').write_text('\n'.join(lines),encoding='utf-8')

print('27 program rows and 22 draft module mappings created; #27 proposal only.')

