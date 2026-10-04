"use client";
import { useEffect, useState } from "react";
import { computeKpis, dailySeries, STAGES } from "@/lib/cx-intelligence";
import { I, Pill, Card, Kpi, Empty, Head, Btn, Bars, Line, Donut, Legend, Spark, PAL, pct, when, downloadFile, toCSV, type ModuleProps, type Row, type Ctx } from "./ui";

const count = (rows: Row[], f: (r: Row) => string) => { const m: Record<string, number> = {}; rows.forEach(r => { const k = f(r); if (k) m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };

/* ================= AI Insights ================= */
export function Insights({ c }: ModuleProps) {
  const { records, events } = c.data, insights = c.kind("insight");
  const triaged = events.filter(e => e.type === "ticket.triaged");
  const intents = count(triaged, e => e.details?.intent || "");
  const gapsBy = count(triaged.filter(e => e.details?.knowledgeGap), e => e.details?.intent || "");
  const sessions = c.kind("session"), handoffIds = new Set(events.filter(e => e.type === "handoff.requested").map(e => e.sessionId));
  const handoffBy = count(sessions.filter(s => handoffIds.has(s.id)), s => s.intent || "Untriaged");
  const k = computeKpis(records, events);
  const computed = (): Row[] => [
    gapsBy[0] && { title: `${gapsBy[0][1]} ${gapsBy[0][0]} questions had no approved answer`, kind: "Knowledge gap", impact: gapsBy[0][1] >= 5 ? "High" : "Medium", recommendation: `Draft and approve an article for ${gapsBy[0][0]}.`, module: "knowledge" },
    handoffBy[0] && { title: `${handoffBy[0][0]} leads human handoffs (${handoffBy[0][1]})`, kind: "Cost", impact: "Medium", recommendation: `Review the ${handoffBy[0][0]} Autoflow so more requests resolve before handoff.`, module: "autoflows" },
    k.coverage !== null && k.coverage < 70 && { title: `Knowledge coverage is ${k.coverage}%`, kind: "Knowledge gap", impact: "High", recommendation: "Approve pending drafts and connect the registrar and help-center sources.", module: "knowledge" },
  ].filter(Boolean) as Row[];
  const analyze = async () => {
    const summary = `Intents: ${intents.map(([n, v]) => `${n} ${v}`).join(", ") || "none"}. Knowledge gaps: ${gapsBy.map(([n, v]) => `${n} ${v}`).join(", ") || "none"}. Handoffs: ${handoffBy.map(([n, v]) => `${n} ${v}`).join(", ") || "none"}. FCR ${pct(k.fcr)}, CSAT ${pct(k.csat)}, coverage ${pct(k.coverage)}.`;
    const r = await c.ai("insights", summary);
    const list: Row[] = Array.isArray(r?.json) ? r!.json : computed();
    if (!list.length) { c.toast("Not enough recorded interactions to analyze yet."); return; }
    for (const i of list.slice(0, 3)) await c.post({ action: "save", kind: "insight", data: { ...i, status: "New", source: r ? "Insights agent" : "Workspace rules" } });
    c.toast(`${Math.min(3, list.length)} recommendations added`);
  };
  return <>
    <Head title="AI-Surfaced Insights" sub="Recommendations from recorded interactions: which articles to write, which Autoflows to improve, where handoffs cost the most."><Btn kind="vio" onClick={analyze} disabled={c.busy}><I n="spark" /> Analyze now</Btn></Head>
    <div className="hx-grid g21">
      <Card title="Recommendations">{insights.map(i => <div className="hx-li top" key={i.id}><Pill t={i.impact === "High" ? "r" : i.impact === "Medium" ? "a" : "g"}>{i.impact}</Pill><div className="hx-grow"><div className="hx-row"><b>{i.title}</b><Pill>{i.kind}</Pill><small>{i.source}</small></div><p className="hx-muted small">{i.recommendation}</p><div className="hx-row"><input className="hx-inline small" defaultValue={i.owner} placeholder="Owner" aria-label="Owner" onBlur={e => e.target.value !== i.owner && c.post({ action: "save", kind: "insight", id: i.id, data: { ...i, owner: e.target.value } })} /><select value={i.status} onChange={e => c.post({ action: "save", kind: "insight", id: i.id, data: { ...i, status: e.target.value } })} aria-label="Status">{["New", "In progress", "Done", "Dismissed"].map(s => <option key={s}>{s}</option>)}</select>{i.module && <Btn kind="pri sm" onClick={async () => { await c.post({ action: "save", kind: "insight", id: i.id, data: { ...i, status: "In progress" } }); c.go(i.module); }}>Apply</Btn>}<Btn kind="ghost sm" onClick={() => c.post({ action: "delete", id: i.id })}><I n="x" s={12} /></Btn></div></div></div>)}
        {!insights.length && <Empty>No recommendations yet. Run an analysis once interactions are recorded.</Empty>}</Card>
      <div className="hx-col">
        <Card title="Contact reasons">{intents.length ? <div className="hx-row"><Donut parts={intents.map(([l, v], i) => ({ label: l, value: v, color: PAL[i % PAL.length] }))} label={triaged.length} sub="triaged" /><Legend items={intents.map(([n], i) => ({ name: n, color: PAL[i % PAL.length] }))} /></div> : <Empty>No triaged messages yet.</Empty>}</Card>
        <Card title="Where answers are missing">{gapsBy.map(([n, v]) => <div className="hx-li" key={n}><span className="hx-grow">{n}</span><b>{v}</b><Btn kind="sm" onClick={() => c.go("knowledge")}>Draft</Btn></div>)}{!gapsBy.length && <Empty>No gaps recorded.</Empty>}</Card>
      </div>
    </div>
  </>;
}

/* ================= Journey Map ================= */
const ROWS: [string, string][] = [["activity", "Customer activities"], ["thoughts", "Thoughts & questions"], ["pain", "Pain points"], ["opp", "AI opportunity"], ["touchpoints", "Touchpoints"], ["capabilities", "Capabilities"], ["kpis", "KPIs"]];
const AGENTS = ["Orchestrator", "Omnichannel Resolution", "Voice Agent", "Live Sync", "Ticket Classification", "Agent Copilot", "Insights & Knowledge Gap", "Marketing & Campaign", "Admissions & Registration", "Compliance & Guardrail", "QA & Evaluation"];
const TEMPLATE: Row = { title: "Omnichannel guest and student journey", stages: ["Awareness", "Consideration", "Acquisition", "Service", "Loyalty"],
  activity: ["Finds Oak Haven or a program online", "Compares options and prices", "Books, applies or pays", "Gets help, onboarding, support", "Returns, refers, re-enrolls"], emotion: [0, -1, 1, -1, 1],
  thoughts: ["“Is this right for me?”", "“What will it really cost?”", "“I hope checkout is easy.”", "“Will someone help me quickly?”", "“They remembered me.”"],
  pain: ["Scattered information", "Unclear fees and deadlines", "Long forms, failed uploads", "Repeating myself across channels", "Generic offers"],
  opp: ["24/7 answers on social DMs", "Transparent pricing answers from approved knowledge", "Live Sync guided forms", "Shared context across channels", "Personalized outreach triggers"],
  touchpoints: ["Search, social, website", "Ads, reviews, communities", "Checkout, application portal", "Calls, chat, email, tickets", "Loyalty offers, UGC"],
  capabilities: ["SEO/SEM, organic social", "Paid promotion, retargeting", "CRM, sales enablement", "Support enablement, personalization", "Loyalty program, community"],
  kpis: ["Traffic, social growth", "Engagement, lead quality", "Conversion, acquisition cost", "CSAT, FCR, churn", "Retention, referral rate"],
  agent: ["Marketing & Campaign", "Omnichannel Resolution", "Live Sync", "Agent Copilot", "Marketing & Campaign"] };
export function Journey({ c }: ModuleProps) {
  const journeys = c.kind("journey");
  const [id, setId] = useState(""), [j, setJ] = useState<Row>(TEMPLATE), [q, setQ] = useState(""), [dirty, setDirty] = useState(false);
  const cur = journeys.find(x => x.id === id);
  useEffect(() => { if (cur) { setJ(cur); setDirty(false); } }, [cur?.id, cur?.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = j.stages?.length || 0;
  const set = (k: string, i: number, v: unknown) => { const arr = [...(j[k] || Array(n).fill(""))]; arr[i] = v; setJ({ ...j, [k]: arr }); setDirty(true); };
  const save = async () => { const r = await c.post({ action: "save", kind: "journey", id: id || undefined, data: j }, "Journey saved"); if (r?.id) { setId(r.id); setDirty(false); } };
  const gen = async () => { if (!q.trim()) return; const r = await c.ai("journey", q); const g = r?.json; if (!g?.stages) { c.toast("Using the template. Connect an AI provider to generate journeys.", true); setJ({ ...TEMPLATE, title: q.slice(0, 80) }); setId(""); setDirty(true); return; } setJ({ ...g, capabilities: g.capabilities || Array(g.stages.length).fill(""), agent: g.stages.map((_: string, i: number) => AGENTS[[7, 1, 3, 5, 6][i] ?? 1]) }); setId(""); setDirty(true); };
  const emo = (j.emotion || []).map((e: number) => Number(e) || 0), W = 190 * n, pts = emo.map((e: number, i: number) => [i * 190 + 95, 50 - e * 18]);
  const face = (e: number) => e >= 1 ? "Delighted" : e === 0 ? "Neutral" : e === -1 ? "Uneasy" : "Frustrated";
  return <>
    <Head title="Journey Map" sub="Stages, touchpoints, feelings and the agent responsible for each opportunity. Click any cell to edit.">
      <select value={id} onChange={e => setId(e.target.value)} aria-label="Saved journeys"><option value="">New / template</option>{journeys.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select>
      <Btn onClick={() => downloadFile("journey-map.csv", toCSV([["Row", ...j.stages], ...ROWS.map(([k, l]) => [l, ...(j[k] || [])]), ["Emotion (-2..1)", ...emo], ["Agent", ...(j.agent || [])]]))}><I n="dl" /> Export CSV</Btn>
      <Btn kind="pri" onClick={save} disabled={!dirty || c.busy}>Save journey</Btn>
    </Head>
    <Card wide><div className="hx-row nowrap"><input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && gen()} placeholder="Generate a map, e.g. first-time applicant from awareness to first term" aria-label="Journey prompt" /><Btn kind="vio" onClick={gen} disabled={c.busy}><I n="spark" /> Generate</Btn></div></Card>
    <Card wide className="flush"><div className="hx-jtitle"><input className="hx-inline big" value={j.title} onChange={e => { setJ({ ...j, title: e.target.value }); setDirty(true); }} aria-label="Journey title" /></div>
      <div className="hx-tbl"><div className="hx-jm" style={{ gridTemplateColumns: `160px repeat(${n}, minmax(170px, 1fr))` }}>
        <div className="hx-stage head">Stages</div>{j.stages.map((s: string, i: number) => <div key={i} className={`hx-stage s${i}`} contentEditable suppressContentEditableWarning onBlur={e => set("stages", i, e.currentTarget.textContent || "")}>{s}</div>)}
        {ROWS.slice(0, 2).map(([k, l]) => [<div key={k} className="hx-rh">{l}</div>, ...Array.from({ length: n }, (_, i) => <div key={`${k}${i}`} className="hx-cell" contentEditable suppressContentEditableWarning onBlur={e => set(k, i, e.currentTarget.textContent || "")}>{(j[k] || [])[i]}</div>)])}
        <div className="hx-rh">Emotional state</div><div className="hx-emo" style={{ gridColumn: `span ${n}` }}><svg className="hx-chart" width={W} height={100} viewBox={`0 0 ${W} 100`}><line x1={0} x2={W} y1={50} y2={50} className="grid" /><path d={pts.map((p: number[], i: number) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ")} fill="none" className="dash" />{pts.map((p: number[], i: number) => <g key={i} onClick={() => set("emotion", i, emo[i] >= 1 ? -2 : emo[i] + 1)} style={{ cursor: "pointer" }}><circle cx={p[0]} cy={p[1]} r={11} fill={emo[i] > 0 ? "#4ade80" : emo[i] < -1 ? "#ff5f6d" : emo[i] < 0 ? "#f2b33d" : "#91a3aa"} /><text x={p[0]} y={p[1] + 26} textAnchor="middle">{face(emo[i])}</text></g>)}</svg></div>
        {ROWS.slice(2).map(([k, l]) => [<div key={k} className="hx-rh">{l}</div>, ...Array.from({ length: n }, (_, i) => <div key={`${k}${i}`} className={`hx-cell ${k}`} contentEditable suppressContentEditableWarning onBlur={e => set(k, i, e.currentTarget.textContent || "")}>{(j[k] || [])[i]}</div>)])}
        <div className="hx-rh">Assigned agent</div>{Array.from({ length: n }, (_, i) => <div key={`a${i}`} className="hx-cell"><select value={(j.agent || [])[i] || AGENTS[1]} onChange={e => set("agent", i, e.target.value)} aria-label={`Agent for ${j.stages[i]}`}>{AGENTS.map(a => <option key={a}>{a}</option>)}</select></div>)}
      </div></div></Card>
    <p className="hx-muted small">Click an emotion dot to cycle it. Save to share the map with your team.</p>
  </>;
}

/* ================= Campaigns ================= */
const TRIGGERS = ["Application incomplete for 3 days", "Course seat opened on waitlist", "Payment due in 5 days", "Stay tomorrow · pre-arrival", "Checked out · feedback request"];
export function Campaigns({ c }: ModuleProps) {
  const camps = c.kind("campaign"), admin = c.data.viewer.admin;
  const blank = { name: "", segment: "Applicants missing documents", channel: "Email", trigger: "", scheduledFor: "", copyA: "", copyB: "" };
  const [f, setF] = useState<Row | null>(null);
  const draft = async () => { if (!f) return; const r = await c.ai("campaign", `Campaign: ${f.name}. Segment: ${f.segment}. Channel: ${f.channel}. ${f.channel === "SMS" || f.channel === "WhatsApp" ? "Keep each under 160 characters." : "Keep each under 45 words."}`); const j = r?.json || { a: `Hi {first_name}, ${String(f.name || "a quick update").toLowerCase()}. Take the next step here: {link}`, b: `{first_name}, one step left: ${String(f.name || "").toLowerCase()}. Start here: {link}` }; setF({ ...f, copyA: j.a, copyB: j.b }); };
  return <>
    <Head title="Campaigns & Proactive Outreach" sub="Segment, write in brand voice, set an event trigger, and A/B test. An administrator approves before anything is sent; delivery needs a tested channel gateway.">{!f && <Btn kind="pri" onClick={() => setF(blank)}><I n="plus" /> New campaign</Btn>}</Head>
    {f && <Card wide title={f.id ? "Edit campaign" : "New campaign"}><div className="hx-grid g3"><label className="hx-f">Name<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Spring aid deadline reminder" /></label>
      <label className="hx-f">Segment<select value={f.segment} onChange={e => setF({ ...f, segment: e.target.value })}>{["Applicants missing documents", "Active students", "Waitlisted students", "Past guests (12 months)", "Upcoming arrivals", "Open support tickets"].map(o => <option key={o}>{o}</option>)}</select></label>
      <label className="hx-f">Channel<select value={f.channel} onChange={e => setF({ ...f, channel: e.target.value })}>{["Email", "SMS", "WhatsApp", "Instagram", "Messenger"].map(o => <option key={o}>{o}</option>)}</select></label>
      <label className="hx-f">Event trigger<select value={f.trigger} onChange={e => setF({ ...f, trigger: e.target.value })}><option value="">None · one-time send</option>{TRIGGERS.map(t => <option key={t}>{t}</option>)}</select></label>
      <label className="hx-f">Schedule<input type="datetime-local" value={f.scheduledFor} onChange={e => setF({ ...f, scheduledFor: e.target.value })} /></label>
      <div className="hx-f"><small>Channel status</small><b>{c.data.connections[f.channel] || "Local workspace"}</b></div></div>
      <label className="hx-f">Message A<textarea value={f.copyA} onChange={e => setF({ ...f, copyA: e.target.value })} /></label><label className="hx-f">Message B (optional A/B)<textarea value={f.copyB} onChange={e => setF({ ...f, copyB: e.target.value })} /></label>
      <div className="hx-row between"><Btn kind="vio" onClick={draft} disabled={c.busy}><I n="spark" /> Draft A/B copy</Btn><div className="hx-row"><Btn kind="ghost" onClick={() => setF(null)}>Cancel</Btn><Btn kind="pri" disabled={c.busy} onClick={async () => { if (await c.post({ action: "save", kind: "campaign", id: f.id, data: f }, "Saved as a draft")) setF(null); }}>Save draft</Btn></div></div></Card>}
    <Card wide><div className="hx-tbl"><table><thead><tr><th>Campaign</th><th>Segment</th><th>Channel</th><th>Trigger / schedule</th><th>Status</th><th /></tr></thead><tbody>{camps.map(x => <tr key={x.id}><td><b>{x.name}</b><small>A: {x.copyA}</small>{x.copyB && <small className="v">B: {x.copyB}</small>}</td><td>{x.segment}</td><td>{x.channel}</td><td><small>{x.trigger || (x.scheduledFor ? when(x.scheduledFor) : "One-time")}</small></td><td><Pill t={x.status === "Approved" ? "g" : "a"}>{x.status}</Pill>{x.delivery && <small>{x.delivery}</small>}</td>
      <td><div className="hx-row nowrap">{x.status === "Draft" && <><Btn kind="sm" onClick={() => setF(x)}>Edit</Btn><Btn kind="sm pri" disabled={!admin} title={admin ? "Approve" : "Administrators approve campaigns"} onClick={() => c.post({ action: "approve", id: x.id }, "Campaign approved")}>Approve</Btn></>}<Btn kind="ghost sm" onClick={() => c.post({ action: "delete", id: x.id }, "Campaign deleted")} disabled={x.status !== "Draft" && !admin}><I n="x" s={12} /></Btn></div></td></tr>)}</tbody></table>{!camps.length && <Empty>No campaigns yet.</Empty>}</div></Card>
    <div className="hx-grid g2"><Card title="Event triggers">{TRIGGERS.map(t => { const on = camps.find(x => x.trigger === t); return <div className="hx-li" key={t}><span className={`hx-dot ${on?.status === "Approved" ? "g" : ""}`} /><span className="hx-grow">{t}</span>{on ? <Pill t={on.status === "Approved" ? "g" : "a"}>{on.status}</Pill> : <Btn kind="sm" onClick={() => setF({ ...blank, trigger: t, name: t.split(" ")[0] + " follow-up" })}>Create</Btn>}</div>; })}</Card>
      <Card title="Results"><p className="hx-muted">Open, click and conversion rates appear here once a channel gateway reports delivery receipts. Nothing is estimated.</p><div className="hx-list">{camps.filter(x => x.status === "Approved").map(x => <div className="hx-li" key={x.id}><b className="hx-grow">{x.name}</b><small>{x.delivery}</small></div>)}</div></Card></div>
  </>;
}

/* ================= Analytics ================= */
type Metric = { n: string; types: string[]; data: (c: Ctx) => { labels: string[]; values: number[]; extra?: number[]; value?: string } };
const byDay = (c: Ctx, types: string[]) => { const s = dailySeries(c.data.events, types); return { labels: s.map(x => x.label), values: s.map(x => x.value) }; };
const METRICS: Record<string, Metric> = {
  volume: { n: "Messages vs resolved, 7 days", types: ["bar", "line"], data: c => { const a = byDay(c, ["message.received", "transcript.received"]), b = byDay(c, ["session.resolved"]); return { ...a, extra: b.values }; } },
  intent: { n: "Contact reasons", types: ["donut", "bar"], data: c => { const e = count(c.data.events.filter(x => x.type === "ticket.triaged"), x => x.details?.intent || ""); return { labels: e.map(x => x[0]), values: e.map(x => x[1]) }; } },
  channel: { n: "Sessions by channel", types: ["bar", "donut"], data: c => { const e = count(c.kind("session"), s => s.channel || "Web"); return { labels: e.map(x => x[0]), values: e.map(x => x[1]) }; } },
  priority: { n: "Priority mix", types: ["donut", "bar"], data: c => { const e = count(c.kind("session"), s => s.priority || "Normal"); return { labels: e.map(x => x[0]), values: e.map(x => x[1]) }; } },
  persona: { n: "Sessions by agent persona", types: ["bar", "donut"], data: c => { const e = count(c.kind("session"), s => s.persona || ""); return { labels: e.map(x => x[0]), values: e.map(x => x[1]) }; } },
  fcr: { n: "First contact resolution", types: ["kpi"], data: c => ({ labels: [], values: [], value: pct(computeKpis(c.data.records, c.data.events).fcr) }) },
  csat: { n: "CSAT", types: ["kpi"], data: c => ({ labels: [], values: [], value: pct(computeKpis(c.data.records, c.data.events).csat) }) },
  coverage: { n: "Knowledge coverage", types: ["kpi"], data: c => ({ labels: [], values: [], value: pct(computeKpis(c.data.records, c.data.events).coverage) }) },
  ratings: { n: "Survey ratings, 7 days", types: ["line", "bar"], data: c => byDay(c, ["feedback.recorded"]) },
  admissions: { n: "Admissions pipeline", types: ["bar", "donut"], data: c => ({ labels: STAGES, values: STAGES.map(s => c.kind("applicant").filter(a => a.stage === s).length) }) },
  grades: { n: "Grade records by status", types: ["donut", "bar"], data: c => { const e = count(c.kind("grade"), g => g.status || "Draft"); return { labels: e.map(x => x[0]), values: e.map(x => x[1]) }; } },
};
export function Analytics({ c }: ModuleProps) {
  const widgets = c.kind("widget").sort((a, b) => (a.order || 0) - (b.order || 0));
  const [q, setQ] = useState("");
  const add = async (metric: string, type?: string, title = "") => c.post({ action: "save", kind: "widget", data: { metric, type: type || METRICS[metric].types[0], title, order: Date.now() } });
  const create = async () => { if (!q.trim()) return; const r = await c.ai("widget", `Request: ${q}\nCatalog: ${Object.entries(METRICS).map(([k, m]) => `${k} (${m.n}; types ${m.types.join("/")})`).join(", ")}`); let j = r?.json; if (!j || !METRICS[j.metric]) { const t = q.toLowerCase(); const m = Object.keys(METRICS).find(k => t.includes(k)) || (/reason|why/.test(t) ? "intent" : /channel/.test(t) ? "channel" : /satisf|rating/.test(t) ? "csat" : /admission|applicant/.test(t) ? "admissions" : /grade/.test(t) ? "grades" : /persona|agent/.test(t) ? "persona" : "volume"); j = { metric: m, type: /donut|pie/.test(t) ? "donut" : /line|trend/.test(t) ? "line" : undefined, title: "" }; } const ty = METRICS[j.metric].types.includes(j.type) ? j.type : undefined; await add(j.metric, ty, j.title || ""); setQ(""); };
  const shown = widgets.length ? widgets : [{ id: "d1", metric: "fcr", type: "kpi" }, { id: "d2", metric: "csat", type: "kpi" }, { id: "d3", metric: "coverage", type: "kpi" }, { id: "d4", metric: "volume", type: "bar" }, { id: "d5", metric: "intent", type: "donut" }, { id: "d6", metric: "channel", type: "bar" }];
  const render = (w: Row) => {
    const M = METRICS[w.metric]; if (!M) return null; const d = M.data(c); let body;
    if (w.type === "kpi") body = <div className="hx-bigkpi">{d.value}</div>;
    else if (!d.values.some(v => v > 0)) body = <Empty>No data recorded yet.</Empty>;
    else if (w.type === "donut") body = <div className="hx-row center"><Donut parts={d.labels.map((l, i) => ({ label: l, value: d.values[i], color: PAL[i % PAL.length] }))} label={d.values.reduce((a, b) => a + b, 0)} sub="total" /><Legend items={d.labels.map((l, i) => ({ name: l, color: PAL[i % PAL.length] }))} /></div>;
    else if (w.type === "line") body = <Line labels={d.labels} series={[{ name: M.n, values: d.values, color: PAL[0], fill: true }, ...(d.extra ? [{ name: "Resolved", values: d.extra, color: PAL[1] }] : [])]} />;
    else body = <Bars labels={d.labels.map(l => l.length > 11 ? l.slice(0, 10) + "…" : l)} series={[{ name: M.n, values: d.values, color: PAL[2] }, ...(d.extra ? [{ name: "Resolved", values: d.extra, color: PAL[1] }] : [])]} />;
    const real = widgets.some(x => x.id === w.id);
    return <Card key={w.id} className={w.type === "kpi" ? "" : "span2"} title={w.title || M.n} actions={real ? <>{M.types.length > 1 && <Btn kind="ghost sm" title="Change chart type" onClick={() => c.post({ action: "save", kind: "widget", id: w.id, data: { ...w, type: M.types[(M.types.indexOf(w.type) + 1) % M.types.length] } })}><I n="refresh" s={12} /></Btn>}<Btn kind="ghost sm" onClick={() => c.post({ action: "delete", id: w.id })}><I n="x" s={12} /></Btn></> : undefined}>{body}</Card>;
  };
  const k = computeKpis(c.data.records, c.data.events), vol = byDay(c, ["message.received", "transcript.received"]);
  return <>
    <Head title="Analytics" sub={<>Build the dashboard you need from recorded data. <span className="hx-dim">Updated {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span></>}>
      <Btn onClick={() => downloadFile("havenconnect-analytics.csv", toCSV([["Metric", "Value"], ["Open sessions", k.open], ["Resolved", k.resolved], ["FCR %", k.fcr ?? ""], ["CSAT %", k.csat ?? ""], ["Coverage %", k.coverage ?? ""], ["Handoffs", k.handoffs], [], ["Day", "Messages"], ...vol.labels.map((l, i) => [l, vol.values[i]])]))}><I n="dl" /> Download CSV</Btn>
    </Head>
    <div className="hx-kpis four"><Kpi label="Interactions this week" value={vol.values.reduce((a, b) => a + b, 0)} note={<Spark values={vol.values} />} /><Kpi label="Resolved" value={k.resolved} tone="t" /><Kpi label="AI drafts reviewed" value={k.aiDrafts} tone="v" /><Kpi label="Human handoffs" value={k.handoffs} tone="r" /></div>
    <div className="hx-grid g3">{shown.map(render)}</div>
    <div className="hx-dock"><I n="spark" /><input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && create()} placeholder="Create a widget with AI, e.g. contact reasons as a donut" aria-label="Create a widget" /><Btn kind="vio sm" onClick={create} disabled={c.busy}>Create</Btn>
      <select value="" onChange={e => e.target.value && add(e.target.value)} aria-label="Add widget"><option value="">Add…</option>{Object.entries(METRICS).map(([key, m]) => <option key={key} value={key}>{m.n}</option>)}</select></div>
  </>;
}
