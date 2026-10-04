"use client";
import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { I, Btn, type Ctx, type Data, type ModuleProps, type Row } from "./ui";
import { CommandCenter, Sessions, VoiceSync, Classification, Alerts } from "./operate";
import { Studio, Builder, Autoflows, Knowledge } from "./build";
import { Insights, Journey, Campaigns, Analytics } from "./grow";
import { Student360, Classroom, Admissions, Faculty } from "./education";
import { Savings, Network, Platform, Channels, Governance } from "./business";
import { Portfolio, AppsRooms } from "./portfolio";
import { LearningCommunications } from "./communications";
import { deriveAlerts } from "@/lib/cx-intelligence";
import "../agentic-suite.css";

type Mod = [id: string, label: string, icon: string, C: ComponentType<ModuleProps>];
const GROUPS: [string, Mod[]][] = [
  ["Operate", [["command", "Command Center", "home", CommandCenter], ["sessions", "Live Sessions", "inbox", Sessions], ["voice", "Voice & Live Sync", "mic", VoiceSync], ["classification", "Ticket Classification", "tag", Classification], ["alerts", "Alerts", "bell", Alerts]]],
  ["Build", [["studio", "Agent Studio", "user", Studio], ["builder", "Agent Builder", "wand", Builder], ["autoflows", "Autoflows", "flow", Autoflows], ["knowledge", "Knowledge", "book", Knowledge]]],
  ["Grow", [["insights", "AI Insights", "bulb", Insights], ["journey", "Journey Map", "route", Journey], ["campaigns", "Campaigns", "mega", Campaigns], ["analytics", "Analytics", "chart", Analytics]]],
  ["Education", [["student", "Student 360", "grad", Student360], ["classroom", "Classroom", "board", Classroom], ["communications", "Learning Communications", "phone", LearningCommunications], ["admissions", "Admissions & Registration", "clip", Admissions], ["faculty", "Faculty Directory", "id", Faculty]]],
  ["Business", [["savings", "Savings & ROI", "dollar", Savings], ["network", "Agent Network", "net", Network], ["platform", "Platform & Services", "cloud", Platform], ["channels", "Channels & Packs", "plug", Channels], ["governance", "Governance & Audit", "shield", Governance]]],
];
const ALL = GROUPS.flatMap(([, m]) => m);
const PLATFORM_MODS: [string, string, string][] = [["portfolio", "Haven Portfolio", "chart"], ["rooms", "Apps & Rooms", "cloud"]];

