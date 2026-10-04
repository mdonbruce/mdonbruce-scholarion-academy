"""Import supplied catalog data without executing source HTML or document instructions."""
from pathlib import Path
import json, re, zipfile, shutil, hashlib

root=Path(__file__).resolve().parent
temp=Path('C:/Users/mdonb/AppData/Local/Temp')
refs=root/'references'
refs.mkdir(exist_ok=True)
names=['program-1.html','program-12.html','index (5).html','scholaris-ai-academy-logo (1).svg','programs (1).json','README (4).md','Scholarion_conversation_record.md','README (1).txt','Pasted text(20261001-203023).txt','Pasted text(20261001-210419).txt','Pasted text(20261001-195120).txt','Pasted markdown(20261001-203254).md','Pasted text(20261001-204212).txt','Pasted text(20261001-203825).txt','scholaris_ai_academy_site_v2.zip','scholaris_ai_academy_site.zip','scholarion_initial_v0_1.zip','scholarion_v0_2.zip','scholarion_v0_3.zip','scholarion_v0_4.zip','app (1).html','faculty (1).html','admin (1).html','login (1).html','lms (1).html','proctor (1).html','proctor (5).html','index (1) (1).html','index (2) (1).html','index (3) (1).html','index (4) (1).html']
manifest=[]
for name in names:
    p=temp/name
    if p.exists():
        shutil.copy2(p,refs/name)
        manifest.append(dict(file=name,bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest()))
