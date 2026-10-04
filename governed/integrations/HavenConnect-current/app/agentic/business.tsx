"use client";
import { useEffect, useMemo, useState } from "react";
import { computeKpis, dailySeries, redact } from "@/lib/cx-intelligence";
import { I, Pill, Card, Empty, Head, Btn, Seg, Toggle, Bars, Donut, Legend, PAL, money, pct, when, downloadFile, toCSV, type ModuleProps, type Row } from "./ui";

/* ================= Savings & ROI ================= */
const PAINS = ["Long waits at registration and check-in peaks", "Staff answer the same questions repeatedly", "Guests and students repeat themselves across channels", "After-hours inquiries go unanswered", "Manual ticket triage and misroutes", "No visibility into why people contact us", "Knowledge is out of date"];
const USE: Record<string, string> = { [PAINS[0]]: "Registration and booking Autoflows with Live Sync", [PAINS[1]]: "Omnichannel Resolution on the top intents", [PAINS[2]]: "Shared session context and channel handoff", [PAINS[3]]: "24/7 web and voice personas", [PAINS[4]]: "Ticket Classification and routing rules", [PAINS[5]]: "AI Insights and weekly review", [PAINS[6]]: "Knowledge gap detection and approval queue" };
export function Savings({ c }: ModuleProps) {
  const saved = c.kind("roi")[0] || {};
  const [r, setR] = useState<Row>({ volume: 1000, aht: 6, cost: 8, target: 20, platform: 0, impl: 0, pains: [], goal: "", ...saved });
  useEffect(() => { if (saved.version) setR((x: Row) => ({ ...x, ...saved })); }, [saved.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const sessions = c.kind("session"), events = c.data.events, handoffs = new Set(events.filter(e => e.type === "handoff.requested").map(e => e.sessionId));
  const aiResolved = sessions.filter(s => s.status === "Resolved" && !handoffs.has(s.id));
  const avoided = aiResolved.length * r.cost;
  const monthly = r.volume * r.cost * r.target / 100, yearNet = monthly * 12 - r.platform * 12 - r.impl, payback = monthly - r.platform > 0 ? r.impl / (monthly - r.platform) : null;
  const personas = [...new Set(sessions.map(s => s.persona).filter(Boolean))];
  const rows = personas.map(p => { const ss = sessions.filter(s => s.persona === p), res = ss.filter(s => s.status === "Resolved"), ok = res.filter(s => !handoffs.has(s.id)); const ratings = events.filter(e => e.type === "feedback.recorded" && ss.some(s => s.id === e.sessionId)).map(e => Number(e.details?.score)); return { p, total: ss.length, resolved: res.length, fcr: res.length ? Math.round(ok.length / res.length * 100) : null, csat: ratings.length ? Math.round(ratings.filter(n => n >= 4).length / ratings.length * 100) : null, avoided: ok.length * r.cost }; }).sort((a, b) => b.avoided - a.avoided);
  const daily = dailySeries(events.filter(e => e.type === "session.resolved" && !handoffs.has(e.sessionId)), ["session.resolved"]);
  const inp = (k: string, label: string, step = 1) => <label className="hx-f">{label}<input type="number" min={0} step={step} value={r[k]} onChange={e => setR({ ...r, [k]: Number(e.target.value) })} /></label>;
  const exportCase = () => downloadFile("havenconnect-business-case.md", `# HavenConnect Agentic AI · Business case\n\nPrepared ${new Date().toLocaleDateString("en-US", { dateStyle: "long" })}\n\n## Goal\n${r.goal || "—"}\n\n## Pain points and use cases\n${(r.pains || []).map((p: string) => `- ${p} → ${USE[p] || ""}`).join("\n") || "- none selected"}\n\n## Recorded to date\n- Sessions resolved without handoff: ${aiResolved.length}\n- Estimated avoided handling cost: ${money(avoided)} (at ${money(r.cost)} per inquiry)\n\n## Scenario (assumptions)\n| Input | Value |\n|---|---|\n| Monthly inquiries | ${r.volume} |\n| Cost per handled inquiry | ${money(r.cost)} |\n| Assumed deflection | ${r.target}% |\n| Platform cost / month | ${money(r.platform)} |\n| Implementation | ${money(r.impl)} |\n\nPotential avoided cost: ${money(monthly)} per month; first-year net ${money(yearNet)}; payback ${payback === null ? "n/a" : `${payback.toFixed(1)} months`}.\n\n_These are assumption-based estimates, not measured savings._\n`, "text/markdown");
  return <>
    <Head title="Savings & ROI" sub="What the agents have resolved so far, what it is worth at your cost per inquiry, and a scenario for the business case. Every dollar figure here is an estimate from your inputs."><Btn onClick={() => c.post({ action: "save", kind: "roi", data: r }, "Assumptions saved")}>Save assumptions</Btn><Btn kind="pri" onClick={exportCase}><I n="dl" /> Business case</Btn></Head>
    <div className="hx-savings">
      <div className="hx-saved"><small>Estimated avoided cost</small><strong>{money(avoided)}</strong><span>{aiResolved.length} resolved without handoff × {money(r.cost)}</span></div>
      <div><small>Potential per month</small><strong>{money(monthly)}</strong><span>{r.target}% of {r.volume.toLocaleString()} inquiries</span></div>
      <div><small>First-year net</small><strong className={yearNet >= 0 ? "ok" : "bad"}>{money(yearNet)}</strong><span>after platform and implementation</span></div>
      <div><small>Payback</small><strong>{payback === null ? "—" : `${payback.toFixed(1)} mo`}</strong><span>implementation ÷ monthly net</span></div>
    </div>
    <div className="hx-grid g21">
      <Card title="Resolved without handoff, 7 days"><Bars labels={daily.map(d => d.label)} series={[{ name: "Resolved without handoff", values: daily.map(d => d.value), color: "#2f6fe0" }, { name: "Estimated avoided $", values: daily.map(d => d.value * r.cost), color: "#2ad5b1" }]} /><Legend items={[{ name: "Resolved without handoff", color: "#2f6fe0" }, { name: "Estimated avoided $", color: "#2ad5b1" }]} /></Card>
      <Card title="Share by agent">{rows.length ? <div className="hx-row center"><Donut parts={rows.map((x, i) => ({ label: x.p, value: x.resolved || 0, color: PAL[i % PAL.length] }))} label={aiResolved.length} sub="resolved" /><Legend items={rows.map((x, i) => ({ name: x.p, color: PAL[i % PAL.length] }))} /></div> : <Empty>No sessions yet.</Empty>}</Card>
    </div>
    <Card wide title="Top performers"><div className="hx-tbl"><table><thead><tr><th>Agent</th><th>Sessions</th><th>Resolved</th><th>FCR</th><th>CSAT</th><th>Est. avoided</th></tr></thead><tbody>{rows.map(x => <tr key={x.p}><td><b>{x.p}</b></td><td>{x.total}</td><td>{x.resolved}</td><td>{pct(x.fcr)}</td><td>{pct(x.csat)}</td><td className="num">{money(x.avoided)}</td></tr>)}</tbody></table>{!rows.length && <Empty>No sessions recorded.</Empty>}</div></Card>
    <div className="hx-grid g2">
      <Card title="Discovery · pain points">{PAINS.map(p => <label className="hx-li check" key={p}><input type="checkbox" checked={(r.pains || []).includes(p)} onChange={e => setR({ ...r, pains: e.target.checked ? [...(r.pains || []), p] : r.pains.filter((x: string) => x !== p) })} /> {p}</label>)}<label className="hx-f">Goal<input value={r.goal} onChange={e => setR({ ...r, goal: e.target.value })} placeholder="Resolve 60% of web inquiries without a handoff" /></label>
        {(r.pains || []).length > 0 && <><h4>Prioritized use cases</h4>{r.pains.map((p: string, i: number) => <div className="hx-li" key={p}><Pill t="t">P{i + 1}</Pill><span>{USE[p]}</span></div>)}</>}</Card>
      <Card title="Scenario assumptions"><div className="hx-grid g2">{inp("volume", "Monthly inquiries")}{inp("aht", "Avg handle time (min)", .5)}{inp("cost", "Cost per handled inquiry ($)")}{inp("target", "Assumed deflection (%)")}{inp("platform", "Platform cost per month ($)")}{inp("impl", "One-time implementation ($)")}</div><p className="hx-muted small">Excludes model usage, telephony and oversight time unless you include them in the platform cost.</p></Card>
    </div>
  </>;
}

/* ================= Agent Network ================= */
const AGENTS: { n: string; c: string; memory: string; tools: string; types: string[]; actor?: RegExp }[] = [
  { n: "Omnichannel Resolution", c: "#4aa8ff", memory: "Session history, approved knowledge", tools: "Reply drafting, Autoflow plans", types: ["message.sent"] },
  { n: "Voice Agent", c: "#e04fd0", memory: "Call transcript", tools: "Speech capture, speech synthesis", types: ["transcript.received"] },
  { n: "Live Sync", c: "#a855f7", memory: "On-screen form state", tools: "Field sync, visual confirmation", types: ["livesync.field", "livesync.confirmed"] },
  { n: "Ticket Classification", c: "#f2b33d", memory: "Labels, routing rules", tools: "Intent, priority, risk tagging", types: ["ticket.triaged", "label.corrected"] },
  { n: "Agent Copilot", c: "#4ade80", memory: "Open session context", tools: "Suggestions, summaries", types: [], actor: /Copilot/ },
  { n: "Insights & Knowledge Gap", c: "#6d5ae6", memory: "Triage outcomes, gaps", tools: "Article drafts, recommendations", types: ["knowledge.saved", "knowledge.approved", "insight.saved"] },
  { n: "Marketing & Campaign", c: "#ff8a5b", memory: "Segments, brand voice", tools: "Copy drafts, triggers", types: ["campaign.saved", "campaign.approved"] },
  { n: "Admissions & Registration", c: "#12a0a6", memory: "Applicants, courses, grades", tools: "Enrollment checks, grade workflow", types: ["enrollment.created", "enrollment.blocked", "applicant.moved", "grade.finalized", "grade.approved"] },
  { n: "Compliance & Guardrail", c: "#ff5f6d", memory: "Redaction rules, access log", tools: "Redaction, access logging", types: ["context.accessed"] },
  { n: "QA & Evaluation", c: "#9fb3bb", memory: "Ratings, outcomes", tools: "Scoring, regression flags", types: ["feedback.recorded"] },
];
const STAGE_TYPES: [string, string, string[]][] = [["Perception", "input", ["message.received", "transcript.received"]], ["Memory", "memory", ["context.accessed", "session.started"]], ["Reasoning", "plan", ["ticket.triaged", "ai.generated"]], ["Decision-making", "decision", ["flow.run.planned", "handoff.requested"]], ["Execution", "execution", ["message.sent", "livesync.field", "livesync.confirmed", "channel.switched"]], ["Feedback", "learning", ["feedback.recorded", "label.corrected", "session.resolved"]]];
export function Network({ c }: ModuleProps) {
  const ev = c.data.events, paused: Record<string, boolean> = c.data.settings?.agentsPaused || {}, admin = c.data.viewer.admin;
  const [pick, setPick] = useState(AGENTS[0].n), [sid, setSid] = useState("");
  const count = (a: typeof AGENTS[number]) => ev.filter(e => a.types.includes(e.type) || (a.actor && a.actor.test(e.actor))).length;
  const toggle = (n: string) => c.post({ action: "save", kind: "settings", data: { ...c.data.settings, agentsPaused: { ...paused, [n]: !paused[n] } } }, `${n} ${paused[n] ? "resumed" : "paused"}`);
  const W = 920, H = 520, cx = 460, cy = 250;
  const pts = AGENTS.map((a, i) => { const ang = -Math.PI / 2 + i * 2 * Math.PI / AGENTS.length; return { ...a, x: cx + Math.cos(ang) * 330, y: cy + Math.sin(ang) * 200 }; });
  const sel = AGENTS.find(a => a.n === pick)!;
  const sessions = c.kind("session"), s = sessions.find(x => x.id === sid) || sessions[0];
  const sev = ev.filter(e => e.sessionId === s?.id);
  return <>
    <Head title="Agent Network" sub="One orchestrator, specialist agents, one shared context. Each agent has its own memory and tools. Pausing an agent stops its automated step for everyone." />
    <div className="hx-grid g21">
      <Card><div className="hx-tbl"><svg className="hx-chart hx-arch" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Multi-agent architecture">
        <g><rect x={20} y={cy - 26} width={110} height={52} rx={12} className="box" /><text x={75} y={cy + 4} textAnchor="middle" className="strong">Staff & users</text><line x1={130} y1={cy} x2={cx - 80} y2={cy} className="link" /></g>
        {pts.map(a => <line key={a.n} x1={cx} y1={cy} x2={a.x} y2={a.y} stroke={paused[a.n] ? "#3a4652" : a.c} strokeOpacity={.5} strokeWidth={1.5} strokeDasharray={paused[a.n] ? "4 4" : undefined} />)}
        <circle cx={cx} cy={cy} r={72} className="core" /><text x={cx} y={cy - 6} textAnchor="middle" className="strong big">Orchestrator</text><text x={cx} y={cy + 12} textAnchor="middle">shared context store</text><text x={cx} y={cy + 28} textAnchor="middle">{ev.filter(e => ["session.started", "flow.run.planned", "channel.switched"].includes(e.type)).length} plans</text>
        {pts.map(a => <g key={a.n} className="agn" onClick={() => setPick(a.n)} style={{ cursor: "pointer" }}><rect x={a.x - 82} y={a.y - 24} width={164} height={48} rx={12} className={`box${pick === a.n ? " sel" : ""}`} stroke={paused[a.n] ? "#5f727b" : a.c} strokeDasharray={paused[a.n] ? "4 3" : undefined} /><circle cx={a.x - 66} cy={a.y} r={5} fill={paused[a.n] ? "#5f727b" : a.c} /><text x={a.x - 56} y={a.y - 3} className="strong">{a.n.length > 21 ? a.n.slice(0, 20) + "…" : a.n}</text><text x={a.x - 56} y={a.y + 13}>{paused[a.n] ? "paused" : `${count(a)} actions`}</text></g>)}
      </svg></div></Card>
      <Card title={sel.n} actions={<Pill t={paused[sel.n] ? "" : "g"}>{paused[sel.n] ? "Paused" : "Running"}</Pill>}>
        <div className="hx-mt"><div className="hx-memtool mem"><I n="brain" s={22} /><div><small>Memory</small><b>{sel.memory}</b></div></div><div className="hx-memtool tool"><I n="tool" s={22} /><div><small>Tools</small><b>{sel.tools}</b></div></div></div>
        <p className="hx-muted small">{count(sel)} recorded actions.</p>
        {admin ? <Btn onClick={() => toggle(sel.n)}>{paused[sel.n] ? "Resume agent" : "Pause agent"}</Btn> : <p className="hx-muted small">Administrators can pause agents.</p>}
        <h4>Recent</h4>{ev.filter(e => sel.types.includes(e.type) || (sel.actor && sel.actor.test(e.actor))).slice(0, 6).map(e => <div className="hx-li" key={e.id}><span className="hx-dot t" /><span className="hx-grow small">{e.type}</span><small>{when(e.createdAt)}</small></div>)}
      </Card>
    </div>
    <Card wide title="Reasoning trace · how one session moved through the agent loop" actions={<select value={s?.id || ""} onChange={e => setSid(e.target.value)} aria-label="Session">{sessions.map(x => <option key={x.id} value={x.id}>{x.subject}</option>)}</select>}>
      {s ? <div className="hx-loop">{STAGE_TYPES.map(([name, edge, types], i) => { const hits = sev.filter(e => types.includes(e.type)), last = hits[0]; return <div key={name} className={`hx-stagebox${hits.length ? " hit" : ""}`}><b>{name}</b><small>{hits.length} events</small><p>{last ? (last.details?.text || last.details?.intent || last.details?.flowName || last.type) : "—"}</p>{i < STAGE_TYPES.length - 1 && <em title={edge}>→</em>}</div>; })}<div className="hx-loopback">feedback and learning return to memory and reasoning</div></div> : <Empty>No sessions yet.</Empty>}
    </Card>
  </>;
}

/* ================= Platform & Services ================= */
const SERVICES: [string, string, string][] = [["Agentic AI API", "/api/agentic-ai", "Sessions, agents, education, governance"], ["Communications", "/api/communications/status", "Voice, SMS, WhatsApp gateway readiness"], ["XConnect numbers", "/api/v1/xconnect", "Number identities and routing"], ["Tenant registry", "/api/tenant-registry", "Protected tenants and domains"], ["Connectors", "/api/integrations", "Webhooks and connector events"], ["Contacts", "/api/contacts", "Guest and staff contacts"], ["Files", "/api/files", "Object storage (R2)"]];
export function Platform({ c }: ModuleProps) {
  const [health, setHealth] = useState<Record<string, { status: number; ms: number }>>({}), [checking, setChecking] = useState(false);
  const check = async () => { setChecking(true); const out: Record<string, { status: number; ms: number }> = {}; await Promise.all(SERVICES.map(async ([, path]) => { const t = performance.now(); try { const r = await fetch(path, { cache: "no-store" }); out[path] = { status: r.status, ms: Math.round(performance.now() - t) }; } catch { out[path] = { status: 0, ms: Math.round(performance.now() - t) }; } })); setHealth(out); setChecking(false); };
  useEffect(() => { check(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const state = (p: string) => { const h = health[p]; if (!h) return ["Checking", ""]; if (h.status >= 200 && h.status < 300) return ["Healthy", "g"]; if (h.status === 401 || h.status === 403) return ["Protected", "b"]; if (h.status === 404 || h.status === 405) return ["No read endpoint", ""]; return [h.status ? `Error ${h.status}` : "Unreachable", "r"]; };
  const conn = c.data.connections, ext: [string, string][] = [["AI provider", c.data.ai?.configured ? `${c.data.ai.provider} · ${c.data.ai.model}` : "Provider credentials required"], ["Scholaris Global Learning", c.data.lms?.configured ? `Connected · ${c.data.lms.tenant}` : "Not connected"], ["Voice gateway", conn.Voice], ["Email gateway", conn.Email], ["WhatsApp", conn.WhatsApp]];
  return <>
    <Head title="Platform & Services" sub="HavenConnect runs as small services behind one staff interface. Health is checked live from this browser."><Btn onClick={check} disabled={checking}><I n="refresh" /> {checking ? "Checking…" : "Check again"}</Btn></Head>
    <Card wide title="Service map"><div className="hx-tbl"><svg className="hx-chart hx-svc" viewBox="0 0 960 330" role="img" aria-label="Service map">
      <rect x={380} y={14} width={200} height={56} rx={14} className="ui" /><text x={480} y={40} textAnchor="middle" className="strong big">HavenConnect UI</text><text x={480} y={58} textAnchor="middle">staff workspace</text>
      {SERVICES.map(([n, p], i) => { const x = 20 + i * 134, [s, t] = state(p); return <g key={p}><path d={`M480 70 C480 120 ${x + 60} 110 ${x + 60} 150`} className="dash" /><rect x={x} y={150} width={120} height={70} rx={12} className={`svc ${t}`} /><text x={x + 60} y={176} textAnchor="middle" className="strong">{n}</text><text x={x + 60} y={194} textAnchor="middle">{s}</text><text x={x + 60} y={210} textAnchor="middle">{health[p] ? `${health[p].ms} ms` : ""}</text><path d={`M${x + 60} 220 L${x + 60} 262`} className="dash" /><g transform={`translate(${x + 44} 262)`}><ellipse cx={16} cy={6} rx={16} ry={6} className="db" /><rect x={0} y={6} width={32} height={22} className="db" /><ellipse cx={16} cy={28} rx={16} ry={6} className="db" /></g></g>; })}
      <text x={480} y={322} textAnchor="middle">Shared D1 database with tenant-tagged records · R2 object storage</text>
    </svg></div></Card>
    <div className="hx-grid g3">
      <Card title="Software · SaaS"><div className="hx-list"><div className="hx-li">HavenConnect staff workspace</div><div className="hx-li">Agentic AI modules and APIs</div><div className="hx-li">Tenant: oak-haven</div></div></Card>
      <Card title="Platform · PaaS"><div className="hx-list"><div className="hx-li">Cloudflare Workers runtime (vinext)</div><div className="hx-li">Server-side secrets; nothing sensitive reaches the browser</div><div className="hx-li">Signed-in staff only (oakhavensuites.com)</div></div></Card>
      <Card title="Data & infrastructure"><div className="hx-list"><div className="hx-li">D1 SQL: cx_records, cx_events, communications, meetings</div><div className="hx-li">R2 object storage for files</div><div className="hx-li">Records visible: {c.data.records.length} · events: {c.data.events.length}</div></div></Card>
    </div>
    <Card wide title="External providers">{ext.map(([n, s]) => <div className="hx-li" key={n}><span className={`hx-dot ${/Not|Awaiting/.test(s) ? "a" : "g"}`} /><b className="hx-grow">{n}</b><span>{s}</span></div>)}</Card>
  </>;
}

/* ================= Channels & Packs ================= */
const PACKS: [string, string, string][] = [["saas", "SaaS", "Onboarding flows, release Q&A, feature questions"], ["ecom", "E-commerce", "Order status, returns, exchanges"], ["fin", "Fintech", "Financial vocabulary, compliance-friendly workflows"], ["health", "Health, wellness & fitness", "Appointments, PHI safeguards"], ["mobile", "Mobile apps", "In-app support flows"], ["edu", "Education", "Admissions, registration, Student 360, grades"], ["hosp", "Hospitality", "Bookings, check-in and out, changes"]];
export function Channels({ c }: ModuleProps) {
  const [connectors, setConnectors] = useState<Row[]>([]), admin = c.data.viewer.admin, packs = c.data.settings?.packs || {};
  useEffect(() => { fetch("/api/integrations", { cache: "no-store" }).then(r => r.json()).then(j => setConnectors(j.connectors || [])).catch(() => setConnectors([])); }, []);
  return <>
    <Head title="Channels & Packs" sub="A channel opens once its gateway passes a live test with consent and retention controls. Packs add vocabulary, templates and guardrails." />
    <div className="hx-grid g2">
      <Card title="Omnichannel connections">{Object.entries(c.data.connections).map(([ch, s]) => <div className="hx-li" key={ch}><span className={`hx-dot ${s.startsWith("Awaiting") ? "a" : "g"}`} /><b className="hx-grow">{ch}</b><span className="small">{s}</span></div>)}</Card>
      <Card title="Connectors">{connectors.map(x => <div className="hx-li top" key={x.id}><div className="hx-grow"><b>{x.name}</b><small>{(x.capabilities || []).join(" · ")}</small></div><Pill t={x.state === "Ready" ? "g" : "a"}>{x.state}</Pill></div>)}{!connectors.length && <Empty>Connector list unavailable.</Empty>}<Btn kind="sm" onClick={() => { window.location.href = "/?view=integrations"; }}>Open Connectors</Btn></Card>
    </div>
    <Card wide title="Industry packs"><div className="hx-grid g3">{PACKS.map(([k, n, d]) => <div className="hx-pack" key={k}><div className="hx-row between"><b>{n}</b><Toggle on={Boolean(packs[k])} label={`Install ${n}`} disabled={!admin} onChange={() => c.post({ action: "save", kind: "settings", data: { ...c.data.settings, packs: { ...packs, [k]: !packs[k] } } }, `${n} ${packs[k] ? "removed" : "installed"}`)} /></div><small>{d}</small>{k === "edu" && <Pill t="v">Controls the Education menu</Pill>}</div>)}</div>{!admin && <p className="hx-muted small">Administrators install packs.</p>}</Card>
  </>;
}

/* ================= Governance & Audit ================= */
export function Governance({ c }: ModuleProps) {
  const [tab, setTab] = useState("Access"), [q, setQ] = useState(""), [test, setTest] = useState("");
  const v = c.data.viewer, st = c.data.settings || {}, admin = v.admin;
  const events = c.data.events.filter(e => !q || `${e.type} ${e.actor} ${JSON.stringify(e.details)}`.toLowerCase().includes(q.toLowerCase()));
  const saveSt = (patch: Row, ok: string) => c.post({ action: "save", kind: "settings", data: { ...st, ...patch } }, ok);
  const perms: [string, boolean, string][] = [["View and edit education records", v.educationAccess, "HAVEN_CX_EDU_EMAILS or HAVEN_XCONNECT_ADMIN_EMAILS"], ["Approve knowledge, Autoflows and personas", v.educationAccess, "Same as above"], ["Approve grades", v.gradeApprover, "HAVEN_GRADE_APPROVER_EMAILS or admin list"], ["Approve campaigns, routing, packs, agent pause", admin, "HAVEN_XCONNECT_ADMIN_EMAILS"], ["Instructor of record", (v.instructorSections || []).length > 0, `Course instructor email · ${(v.instructorSections || []).join(", ") || "none"}`]];
  const kpis = useMemo(() => computeKpis(c.data.records, c.data.events), [c.data]);
  return <>
    <Head title="Governance & Audit" sub="Who can build, approve and view; what leaves HavenConnect for an AI provider; and a full record of every action." />
    <Seg value={tab} options={["Access", "AI & redaction", "Data", "Audit log", "Structure"]} onChange={setTab} /><div className="hx-gap" />
    {tab === "Access" && <Card wide title={`Signed in as ${v.email}`}><div className="hx-tbl"><table><thead><tr><th>Permission</th><th>You</th><th>Granted by</th></tr></thead><tbody>{perms.map(([n, ok, how]) => <tr key={n}><td>{n}</td><td><Pill t={ok ? "g" : ""}>{ok ? "Allowed" : "Not allowed"}</Pill></td><td><small className="mono">{how}</small></td></tr>)}</tbody></table></div><p className="hx-muted small">Access lists are hosted secrets, so they change in hosting settings rather than here. Grades need two people: one finalizes, a different approver signs off.</p></Card>}
    {tab === "AI & redaction" && <div className="hx-grid g2"><Card title="AI provider"><div className="hx-li"><b className="hx-grow">Provider</b><span>{c.data.ai?.configured ? c.data.ai.provider : "Provider credentials required"}</span></div><div className="hx-li"><b className="hx-grow">Model</b><span className="mono">{c.data.ai?.model || "—"}</span></div><div className="hx-li"><b className="hx-grow">AI drafts generated</b><span>{kpis.aiDrafts}</span></div><p className="hx-muted small">Set OPENAI_API_KEY and ANTHROPIC_API_KEY as encrypted hosted secrets. OpenAI is primary and Anthropic is the automatic fallback. Provider output, redaction, and fallback activity are recorded in the property-scoped audit trail.</p></Card>
      <Card title="Redaction before model calls">{["PII", "PCI", "PHI", "FERPA"].map(k => <div className="hx-li" key={k}><b className="hx-grow">{k}</b><Toggle on={st.redact?.[k] !== false} label={`${k} redaction`} disabled={!admin} onChange={() => saveSt({ redact: { ...st.redact, [k]: st.redact?.[k] === false } }, `${k} redaction updated`)} /></div>)}<input value={test} onChange={e => setTest(e.target.value)} placeholder="Try: card 4111 1111 1111 1111, jane@example.com" aria-label="Redaction test" /><p className="mono small">{test ? redact(test, st.redact) : ""}</p></Card></div>}
    {tab === "Data" && <Card wide title="Service levels and retention"><div className="hx-grid g3"><label className="hx-f">First-response SLA (hours)<input type="number" min={1} max={168} defaultValue={st.slaHours} disabled={!admin} onBlur={e => Number(e.target.value) !== st.slaHours && saveSt({ slaHours: Number(e.target.value) }, "SLA updated")} /></label><label className="hx-f">Transcript retention (days)<input type="number" min={30} max={3650} defaultValue={st.retentionDays} disabled={!admin} onBlur={e => Number(e.target.value) !== st.retentionDays && saveSt({ retentionDays: Number(e.target.value) }, "Retention updated")} /></label><label className="hx-f">Brand voice<input defaultValue={st.brand} disabled={!admin} onBlur={e => e.target.value !== st.brand && saveSt({ brand: e.target.value }, "Brand voice updated")} /></label></div><p className="hx-muted small">Retention is recorded as policy here; automated deletion runs once the retention job is scheduled in hosting.</p></Card>}
    {tab === "Audit log" && <Card wide actions={<><input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by action, person, record" aria-label="Filter audit log" style={{ width: 260 }} /><Btn onClick={() => downloadFile("havenconnect-audit.csv", toCSV([["Time", "Actor", "Action", "Session", "Details"], ...events.map(e => [e.createdAt, e.actor, e.type, e.sessionId, JSON.stringify(e.details)])]))}><I n="dl" /> Export CSV</Btn></>} title={`Audit log · ${events.length} events`}><div className="hx-tbl"><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Detail</th></tr></thead><tbody>{events.slice(0, 200).map(e => <tr key={e.id}><td><small className="mono">{when(e.createdAt)}</small></td><td><small>{e.actor}</small></td><td><b className="small">{e.type}</b></td><td><small>{e.details?.name || e.details?.text?.slice?.(0, 80) || e.details?.section || e.details?.course || e.details?.task || e.details?.purpose || ""}</small></td></tr>)}</tbody></table></div></Card>}
    {tab === "Structure" && <Card wide title="Governance structure"><div className="hx-tbl"><svg className="hx-chart hx-org" viewBox="0 0 760 400" role="img" aria-label="Governance structure"><defs><marker id="hxar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" className="arrow" /></marker></defs>
      {([[150, 10, 200, "Oak Haven leadership", "Haven Digital Systems", "#1d3c6e"], [410, 10, 200, "Legal & compliance", "external review", "#1d3c6e"], [260, 88, 240, "AI governance council", "models, redaction, access", "#b8323f"], [280, 164, 200, "CX steering group", "priorities and ROI", "#0f8a8f"], [280, 242, 200, "Core operations", "agents, flows, QA", "#3b4a52"], [30, 242, 200, "Knowledge & content", "articles, brand voice", "#6d3a9c"], [530, 242, 200, "Task forces", "per use case or pack", "#6d3a9c"], [280, 324, 200, "Frontline feedback", "staff, students, guests", "#a87a1d"]] as [number, number, number, string, string, string][]).map(([x, y, w, t, s, col]) => <g key={t}><rect x={x} y={y} width={w} height={48} rx={8} fill={col} /><text x={x + w / 2} y={y + 21} textAnchor="middle" className="white strong">{t}</text><text x={x + w / 2} y={y + 37} textAnchor="middle" className="white">{s}</text></g>)}
      {[[250, 58, 350, 86], [510, 58, 410, 86], [380, 162, 380, 138], [380, 240, 380, 214], [380, 322, 380, 292], [278, 266, 232, 266], [482, 266, 528, 266]].map(([a, b, x, y], i) => <line key={i} x1={a} y1={b} x2={x} y2={y} className="orgline" markerEnd="url(#hxar)" />)}</svg></div><p className="hx-muted small">Changes flow upward for approval: frontline feedback, operations, steering group, then the governance council.</p></Card>}
  </>;
}
