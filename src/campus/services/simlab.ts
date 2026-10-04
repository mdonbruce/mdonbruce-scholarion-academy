import { CampusError } from "../core";
import { scenarioByKey, SIM_SCENARIOS, type SimScenario } from "../academy/sim-scenarios";
import { fitSize, LEAD_FACULTY } from "../../brand/faculty";
import { facultyDataUri } from "../../brand/faculty-assets";

/**
 * Simulated Module labs: Module_Student_Lab.html, Module_Instructor_Lab.html and
 * Module_Simulated_Application_Demo_APP.html — self-contained, accessible HTML pages built
 * from a sandbox scenario. The agent is a transparent rule-based policy (no model call).
 */

export type SimEdition = "student" | "instructor" | "app";
export const DRAFT_LABEL = "AI DRAFT — requires SME and instructional-designer approval";

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const json = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

const CSS = String.raw`
:root{--bg:#f6f7fb;--surface:#fff;--ink:#14213d;--muted:#4a5672;--line:#d7deeb;--brand:#1b3a8a;--accent:#b45309;--ok:#166534;--okbg:#e8f5ec;--bad:#9f1239;--badbg:#fdecef;--warnbg:#fff7e6;--focus:#1d4ed8}
@media (prefers-color-scheme:dark){:root{--bg:#0d1324;--surface:#151d33;--ink:#e7ecf7;--muted:#b3bdd6;--line:#2b3656;--brand:#9db6ff;--accent:#f5b45a;--ok:#86efac;--okbg:#12301f;--bad:#fda4af;--badbg:#3a1420;--warnbg:#33270f;--focus:#93c5fd}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--brand)}:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.wrap{max-width:1180px;margin:0 auto;padding:16px}header.top{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:baseline;justify-content:space-between}
h1{font-size:1.6rem;margin:.2em 0}h2{font-size:1.2rem;margin:1.2em 0 .4em}h3{font-size:1rem;margin:.8em 0 .3em}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:12px 0}
.muted{color:var(--muted)}.tiny{font-size:.82rem}.draft{display:inline-block;border:1px solid var(--accent);color:var(--accent);border-radius:999px;padding:1px 10px;font-size:.78rem;font-weight:600}
.banner{background:var(--warnbg);border:2px solid var(--accent);border-radius:10px;padding:10px 14px;font-weight:600;margin:10px 0}
.grid{display:grid;gap:12px}@media(min-width:900px){.g2{grid-template-columns:1fr 1fr}.g3{grid-template-columns:1.1fr 1.4fr 1fr}}
table{border-collapse:collapse;width:100%;font-size:.9rem}th,td{border:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top}caption{text-align:left;font-weight:600;padding:4px 0}
button,select,input,textarea{font:inherit;color:inherit}button{background:var(--brand);color:#fff;border:0;border-radius:8px;padding:7px 12px;cursor:pointer;margin:2px}
@media(prefers-color-scheme:dark){button{color:#0d1324}}button.ghost{background:transparent;color:var(--brand);border:1px solid var(--brand)}button[disabled]{opacity:.5;cursor:not-allowed}
select,input,textarea{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:6px 8px;max-width:100%}textarea{width:100%}
label{display:inline-block;margin:2px 8px 2px 0}fieldset{border:1px solid var(--line);border-radius:8px;margin:10px 0;padding:8px 12px}legend{font-weight:600;padding:0 4px}
ol.trace{list-style:none;padding:0;margin:0;max-height:340px;overflow:auto}ol.trace li{border-left:4px solid var(--line);padding:4px 8px;margin:4px 0;background:var(--bg);border-radius:0 6px 6px 0;font-size:.9rem}
ol.trace li[data-t=call]{border-color:var(--brand)}ol.trace li[data-t=observe]{border-color:var(--ok)}ol.trace li[data-t=error],ol.trace li[data-t=guard]{border-color:var(--bad)}ol.trace li[data-t=approval]{border-color:var(--accent)}
.tag{font-weight:700;text-transform:uppercase;font-size:.72rem;letter-spacing:.06em;margin-right:6px}
.pass{color:var(--ok);background:var(--okbg);border-radius:6px;padding:1px 8px;font-weight:700}.fail{color:var(--bad);background:var(--badbg);border-radius:6px;padding:1px 8px;font-weight:700}
.reply{white-space:pre-wrap;background:var(--bg);border:1px dashed var(--line);border-radius:8px;padding:8px}
.approval{border:2px solid var(--accent);background:var(--warnbg);border-radius:10px;padding:10px;margin:8px 0}
.key{background:var(--okbg);border-radius:8px;padding:6px 10px;margin-top:6px}
body.student-view .instructor-only{display:none!important}body:not(.student-view) .student-return{display:none}
.timer{font-size:1.6rem;font-variant-numeric:tabular-nums;font-weight:700}
.kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}.kpi div{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:8px}.kpi b{display:block;font-size:1.3rem}
.sr{position:absolute;left:-9999px}
.faculty{display:flex;gap:10px;align-items:center;margin:6px 0}.faculty img{display:block;height:auto;border-radius:6px;border:1px solid var(--line)}.brandline{font-weight:700;letter-spacing:.04em;color:var(--brand)}
`;

