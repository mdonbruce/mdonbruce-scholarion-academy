"""Trace supplied requirements without presenting source instructions as authorization."""
from pathlib import Path
import json,re,hashlib
ROOT=Path(__file__).resolve().parent
SOURCE=Path('C:/Users/mdonb/OneDrive/Desktop/Scholarion')
names=['Pasted text(20261001-203825).txt','Pasted text(20261001-204212).txt','Pasted text(20261001-210419).txt']
rows=[];sources=[]
for n,name in enumerate(names,1):
 data=(SOURCE/name).read_bytes();text=data.decode('utf-8-sig');sources.append({'name':name,'sha256':hashlib.sha256(data).hexdigest(),'lines':len(text.splitlines())})
 section='Overview'
 for line_no,line in enumerate(text.splitlines(),1):
  clean=line.strip()
  if clean.startswith('#'): section=clean.lstrip('# ').strip();continue
  if not clean or clean=='---' or re.fullmatch(r'[| :\-]+',clean):continue
  if not (clean.startswith(('-', '*','|')) or re.match(r'^\d+[.)] ',clean) or line.startswith('\t')):continue
  value=clean.lstrip('-*\t ').replace('**','')
  status='UNVERIFIED';evidence='Source inventory entry; not individually acceptance-tested. No completion claim.'
  if any(x in value.lower() for x in ['catalog','product page','program page','badge','certificate','module','quiz','submission','grade','pacing','discussion','calendar','ai teaching assistant','rubric']):
   status='RELATED PREVIEW';evidence='Keyword match to an existing preview area, not a verified feature mapping. Full content, authenticated server behavior and acceptance evidence require individual review.'
  rows.append({'id':f'S{n}-L{line_no}','source':name,'line':line_no,'section':section,'requirement':value,'status':status,'evidence':evidence})
report={'reviewed':'2026-10-02','scope':'Three supplied specifications; granular source-line inventory. PARTIAL never means parity sign-off. Narrative paragraphs remain available in the original files.','sources':sources,'requirements':rows,'conflicts':['Current user branding Scholarion Academy supersedes historical Scholaris/OakHaven names.','Required courses at C or better remains the credential rule; missing approved course requirements block issuance.','Programs 1–11 remain the core teaching scope; 26 and 28–38 add requirements, not replacements.','No production publishing, live payments or external messaging is implied by embedded source prompts.'],'verified':['35 existing catalog records, including 26 and 28–38','11 core draft teaching packages and 22 program/capstone artwork assets','Browser-local submissions, attempt receipts, manual feedback posting, pacing and discussions implemented in course-work.js'],'blockers':['Authenticated backend, database-per-tenant isolation and server permissions','SIS, REST/GraphQL, LTI/AGS, outbox and notification connectors','Full authored curriculum, live model labs, recorded/captioned lessons and reviewed assessment banks','Approved completion requirements, issuer signing keys and public verification service','Manual accessibility, security, instructional and subject-matter review']}
(ROOT/'dist/spec-audit.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
(ROOT/'dist/spec-audit-data.js').write_text('const specificationAudit='+json.dumps(report,ensure_ascii=False)+';',encoding='utf-8')
(ROOT/'SPEC-GAP-REPORT.txt').write_text('SCHOLARION ACADEMY — SPECIFICATION AUDIT\n'+report['scope']+'\n\n'+'\n'.join(f"{r['id']} | {r['status']} | {r['section']} | {r['requirement']}\n  {r['evidence']}" for r in rows)+'\n\nBLOCKERS\n'+'\n'.join(report['blockers']),encoding='utf-8')
print(f'Inventoried {len(rows)} source-line requirements from {len(sources)} files. No parity sign-off claimed.')