export function AgenticAI() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [route, setRoute] = useState("portfolio");
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; msg: string; err?: boolean }[]>([]);
  const [student, setStudentState] = useState("");
  const [session, setSession] = useState("");
  const [glass, setGlass] = useState(false);
  const [ask, setAsk] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [app, setApp] = useState("");
  const [apps, setApps] = useState<Row[]>([]);
  const [platformAdmin, setPlatformAdmin] = useState(false);

  const toast = useCallback((msg: string, err = false) => { const id = Date.now() + Math.random(); setToasts(t => [...t, { id, msg, err }]); setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4200); }, []);
  const refresh = useCallback(async () => {
    if (!app) return;
    try {
      const r = await fetch(`/api/agentic-ai?app=${encodeURIComponent(app)}`, { cache: "no-store" }); const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not load the workspace");
      setData(j); setError("");
    } catch (e: any) { setData(null); setError(e.message); }
  }, [app]);
  const reloadApps = useCallback(async () => { try { const r = await fetch("/api/agentic-ai?scope=apps", { cache: "no-store" }); const j = await r.json(); if (r.ok) { setApps(j.apps || []); setPlatformAdmin(Boolean(j.platformAdmin)); } } catch { /* keep list */ } }, []);
  useEffect(() => {
    setMounted(true); reloadApps();
    let saved = "oak-haven";
    try { const s = localStorage.getItem("hx-control-plane-route"); if (s && (ALL.some(m => m[0] === s) || PLATFORM_MODS.some(m => m[0] === s))) setRoute(s); setGlass(localStorage.getItem("hx-glass") === "1"); saved = localStorage.getItem("hx-app") || saved; } catch { /* storage unavailable */ }
    setApp(saved);
  }, [reloadApps]);
  useEffect(() => { const open = apps.filter(a => a.canEnter !== false); if (open.length && app && !open.some(a => a.slug === app)) { const next = open[0].slug; setApp(next); try { localStorage.setItem("hx-app", next); } catch { /* ignore */ } } }, [apps, app]);
  useEffect(() => { refresh(); const t = window.setInterval(() => { if (!document.hidden) refresh(); }, 8000); return () => window.clearInterval(t); }, [refresh]);
  const switchApp = useCallback((slug: string) => { setApp(slug); setData(null); setError(""); setStudentState(""); setSession(""); try { localStorage.setItem("hx-app", slug); } catch { /* ignore */ } setRoute(r => PLATFORM_MODS.some(m => m[0] === r) ? "command" : r); }, []);
  const post = useCallback(async (body: Row, success?: string) => {
    setBusy(true);
    try {
      const r = await fetch("/api/agentic-ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, app }) }); const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Action failed");
      if (success || j.result) toast(j.result || success);
      await refresh(); return j as Row;
    } catch (e: any) { toast(e.message, true); return null; } finally { setBusy(false); }
  }, [refresh, toast, app]);
  const ai = useCallback(async (task: string, input: unknown, extra: Row = {}) => {
    if (!data?.ai?.configured) { toast("No AI provider is configured yet. Using built-in rules instead.", true); return null; }
    setBusy(true);
    try {
      const r = await fetch("/api/agentic-ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "ai", task, input, app, ...extra }) }); const j = await r.json();
      if (!r.ok) throw new Error(j.error || "AI request failed");
      if (j.reviewRequired) toast("This room requires staff review of every AI draft before it is used.");
      return j as { text: string; json?: any };
    } catch (e: any) { toast(e.message, true); return null; } finally { setBusy(false); }
  }, [data?.ai?.configured, toast, app]);
  const go = useCallback((m: string) => { setRoute(m); setNavOpen(false); try { localStorage.setItem("hx-control-plane-route", m); } catch { /* ignore */ } }, []);
  const setStudent = useCallback(async (id: string) => { setStudentState(id); if (id) await fetch("/api/agentic-ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "context.access", contextId: id, purpose: "Student 360 review", app }) }).catch(() => null); }, [app]);
  const kind = useCallback((k: string) => (data?.records || []).filter(r => r.kind === k), [data]);

  const eduVisible = Boolean(data && data.app?.education !== false && data.settings?.packs?.edu !== false && (data.viewer.educationAccess || data.viewer.instructorSections?.length));
  const groups = GROUPS.filter(([g]) => g !== "Education" || eduVisible);
  const platformRoute = PLATFORM_MODS.find(m => m[0] === route);
  const current = (groups.flatMap(([, m]) => m).find(m => m[0] === route) || ALL[0]);
  const appsProps = { apps, platformAdmin, current: app, switchApp, reload: async () => { await reloadApps(); await refresh(); }, toast };
  const switcher = <label className="hx-appsel" title="Switch product room"><span className="hx-dot" style={{ background: apps.find(a => a.slug === app)?.color || "#91a3aa" }} /><select value={app} onChange={e => switchApp(e.target.value)} aria-label="Product room">{apps.filter(a => a.canEnter !== false).map(a => <option key={a.slug} value={a.slug}>{a.name}</option>)}{!apps.length && <option value={app}>{app}</option>}</select></label>;
  const alertCount = useMemo(() => { if (!data) return 0; const states = new Map(data.records.filter(r => r.kind === "alert").map(r => [r.key, r.status])); return deriveAlerts(data.records, data.events, Date.now(), data.settings?.slaHours || 4).filter(a => (states.get(a.key) || "Active") === "Active").length; }, [data]);
  const sample = useMemo(() => (data?.records || []).some(r => r.sample), [data]);

  if (!data) return <section className={`hx${glass ? " glass" : ""}`}><div className="hx-main wide"><div className="hx-top">{switcher}<span className="hx-sp" /><Btn kind="ghost" onClick={() => go("portfolio")}><I n="chart" /> Portfolio</Btn><Btn kind="ghost" onClick={() => go("rooms")}><I n="cloud" /> Apps & Rooms</Btn></div>
    <div className="hx-view">{error ? <div className="hx-note r"><I n="shield" />{error}<Btn kind="sm" onClick={refresh}>Retry</Btn></div> : <div className="hx-loading"><I n="shield" s={20} />Loading {apps.find(a => a.slug === app)?.name || "workspace"}…</div>}
      {route === "portfolio" ? <Portfolio {...appsProps} /> : route === "rooms" || error ? <AppsRooms {...appsProps} /> : null}</div></div>
    <div className="hx-toasts" aria-live="polite">{toasts.map(t => <div key={t.id} className={`hx-toast${t.err ? " err" : ""}`}>{t.msg}</div>)}</div></section>;
  const c: Ctx = { data, kind, post, ai, go, toast, busy, student, setStudent, session, setSession };
  const students = data.records.filter(r => r.kind === "context" && r.type === "Student");
  const slot = mounted ? document.getElementById("agentic-header-slot") : null;
  const Current = current[3];
  return <section className={`hx${glass ? " glass" : ""}`} aria-label="HavenConnect Agentic AI workspace">
    {slot && eduVisible && createPortal(<label className="hx-header-select">Student <select value={student} onChange={e => { setStudent(e.target.value); go("student"); }}><option value="">Select a student…</option>{students.map(s => <option key={s.id} value={s.id}>{s.name} · {s.reference}</option>)}</select></label>, slot)}
    <aside className={`hx-nav${navOpen ? " open" : ""}`} aria-label="Agentic AI modules">
      <div className="hx-brand"><span className="hx-logo" /><div><b>Agentic AI</b><small>{data.viewer.email}</small></div></div>
      <div className="hx-eyebrow">Haven Digital Systems</div>{PLATFORM_MODS.map(([id, label, icon]) => <button key={id} className={route === id ? "on" : ""} onClick={() => go(id)}><I n={icon} s={16} /><span>{label}</span></button>)}
      <div className="hx-roomlabel"><span className="hx-dot" style={{ background: data.app?.color }} /><b>{data.app?.name}</b><small>{data.app?.category}</small></div>
      {groups.map(([g, mods]) => <div key={g}><div className="hx-eyebrow">{g}</div>{mods.map(([id, label, icon]) => <button key={id} className={!platformRoute && current[0] === id ? "on" : ""} onClick={() => go(id)}><I n={icon} s={16} /><span>{label}</span>{id === "alerts" && alertCount > 0 && <em>{alertCount}</em>}</button>)}</div>)}
      <div className="hx-navfoot">
        <div><span>AI engine</span><b className={data.ai?.configured ? "ok" : "warn"} title={data.ai?.configured ? "Authenticated provider connection verified" : "Add an encrypted OPENAI_API_KEY or ANTHROPIC_API_KEY hosted secret"}>{data.ai?.configured ? `${data.ai.provider} · ${data.ai.model}` : "Provider credentials required"}</b></div>
        {data.app?.education && <div><span>Scholaris Global Learning</span><b className={data.lms?.configured ? "ok" : "warn"}>{data.lms?.configured ? "Connected" : "Not connected"}</b></div>}
      </div>
    </aside>
    <div className="hx-main">
      <div className="hx-top">
        <button className="hx-btn ghost hx-menu" onClick={() => setNavOpen(o => !o)} aria-label="Modules"><I n="flow" /> Modules</button>
        {switcher}<span className="hx-crumb">{platformRoute ? "Haven Digital Systems" : groups.find(([, m]) => m.includes(current))?.[0]} / <b>{platformRoute ? platformRoute[1] : current[1]}</b></span>
        <span className="hx-sp" />
        <button className="hx-btn ghost" onClick={() => { setGlass(g => { try { localStorage.setItem("hx-glass", g ? "0" : "1"); } catch { /* ignore */ } return !g; }); }} aria-label="Switch theme"><I n={glass ? "moon" : "sun"} /> {glass ? "Dark" : "Glass"}</button>
        <Btn kind="vio" onClick={() => setAsk(true)}><I n="spark" /> Ask HavenConnect</Btn>
      </div>
      {error && <div className="hx-alert" role="alert"><I n="bell" />{error}<button onClick={() => setError("")}>Dismiss</button></div>}
      {data.pack && (data.pack.reviewRequired || data.app?.pack !== "standard") && !platformRoute && <div className={`hx-guard${data.pack.reviewRequired ? " strict" : ""}`}><I n="shield" s={14} /><b>{data.pack.label} guardrails</b> {data.pack.note}</div>}
      {sample && <div className="hx-sample"><b>Sample data is loaded.</b> Records marked Sample are for staging practice, not real people. {data.viewer.educationAccess && <Btn kind="sm" onClick={() => post({ action: "sample.clear" }, "Sample data removed")}>Remove sample data</Btn>}</div>}
      <div className="hx-view">{route === "portfolio" ? <Portfolio {...appsProps} /> : route === "rooms" ? <AppsRooms {...appsProps} /> : <Current c={c} />}</div>
    </div>
    {ask && <Orchestrator c={c} close={() => setAsk(false)} modules={ALL.map(m => m[0])} />}
    <div className="hx-toasts" aria-live="polite">{toasts.map(t => <div key={t.id} className={`hx-toast${t.err ? " err" : ""}`}>{t.msg}</div>)}</div>
  </section>;
}

function Orchestrator({ c, close, modules }: { c: Ctx; close: () => void; modules: string[] }) {
  const [turns, setTurns] = useState<{ role: string; text: string; action?: Row | null }[]>([]);
  const [q, setQ] = useState("");
  const { data } = c;
  const brief = () => {
    const sessions = data.records.filter(r => r.kind === "session");
    return `Open sessions: ${sessions.filter(s => s.status === "Open").map(s => `${s.subject} [${s.id}] (${s.intent || "untriaged"}, ${s.priority || "Normal"})`).slice(0, 12).join("; ") || "none"}.
Students visible: ${data.records.filter(r => r.kind === "context" && r.type === "Student").map(s => `${s.name} [${s.id}] sections ${(s.sections || []).join("/") || "none"}`).join("; ") || "none"}.
Courses: ${data.records.filter(r => r.kind === "course").map(x => `${x.code} ${x.enrolled}/${x.cap} prereq ${x.prereq || "none"}`).join("; ") || "none"}.
Draft approvals: ${data.records.filter(r => ["knowledge", "flow", "campaign"].includes(r.kind) && r.status === "Draft").length}. Modules: ${modules.join(", ")}.`;
  };
  const local = (text: string): { answer: string; action: Row | null } => {
    const t = text.toLowerCase(), mod = modules.find(m => t.includes(m));
    if (mod) return { answer: `I can open ${mod} for you.`, action: { type: "open_module", label: `Open ${mod}`, args: { module: mod } } };
    const open = data.records.filter(r => r.kind === "session" && r.status === "Open");
    return { answer: `${open.length} open sessions, ${data.records.filter(r => ["knowledge", "flow", "campaign"].includes(r.kind) && r.status === "Draft").length} drafts awaiting approval. Connect an AI provider for full answers.`, action: null };
  };
  const send = async (text = q) => {
    if (!text.trim()) return; setQ(""); const next = [...turns, { role: "user", text }]; setTurns(next);
    const r = await c.ai("orchestrator", `${brief()}\n\nConversation:\n${next.slice(-6).map(t => `${t.role === "user" ? "Staff" : "Orchestrator"}: ${t.text}`).join("\n")}`);
    const j = r?.json && typeof r.json === "object" ? r.json : local(text);
    setTurns([...next, { role: "ai", text: String(j.answer || r?.text || ""), action: j.action || null }]);
  };
  const run = async (a: Row) => {
    const args = a.args || {};
    if (a.type === "open_module" && modules.includes(args.module)) { c.go(args.module); close(); return; }
    if (a.type === "enroll") await c.post({ action: "enroll", contextId: args.contextId, course: args.course });
    if (a.type === "resolve_session") await c.post({ action: "event", sessionId: args.sessionId, type: "session.resolved" }, "Session resolved");
    if (a.type === "draft_campaign") await c.post({ action: "save", kind: "campaign", data: { name: args.name, segment: args.segment, channel: ({ email: "Email", sms: "SMS", whatsapp: "WhatsApp" } as Row)[String(args.channel).toLowerCase()] || "Email", copyA: args.message } }, "Campaign draft created for review");
    setTurns(t => t.map(x => x.action === a ? { ...x, action: { ...a, done: true } } : x));
  };
  return <><div className="hx-scrim" onClick={close} /><aside className="hx-drawer" role="dialog" aria-modal="true" aria-label="Ask HavenConnect">
    <div className="hx-dh"><I n="spark" /><h3>Ask HavenConnect</h3><button className="hx-btn ghost" onClick={close} aria-label="Close"><I n="x" /></button></div>
    <div className="hx-db">{turns.length ? turns.map((t, i) => <div key={i} className={`hx-bub ${t.role === "user" ? "me" : "ai"}`}>{t.text}{t.action && <div className="hx-proposal"><small>Proposed action</small><b>{t.action.label || t.action.type}</b>{t.action.done ? <span className="hx-pill g">Done</span> : <Btn kind="pri sm" onClick={() => run(t.action as Row)}>Approve</Btn>}</div>}</div>) :
      <><p className="hx-muted">Ask the Orchestrator about your operation or tell it what to do. It proposes one action at a time and waits for your approval.</p>{["What needs my attention today?", "Open the alerts", "Enroll a student in CTS2314-01", "Draft an email campaign for applicants missing documents"].map(s => <button key={s} className="hx-btn" onClick={() => send(s)}>{s}</button>)}</>}</div>
    <div className="hx-df"><input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") send(); }} placeholder="Ask or instruct…" aria-label="Message the Orchestrator" /><Btn kind="pri" onClick={() => send()} disabled={c.busy}><I n="send" /></Btn></div>
  </aside></>;
}