/** The shared agent engine (plain JS, no template literals). */
const ENGINE = String.raw`
var S = window.__SCENARIO__, MODE = window.__MODE__;
function $(id){return document.getElementById(id);}
function el(tag, attrs, text){var e=document.createElement(tag);if(attrs)for(var k in attrs)e.setAttribute(k,attrs[k]);if(text!==undefined)e.textContent=text;return e;}
var idRe = new RegExp(S.idPattern, "i");
function toolByName(n){for(var i=0;i<S.tools.length;i++)if(S.tools[i].name===n)return S.tools[i];return null;}
function guardHit(text, on){if(!on)return null;var t=text.toLowerCase();for(var i=0;i<S.injectionMarkers.length;i++)if(t.indexOf(S.injectionMarkers[i])>=0)return S.injectionMarkers[i];return null;}
function pickIntent(text){var t=" "+text.toLowerCase()+" ";for(var i=0;i<S.intents.length;i++){var it=S.intents[i];for(var j=0;j<it.match.length;j++)if(t.indexOf(it.match[j])>=0)return it;}return null;}
function fieldArg(tool, text){var t=text.toLowerCase();var rows=S.data[tool.table]||{};for(var k in rows){var v=String(rows[k][tool.field]).toLowerCase();if(t.indexOf(v)>=0)return rows[k][tool.field];}return "";}
function argFor(tool, kind, text){if(kind==="id"){var m=text.match(idRe);return m?m[0].toUpperCase():"";}if(kind==="field")return fieldArg(tool,text);return text.slice(0,140);}
function exec(tool, arg, state){
  if(tool.kind==="lookup"){var rec=(S.data[tool.table]||{})[arg];if(!rec)return {ok:false,error:"not_found",detail:(arg||"(no id given)")+" was not found in "+tool.table};state.ctx.id=arg;for(var k in rec)state.ctx[k]=rec[k];return {ok:true,result:rec};}
  if(tool.kind==="search"){var rows=S.data[tool.table]||{},out=[];for(var k2 in rows){if(!arg||rows[k2][tool.field]===arg)out.push(k2+": "+summarize(rows[k2]));}state.ctx.matches=out.length?out.join("; "):"nothing matching";return {ok:true,result:out};}
  state.actions.push({tool:tool.name,arg:arg});return {ok:true,result:{done:tool.name,ref:"ACT-"+(1000+state.actions.length)}};
}
function summarize(o){var p=[];for(var k in o)p.push(k+"="+o[k]);return p.join(", ");}
function fill(tpl, ctx){return tpl.replace(/\{(\w+)\}/g,function(_,k){return ctx[k]!==undefined?String(ctx[k]):"(unknown)";});}
function newRun(text, opts){return {text:text,opts:opts,trace:[],calls:[],actions:[],ctx:{},status:"running",intent:null,plan:[],pc:0,reply:"",approvedFor:{},awaiting:null};}
function log(run,t,msg){run.trace.push({t:t,msg:msg});}
function start(run){
  var g=guardHit(run.text, run.opts.guard);
  if(g){log(run,"guard","Blocked by guardrail before any tool ran: request contains \""+g+"\". User text is treated as data, not instructions.");run.status="blocked";run.reply="I can't help with that request. A staff member can assist you directly.";return run;}
  if(run.opts.policy==="auto"){run.intent=pickIntent(run.text);if(!run.intent){log(run,"decide","No matching intent; escalating to a person.");run.status="escalated";run.reply="I've passed your message to a staff member.";return run;}log(run,"decide","Intent: "+run.intent.label+". Plan: "+run.intent.steps.map(function(s){return s.tool;}).join(" -> "));run.plan=run.intent.steps;}
  else{log(run,"decide","Manual policy: you choose each tool.");}
  return run;
}
function callTool(run, name, kind){
  if(run.status!=="running")return run;
  if(run.calls.length>=run.opts.limit){log(run,"error","Step limit ("+run.opts.limit+") reached; stopping.");run.status="limit";return run;}
  var tool=toolByName(name);if(!tool)return run;
  if(!kind){kind=tool.kind==="lookup"?"id":tool.kind==="search"?"field":(name.indexOf("draft")===0?"text":"id");}
  var arg=argFor(tool,kind,run.text);
  if(tool.risky&&!run.approvedFor[name]){run.status="awaiting_approval";run.awaiting={name:name,kind:kind,arg:arg};log(run,"approval","Paused: "+name+"("+arg+") needs human approval.");return run;}
  if(name.indexOf("draft")===0&&run.lastError){log(run,"error","Warning: replying after an unhandled error — the reply may invent facts.");run.invented=true;}
  log(run,"call",name+"("+arg+")");run.calls.push(name);
  var r=exec(tool,arg,run);
  if(!r.ok){run.lastError=r.error;log(run,"error","Observation: "+r.detail);}else{run.lastError=null;log(run,"observe","Observation: "+(Array.isArray(r.result)?(r.result.join("; ")||"no rows"):summarize(r.result)));}
  if(name.indexOf("draft")===0){var tpl=run.intent?run.intent.reply:"Reply drafted from the observations above.";run.reply=fill(tpl,run.ctx);run.status="finished";log(run,"finish","Finished with a reply.");}
  return run;
}
function stepAuto(run){
  if(run.status!=="running")return run;
  if(run.lastError==="not_found"){log(run,"finish","Stopped: the record wasn't found. Replying with a handled error instead of guessing.");run.status="not_found";run.reply="I couldn't find that "+S.idLabel.split(" (")[0]+". Please check it, or I can connect you with a staff member.";return run;}
  if(run.pc>=run.plan.length){run.status="finished";return run;}
  var s=run.plan[run.pc];var before=run.calls.length;callTool(run,s.tool,s.arg);if(run.calls.length>before)run.pc++;return run;
}
function approve(run, yes){
  if(run.status!=="awaiting_approval")return run;var a=run.awaiting;run.awaiting=null;
  if(!yes){log(run,"approval","Declined by staff: "+a.name+" did not run.");run.status="finished";run.reply="A staff member reviewed your request and will contact you with next steps.";return run;}
  log(run,"approval","Approved by staff: "+a.name+"("+a.arg+").");run.approvedFor[a.name]=true;run.status="running";return run;
}
function finishManual(run){if(run.status!=="running")return run;if(run.lastError==="not_found"){run.status="not_found";run.reply="I couldn't find that record. Please check it, or I can connect you with a staff member.";log(run,"finish","Stopped with a handled not-found.");}else{run.status="finished";log(run,"finish","Finished without a reply tool.");}return run;}
function runAuto(text, opts){var run=start(newRun(text,opts));var guard=0;while(run.status==="running"&&guard++<20){stepAuto(run);if(run.status==="awaiting_approval"&&opts.autoApprove)approve(run,true);}return run;}
function check(task, run){
  var why=[];
  if(task.expectBlocked){if(run.status!=="blocked")why.push("expected the guardrail to block");if(run.calls.length)why.push("no tools should run");return {pass:!why.length,why:why};}
  var exp=task.expectTools.join(">"),got=run.calls.join(">");
  if(exp!==got)why.push("tools called: "+(got||"none")+"; expected "+exp);
  if(task.expectApproval){var ap=false;for(var i=0;i<run.trace.length;i++){if(run.trace[i].t==="approval"&&run.trace[i].msg.indexOf("Approved")===0)ap=true;}if(!ap)why.push("an approval should be requested and granted before the risky tool");}
  if(task.expectNotFound){if(run.status!=="not_found")why.push("expected a handled not-found stop");if(run.invented)why.push("the reply invented data after an error");}
  else if(run.status!=="finished")why.push("run status is "+run.status);
  return {pass:!why.length,why:why};
}
function renderTrace(ol, run){ol.innerHTML="";run.trace.forEach(function(r,i){var li=el("li",{"data-t":r.t});li.appendChild(el("span",{"class":"tag"},r.t));li.appendChild(document.createTextNode((i+1)+". "+r.msg));ol.appendChild(li);});ol.scrollTop=ol.scrollHeight;}
window.SimEngine={start:start,newRun:newRun,callTool:callTool,stepAuto:stepAuto,approve:approve,finishManual:finishManual,runAuto:runAuto,check:check,renderTrace:renderTrace,S:S};
`;

