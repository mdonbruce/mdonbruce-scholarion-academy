from pathlib import Path
import json,zipfile
root=Path(__file__).resolve().parent
ps=json.loads((root/'dist/academy/programs.json').read_text())
report=['SCHOLARION ACADEMY — CORE PROGRAM DRAFT BUILD','2026-10-02','', 'All entries below are draft authoring packages, not published production courses.','']
for p in ps:
 report += [f"Program {p['id']}: {p['title']}",f"Built: {len(p['modules'])} module packages; {len(p['assessments'])} draft assessment briefs; 5 outcomes; program and capstone badge artwork.",'Verified: synthetic data, deterministic solution-cell execution, file and package checks.','Draft: lesson content, slides/scripts, activities, assessment rubrics, capstone scaffold.','Pending: SME/originality/accessibility review, advanced live-model labs, media, final exams, hosted integrations.',p['scheduleNote'],'']
(root/'CORE-PROGRAM-STATUS.txt').write_text('\n'.join(report),encoding='utf-8')
with zipfile.ZipFile(root.parent/'scholarion-core-11-programs-draft.zip','w',zipfile.ZIP_DEFLATED) as z:
 for folder in ['dist/academy','instructor-packages']:
  for f in (root/folder).rglob('*'):
   if f.is_file() and f.suffix!='.zip':z.write(f,f.relative_to(root))
 for name in ['CORE-PROGRAM-STATUS.txt','README.md','build_academy.py','academy_topics.py','build-academy-badges.cjs','validate_academy.py']:
  z.write(root/name,name)
print('Packaged all 11 programs, instructor resources and badge assets.')
