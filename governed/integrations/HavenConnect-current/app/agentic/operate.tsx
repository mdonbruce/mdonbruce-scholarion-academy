"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { computeKpis, dailySeries, deriveAlerts, classifyWith, classifierAccuracy, retrieveGuidance, INTENTS } from "@/lib/cx-intelligence";
import { I, Av, Pill, Card, Kpi, Empty, Head, Btn, Seg, Bars, Donut, Legend, PAL, ago, when, pct, downloadFile, toCSV, type ModuleProps, type Row, type Ctx } from "./ui";

export const PERSONAS = ["Amara", "Alex", "Kyle"];
const CHANNELS = ["Web", "Mobile", "Voice", "Email", "SMS", "WhatsApp", "Instagram", "Messenger", "X", "Facebook"];
export const personaNames = (c: Ctx) => [...new Set([...PERSONAS, ...c.kind("persona").map(p => p.name)])];
const intentTone = (i?: string) => i?.startsWith("Admissions") ? "v" : i?.startsWith("Billing") ? "a" : i?.startsWith("Technical") ? "b" : "";
export const statusPill = (s: Row) => s.status === "Resolved" ? <Pill t="g">Resolved</Pill> : s.handoff ? <Pill t="r">Handoff</Pill> : <Pill t="t">Open</Pill>;

/* ================= Command Center ================= */
export function CommandCenter({ c }: ModuleProps) {
  const { records, events } = c.data;
  const k = computeKpis(records, events);
  const [subject, setSubject] = useState(""), [persona, setPersona] = useState("Amara");
  const sessions = c.kind("session");
  const msgs = dailySeries(events, ["message.received", "transcript.received"]), res = dailySeries(events, ["session.resolved"]);
  const byIntent = useMemo(() => { const m: Record<string, number> = {}; sessions.filter(s => s.status === "Open").forEach(s => m[s.intent || "Untriaged"] = (m[s.intent || "Untriaged"] || 0) + 1); return Object.entries(m).sort((a, b) => b[1] - a[1]); }, [sessions]);
  const alerts = deriveAlerts(records, events, Date.now(), c.data.settings?.slaHours || 4);
  const pending = records.filter(r => ["knowledge", "flow", "campaign", "persona"].includes(r.kind) && r.status === "Draft").length + records.filter(r => r.kind === "grade" && r.status === "Pending approval").length;
  const start = async () => { const r = await c.post({ action: "save", kind: "session", data: { persona, channel: "Web", subject } }, "Session started"); if (r?.id) { c.setSession(r.id); setSubject(""); c.go("sessions"); } };
  return <>
    <Head title="Command Center" sub="Every recorded interaction across agents and channels. Figures come from this workspace's sessions and events; a dash means there isn't enough data yet." />
    <div className="hx-kpis">
      <Kpi label="Open sessions" value={k.open} note={`${k.resolved} resolved`} />
      <Kpi label="First contact resolution" value={pct(k.fcr)} note="Resolved without handoff" tone="t" />
      <Kpi label="CSAT" value={pct(k.csat)} note={`${k.ratings} ratings`} tone="v" />
      <Kpi label="Avg first response" value={k.firstResponseMin === null ? "—" : `${k.firstResponseMin} min`} note="Message to first reply" />
      <Kpi label="Knowledge coverage" value={pct(k.coverage)} note={`${k.gaps} gaps flagged`} tone="b" />
      <Kpi label="Live Sync confirmations" value={k.liveSync} note="On-screen confirmations" />
      <Kpi label="Human handoffs" value={k.handoffs} note="Context passed to staff" tone="r" />
      <Kpi label="Awaiting approval" value={pending} note="Drafts, campaigns, grades" tone="a" />
    </div>
    <div className="hx-grid g21">
      <Card title="Interactions, last 7 days" actions={<Legend items={[{ name: "Messages received", color: PAL[0] }, { name: "Sessions resolved", color: PAL[1] }]} />}>
        <Bars labels={msgs.map(m => m.label)} series={[{ name: "Messages received", values: msgs.map(m => m.value), color: PAL[0] }, { name: "Sessions resolved", values: res.map(m => m.value), color: PAL[1] }]} />
      </Card>
      <Card title="Open by intent">{byIntent.length ? <div className="hx-list">{byIntent.map(([n, v]) => <div className="hx-li" key={n}><Pill t={intentTone(n)}>{n}</Pill><span className="hx-sp" /><div className="hx-bar" style={{ width: 90 }}><i style={{ width: `${v / byIntent[0][1] * 100}%` }} /></div><b>{v}</b></div>)}</div> : <Empty>No open sessions.</Empty>}</Card>
    </div>
    <div className="hx-grid g3">
      <Card title="Start an inquiry"><p className="hx-muted">Web sessions start here. Other channels open once their gateway passes a live test.</p>
        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="What does the person need?" aria-label="Inquiry subject" />
        <div className="hx-chips">{personaNames(c).map(p => <button key={p} className={persona === p ? "on" : ""} onClick={() => setPersona(p)}>{p}</button>)}</div>
        <Btn kind="pri" onClick={start} disabled={c.busy}><I n="plus" /> Start session</Btn></Card>
      <Card title={<><span className="hx-dot live" /> Live sessions</>} actions={<Btn kind="ghost sm" onClick={() => c.go("sessions")}>View all</Btn>}>
        {sessions.filter(s => s.status === "Open").slice(0, 6).map(s => <div className="hx-li" key={s.id}><Av name={s.persona || "?"} /><div className="hx-grow"><b>{s.subject}</b><small>{s.persona} · {s.channel} · {ago(s.startedAt)}</small></div>{statusPill(s)}<Btn kind="sm" onClick={() => { c.setSession(s.id); c.go("sessions"); }}>Open</Btn></div>)}
        {!sessions.some(s => s.status === "Open") && <Empty>Nothing open.</Empty>}</Card>
      <Card title="Needs attention" actions={<Btn kind="ghost sm" onClick={() => c.go("alerts")}>Alerts</Btn>}>
        {alerts.slice(0, 5).map(a => <div className="hx-li" key={a.key}><Pill t={a.severity === "Critical" ? "r" : a.severity === "Major" ? "a" : a.severity === "Minor" ? "b" : ""}>{a.severity}</Pill><div className="hx-grow"><b>{a.issue}</b><small>{a.title}</small></div></div>)}
        {!alerts.length && <Empty>No alerts.</Empty>}</Card>
    </div>
    <Card title="Agent activity" wide>{events.slice(0, 10).map(e => <div className="hx-li" key={e.id}><span className="hx-dot t" /><div className="hx-grow"><b>{e.type}</b><small>{e.actor}</small></div><small>{ago(e.createdAt)}</small></div>)}{!events.length && <Empty>No recorded activity yet.</Empty>}</Card>
  </>;
}