/** Lab page script (student and instructor editions). */
const LAB_UI = String.raw`
(function(){
var E=window.SimEngine,S=E.S,run=null,results={};
var taskSel=$("task"),req=$("req"),pol=$("policy"),trace=$("trace"),reply=$("reply"),status=$("status"),toolsBox=$("manualTools"),apBox=$("approvalBox"),cp=$("checkpoint");
function opts(){return {policy:pol.value,guard:true,limit:S.stepLimit,autoApprove:false};}
function curTask(){for(var i=0;i<S.tasks.length;i++)if(S.tasks[i].id===taskSel.value)return S.tasks[i];return null;}
taskSel.addEventListener("change",function(){var t=curTask();req.value=t?t.request:"";});
function paint(){
  E.renderTrace(trace,run);reply.textContent=run.reply||"(no reply yet)";status.textContent="Status: "+run.status.replace(/_/g," ")+" · tool calls "+run.calls.length+"/"+S.stepLimit;
  apBox.hidden=run.status!=="awaiting_approval";if(!apBox.hidden)$("apText").textContent=run.awaiting.name+"("+run.awaiting.arg+") is waiting for a staff decision.";
  var manual=pol.value==="manual"&&run.status==="running";toolsBox.querySelectorAll("button").forEach(function(b){b.disabled=!manual;});
  $("stepBtn").disabled=!(pol.value==="auto"&&run.status==="running");
  var t=curTask();if(t&&run.status!=="running"&&run.status!=="awaiting_approval"){var c=E.check(t,run);results[t.id]=c.pass;cp.innerHTML="";var s=el("span",{"class":c.pass?"pass":"fail"},c.pass?"Checkpoint "+t.id+" passed":"Checkpoint "+t.id+" not yet");cp.appendChild(s);if(!c.pass)cp.appendChild(el("p",{"class":"tiny"},c.why.join("; ")));board();}else{cp.textContent="";}
}
$("runBtn").addEventListener("click",function(){run=E.start(E.newRun(req.value,opts()));if(pol.value==="auto"){while(run.status==="running"){var n=run.trace.length;E.stepAuto(run);if(run.trace.length===n)break;}}paint();});
$("stepBtn").addEventListener("click",function(){if(run){E.stepAuto(run);paint();}});
S.tools.forEach(function(tl){var b=el("button",{type:"button","class":"ghost",disabled:"disabled"},tl.name+(tl.risky?" (needs approval)":""));b.addEventListener("click",function(){E.callTool(run,tl.name);paint();});toolsBox.appendChild(b);});
var fin=el("button",{type:"button","class":"ghost",disabled:"disabled"},"Finish (handle error / stop)");fin.addEventListener("click",function(){E.finishManual(run);paint();});toolsBox.appendChild(fin);
$("apYes").addEventListener("click",function(){E.approve(run,true);if(pol.value==="auto"){while(run.status==="running"){var n=run.trace.length;E.stepAuto(run);if(run.trace.length===n)break;}}paint();});
$("apNo").addEventListener("click",function(){E.approve(run,false);paint();});
function board(){var tb=$("board");tb.innerHTML="";S.tasks.forEach(function(t){var tr=el("tr");tr.appendChild(el("td",null,t.id+" "+t.title));var td=el("td");var v=results[t.id];td.appendChild(el("span",{"class":v===undefined?"":(v?"pass":"fail")},v===undefined?"not run":(v?"passed":"not yet")));tr.appendChild(td);tb.appendChild(tr);});$("score").textContent=Object.keys(results).filter(function(k){return results[k];}).length+" of "+S.tasks.length+" checkpoints passed";}
board();taskSel.dispatchEvent(new Event("change"));
$("dlAnswers").addEventListener("click",function(){var lines=["Module worksheet — "+S.moduleTitle,"Name: "+($("wsName").value||"(not given)"),""];document.querySelectorAll("[data-ws]").forEach(function(f,i){var v="";var r=f.querySelector("input:checked");if(r)v=r.value;var ta=f.querySelector("textarea");if(ta)v=ta.value;lines.push((i+1)+". "+f.getAttribute("data-q"));lines.push("   Answer: "+(v||"(blank)"));});lines.push("","Checkpoints: "+$("score").textContent);var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([lines.join("\n")],{type:"text/plain"}));a.download="Module_Worksheet_Answers.txt";document.body.appendChild(a);a.click();a.remove();});
if(MODE==="instructor"){
  $("toStudent").addEventListener("click",function(){document.body.classList.add("student-view");$("svStatus").textContent="Student View on — answers and controls hidden.";});
  $("toInstructor").addEventListener("click",function(){document.body.classList.remove("student-view");});
  var left=0,timer=null;function show(){var m=Math.floor(left/60),s=left%60;$("clock").textContent=(m<10?"0":"")+m+":"+(s<10?"0":"")+s;}
  $("tStart").addEventListener("click",function(){if(!left)left=Math.max(1,Number($("tMin").value||20))*60;if(timer)return;timer=setInterval(function(){left--;show();if(left<=0){clearInterval(timer);timer=null;$("clockMsg").textContent="Time is up.";}},1000);});
  $("tPause").addEventListener("click",function(){clearInterval(timer);timer=null;});
  $("tReset").addEventListener("click",function(){clearInterval(timer);timer=null;left=0;$("clock").textContent="00:00";$("clockMsg").textContent="";});
  $("resetAll").addEventListener("click",function(){results={};board();run=null;trace.innerHTML="";reply.textContent="(no reply yet)";cp.textContent="";});
  $("runRef").addEventListener("click",function(){var out=$("refOut");out.innerHTML="";S.tasks.forEach(function(t){var r=E.runAuto(t.request,{policy:"auto",guard:true,limit:S.stepLimit,autoApprove:true});var c=E.check(t,r);results[t.id]=c.pass;out.appendChild(el("li",null,t.id+": "+(c.pass?"passes":"fails — "+c.why.join("; "))+" · trace: "+r.trace.map(function(x){return x.t;}).join(" > ")));});board();});
  $("hintsAll").addEventListener("click",function(){document.querySelectorAll("details.hint").forEach(function(d){d.open=!d.open;});});
}
})();
`;

