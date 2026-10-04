from pathlib import Path
import json,re
from urllib.parse import urlsplit,unquote
root=Path(__file__).resolve().parent/'dist'
programs=json.loads((root/'data/programs.json').read_text(encoding='utf-8'))
expected=set(range(1,27))|set(range(28,39))  # 13 and 14 now have standalone records; 27 remains proposed
assert len(programs)==len(expected) and {p['id'] for p in programs}==expected
for p in programs:
    assert all(p.get(k) for k in ['title','track','length','summary','capstone','format','status'])
    assert 'Scholaris' not in json.dumps(p) and 'Haven' not in json.dumps(p)
for id,count in [(1,20),(12,10),(15,10),(26,10)]:  # current curriculum tables (program 1 adds a capstone week; 26 now spans 10 weeks)
    assert len(next(p for p in programs if p['id']==id)['weeks'])==count,(id,count)
html=(root/'index.html').read_text(encoding='utf-8-sig')
for path in re.findall(r'(?:src|href)="([^"#]+)"',html):
    if not path.startswith(('http','data:')):assert (root/unquote(urlsplit(path).path)).exists(),path
aliases={'app.html':'dashboard','lms.html':'lms','login.html':'signin','faculty.html':'faculty','admin.html':'admin','proctor.html':'assessment','program-1.html':'program/1','program-12.html':'program/12'}
for filename,route in aliases.items():
    (root/filename).write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=./index.html#'+route+'"><title>Scholarion</title><body><p>Opening Scholarion… <a href="./index.html#'+route+'">Continue</a></p></body></html>',encoding='utf-8')
print(f'PASS: {len(programs)} unique program IDs, required fields, branding, 4 curriculum tables, local assets, and 8 compatibility routes.')