/* ================= Live Sessions + Copilot ================= */
export function Sessions({ c }: ModuleProps) {
  const { events } = c.data;
  const [filter, setFilter] = useState("Open"), [msg, setMsg] = useState(""), [reply, setReply] = useState(""), [sync, setSync] = useState(""), [flowId, setFlowId] = useState(""), [summary, setSummary] = useState(""), [subject, setSubject] = useState(""), [listening, setListening] = useState(false);
  const sessions = c.kind("session").filter(s => filter === "All" || s.status === filter);
  const sel = c.kind("session").find(s => s.id === c.session) || sessions[0];
  const timeline = events.filter(e => e.sessionId === sel?.id).slice().reverse();
  const triage = [...timeline].reverse().find(e => e.type === "ticket.triaged")?.details;
  const flows = c.kind("flow").filter(f => f.status === "Approved");
  const lastCustomer = [...timeline].reverse().find(e => e.type === "message.received" || e.type === "transcript.received")?.details?.text || "";
  const guidance = useMemo(() => lastCustomer ? retrieveGuidance(lastCustomer, c.kind("knowledge") as any) : [], [lastCustomer, c]);
  const rated = timeline.some(e => e.type === "feedback.recorded");
  const send = (type: string, extra: Row = {}, ok?: string) => sel && c.post({ action: "event", sessionId: sel.id, type, ...extra }, ok);
  const capture = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { c.toast("Speech capture isn't available in this browser. Type the message instead.", true); return; }
    const r = new SR(); r.lang = "en-US"; r.interimResults = false; setListening(true);
    r.onresult = (e: any) => setMsg(e.results[0][0].transcript); r.onerror = () => c.toast("Microphone capture stopped. Type the message instead.", true); r.onend = () => setListening(false); r.start();
  };
  const draft = async () => { const r = await c.ai("reply", reply, { sessionId: sel?.id }); setReply(r?.text || (guidance[0] ? `${guidance[0].excerpt}\n\nWould you like me to take care of that for you?` : "Thanks for reaching out. Could you tell me a little more so I can resolve this in one go?")); };
  const summarize = async () => { const text = timeline.map(e => `${e.type}: ${e.details?.text || e.details?.step || e.details?.intent || ""}`).join("\n"); const r = await c.ai("summary", text, { sessionId: sel?.id }); setSummary(r?.text || `Issue: ${sel?.subject}\nIntent: ${triage?.intent || "—"} · ${triage?.priority || "Normal"} priority\nLatest: ${lastCustomer || "—"}\nNext step: ${triage?.needsHuman ? "Staff review required" : "Confirm resolution"}`); };
  const create = async () => { const r = await c.post({ action: "save", kind: "session", data: { subject, channel: "Web", persona: "Amara" } }); if (r?.id) { c.setSession(r.id); setSubject(""); setFilter("Open"); } };
  return <>
    <Head title="Live Sessions" sub="One queue for every recorded conversation, with the Agent Copilot beside it. Replies you send are recorded here; delivery to external channels needs a tested gateway." />
    <div className="hx-inbox">
      <Card><Seg value={filter} options={["Open", "Resolved", "All"]} onChange={setFilter} />
        <div className="hx-row nowrap" style={{ margin: "10px 0" }}><input value={subject} onChange={e => setSubject(e.target.value)} placeholder="New inquiry subject" aria-label="New inquiry subject" /><Btn kind="pri" onClick={create} disabled={c.busy} title="Start session"><I n="plus" /></Btn></div>
        <div className="hx-convlist">{sessions.map(s => <button key={s.id} className={`hx-conv${sel?.id === s.id ? " on" : ""}`} onClick={() => { c.setSession(s.id); setSummary(""); setReply(""); }}><Av name={s.persona || "?"} /><span className="hx-grow"><b>{s.subject}</b><small>{s.persona} · {s.channel} · {ago(s.lastMessageAt || s.startedAt)}</small><span className="hx-row">{s.priority === "High" && <Pill t="r">High</Pill>}{s.intent && <Pill t={intentTone(s.intent)}>{s.intent}</Pill>}{s.sample && <Pill>Sample</Pill>}</span></span></button>)}{!sessions.length && <Empty>No sessions.</Empty>}</div></Card>
      {sel ? <Card className="hx-thread-card">
        <div className="hx-chd"><div><h3>{sel.subject}</h3><small>{sel.persona} · {(sel.channelsUsed || [sel.channel]).join(" → ")} · started {when(sel.startedAt)}</small></div>{statusPill(sel)}</div>
        <div className="hx-thread" aria-live="polite">{timeline.map(e => ["message.received", "transcript.received"].includes(e.type) ? <div key={e.id} className="hx-bub ai"><small>Customer · {when(e.createdAt)}{e.type === "transcript.received" ? " · voice" : ""}</small>{e.details?.text}</div> : e.type === "message.sent" ? <div key={e.id} className="hx-bub me"><small>{e.actor} · {when(e.createdAt)}</small>{e.details?.text}</div> : <div key={e.id} className="hx-sys">{e.type === "ticket.triaged" ? `Triage: ${e.details?.intent} · ${e.details?.priority} · ${e.details?.department}${e.details?.knowledgeGap ? " · knowledge gap" : ""}` : e.type === "flow.run.planned" ? `Autoflow planned: ${e.details?.flowName} (${e.details?.state})` : e.type === "channel.switched" ? `Continued on ${e.details?.to}. Context carried over.` : e.type === "livesync.field" ? `Live Sync · ${e.details?.field}: ${e.details?.value}` : e.type === "livesync.confirmed" ? `Live Sync confirmed: ${e.details?.text || e.details?.step}` : e.type === "feedback.recorded" ? `Survey rating ${e.details?.score}/5` : e.type} · {ago(e.createdAt)}</div>)}{!timeline.length && <Empty>No events yet. Record the first message.</Empty>}</div>
        {sel.status === "Open" ? <>
          <div className="hx-row nowrap"><input value={msg} onChange={e => setMsg(e.target.value)} placeholder="Customer message or transcript" aria-label="Customer message" /><Btn onClick={capture} title="Capture speech" kind={listening ? "rec" : ""}><I n="mic" /></Btn><Btn kind="pri" disabled={!msg.trim() || c.busy} onClick={async () => { if (await send("message.received", { text: msg })) setMsg(""); }}>Record</Btn></div>
          <textarea value={reply} onChange={e => setReply(e.target.value)} placeholder={`Reply as ${sel.persona}…`} aria-label="Reply" />
          <div className="hx-row"><Btn kind="vio" onClick={draft} disabled={c.busy}><I n="spark" /> AI draft</Btn><Btn kind="pri" disabled={!reply.trim() || c.busy} onClick={async () => { if (await send("message.sent", { text: reply })) setReply(""); }}><I n="send" /> Record reply</Btn>
            <select aria-label="Continue on channel" value="" onChange={e => e.target.value && send("channel.switched", { channel: e.target.value }, `Context carried to ${e.target.value}`)}><option value="">Continue on…</option>{CHANNELS.filter(ch => ch !== sel.channel).map(ch => <option key={ch}>{ch}</option>)}</select>
            <Btn onClick={() => send("handoff.requested", {}, "Handed off with full context")}>Hand off</Btn><Btn onClick={() => send("session.resolved", {}, "Session resolved")}><I n="check" /> Resolve</Btn></div>
          <div className="hx-row nowrap"><input value={sync} onChange={e => setSync(e.target.value)} placeholder="On-screen action the customer confirmed" aria-label="Live Sync confirmation" /><Btn disabled={!sync.trim()} onClick={async () => { if (await send("livesync.confirmed", { text: sync, step: "Visual confirmation" })) setSync(""); }}>Confirm in Live Sync</Btn></div>
        </> : !rated ? <div className="hx-row"><span className="hx-muted">Record survey rating:</span>{[1, 2, 3, 4, 5].map(n => <Btn key={n} kind="sm" onClick={() => c.post({ action: "feedback", sessionId: sel.id, score: n }, "Rating recorded")}>{n}</Btn>)}</div> : <p className="hx-muted">Resolved and rated.</p>}
      </Card> : <Card><Empty>Select or start a session.</Empty></Card>}
      <Card title={<><I n="spark" /> Agent Copilot</>} className="hx-copilot">
        {triage ? <div className="hx-grid g2 tight"><div><small>Intent</small><b>{triage.intent}</b></div><div><small>Priority</small><b>{triage.priority}</b></div><div><small>Department</small><b>{triage.department}</b></div><div><small>Data</small><b>{triage.risk}</b></div><div><small>Specialist</small><b>{triage.persona}</b></div><div><small>Source</small><b>{triage.learned ? "Learned label" : triage.rule ? "Routing rule" : "Base rules"}</b></div></div> : <p className="hx-muted">Record a customer message to classify it.</p>}
        {triage?.needsHuman && <div className="hx-note r">Human review required before any account, grade, payment or enrollment change.</div>}
        {sel && triage && <label className="hx-f">Correct the intent<select value="" onChange={e => e.target.value && c.post({ action: "label", text: lastCustomer.slice(0, 200), label: e.target.value, predicted: triage.intent, sessionId: sel.id }, "Correction saved. It applies to new messages.")}><option value="">{triage.intent} (current)</option>{INTENTS.filter(i => i !== triage.intent).map(i => <option key={i}>{i}</option>)}</select></label>}
        <h4>Approved guidance</h4>{guidance.map(g => <div className="hx-guide" key={g.id}><b>{g.title}</b><small>{g.source}</small><p>{g.excerpt.slice(0, 180)}…</p><Btn kind="sm" onClick={() => setReply(r => (r ? r + "\n\n" : "") + g.excerpt)}>Insert</Btn></div>)}{!guidance.length && <p className="hx-muted">No approved guidance matched. The gap is logged for Knowledge.</p>}
        <h4>Autoflow</h4><div className="hx-row nowrap"><select value={flowId} onChange={e => setFlowId(e.target.value)} aria-label="Approved Autoflow"><option value="">Choose approved Autoflow</option>{flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select><Btn disabled={!flowId || !sel || sel.status !== "Open"} onClick={() => sel && c.post({ action: "flow.run", flowId, sessionId: sel.id }, "Plan added. External steps wait for approval and a connector.")}>Plan</Btn></div>
        <Btn kind="sm" onClick={summarize} disabled={!sel}><I n="spark" /> Summarize for handoff</Btn>{summary && <p className="hx-pre">{summary}</p>}
      </Card>
    </div>
  </>;
}