/** Application demo script. */
const APP_UI = String.raw`
(function(){
var E=window.SimEngine,S=E.S,run=null,history=[],stats={runs:0,blocked:0,approvals:0,errors:0,steps:0};
var req=$("appReq"),trace=$("appTrace"),reply=$("appReply"),st=$("appStatus"),ap=$("appApproval");
S.appSamples.forEach(function(s){var b=el("button",{type:"button","class":"ghost"},s);b.addEventListener("click",function(){req.value=s;req.focus();});$("samples").appendChild(b);});
function opts(){return {policy:"auto",guard:$("guardOn").checked,limit:Number($("limit").value)||S.stepLimit,autoApprove:false};}
function drive(){while(run.status==="running"){var n=run.trace.length;E.stepAuto(run);if(run.trace.length===n)break;}paint();}
function paint(){E.renderTrace(trace,run);reply.textContent=run.reply||"…";st.textContent="Status: "+run.status.replace(/_/g," ");ap.hidden=run.status!=="awaiting_approval";if(!ap.hidden)$("appApText").textContent=run.awaiting.name+"("+run.awaiting.arg+")";if(run.status!=="running"&&run.status!=="awaiting_approval"&&!run.counted){run.counted=true;stats.runs++;stats.steps+=run.calls.length;if(run.status==="blocked")stats.blocked++;if(run.status==="not_found"||run.status==="limit")stats.errors++;history.unshift(run);kpis();log();}}
function kpis(){$("kRuns").textContent=stats.runs;$("kBlocked").textContent=stats.blocked;$("kAppr").textContent=stats.approvals;$("kErr").textContent=stats.errors;$("kSteps").textContent=stats.runs?(stats.steps/stats.runs).toFixed(1):"0";}
function log(){var ul=$("actions");ul.innerHTML="";history.forEach(function(r){r.actions.forEach(function(a){ul.appendChild(el("li",null,a.tool+"("+a.arg+")"));});});if(!ul.children.length)ul.appendChild(el("li",{"class":"muted"},"No actions yet."));}
$("appRun").addEventListener("click",function(){if(!req.value.trim())return;run=E.start(E.newRun(req.value.trim(),opts()));drive();});
$("appYes").addEventListener("click",function(){stats.approvals++;E.approve(run,true);drive();});
$("appNo").addEventListener("click",function(){E.approve(run,false);paint();});
$("evalBtn").addEventListener("click",function(){var tb=$("evalRows");tb.innerHTML="";var pass=0;S.tasks.forEach(function(t){var r=E.runAuto(t.request,{policy:"auto",guard:$("guardOn").checked,limit:Number($("limit").value)||S.stepLimit,autoApprove:true});var c=E.check(t,r);if(c.pass)pass++;var tr=el("tr");tr.appendChild(el("td",null,t.id+" "+t.title));var td=el("td");td.appendChild(el("span",{"class":c.pass?"pass":"fail"},c.pass?"pass":"fail"));tr.appendChild(td);tr.appendChild(el("td",{"class":"tiny"},c.why.join("; ")||"—"));tb.appendChild(tr);});$("evalScore").textContent="Eval pass rate: "+pass+"/"+S.tasks.length+($("guardOn").checked?"":" (guardrail OFF — compare with it on)");});
kpis();log();
})();
`;

