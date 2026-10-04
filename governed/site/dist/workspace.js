/* Authoritative core routes. Legacy demonstrations remain outside this registry. */
let workspaceSession=null, workspaceEpoch=0;
let selectedCourse=sessionStorage.getItem('scholarion-course')||'';
const workspaceRoutes={dashboard:'Learning dashboard',courses:'My courses','live-courses':'My courses',assignments:'Assignments',grades:'Gradebook','server-coursework':'Coursework',calendar:'Personal calendar',discussions:'Course discussions',help:'Support requests','workspace-session':'Workspace sign in'};
async function workspaceApi(path,data={}){
 const response=await fetch('/api/'+path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',...(governedToken?{Authorization:'Bearer '+governedToken}:{})},body:JSON.stringify({tenant:'scholarion',course:selectedCourse,...data})});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Request failed');return result;
}
courseworkApi=(action,data={})=>workspaceApi('coursework/'+action,data);
hubCall=(action,data={})=>workspaceApi('hub/'+action,{kind:location.hash.slice(1),...data});
governedApi=(action,data={})=>workspaceApi('governed/'+action,data);
curriculumRequest=(action,data={})=>workspaceApi('curriculum/'+action,data);
enterpriseCall=(action,data={})=>workspaceApi('enterprise/'+action,data);
registryCall=(action,data={})=>workspaceApi('integrations/'+action,data);
departmentCall=(action,data={})=>workspaceApi('departments/'+action,data);
oatCall=(action,data={})=>workspaceApi('acceptance/'+action,data);
runtimeCall=(action,data={})=>workspaceApi('runtime/'+action,data);
wb=(action,data={})=>workspaceApi('workbench/'+action,data);
const legacyHubLoad=hubLoad;
hubLoad=async function(){
 if(location.hash!=='#help')return legacyHubLoad();
 const d=await hubCall('list');const target=document.getElementById('hub-records');if(!target)return;
 document.getElementById('hub-status').textContent='Connected as '+d.user+' · '+d.role;
 target.innerHTML=d.records.map(r=>`<article class="callout"><h3>${esc(r.title)}</h3><p>${esc(r.owner)} · ${esc(r.state)}</p><p>${esc(r.body)}</p>${(r.replies||[]).map(reply=>`<blockquote><p>${esc(reply.body)}</p><footer>${esc(reply.author)} · ${esc(new Date(reply.created*1000).toLocaleString())}</footer></blockquote>`).join('')}${r.state==='active'?`<form data-support-reply="${esc(r.id)}" data-version="${r.version}"><label>Reply<textarea name="body" required maxlength="5000"></textarea></label><button class="button">Send reply</button></form>${d.role==='instructor'?`<button class="button secondary" data-support-action="resolve" data-id="${esc(r.id)}" data-version="${r.version}">Mark resolved</button>`:''}`:r.state==='resolved'?`<p>Resolved ${esc(new Date(r.resolution.resolved*1000).toLocaleString())}</p><button class="button secondary" data-support-action="reopen" data-id="${esc(r.id)}" data-version="${r.version}">Reopen request</button>`:'<p>Archived request</p>'}</article>`).join('')||'<p>No support requests.</p>';
};
document.addEventListener('submit',async e=>{const f=e.target;if(!f.dataset.supportReply)return;e.preventDefault();const button=f.querySelector('button');button.disabled=true;try{await hubCall('reply',{id:f.dataset.supportReply,version:Number(f.dataset.version),body:new FormData(f).get('body')});await hubLoad();}catch(error){document.getElementById('hub-status').textContent=error.message;button.disabled=false;}});
document.addEventListener('click',async e=>{const b=e.target.closest('[data-support-action]');if(!b)return;b.disabled=true;try{await hubCall(b.dataset.supportAction,{id:b.dataset.id,version:Number(b.dataset.version)});await hubLoad();}catch(error){document.getElementById('hub-status').textContent=error.message;b.disabled=false;}});
function workspaceNavigation(){
 const common=[['dashboard','Overview'],['courses','My courses'],['classroom','Live classroom'],['self-paced','Self-paced catalog'],['assignments','Assignments'],['grades','Gradebook'],['calendar','Calendar'],['discussions','Discussions'],['help','Support'],['platform-status','Platform capabilities'],['assessment','Assessment setup'],['credentials','Credential preview'],['agent-workbench','Agent workbench']];
 const instructor=[['studio-sources','Source Studio'],['assignment-packages','Assignment package studio'],['voice-studio','Voice & avatar drafts'],['curriculum-commons','Curriculum Commons'],['program-studio','Program design studio'],['curriculum-intelligence','Curriculum Intelligence'],['curriculum-review','Curriculum review'],['agent-runtime','Agent approvals'],['operational-acceptance','Release readiness'],['faculty','Faculty studio (preview)'],['integration-center','Integration Center'],['departments','Department operations'],['consolidation','Program consolidation'],['spec-audit','Specification audit'],['enterprise-controls','Enterprise controls'],['governed-agent','Governed retrieval']];
 return common.concat(workspaceSession?.role==='instructor'?instructor:[]).map(([route,label])=>`<a class="nav-item ${location.hash==='#'+route?'active':''}" href="#${route}">${esc(label)}</a>`).join('')+'<div class="nav-label">EXPLORE</div><a class="nav-item" href="#catalog">Program catalog</a><a class="nav-item" href="#pathways">Learning pathways</a><a class="nav-item" href="#workspace-session">Workspace account</a>';
}
function normalizeWorkspace(){
 const nav=document.querySelector('.sidebar nav');if(nav)nav.innerHTML=workspaceNavigation();
 const profile=document.querySelector('.profile');if(profile)profile.innerHTML=`<div><b>${esc(workspaceSession?.user||'Not connected')}</b><small>${esc(workspaceSession?.role||'Scholarion Academy')}</small></div>`;
 const bar=document.querySelector('.demo-bar');if(bar)bar.innerHTML=`<span>${workspaceRoutes[location.hash.slice(1)]?'Scholarion Academy · Workspace records saved in the server database':'Preview / pilot module · See module-specific capability limits'}</span><a href="#workspace-session">Account</a>`;
 document.title=(document.querySelector('main h1')?.textContent||'Scholarion Academy')+' · Scholarion Academy';
 if(workspaceSession){
  document.querySelectorAll('form').forEach(f=>{if(f.querySelector('input[name="token"]')){const note=document.createElement('p');note.textContent='Using your connected workspace account · '+selectedCourse;f.replaceWith(note);}});
 }
}
function workspaceFrame(route,body){
 const selector=workspaceSession?.courses.length?`<label>Active course <select id="workspace-course">${workspaceSession.courses.map(c=>`<option ${selectedCourse===c?'selected':''} value="${esc(c)}">${esc(c)}</option>`).join('')}</select></label>`:'';
 document.getElementById('app').innerHTML=integratedShell(route,heading(workspaceRoutes[route]||'Learning workspace','Scholarion Academy · Scholarion Academy')+selector+'<p id="workspace-status" role="status"></p>'+body,workspaceSession?.role==='instructor'?'faculty':'learner');bind();normalizeWorkspace();
}
function workspaceLogin(){
 return `<section class="card prose"><h2>${workspaceSession?'Connected account':'Connect your local account'}</h2>${workspaceSession?`<p>${esc(workspaceSession.user)} · ${esc(workspaceSession.role)}</p><button class="button secondary" id="workspace-signout">Sign out</button>`:'<p>Sign in using your username, password and authenticator code.</p><p><a class="button secondary" href="#workspace-session">Sign in to your account</a></p>'}</section>`;
}
async function renderWorkspace(route,epoch){
 workspaceFrame(route,'<p role="status">Loading authorized records…</p>');
 try{workspaceSession=await workspaceApi('session');}catch{workspaceSession=null;}
 if(epoch!==workspaceEpoch)return;
 if(route==='workspace-session'){workspaceFrame(route,workspaceLogin());return;}
 if(!workspaceSession){workspaceFrame(route,workspaceGuestPage(route));return;}
 if(!workspaceSession.courses.includes(selectedCourse))selectedCourse=workspaceSession.courses[0]||'';
 sessionStorage.setItem('scholarion-course',selectedCourse);
 if(!selectedCourse){workspaceFrame(route,'<section class="card prose"><p>No active course enrollments. Contact your academy administrator for access.</p></section>');return;}
 try{
  if(['dashboard','courses','live-courses'].includes(route)){
   const d=await workspaceApi('dashboard');if(epoch!==workspaceEpoch)return;
   const courseCards=d.courses.map(c=>{const assignments=d.assignments.filter(a=>a.course===c),sent=new Set(d.submissions.filter(s=>s.course===c).map(s=>s.assignment));return `<article class="card prose"><h2>${esc(c)}</h2><p>10-week course</p><p>${sent.size} of ${assignments.length} published assignments have submission receipts. This is submission activity, not competency completion.</p><button class="button" data-workspace-course="${esc(c)}">Open coursework</button></article>`;}).join('');
   const metrics=route==='dashboard'?`<section class="stats">${d.metrics.map(m=>`<article class="card prose"><h2>${esc(m.name)}</h2><strong>${m.value}</strong><p>${esc(m.calculation)}</p><a href="${m.href==='#live-courses'?'#courses':m.href}">View records</a></article>`).join('')}</section><section class="card prose"><h2>Your next step</h2><p>${d.role==='instructor'?'Review submitted work and return feedback.':'Open your course to review published work and feedback.'}</p><a class="button" href="#assignments">Open coursework</a></section>`:'';
   workspaceFrame(route,metrics+'<section class="course-grid">'+courseCards+'</section>');
  }else if(['assignments','grades','server-coursework'].includes(route)){
   workspaceFrame(route,'<button class="button secondary" id="server-refresh">Refresh records</button><p id="server-course-status" role="status"></p><div id="server-course-content"></div>');await loadServerCourse();
  }else{
   workspaceFrame(route,hubPage(route));document.getElementById('hub-connect')?.remove();await hubLoad();
  }
 }catch(error){if(epoch===workspaceEpoch){workspaceFrame(route,'<section class="card prose"><p>Unable to load records. Your saved work has not been changed.</p><button class="button" id="workspace-retry">Try again</button></section>');document.getElementById('workspace-status').textContent=error.message;}}
}
const legacyWorkspaceRender=render;
render=function(){const route=location.hash.slice(1),epoch=++workspaceEpoch;if(location.port==='4180'&&workspaceRoutes[route]){renderWorkspace(route,epoch);return;}legacyWorkspaceRender();if(location.port==='4180')normalizeWorkspace();};