(refs/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
with zipfile.ZipFile(temp/'scholaris_ai_academy_site_v2.zip') as z:
    programs=json.loads(z.read('scholaris_ai_academy_site/data/programs.json'))
def clean(s):
    return s.replace('Scholaris','Scholarion').replace('Haven','Scholarion').replace('**','').strip()
def source(name):return (temp/name).read_text(encoding='utf-8-sig')
advanced=source('Pasted text(20261001-203023).txt')
selfpaced=source('Pasted text(20261001-204212).txt')
def detail(text,id):
    match=re.search(r'(?m)^\*\*#'+str(id)+r'\b[^\n]*',text)
    if not match:return ''
    end=re.search(r'(?m)^\*\*#\d+\b|^## ',text[match.end():])
    return clean(text[match.start():match.end()+end.start() if end else len(text)])
for text,low,high in [(advanced,15,25),(selfpaced,28,38)]:
    for line in text.splitlines():
        cells=[c.strip() for c in line.split('|')[1:-1]]
        if len(cells)<6 or not cells[0].isdigit():continue
        id=int(cells[0])
        if not low<=id<=high:continue
        block=detail(text,id)
        cap=re.search(r'(?im)^-?\s*(?:\*\*)?Capstone(?:\*\*)?:?\s*(.*)',block)
        track=clean(cells[2]) if low==15 else ('Business & Leadership' if id==34 else 'Builder')
        track={'Builder-light':'Builder','Business':'Business & Leadership','Product':'Business & Product','Leadership':'Business & Leadership'}.get(track,track)
        programs.append(dict(id=id,title=clean(cells[1]),track=track,length=clean(cells[3]),coding='No coding required' if id in [20,25,34] else 'See program prerequisites',summary=block.split('\n')[1].lstrip('- ').strip() if len(block.split('\n'))>1 else clean(cells[1]),capstone=cap.group(1) if cap else 'See supplied curriculum outline; final assessment details require review.',format='Self-paced' if low==28 else 'Live / cohort',type=clean(cells[2]) if low==28 else 'Certificate program',stacking=clean(cells[5]),specification=block,source='self-paced design specification' if low==28 else 'advanced program design specification'))
programs.append(dict(id=26,title='Agentic AI Systems Design — Live Intensive',track='Builder',length='7 weeks',coding='Working Python required',format='Live online · 8–11 hours/week',summary='Design, evaluate, and demonstrate an agentic system through faculty sessions and guided labs.',capstone='Agentic system with retrieval, tool use, evaluation, human oversight, and a final presentation.',prerequisites='Working Python, algorithms and data structures, basic LLM and AI concepts.',requirements='All 12 labs submitted with checkpoints met; weekly quizzes at 70% or above; capstone rubric pass; final presentation.',weeks=[['1','Agent architecture and problem framing'],['2','Retrieval and knowledge grounding'],['3','Tool use and orchestration'],['4','Multi-agent collaboration'],['5','Evaluation and safety'],['6','Deployment and monitoring'],['7','Capstone labs and presentations']],source='Program 26 supplied specification'))
programs.sort(key=lambda p:p['id'])
editorial_summaries={15:'Build and evaluate agentic systems through live weekend labs, from retrieval and tools to deployment and a capstone defense.',17:'Combine data, AI, prompting, generative applications, and agent development into a longer practical pathway.',18:'Study search, machine learning, neural networks, vision, and language processing through Python labs.',20:'Develop a prioritized portfolio of generative AI opportunities and a practical pilot plan.',24:'Combine foundational and advanced AI learning with a mentor-supervised industry capstone.',25:'Connect AI strategy and governance to a leadership practicum and implementation plan.',28:'Build retrieval-grounded applications and agents through an eight-course professional pathway.',29:'Develop agents from core design concepts through provider-neutral applications.',30:'Build Python agents from first principles, then extend them with tools and reusable patterns.',31:'Extend the three-course Python agent core with advanced applications and delivery practices.',32:'Explore agent autonomy, tool use, planning, and core design patterns.',33:'Build agentic pipelines, stateful graph workflows, and tool integrations.',34:'Understand agent capabilities, organizational use cases, risk, and responsible adoption.',37:'Develop Python, data, machine-learning, and evaluation foundations.',38:'Study neural networks, deep learning, and language processing for agent applications.'}
for p in programs:
    if p['id'] in editorial_summaries:p['summary']=editorial_summaries[p['id']]
    if p['id']==15:
        p['coding']='Working Python and APIs required'
        p['prerequisites']='Working Python and comfort calling APIs; no prior agent framework or Docker experience required.'
        p['capstone']='A multi-agent platform with retrieval, tool integration, guardrails, tracing, deployment documentation, and a live demonstration.'
        p['requirements']='20 modules completed; module assessments passed; capstone at least 70/100 with a live defense; final knowledge check passed.'
for id,text,start in [(15,advanced,'### 5.2 Weekend plan'),(26,source('Pasted text(20261001-203825).txt'),'## 4. WEEK-BY-WEEK')]:
    section=text[text.index(start):]
    rows=[]
    for line in section.splitlines():
        cells=[clean(c) for c in line.split('|')[1:-1]]
        if cells and cells[0].isdigit():
            rows.append([cells[0], ' · '.join(cells[1:3]) if id==15 else cells[1]])
        elif rows and line.startswith('**'):break
    next(p for p in programs if p['id']==id)['weeks']=rows
for p in programs:
    p['status']='Draft curriculum'
    p.setdefault('format','Online / cohort')
    p.setdefault('type','Certificate program')
    p.setdefault('source','v2 archive catalog')
    p['level']='Advanced' if p['id'] in [1,15,22,23,24,25,26,28,31,33,38] else 'Foundational' if p['id'] in [7,18,19,21,32,34,37] else 'Intermediate'
    for key,value in list(p.items()):
        if isinstance(value,str):p[key]=clean(value)
        elif isinstance(value,list):p[key]=json.loads(json.dumps(value).replace('Scholaris','Scholarion'))
data=root/'dist'/'data';data.mkdir(exist_ok=True)
(data/'programs.json').write_text(json.dumps(programs,ensure_ascii=False,indent=2),encoding='utf-8')
(root/'dist'/'catalog-data.js').write_text('const programCatalog = '+json.dumps(programs,ensure_ascii=False)+';\n',encoding='utf-8')
print(json.dumps({'program_count':len(programs),'ids':[p['id'] for p in programs],'source_files_preserved':len(manifest),'missing_specifications':[13,14],'proposed_only':[27]}))