/** The approved faculty photo (embedded original, never stretched) with name and Scholarion Academy branding. */
function facultyBlock() {
  const f = LEAD_FACULTY;
  const uri = facultyDataUri(f);
  if (!uri) return `<p class="tiny">${esc(f.name)} · ${esc(f.role)}, ${esc(f.org)}</p>`;
  const d = fitSize(f.photo, 64, 74);
  return `<figure class="faculty"><img src="${uri}" width="${d.width}" height="${d.height}" alt="${esc(f.photo.alt)}"><figcaption><strong>${esc(f.name)}</strong><br><span class="tiny">${esc(f.role)}, ${esc(f.org)}</span></figcaption></figure>`;
}

function head(title: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head>`;
}

function scenarioPublic(s: SimScenario, withAnswers: boolean) {
  const { worksheet, ...rest } = s;
  return { ...rest, worksheet: withAnswers ? worksheet : worksheet.map((w) => ({ q: w.q, kind: w.kind, choices: w.choices, lo: w.lo, bloom: w.bloom })) };
}

function toolsTable(s: SimScenario) {
  return `<table><caption>Tools the agent can call</caption><thead><tr><th scope="col">Tool</th><th scope="col">Kind</th><th scope="col">What it does</th><th scope="col">Approval</th></tr></thead><tbody>${s.tools.map((t) => `<tr><td><code>${esc(t.name)}</code></td><td>${esc(t.kind)}</td><td>${esc(t.description)}</td><td>${t.risky ? "Required" : "No"}</td></tr>`).join("")}</tbody></table>`;
}

function dataTables(s: SimScenario) {
  return Object.entries(s.data).map(([table, rows]) => {
    const cols = [...new Set(Object.values(rows).flatMap((r) => Object.keys(r)))];
    return `<table><caption>Synthetic ${esc(table)} data</caption><thead><tr><th scope="col">ID</th>${cols.map((c) => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead><tbody>${Object.entries(rows).map(([id, r]) => `<tr><th scope="row">${esc(id)}</th>${cols.map((c) => `<td>${esc(r[c])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }).join("");
}

function labPage(s: SimScenario, mode: "student" | "instructor", ctx: { program?: string; module?: string }) {
  const inst = mode === "instructor";
  const total = s.parts.reduce((n, p) => n + p.minutes, 0);
  const title = `Module ${ctx.module ?? ""} ${inst ? "Instructor" : "Student"} Lab — ${s.moduleTitle}`.replace(/\s+/g, " ");
  const ws = s.worksheet.map((w, i) => {
    const name = `ws${i}`;
    const body = w.kind === "mc"
      ? (w.choices ?? []).map((c, j) => `<label><input type="radio" name="${name}" value="${esc(c)}" id="${name}_${j}"> ${esc(c)}</label>`).join("<br>")
      : `<label for="${name}_t" class="sr">Your answer</label><textarea id="${name}_t" rows="3"></textarea>`;
    const key = inst ? `<div class="key instructor-only"><strong>Answer:</strong> ${esc(w.answer)}<br><span class="tiny">${esc(w.explanation)} · ${esc(w.lo)} · ${esc(w.bloom)}</span></div>` : "";
    return `<fieldset data-ws data-q="${esc(w.q)}"><legend>${i + 1}. ${esc(w.q)} <span class="tiny muted">(${esc(w.lo)}, ${esc(w.bloom)})</span></legend>${body}${key}</fieldset>`;
  }).join("");
  const parts = s.parts.map((p) => `<div class="card"><h3>${esc(p.title)} <span class="tiny muted">· ${p.minutes} min</span></h3><p><strong>Goal:</strong> ${esc(p.goal)}</p><ol>${p.instructions.map((x) => `<li>${esc(x)}</li>`).join("")}</ol><p><strong>Checkpoint:</strong> ${esc(p.checkpoint)}</p><details class="hint"><summary>Hint</summary><p>${esc(p.hint)}</p></details>${inst ? `<p class="instructor-only tiny"><strong>Watch for:</strong> ${esc(p.misconception)}</p>` : ""}</div>`).join("");
  const control = inst ? `
<div class="banner instructor-only" role="note">INSTRUCTOR MODE — answer keys and control panel are visible on this screen; Switch to Student View before projecting student work.</div>
<section class="card instructor-only" aria-labelledby="cp-h"><h2 id="cp-h">Instructor control panel</h2>
<div class="grid g2"><div><button type="button" id="toStudent">Switch to Student View</button> <span id="svStatus" class="tiny" aria-live="polite"></span>
<p><button type="button" id="runRef">Run reference solution on all tasks</button> <button type="button" class="ghost" id="resetAll">Reset all runs</button> <button type="button" class="ghost" id="hintsAll">Open/close all hints</button></p>
<ol id="refOut" class="tiny" aria-live="polite"></ol></div>
<div><h3>Countdown</h3><label for="tMin">Minutes</label> <input id="tMin" type="number" min="1" max="120" value="${total}" style="width:5em"> <button type="button" id="tStart">Start</button><button type="button" class="ghost" id="tPause">Pause</button><button type="button" class="ghost" id="tReset">Reset</button>
<div class="timer" id="clock" role="timer" aria-live="off">00:00</div><p id="clockMsg" aria-live="assertive"></p></div></div>
<h3>Timing and grading notes</h3><table><caption>Timing per part</caption><thead><tr><th scope="col">Part</th><th scope="col">Minutes</th><th scope="col">Common misconception</th></tr></thead><tbody>${s.parts.map((p) => `<tr><td>${esc(p.title)}</td><td>${p.minutes}</td><td>${esc(p.misconception)}</td></tr>`).join("")}</tbody></table>
<p class="tiny">Autograder spec: visible tests T1–T5 (one per checkpoint, 4 points each, 20 total); hidden tests re-run the same checks on two unseen requests per intent. Worksheet: items 1–6 auto-scored (1 point each), items 7–10 rubric-scored (0–2 points: correct reasoning, specific to this scenario).</p>
<p class="tiny">Adapting: slower groups do Parts 1–3 in Auto policy only; faster groups add a new tool and a test for it (worksheet item 10).</p></section>
<button type="button" class="ghost student-return" id="toInstructor">Return to instructor mode</button>` : "";
  return `${head(title)}<body class="${inst ? "instructor" : "student"}"><div class="wrap">
<header class="top"><div><p class="tiny"><span class="brandline">Scholarion Academy</span> · ${esc(ctx.program ?? "Scholaris AI Academy")} · ${esc(s.org)}</p><h1>${esc(title)}</h1>${facultyBlock()}</div><span class="draft">${esc(DRAFT_LABEL)}</span></header>
${control}
<section class="card" aria-labelledby="ov-h"><h2 id="ov-h">Overview</h2><p>${esc(s.orgNote)} You'll work with a <strong>${esc(s.title)}</strong>: an agent loop that decides, calls a tool, observes the result and repeats until it finishes or reaches a step limit of ${s.stepLimit}. About ${total} minutes.</p>
<h3>Learning outcomes</h3><ul>${s.outcomes.map((o) => `<li><strong>${esc(o.id)}</strong> (${esc(o.bloom)}): ${esc(o.text)}</li>`).join("")}</ul>
<p class="tiny muted">The agent in this lab is a transparent rule-based policy so every decision is visible; no AI model is called. Data is synthetic.</p></section>
<section class="card" aria-labelledby="setup-h"><h2 id="setup-h">Setup: tools and data</h2>${toolsTable(s)}<div class="grid g2">${dataTables(s)}</div></section>
<section aria-labelledby="parts-h"><h2 id="parts-h">Lab parts</h2>${parts}</section>
<section class="card" aria-labelledby="sim-h"><h2 id="sim-h">Simulator</h2>
<div class="grid g2"><div>
<label for="task">Task</label> <select id="task">${s.tasks.map((t) => `<option value="${esc(t.id)}">${esc(t.id)} — ${esc(t.title)}</option>`).join("")}<option value="custom">Custom request</option></select>
<label for="policy">Policy</label> <select id="policy"><option value="auto">Auto (rule-based agent)</option><option value="manual">Manual (you are the policy)</option></select>
<p><label for="req">Request (${esc(s.idLabel)})</label><textarea id="req" rows="3"></textarea></p>
<button type="button" id="runBtn">Run</button><button type="button" class="ghost" id="stepBtn" disabled>Next step</button>
<div id="manualTools" role="group" aria-label="Manual tool choices"></div>
<div id="approvalBox" class="approval" hidden><p><strong>Approval needed.</strong> <span id="apText"></span></p><button type="button" id="apYes">Approve as staff</button><button type="button" class="ghost" id="apNo">Decline</button></div>
<p id="status" class="tiny" aria-live="polite"></p><div id="checkpoint" aria-live="polite"></div></div>
<div><h3>Trace</h3><ol class="trace" id="trace" aria-live="polite" aria-label="Agent trace"></ol><h3>Reply</h3><div class="reply" id="reply">(no reply yet)</div></div></div>
<table><caption>Checkpoints</caption><thead><tr><th scope="col">Task</th><th scope="col">Result</th></tr></thead><tbody id="board"></tbody></table><p id="score" class="tiny" aria-live="polite"></p></section>
<section class="card" aria-labelledby="ws-h"><h2 id="ws-h">Worksheet (10 questions)</h2><p><label for="wsName">Your name</label> <input id="wsName" autocomplete="name"></p>${ws}
<button type="button" id="dlAnswers">Download my answers</button> <button type="button" class="ghost" onclick="window.print()">Print</button></section>
<section class="card" aria-labelledby="ref-h"><h2 id="ref-h">Reflection and submission</h2><ol><li>Where in your runs did an observation change the next decision?</li><li>Which tool in your own work would you put behind an approval gate, and why?</li><li>How would you know, in production, that this agent is getting worse?</li></ol>
<p><strong>Submit:</strong> a 2–3-page APA paper with screenshots of your passing checkpoints and trace, your worksheet answers, explanations and references. Upload to the course as Word or PDF by Sunday 11:59 PM.</p>
<p class="tiny">AI-use policy: allowed with disclosure for the paper; not allowed for worksheet items 1–6. Accessibility support and extended time are available through your accommodations plan.</p></section>
</div>
<script>window.__SCENARIO__=${json(scenarioPublic(s, inst))};window.__MODE__=${json(mode)};</script><script>${ENGINE}</script><script>${LAB_UI}</script></body></html>`;
}

function appPage(s: SimScenario, ctx: { program?: string; module?: string }) {
  const title = `Module ${ctx.module ?? ""} Simulated Application Demo — ${s.title}`.replace(/\s+/g, " ");
  return `${head(title)}<body><div class="wrap">
<header class="top"><div><p class="tiny"><span class="brandline">Scholarion Academy</span> · ${esc(s.org)} · class demonstration</p><h1>${esc(s.title)} <span class="tiny muted">(simulated)</span></h1>${facultyBlock()}</div><span class="draft">${esc(DRAFT_LABEL)}</span></header>
<p class="tiny muted">${esc(s.orgNote)} Decisions come from a visible rule-based policy; connect a model provider in the Cloud Lab to swap in a live model behind the same tools, gates and guardrails.</p>
<div class="grid g3">
<section class="card" aria-labelledby="in-h"><h2 id="in-h">Inbox</h2><p class="tiny">Sample messages</p><div id="samples" role="group" aria-label="Sample messages"></div>
<p><label for="appReq">Message</label><textarea id="appReq" rows="4"></textarea></p><button type="button" id="appRun">Run agent</button>
<fieldset><legend>Settings</legend><label><input type="checkbox" id="guardOn" checked> Guardrail on</label><br><label for="limit">Step limit</label> <input id="limit" type="number" min="1" max="10" value="${s.stepLimit}" style="width:4em"></fieldset></section>
<section class="card" aria-labelledby="run-h"><h2 id="run-h">Agent run</h2><p id="appStatus" class="tiny" aria-live="polite">Status: idle</p>
<div id="appApproval" class="approval" hidden role="alertdialog" aria-labelledby="apH"><p id="apH"><strong>Staff approval needed:</strong> <span id="appApText"></span></p><button type="button" id="appYes">Approve</button><button type="button" class="ghost" id="appNo">Decline</button></div>
<ol class="trace" id="appTrace" aria-live="polite" aria-label="Agent trace"></ol><h3>Reply</h3><div class="reply" id="appReply">…</div></section>
<section class="card" aria-labelledby="ops-h"><h2 id="ops-h">Operations</h2><div class="kpi"><div>Runs<b id="kRuns">0</b></div><div>Blocked<b id="kBlocked">0</b></div><div>Approvals<b id="kAppr">0</b></div><div>Handled errors<b id="kErr">0</b></div><div>Avg tool calls<b id="kSteps">0</b></div></div>
<h3>Actions taken</h3><ul id="actions" class="tiny"></ul>${toolsTable(s)}</section></div>
<section class="card" aria-labelledby="ev-h"><h2 id="ev-h">Evaluation suite</h2><p class="tiny">Runs the five lab tasks with auto-approval and checks tool order, approval gates, not-found handling and guardrail blocks.</p><button type="button" id="evalBtn">Run evaluation</button> <span id="evalScore" aria-live="polite"></span>
<table><caption>Results</caption><thead><tr><th scope="col">Task</th><th scope="col">Result</th><th scope="col">Why</th></tr></thead><tbody id="evalRows"></tbody></table></section>
<section class="card" aria-labelledby="data-h"><h2 id="data-h">Synthetic data</h2><div class="grid g2">${dataTables(s)}</div></section>
</div><script>window.__SCENARIO__=${json(scenarioPublic(s, false))};window.__MODE__="app";</script><script>${ENGINE}</script><script>${APP_UI}</script></body></html>`;
}

export function simLabHtml(key: string, edition: SimEdition, ctx: { program?: string; module?: string } = {}) {
  const s = scenarioByKey(key);
  if (!s) throw new CampusError("not_found", "Simulated lab scenario not found", 404);
  if (edition === "app") return appPage(s, ctx);
  return labPage(s, edition, ctx);
}

export function simLabFileName(key: string, edition: SimEdition, module = "") {
  const m = module ? `Module_${module.replace(/[^A-Za-z0-9]+/g, "_")}` : "Module";
  return edition === "app" ? `${m}_Simulated_Application_Demo_APP.html` : `${m}_${edition === "instructor" ? "Instructor" : "Student"}_Lab.html`;
}

export function simScenarios() {
  return SIM_SCENARIOS.map((s) => ({ key: s.key, title: s.title, org: s.org, moduleTitle: s.moduleTitle, programs: s.programs, libraryKeys: s.libraryKeys, tasks: s.tasks.length, worksheet: s.worksheet.length }));
}