document.addEventListener('change',e=>{if(e.target.id!=='workspace-course')return;selectedCourse=e.target.value;sessionStorage.setItem('scholarion-course',selectedCourse);serverRequestKey=crypto.randomUUID();render();});
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-workspace-course],#workspace-signout,#workspace-retry');if(!b)return;
 if(b.dataset.workspaceCourse){selectedCourse=b.dataset.workspaceCourse;sessionStorage.setItem('scholarion-course',selectedCourse);serverRequestKey=crypto.randomUUID();location.hash='#assignments';}
 else if(b.id==='workspace-retry')render();
 else{try{await workspaceApi('session/logout');governedToken='';workspaceSession=null;serverCourseData=null;render();}catch(error){document.getElementById('workspace-status').textContent=error.message;}}
});
render();
if(location.port==='4180'&&!workspaceRoutes[location.hash.slice(1)])workspaceApi('session').then(s=>{workspaceSession=s;if(!s.courses.includes(selectedCourse))selectedCourse=s.courses[0]||'';normalizeWorkspace();}).catch(()=>{});

function workspaceGuestPage(route){
 const descriptions={dashboard:'Your learning overview.',courses:'Your enrolled courses will appear here.','live-courses':'Your enrolled courses will appear here.',assignments:'No assignments to display.',grades:'No grades to display.','server-coursework':'No coursework to display.',calendar:'No scheduled events to display.',discussions:'No course discussions to display.',help:'Your support requests will appear here.'};
 return `<section class="card prose"><h2>${esc(workspaceRoutes[route]||'Learning workspace')}</h2><p>${esc(descriptions[route]||'No records to display.')}</p></section>`;
}