/* ================= Voice & Live Sync ================= */
const SCN: Record<string, { name: string; persona: string; fields: string[]; lines: [string, Record<string, string>, string][] }> = {
  hotel: { name: "Change a hotel booking", persona: "Amara", fields: ["Guest", "Booking reference", "Current date", "New date", "Room", "Status"], lines: [
    ["Hi, this is Tom Becker. I need to change my Oak Haven booking.", { Guest: "Tom Becker" }, "Hi Tom, I can help with that. What's your booking reference?"],
    ["It's HV-88412. I want to move from Friday to Saturday.", { "Booking reference": "HV-88412", "Current date": "Friday" }, "Thank you. I'll check Saturday availability and put the options on your screen."],
    ["Saturday works, same room please.", { "New date": "Saturday", Room: "Same room type" }, "Please review the change on your screen and tap confirm. A staff member finalizes it in the booking system."]] },
  edu: { name: "Register for a course", persona: "Amara", fields: ["Student", "Student ID", "Course", "Prerequisite", "Section", "Status"], lines: [
    ["Hi, I want to register for Network Security next term.", { Course: "CTS2314 · Network Security" }, "Great choice. What's your student ID so I can check your record?"],
    ["It's S1047, Ethan Brooks.", { Student: "Ethan Brooks", "Student ID": "S1047" }, "Thanks Ethan. I'm checking the prerequisite, CTS1134, now."],
    ["Section 01 on Monday and Wednesday is fine.", { Section: "CTS2314-01 · Mon/Wed" }, "Please confirm the section on your screen. The registrar completes enrollment after the prerequisite check."]] },
  finance: { name: "Schedule a finance review", persona: "Alex", fields: ["Customer", "Verified", "Meeting type", "Preferred day", "Time", "Status"], lines: [
    ["Hi Alex, I'd like to schedule a mortgage review meeting this week.", { "Meeting type": "Mortgage review" }, "Happy to help. For security, a staff member will verify your identity before anything is booked. What day suits you?"],
    ["Thursday afternoon, around 2pm. I'm Grace Liu.", { Customer: "Grace Liu", "Preferred day": "Thursday", Time: "2:00 PM" }, "Thanks Grace. I've put Thursday at 2 PM on your screen. Please confirm and we'll send the invitation once verified."]] },
};
export function VoiceSync({ c }: ModuleProps) {
  const [scn, setScn] = useState("hotel"), [sid, setSid] = useState(""), [said, setSaid] = useState(""), [speaking, setSpeaking] = useState(false), [voiceState, setVoiceState] = useState<"Ready" | "Playing" | "Played" | "Playback error">("Ready"), [step, setStep] = useState(0), [listening, setListening] = useState(false);
  const sc = SCN[scn];
  const persona = c.kind("persona").find(p => p.name === sc.persona) || { name: sc.persona, pitch: 1, speed: 1 };
  const evs = c.data.events.filter(e => e.sessionId === sid).slice().reverse();
  const fields: Record<string, string> = {}; evs.filter(e => e.type === "livesync.field").forEach(e => { fields[e.details?.field] = e.details?.value; });
  const confirmed = evs.some(e => e.type === "livesync.confirmed");
  const canvas = useRef<HTMLCanvasElement | null>(null), speakingRef = useRef(false), audioRef = useRef<HTMLAudioElement | null>(null);
  speakingRef.current = speaking;
  useEffect(() => {
    const cv = canvas.current; if (!cv) return; const ctx = cv.getContext("2d"); if (!ctx) return; let t = 0, raf = 0; const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const draw = () => { t += speakingRef.current ? .05 : .015; const W = cv.width, m = W / 2, R = W * .36 * (1 + (speakingRef.current ? Math.sin(t * 6) * .03 : 0)); ctx.clearRect(0, 0, W, W);
      const g = ctx.createRadialGradient(m - R * .3, m - R * .35, R * .1, m, m, R); g.addColorStop(0, "#f0c9ff"); g.addColorStop(.35, "#8b5cf6"); g.addColorStop(.7, "#3b1d8f"); g.addColorStop(1, "#170a33");
      ctx.save(); ctx.beginPath(); ctx.arc(m, m, R, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill(); ctx.clip();
      for (let k = 0; k < 3; k++) { ctx.beginPath(); const ph = t * (1 + k * .3) + k * 2; for (let a = 0; a <= Math.PI * 2 + .01; a += .05) { const r = R * (.55 + .25 * Math.sin(a * 2 + ph) + (speakingRef.current ? .08 * Math.sin(a * 7 + t * 9) : 0)); const x = m + Math.cos(a + ph * .3) * r, y = m + Math.sin(a + ph * .2) * r * .6; if (a) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.strokeStyle = ["rgba(90,200,255,.55)", "rgba(255,120,220,.5)", "rgba(255,200,120,.35)"][k]; ctx.lineWidth = 18 - k * 4; ctx.filter = "blur(6px)"; ctx.stroke(); ctx.filter = "none"; }
      ctx.restore(); if (!reduce) raf = requestAnimationFrame(draw); };
    draw(); return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => () => { audioRef.current?.pause(); if (audioRef.current?.src.startsWith("blob:")) URL.revokeObjectURL(audioRef.current.src); }, []);
  const speak = (text: string, backup = false) => new Promise<void>(async res => {
    setSpeaking(true); setVoiceState("Playing"); const done = (state: "Played" | "Playback error") => { setSpeaking(false); setVoiceState(state); res(); };
    try {
      let src = "/amara-official.mp3";
      if (!backup) { const response = await fetch("/api/voice-synthesis", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, language: "en-NG", sessionId: sid }) }); if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Dynamic speech is unavailable"); } src = URL.createObjectURL(await response.blob()); }
      audioRef.current?.pause(); if (audioRef.current?.src.startsWith("blob:")) URL.revokeObjectURL(audioRef.current.src);
      const audio = new Audio(src); audioRef.current = audio; audio.onended = () => { if (src.startsWith("blob:")) URL.revokeObjectURL(src); done("Played"); }; audio.onerror = () => done("Playback error"); await audio.play();
    } catch (error) { done("Playback error"); c.toast(error instanceof Error ? error.message : "Dynamic Amara speech failed", true); }
  });
  const start = async () => { const voice = speak(`Hi, this is ${sc.persona}. How can I help?`); const r = await c.post({ action: "save", kind: "session", data: { subject: `Voice · ${sc.name}`, persona: sc.persona, channel: "Web" } }); if (r?.id) { setSid(r.id); setStep(0); } await voice; };
  const caller = async (text: string, f: Record<string, string>, scripted?: string) => {
    if (!sid || !text.trim()) return; setSaid("");
    await c.post({ action: "event", sessionId: sid, type: "transcript.received", text });
    for (const [field, value] of Object.entries(f)) await c.post({ action: "event", sessionId: sid, type: "livesync.field", field, value });
    const r = await c.ai("reply", "This is a phone call with a synchronized screen showing: " + sc.fields.join(", "), { sessionId: sid });
    const answer = r?.text || scripted || "Thanks. A staff member will confirm the details with you shortly.";
    await c.post({ action: "event", sessionId: sid, type: "message.sent", text: answer });
    await speak(answer);
  };
  const extract = (text: string) => { const f: Record<string, string> = {}; const nm = text.match(/(?:my name is|this is|i'm|i am)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/); if (nm) f[sc.fields[0]] = nm[1]; const ref = text.match(/\b([A-Z]{2}-?\d{3,6}|S\d{4})\b/); if (ref) f[sc.fields[1]] = ref[1]; const day = text.match(/\b(mon|tues|wednes|thurs|fri|satur|sun)day\b/i); if (day) f[sc.fields[3]] = day[0]; return f; };
  const listen = () => { const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition; if (!SR) { c.toast("Speech capture isn't available in this browser. Type what the caller says.", true); return; } const r = new SR(); r.lang = "en-US"; setListening(true); r.onresult = (e: any) => { const t = e.results[0][0].transcript; caller(t, extract(t)); }; r.onend = () => setListening(false); r.onerror = () => c.toast("Microphone capture stopped.", true); r.start(); };
  const next = async () => { const line = sc.lines[step]; if (!line) return; void speak(line[2]); setStep(s => s + 1); await caller(line[0], line[1], line[2]); };
  return <>
    <Head title="Voice & Live Sync" sub="The caller talks while the fields on their screen fill in. Every utterance, field and confirmation is recorded on the session.">
      <select value={scn} onChange={e => { setScn(e.target.value); setSid(""); setStep(0); }} aria-label="Scenario">{Object.entries(SCN).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select>
    </Head>
    <div className="hx-grid g2">
      <div className="hx-voice">
        <div className="hx-row between wide"><span className="hx-chip"><I n="mic" s={14} /> Voice chat</span><span className="hx-chip">{voiceState}</span><span className="hx-chip">{sid ? <><span className="hx-dot live g" /> On call</> : "Ready"}</span></div>
        <canvas ref={canvas} width={480} height={480} aria-label="Voice activity" />
        <span className="hx-chip"><I n="wand" s={14} /> Your Assistant · {sc.persona}</span>
        <h2>Smart Voice<br />Assistant</h2>
        <div className="hx-vlog">{evs.filter(e => ["transcript.received", "message.sent"].includes(e.type)).map(e => <div key={e.id} className={`hx-bub ${e.type === "message.sent" ? "ai" : "me"}`}>{e.details?.text}</div>)}</div>
        {sid && <div className="hx-row nowrap wide"><input value={said} onChange={e => setSaid(e.target.value)} onKeyDown={e => { if (e.key === "Enter") caller(said, extract(said)); }} placeholder="Type what the caller says…" aria-label="Caller speech" /><Btn onClick={() => caller(said, extract(said))}><I n="send" /></Btn></div>}
        <div className="hx-vctrl">
          <button className="hx-vbtn" onClick={next} disabled={!sid || step >= sc.lines.length} aria-label="Play next scripted caller line" title="Next scripted line"><I n="fwd" s={20} /></button>
          <button className={`hx-vbtn big${listening || speaking ? " rec" : ""}`} onClick={sid ? listen : start} aria-label={sid ? "Listen to caller" : "Start call"}><I n="mic" s={26} /></button>
          <button className="hx-vbtn" onClick={() => { audioRef.current?.pause(); setSpeaking(false); setVoiceState("Ready"); setSid(""); setStep(0); }} aria-label="End call"><I n="x" s={20} /></button>
        </div>
        <div className="hx-row"><Btn kind="pri" onClick={() => void speak("Hello, I am Amara, Oak Haven's AI assistant.")}><I n="play" /> Generate Amara speech</Btn><Btn onClick={() => void speak("Backup recording", true)}>Play backup recording</Btn></div>
        <small className="hx-vhelp">{sid ? "Tap the mic to capture the caller, type their words, or play the next scripted line." : "Tap the mic to start a recorded call session."}</small>
      </div>
      <div className="hx-col">
        <Card title={<><I n="screen" /> Caller's screen · Live Sync</>} actions={sid ? <Pill t="t">synced</Pill> : <Pill>idle</Pill>}>
          <div className="hx-sync">{sc.fields.map(f => <div key={f} className={`hx-sfield${fields[f] || (f === "Status" && confirmed) ? " fill" : ""}`}><small>{f}</small><b>{f === "Status" && confirmed ? "Confirmed on screen" : fields[f] || "—"}</b></div>)}</div>
          <Btn kind="pri" disabled={!sid || confirmed} onClick={() => c.post({ action: "event", sessionId: sid, type: "livesync.confirmed", text: `${sc.name}: ${Object.entries(fields).map(([k, v]) => `${k} ${v}`).join(", ")}`, step: "Visual confirmation" }, "Caller confirmed on screen")}><I n="check" /> Caller taps Confirm</Btn>
        </Card>
        <Card title="What runs on this call"><div className="hx-list">
          <div className="hx-li"><span className="hx-dot t" />Speech capture uses this browser's recognizer; a telephone call needs the voice gateway.</div>
          <div className="hx-li"><span className="hx-dot t" />Dynamic replies use the consented Amara voice ID through the configured speech provider; the fixed recording is backup-only.</div>
          <div className="hx-li"><span className="hx-dot t" />Replies are drafted from approved guidance{c.data.ai?.configured ? ` by ${c.data.ai.provider}` : " (AI provider not configured, scripted lines used)"}.</div>
          <div className="hx-li"><span className="hx-dot t" />Identity checks and final booking or enrollment changes stay with staff.</div></div></Card>
      </div>
    </div>
  </>;
}

/* ================= Ticket Classification ================= */
export function Classification({ c }: ModuleProps) {
  const labels = c.kind("label"), routing = c.kind("routing"), admin = c.data.viewer.admin;
  const [test, setTest] = useState(""), [rule, setRule] = useState<Row>({ intent: INTENTS[0], persona: "Amara", department: "", priority: "Normal" });
  const acc = classifierAccuracy(labels, routing);
  const triaged = c.data.events.filter(e => e.type === "ticket.triaged");
  const out = test.trim() ? classifyWith(test, { labels, routing }) : null;
  const matrix = INTENTS.map(a => INTENTS.map(b => labels.filter(l => l.label === a && l.predicted === b).length));
  const recent = c.kind("session").filter(s => s.intent).slice(0, 10);
  return <>
    <Head title="Ticket Classification" sub="Every message is tagged for intent, priority and data sensitivity, then routed. Correct a label and it applies to new messages immediately." />
    <div className="hx-kpis">
      <Kpi label="Agreement with corrections" value={pct(acc)} note={labels.length ? `${labels.length} labeled examples` : "Correct a few tickets to measure"} tone="t" />
      <Kpi label="Messages triaged" value={triaged.length} note="All time in this workspace" />
      <Kpi label="Flagged for human review" value={triaged.filter(t => t.details?.needsHuman).length} note="Urgent or sensitive" tone="r" />
      <Kpi label="Routing rules" value={routing.filter(r => r.status !== "Disabled").length} note={admin ? "Editable below" : "Administrators edit"} />
    </div>
    <div className="hx-grid g2">
      <Card title="Try the classifier"><input value={test} onChange={e => setTest(e.target.value)} placeholder="e.g. I was charged twice and I'm locked out" aria-label="Test message" />
        {out && <div className="hx-grid g3 tight" style={{ marginTop: 12 }}><div><small>Intent</small><b>{out.intent}</b></div><div><small>Priority</small><b>{out.priority}</b></div><div><small>Data</small><b>{out.risk}</b></div><div><small>Specialist</small><b>{out.persona}</b></div><div><small>Department</small><b>{out.department}</b></div><div><small>Human review</small><b>{out.needsHuman ? "Required" : "No"}</b></div></div>}</Card>
      <Card title="Routing rules">{routing.map(r => <div className="hx-li" key={r.id}><Pill t={intentTone(r.intent)}>{r.intent}</Pill><span className="hx-grow">→ {r.persona || "default"}{r.department ? ` · ${r.department}` : ""}{r.priority === "High" ? " · High priority" : ""}</span>{admin && <><Btn kind="sm" onClick={() => c.post({ action: "save", kind: "routing", id: r.id, data: { ...r, status: r.status === "Disabled" ? "Active" : "Disabled" } })}>{r.status === "Disabled" ? "Enable" : "Disable"}</Btn><Btn kind="ghost sm" onClick={() => c.post({ action: "delete", id: r.id })}><I n="x" s={12} /></Btn></>}</div>)}
        {!routing.length && <p className="hx-muted">Base routing: Admissions → Amara, Finance → Alex, IT → Kyle, everything else → Amara.</p>}
        {admin ? <div className="hx-row"><select value={rule.intent} onChange={e => setRule({ ...rule, intent: e.target.value })} aria-label="Intent">{INTENTS.map(i => <option key={i}>{i}</option>)}</select><select value={rule.persona} onChange={e => setRule({ ...rule, persona: e.target.value })} aria-label="Persona">{personaNames(c).map(p => <option key={p}>{p}</option>)}</select><input value={rule.department} onChange={e => setRule({ ...rule, department: e.target.value })} placeholder="Department" aria-label="Department" /><select value={rule.priority} onChange={e => setRule({ ...rule, priority: e.target.value })} aria-label="Priority"><option>Normal</option><option>High</option></select><Btn kind="pri" onClick={() => c.post({ action: "save", kind: "routing", data: rule }, "Rule added")}>Add rule</Btn></div> : <p className="hx-muted">Only administrators can change routing.</p>}</Card>
    </div>
    <div className="hx-grid g2">
      <Card title="Recent tickets"><div className="hx-tbl"><table><thead><tr><th>Ticket</th><th>Classified as</th><th>Correct label</th></tr></thead><tbody>{recent.map(s => <tr key={s.id}><td><b>{s.subject}</b><small>{s.persona} · {s.priority}</small></td><td><Pill t={intentTone(s.intent)}>{s.intent}</Pill></td><td><select value="" onChange={e => { const txt = c.data.events.filter(x => x.sessionId === s.id && x.type === "message.received").pop()?.details?.text || s.subject; if (e.target.value) c.post({ action: "label", text: String(txt).slice(0, 200), label: e.target.value, predicted: s.intent, sessionId: s.id }, "Correction saved"); }} aria-label="Correct label"><option value="">Correct…</option>{INTENTS.map(i => <option key={i}>{i}</option>)}</select></td></tr>)}</tbody></table>{!recent.length && <Empty>No classified tickets yet.</Empty>}</div></Card>
      <Card title="Corrections matrix" actions={<small>rows = correct label · columns = what the model said</small>}>{labels.length ? <div className="hx-tbl"><table className="mono"><thead><tr><th />{INTENTS.map(i => <th key={i}>{i.split(" ")[0]}</th>)}</tr></thead><tbody>{INTENTS.map((a, i) => <tr key={a}><td><b>{a.split(" ")[0]}</b></td>{matrix[i].map((v, j) => <td key={j} className={v ? (i === j ? "ok" : "bad") : ""}>{v || ""}</td>)}</tr>)}</tbody></table></div> : <Empty>No corrections yet.</Empty>}</Card>
    </div>
  </>;
}

/* ================= Alerts ================= */
const SEV = [["Critical", "r"], ["Major", "a"], ["Minor", "b"], ["Event", "v"]] as const;
export function Alerts({ c }: ModuleProps) {
  const derived = deriveAlerts(c.data.records, c.data.events, Date.now(), c.data.settings?.slaHours || 4);
  const saved = new Map(c.kind("alert").map(a => [a.key, a]));
  const rows: Row[] = derived.map(a => ({ ...a, state: saved.get(a.key) || { status: "Active", assignee: "", comments: [] } }));
  const [status, setStatus] = useState("Active"), [sev, setSev] = useState("All"), [q, setQ] = useState(""), [open, setOpen] = useState(""), [note, setNote] = useState(""), [assignee, setAssignee] = useState("");
  const list = rows.filter(r => (status === "All" || r.state.status === status) && (sev === "All" || r.severity === sev) && (!q || `${r.issue} ${r.title}`.toLowerCase().includes(q.toLowerCase())));
  const update = (r: Row, patch: Row, ok: string) => c.post({ action: "save", kind: "alert", id: `alert:${r.key}`.slice(0, 80), data: { key: r.key, ...r.state, ...patch } }, ok);
  return <>
    <Head title="Alerts" sub="Raised from recorded sessions, knowledge gaps, approvals and sync results. Acknowledge, assign and resolve them here.">
      <Btn onClick={() => downloadFile("havenconnect-alerts.csv", toCSV([["Severity", "Issue", "Title", "Status", "Assignee", "Raised"], ...rows.map(r => [r.severity, r.issue, r.title, r.state.status, r.state.assignee, r.at || ""])]))}><I n="dl" /> Export CSV</Btn>
    </Head>
    <div className="hx-alerttiles">{SEV.map(([s, t]) => <button key={s} className={`hx-atile ${t}${sev === s ? " on" : ""}`} onClick={() => setSev(sev === s ? "All" : s)}><small>{s}</small><strong>{rows.filter(r => r.severity === s && r.state.status === "Active").length}</strong><I n="bell" s={18} /></button>)}</div>
    <Card wide>
      <div className="hx-row"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search issues" aria-label="Search alerts" style={{ maxWidth: 280 }} /><Seg value={status} options={["Active", "Acknowledged", "Resolved", "All"]} onChange={setStatus} /></div>
      <div className="hx-tbl"><table><thead><tr><th>Raised</th><th>Severity</th><th>Issue</th><th>Detail</th><th>Status</th><th>Assigned</th><th>Notes</th><th /></tr></thead><tbody>
        {list.map(r => <tr key={r.key}><td><small>{when(r.at)}</small></td><td><Pill t={SEV.find(s => s[0] === r.severity)?.[1]}>{r.severity}</Pill></td><td><b>{r.issue}</b></td><td>{r.title}</td><td><Pill t={r.state.status === "Resolved" ? "g" : r.state.status === "Acknowledged" ? "b" : ""}>{r.state.status}</Pill></td><td>{r.state.assignee || "—"}</td><td>{r.state.comments?.length || 0}</td><td><div className="hx-row nowrap">{r.sessionId && <Btn kind="sm" onClick={() => { c.setSession(r.sessionId); c.go("sessions"); }}>Open</Btn>}<Btn kind="sm" onClick={() => { setOpen(open === r.key ? "" : r.key); setAssignee(r.state.assignee || ""); }}>Manage</Btn></div></td></tr>)}
      </tbody></table>{!list.length && <Empty>No alerts match.</Empty>}</div>
      {open && (() => { const r = rows.find(x => x.key === open); if (!r) return null; return <div className="hx-manage"><h4>{r.issue}: {r.title}</h4>
        <div className="hx-row"><Btn onClick={() => update(r, { status: "Acknowledged" }, "Acknowledged")}>Acknowledge</Btn><Btn kind="pri" onClick={() => update(r, { status: "Resolved" }, "Resolved")}>Resolve</Btn>{r.state.status !== "Active" && <Btn onClick={() => update(r, { status: "Active" }, "Reopened")}>Reopen</Btn>}
          <input value={assignee} onChange={e => setAssignee(e.target.value)} placeholder="Assign to (name or email)" aria-label="Assignee" style={{ maxWidth: 240 }} /><Btn onClick={() => update(r, { assignee }, "Assigned")}>Assign</Btn></div>
        {(r.state.comments || []).map((cm: Row, i: number) => <p key={i} className="hx-muted"><b>{cm.by}</b> · {when(cm.at)} — {cm.text}</p>)}
        <div className="hx-row nowrap"><input value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note" aria-label="Note" /><Btn disabled={!note.trim()} onClick={async () => { if (await update(r, { comments: [...(r.state.comments || []), { by: c.data.viewer.email, at: new Date().toISOString(), text: note }] }, "Note added")) setNote(""); }}>Add note</Btn></div></div>; })()}
    </Card>
    <div className="hx-grid g2"><Card title="Active alerts by issue">{(() => { const m: Record<string, number> = {}; rows.filter(r => r.state.status === "Active").forEach(r => m[r.issue] = (m[r.issue] || 0) + 1); const e = Object.entries(m); return e.length ? <div className="hx-row"><Donut parts={e.map(([l, v], i) => ({ label: l, value: v, color: PAL[i % PAL.length] }))} label={e.reduce((a, [, v]) => a + v, 0)} sub="active" /><Legend items={e.map(([n], i) => ({ name: n, color: PAL[i % PAL.length] }))} /></div> : <Empty>No active alerts.</Empty>; })()}</Card>
      <Card title="Alert rules"><div className="hx-list small"><div className="hx-li">SLA breach · open longer than {c.data.settings?.slaHours || 4} hours (Critical when High priority)</div><div className="hx-li">Human handoff or review required · Major</div><div className="hx-li">Knowledge gap · Minor, Major from 5 unanswered questions</div><div className="hx-li">Draft awaiting approval · Event</div><div className="hx-li">Grade approval pending · Major; Scholaris sync failure · Critical</div></div></Card></div>
  </>;
}
