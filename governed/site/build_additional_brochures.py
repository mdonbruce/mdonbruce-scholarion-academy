"""Build draft brochures from the same data used by program pages."""
import json
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,PageBreak
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
root=Path(__file__).resolve().parent
out=root/'dist/brochures';out.mkdir(exist_ok=True)
styles=getSampleStyleSheet();styles['Title'].textColor=colors.HexColor('#073566');styles['BodyText'].leading=13
for p in json.loads((root/'dist/data/additional-programs.json').read_text(encoding='utf-8')):
 story=[]
 def para(t,style='BodyText'):story.extend([Paragraph(escape(t),styles[style]),Spacer(1,4)])
 para('SCHOLARION ACADEMY','Heading2');para(p['title'],'Title');para('DRAFT — NOT OPEN FOR ENROLLMENT','Heading2')
 para(f"{p['totalWeeks']} weeks total; {len(p['courses'])} ten-week courses. Lead faculty: {p['faculty']}. Biography pending.")
 para(p['prerequisites']);para('Fees, start dates and live schedules are unconfigured. Sandbox only; no real payments. No CEUs or employment guarantees.')
 para('Learning outcomes','Heading2')
 for c in p['competencies']:para(c['text'])
 para('Projects and final review','Heading2');para(p['capstone'])
 for r in p['rubric']:para(f"{r['criterion']}: {r['points']} points (proposed)")
 for c in p['courses']:
  story.append(PageBreak());para(c['id']+' — '+c['title'],'Title');para('Ten-week course design; teaching materials require academic review.')
  for m in c['modules']:para(f"Week {m['week']}: {m['title']}",'Heading3');para(m['outcomes'][0]['text'])
 story.append(PageBreak());para('Delivery and release status','Title');para(p['dependencyNotes'])
 para('Certificate: '+p['credential']['title']+'. Badge issuance remains disabled pending approved completion rules.')
 para('Learning hours: '+(str(p['learningHours'])+' estimated' if p['learningHours'] else 'pending confirmation'))
 para('Tool versions, educational licenses and faculty support capacity are unverified. No third-party affiliation or endorsement is implied. Use synthetic or licensed data only.')
 for g in p['gaps']:para(g)
 para('Contact the Academy through local Support. Advisor scheduling, financing, refunds and cohort deadlines require configuration. This brochure is generated from the same design data as the program preview.')
 SimpleDocTemplate(str(out/f"program-{p['program']}.pdf"),title=p['title'],author='Scholarion Academy',topMargin=40,bottomMargin=40).build(story)
print('Four draft PDF brochures generated')
