from pathlib import Path
import json,zipfile,io,contextlib
root=Path(__file__).resolve().parent
ps=json.loads((root/'dist/academy/programs.json').read_text())
assert len(ps)==11 and {p['id'] for p in ps}==set(range(1,12))
notebooks=0;modules=0
for p in ps:
 assert len(p['outcomes'])==5
 assert len(p['modules'])=={1:20,2:20,3:20,4:14,5:14,6:12,7:6,8:12,9:12,10:10,11:10}[p['id']]
 assert sum(r['points'] for r in p['rubric'])==100
 for block in p['blocks']:
  items=[a for a in p['assessments'] if a['id'].startswith(block['id']+'-')]
  expected={'Assignment':3,'Lab':2,'Project':1,'Quiz':6} if p['id']==7 else {'Assignment':5,'Lab':3,'Project':2,'Quiz':8}
  for kind,count in expected.items():assert sum(a['type']==kind for a in items)==count
 for m in p['modules']:
  modules+=1
  assert len(m['miniLabs'])==2 and len(m['quiz'])==3
  assert all(0<=q['correct']<len(q['choices']) for q in m['quiz'])
  assert (m['prerequisite'] is None)==(m['number']==1)
  for name in ['starter.ipynb','mini-1-starter.ipynb','mini-2-starter.ipynb','dataset.csv','data-card.json','slides.html','lecture-script.txt']:
   assert (root/'dist'/m['path']/name).is_file(),name
  teach=root/'instructor-packages'/f"program-{p['id']}"/f"module-{m['number']:02d}"
  for name in ['solution.ipynb','mini-1-solution.ipynb','mini-2-solution.ipynb']:
   n=json.loads((teach/name).read_text());cell=n['cells'][1];code=''.join(cell['source']);stream=io.StringIO();env={}
   with contextlib.redirect_stdout(stream):exec(code,env)
   assert stream.getvalue()==''.join(cell['outputs'][0]['text'])
   rows=env['rows'];result=env['result'];family=m['family']
   if family=='quality':assert len(result)==sum(r['confidence'] is not None for r in rows)
   if family=='routing':assert all(result[r['id']]=='review' for r in rows if r['confidence'] is None)
   if family=='workflow':assert set(result.values())<={'needs_data','human_review','awaiting_approval'}
   if family=='reconcile':assert result==[r['id'] for i,r in enumerate(rows) if i%5==0]
   if family=='retrieval':assert result==({'solution.ipynb':['D1','D3','D2'],'mini-1-solution.ipynb':[],'mini-2-solution.ipynb':['D3','D1','D2']}[name])
   if family=='cost':assert result['baseline_minutes']-result['assisted_minutes']==result['net_minutes_saved']
   if family=='evaluation':assert sum(x['total'] for x in result.values())==len(rows)
   notebooks+=1
 with zipfile.ZipFile(root/'dist/academy'/f"program-{p['id']}"/'student-package.zip') as z:
  assert not any('solution' in n or 'answer-key' in n for n in z.namelist())
  student=json.loads(z.read('program.json'))
  assert all('correct' not in q for m in student['modules'] for q in m['quiz'])
 assert (root/'dist/academy'/f"program-{p['id']}"/'program-badge.svg').is_file()
 assert not p['credential']['eligible'] and not p['credential']['requiredCourseIds']
print(f'PASS: 11 program structures; {modules} modules; {notebooks} notebooks re-executed and checked; assessment counts, student exports, badges and issuance gates.')
