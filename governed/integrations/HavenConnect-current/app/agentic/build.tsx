"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { retrieveGuidance, planFlow } from "@/lib/cx-intelligence";
import { I, Av, Pill, Card, Empty, Head, Btn, Seg, downloadFile, type ModuleProps, type Row, type Ctx } from "./ui";

const CHANNELS = ["Web", "Mobile", "Voice", "Email", "SMS", "WhatsApp", "Instagram", "Messenger", "X", "Facebook"];
const BASE: Row[] = [
  { name: "Alex", tone: "Clear", industry: "Finance", role: "Finance & higher-ed billing", pitch: 1, speed: 1, intonation: 52, stability: 75 },
  { name: "Amara", tone: "Warm", industry: "Hospitality & Education", role: "Official voice, concierge, admissions & Live Sync", pitch: .96, speed: .9, intonation: 52, stability: 84 },
  { name: "Kyle", tone: "Technical", industry: "SaaS", role: "IT support", pitch: .93, speed: 1, intonation: 46, stability: 78 },
];
const DESIGN = ["Idea", "Analysis of competitors", "Hypothesis test", "Brand identity", "Wireframing", "UX analysis", "UI design", "Prototyping"];
export const allPersonas = (c: Ctx): Row[] => { const saved = c.kind("persona"); const merged = BASE.map(b => ({ channels: ["Web"], greeting: `Hi, I'm ${b.name}. How can I help?`, status: "Default", ...b, ...(saved.find(s => s.name === b.name) || {}) })); return [...merged, ...saved.filter(s => !BASE.some(b => b.name === s.name))]; };

/* ================= Agent Studio ================= */
export function Studio({ c }: ModuleProps) {
  const personas = allPersonas(c);
  const [name, setName] = useState("Amara");
  const saved = personas.find(p => p.name === name) || personas[0];
  const [p, setP] = useState<Row>(saved);
  const [text, setText] = useState(""), [word, setWord] = useState(-1), [q, setQ] = useState(""), [voiceState, setVoiceState] = useState<"Ready" | "Playing" | "Played" | "Playback error">("Ready");
  useEffect(() => { setP(saved); setText(saved.greeting || ""); setWord(-1); }, [saved.name, saved.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const conn = c.data.connections;
  const dirty = JSON.stringify(p) !== JSON.stringify(saved);
  const words = String(text || p.greeting || "").split(/\s+/).filter(Boolean);
  const timer = useRef<number | null>(null), audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => { audioRef.current?.pause(); if (audioRef.current?.src.startsWith("blob:")) URL.revokeObjectURL(audioRef.current.src); }, []);
  const play = async (t = text || p.greeting, backup = false) => {
    if (timer.current) window.clearTimeout(timer.current); setText(t); const n = t.split(/\s+/).filter(Boolean).length, per = 60000 / (165 * (Number(p.speed) || 1));
    setVoiceState("Playing");
    try {
      let src = "/amara-official.mp3";
      if (!backup) { const response = await fetch("/api/voice-synthesis", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: t, language: p.locale === "Nigerian Pidgin" ? "pcm-NG" : "en-NG" }) }); if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Dynamic speech is unavailable"); } src = URL.createObjectURL(await response.blob()); }
      audioRef.current?.pause(); if (audioRef.current?.src.startsWith("blob:")) URL.revokeObjectURL(audioRef.current.src);
      const audio = new Audio(src); audio.onended = () => { setVoiceState("Played"); if (src.startsWith("blob:")) URL.revokeObjectURL(src); }; audio.onerror = () => setVoiceState("Playback error"); audioRef.current = audio; await audio.play();
    } catch (error) { setVoiceState("Playback error"); c.toast(error instanceof Error ? error.message : "Dynamic Amara speech failed", true); return; }
    let i = 0; const tick = () => { setWord(i); i++; if (i <= n) timer.current = window.setTimeout(tick, per); }; tick();
  };
  const ask = async () => { const r = await c.ai("reply", `Persona: ${p.name} (${p.tone}). Customer: ${q || "Hi, I'd like some help."}`); await play(r?.text || `Thanks for asking. I'm ${p.name}. Let me look into that and bring in a colleague if needed.`); };
  const saveDraft = () => c.post({ action: "save", kind: "persona", data: p }, `${p.name} saved as a draft`);
  const slider = (label: string, key: string, min: number, max: number, step: number, lo: string, hi: string) => <div className="hx-slider"><b>{label}</b><span>{lo}</span><input type="range" min={min} max={max} step={step} value={p[key] ?? min} onChange={e => setP({ ...p, [key]: Number(e.target.value) })} aria-label={label} /><span>{hi}</span><em>{p[key]}</em></div>;
  return <>
    <Head title="Agent Studio" sub="Each agent's persona, voice, channels and guardrails. Save changes as a draft; an authorized administrator publishes them.">
      <Btn onClick={() => c.go("builder")}><I n="wand" /> New agent</Btn><Btn onClick={saveDraft} disabled={c.busy || !dirty}>Save draft</Btn>
      <Btn kind="pri" disabled={c.busy || !saved.id || saved.status !== "Draft" || !c.data.viewer.educationAccess} onClick={() => c.post({ action: "approve", id: saved.id }, `${saved.name} published`)} title={c.data.viewer.educationAccess ? "Publish the saved draft" : "Requires an authorized administrator"}><I n="check" /> Publish{saved.publishedVersion ? ` v${saved.publishedVersion + 1}` : ""}</Btn>
    </Head>
    <div className="hx-personas">{personas.map(x => <button key={x.name} className={`hx-pcard${x.name === p.name ? " on" : ""}`} onClick={() => setName(x.name)}><Av name={x.name} /><span><b>{x.name}</b><small>AI Agent · {x.tone}</small></span><I n="fwd" /></button>)}</div>
    <div className="hx-grid g2">
      <div className="hx-col">
        <div className="hx-row nowrap"><Av name={p.name} lg /><div className="hx-col tight"><div className="hx-row"><h2 className="hx-pname">{p.name} · AI Agent</h2><Pill t={p.status === "Published" ? "g" : p.status === "Draft" ? "a" : ""}>{p.status || "Default"}{p.publishedVersion ? ` · v${p.publishedVersion}` : ""}</Pill>{dirty && <Pill t="a">Unsaved</Pill>}</div>
          <div className="hx-row">{([["industry", ["Finance", "Healthcare", "SaaS", "Education", "E-commerce", "Hospitality", "Mobile Apps"]], ["tone", ["Clear", "Calm", "Technical", "Friendly", "Formal"]], ["locale", ["English (US)", "English (UK)", "English (NG)", "Spanish (MX)", "French (FR)", "Yoruba (NG)"]]] as [string, string[]][]).map(([k, opts]) => <select key={k} className="hx-chipsel" value={p[k] || opts[0]} onChange={e => setP({ ...p, [k]: e.target.value })} aria-label={k}>{opts.map(o => <option key={o}>{o}</option>)}</select>)}</div></div></div>
        <div><small className="hx-eyebrow">Channels · only connected channels can be enabled</small><div className="hx-chgrid">{CHANNELS.map(ch => { const ok = ch === "Web" || !String(conn[ch] || "").startsWith("Awaiting"), on = (p.channels || []).includes(ch); return <button key={ch} className={`hx-chbtn${on ? " on" : ""}`} disabled={!ok} title={`${ch}: ${conn[ch] || "Local workspace"}`} aria-pressed={on} onClick={() => setP({ ...p, channels: on ? p.channels.filter((x: string) => x !== ch) : [...(p.channels || []), ch] })}><span>{ch.slice(0, 2)}</span><small>{ch}</small></button>; })}</div></div>
        <div className="hx-col">{slider("Pitch", "pitch", 0, 2, .05, "Low", "High")}{slider("Speed", "speed", .5, 2, .05, "Slow", "Fast")}{slider("Intonation", "intonation", 0, 100, 1, "Low", "High")}{slider("Stability", "stability", 0, 100, 1, "Variable", "Stable")}</div>
        <p className="hx-muted small">Browser preview applies pitch and speed. Intonation and stability are stored for a connected speech provider.</p>
        <label className="hx-f">Greeting<input value={p.greeting || ""} onChange={e => setP({ ...p, greeting: e.target.value })} /></label>
        <label className="hx-f">Allowed actions (comma separated)<input value={(p.actions || []).join(", ")} onChange={e => setP({ ...p, actions: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} placeholder="Check application status, Send deadline reminder" /></label>
        <label className="hx-f">Guardrail policy<select value={p.guard || "Standard"} onChange={e => setP({ ...p, guard: e.target.value })}>{["Standard", "Fintech strict", "PHI safe", "FERPA safe"].map(g => <option key={g}>{g}</option>)}</select></label>
      </div>
      <div className="hx-col">
        <div className="hx-player"><div className="hx-row between"><div className="hx-row"><span className="hx-av" style={{ background: "var(--hx-accent)" }}><I n="route" /></span><div><b>{p.industry} · {p.name}</b><small>HavenConnect · {p.locale || "English (US)"}</small></div></div><Pill>AI Agent · {p.industry}</Pill></div>
          <div className="hx-tx">{words.map((w, i) => <span key={i} className={i < word ? "done" : i === word ? "hl" : "todo"}>{w} </span>)}</div>
          <div className="hx-row nowrap"><Btn kind="pri" onClick={() => void play()}><I n="play" /> Generate &amp; speak as Amara</Btn><Btn onClick={() => void play("Amara backup recording", true)}>Play backup recording</Btn><Pill t={voiceState === "Played" ? "g" : voiceState === "Playback error" ? "r" : voiceState === "Playing" ? "t" : ""}>{voiceState}</Pill><div className="hx-bar grow"><i style={{ width: `${words.length ? Math.min(100, Math.max(0, word) / words.length * 100) : 0}%` }} /></div></div></div>
        <Card title="Test request"><textarea value={q} onChange={e => setQ(e.target.value)} placeholder={`Hi ${p.name}, I'd like to schedule a review meeting this week.`} aria-label="Test request" /><div className="hx-row"><Btn kind="vio" onClick={ask} disabled={c.busy}><I n="spark" /> Generate reply &amp; speak</Btn><Btn onClick={() => void play(p.greeting)}>Speak greeting</Btn></div><p className="hx-muted small">Dynamic speech is generated only when the consented Amara voice ID and an approved TTS provider are configured. The backup recording never represents a generated reply.</p></Card>
        <Card title="Design process" actions={<small>Where this agent is in its design</small>}><div className="hx-steps">{DESIGN.map((s, i) => { const at = DESIGN.indexOf(p.stage || "Idea"); return <button key={s} className={i === at ? "on" : i < at ? "done" : ""} onClick={() => setP({ ...p, stage: s })}><i>{i < at ? "✓" : i + 1}</i>{s}</button>; })}</div></Card>
      </div>
    </div>
  </>;
}

/* ================= Agent Builder ================= */
const ROLES: [string, string, string][] = [
  ["Support Agent", "Resolves customer and employee questions end-to-end", "Hospitality"], ["Sales Agent", "Qualifies leads, answers pricing, books demos", "SaaS"],
  ["Admissions Agent", "Answers applicants, checks status, collects documents", "Education"], ["Registration Agent", "Checks prerequisites and prepares enrollment", "Education"],
  ["Customer Success Agent", "Nurtures accounts and gathers feedback", "SaaS"], ["Marketing Agent", "Builds segments and drafts on-brand campaigns", "Hospitality"],
  ["Knowledge Agent", "Answers from the organization's approved knowledge", "Education"], ["Analyst Agent", "Analyzes conversations and surfaces insights", "Finance"],
  ["Workflow Agent", "Runs one step inside an Autoflow", "SaaS"], ["Voice Receptionist", "Answers calls, captures details, transfers", "Hospitality"],
  ["Compliance Agent", "Redacts sensitive data and enforces disclosures", "Finance"], ["Custom Agent", "Start from a blank brief", "Education"],
];
const SKILLS = ["Check application status", "Prepare course registration", "Send deadline reminder", "Draft refund request for approval", "Update contact details (with verification)", "Book appointment (with confirmation)", "Reset password", "Open IT ticket", "Schedule callback", "Change booking (staff confirms)"];
export function Builder({ c }: ModuleProps) {
  const [step, setStep] = useState(0);
  const [w, setW] = useState<Row>({ role: "Support Agent", name: "", industry: "Hospitality", tone: "Friendly", instructions: "", skills: ["Schedule callback"], packs: ["hosp"] });
  const steps = ["Role", "Basic info", "Instructions", "Packs", "Skills", "Done"];
  const packs = [["saas", "SaaS"], ["ecom", "E-commerce"], ["fin", "Fintech"], ["health", "Health & wellness"], ["mobile", "Mobile apps"], ["edu", "Education"], ["hosp", "Hospitality"]];
  const def = () => `You are a ${w.role.toLowerCase()} for Oak Haven (${w.industry}). Use a ${w.tone.toLowerCase()} tone.\n- Resolve the request in one conversation when you can.\n- Answer only from approved knowledge; never guess policies, prices or dates.\n- Staff verify identity before any account, booking, payment, grade or enrollment change.\n- Hand off with a full summary when the person is upset, asks for a human, or the matter is sensitive.`;
  const tog = (k: string, v: string) => setW({ ...w, [k]: w[k].includes(v) ? w[k].filter((x: string) => x !== v) : [...w[k], v] });
  const create = async () => { const name = (w.name || w.role.split(" ")[0]).trim(); const r = await c.post({ action: "save", kind: "persona", data: { name, role: w.role, industry: w.industry, tone: w.tone, instructions: w.instructions || def(), actions: w.skills, channels: ["Web"], stage: "Idea", greeting: `Hi, I'm ${name}. How can I help?` } }, `${name} created as a draft`); if (r) { setStep(0); c.go("studio"); } };
  return <>
    <Head title="Agent Builder" sub="A six-step launch pad. The role pre-fills instructions, packs and skills; you can change anything later." />
    <div className="hx-steps big">{steps.map((s, i) => <button key={s} className={i === step ? "on" : i < step ? "done" : ""} onClick={() => setStep(i)}><i>{i < step ? "✓" : i + 1}</i>{s}</button>)}</div>
    <Card wide>
      {step === 0 && <><h2>Pick a role <span className="hx-muted">to start with</span></h2><div className="hx-roles">{ROLES.map(([r, d, ind]) => <button key={r} className={`hx-role${w.role === r ? " on" : ""}`} onClick={() => setW({ ...w, role: r, industry: ind })}><Av name={r} /><span><b>{r}</b><small>{d}</small></span></button>)}</div></>}
      {step === 1 && <div className="hx-grid g2"><label className="hx-f">Agent name<input value={w.name} onChange={e => setW({ ...w, name: e.target.value })} placeholder="e.g. Amaka" /></label><label className="hx-f">Industry<select value={w.industry} onChange={e => setW({ ...w, industry: e.target.value })}>{["Education", "Finance", "Healthcare", "SaaS", "E-commerce", "Hospitality"].map(o => <option key={o}>{o}</option>)}</select></label><label className="hx-f">Tone<select value={w.tone} onChange={e => setW({ ...w, tone: e.target.value })}>{["Friendly", "Clear", "Calm", "Technical", "Formal"].map(o => <option key={o}>{o}</option>)}</select></label><p className="hx-muted">New agents start on Web. Other channels unlock once their gateway passes a live test.</p></div>}
      {step === 2 && <><textarea className="tall" value={w.instructions || def()} onChange={e => setW({ ...w, instructions: e.target.value })} aria-label="Instructions" /><Btn kind="vio" onClick={async () => { const r = await c.ai("instructions", `Role: ${w.role}. Industry: ${w.industry}. Tone: ${w.tone}. Skills: ${w.skills.join(", ")}.`); if (r?.text) setW({ ...w, instructions: r.text }); }} disabled={c.busy}><I n="spark" /> Draft with AI</Btn></>}
      {step === 3 && <div className="hx-roles">{packs.map(([k, n]) => <button key={k} className={`hx-role${w.packs.includes(k) ? " on" : ""}`} onClick={() => tog("packs", k)}><I n="plug" s={20} /><span><b>{n}</b><small>{c.data.settings?.packs?.[k] ? "Installed" : "Not installed"}</small></span></button>)}</div>}
      {step === 4 && <div className="hx-roles">{SKILLS.map(s => <button key={s} className={`hx-role${w.skills.includes(s) ? " on" : ""}`} onClick={() => tog("skills", s)}><I n={w.skills.includes(s) ? "check" : "plus"} s={18} /><b>{s}</b></button>)}</div>}
      {step === 5 && <div className="hx-col"><div className="hx-row"><Av name={w.name || w.role} lg /><div><h2>{w.name || w.role.split(" ")[0]}</h2><p className="hx-muted">{w.role} · {w.industry} · {w.tone}</p></div></div><p><b>Skills:</b> {w.skills.join(", ") || "none"}</p><p className="hx-pre">{w.instructions || def()}</p><p className="hx-muted">The agent is created as a draft. Publish it from Agent Studio after review.</p></div>}
    </Card>
    <div className="hx-row between"><Btn kind="ghost" disabled={!step} onClick={() => setStep(step - 1)}>Back</Btn>{step < 5 ? <Btn kind="pri" onClick={() => setStep(step + 1)}>Continue</Btn> : <Btn kind="pri" onClick={create} disabled={c.busy}><I n="check" /> Create agent</Btn>}</div>
  </>;
}

/* ================= Autoflows ================= */
const NODE_TYPES: [string, string, string][] = [["trigger", "de", "Trigger"], ["llm", "ag", "LLM reasoning"], ["tool", "ag", "Agent tool use"], ["verify", "de", "Verify identity"], ["cond", "de", "Condition"], ["api", "de", "Connector action"], ["form", "de", "Live Sync form"], ["disclose", "de", "Disclosure"], ["human", "hm", "Staff approval"]];
const kindOf = (t: string) => NODE_TYPES.find(n => n[0] === t)?.[1] || "de";
const TEMPLATES: Record<string, [string, string, string][]> = {
  "Booking change": [["trigger", "Trigger", "Intent = booking change"], ["verify", "Verify guest", "Last name + reference"], ["api", "Check availability", "Property system"], ["form", "Live Sync · confirm", "Guest confirms on screen"], ["human", "Front desk finalizes", "Staff approval"]],
  "Refund request": [["trigger", "Trigger", "Intent = refund"], ["verify", "Verify identity", "One-time code"], ["llm", "Reason over charges", "Find the duplicate"], ["cond", "Within policy?", "Threshold rule"], ["human", "Finance approval", "Staff approval"], ["disclose", "Disclosure", "5–10 business days"]],
  "Admission inquiry": [["trigger", "Trigger", "Intent = admissions"], ["llm", "Understand question", "Program, term, status"], ["api", "Application lookup", "SIS"], ["form", "Live Sync · document upload", "Missing documents"]],
  "Password reset": [["trigger", "Trigger", "Intent = password"], ["verify", "Verify email owner", "Magic link"], ["api", "Send reset", "Identity provider"]],
};
export function Autoflows({ c }: ModuleProps) {
  const flows = c.kind("flow");
  const [id, setId] = useState(""), [draft, setDraft] = useState<Row | null>(null), [sel, setSel] = useState(""), [link, setLink] = useState(""), [dev, setDev] = useState(false), [log, setLog] = useState(""), [running, setRunning] = useState(""), [scenario, setScenario] = useState("Verified customer");
  const current = flows.find(f => f.id === id) || flows[0];
  const toDraft = (f: Row): Row => { const nodes = f.nodes?.length ? f.nodes : [{ id: "n1", type: "trigger", title: "Trigger", desc: f.trigger || "", x: 40, y: 90 }, ...(f.steps || []).map((s: string, i: number) => ({ id: `n${i + 2}`, type: /approv|staff|review/i.test(s) ? "human" : /verify|identity/i.test(s) ? "verify" : /send|update|register|book|create|refund/i.test(s) ? "api" : "llm", title: s.split(" — ")[0].slice(0, 40), desc: s.split(" — ")[1] || "", x: 40 + ((i + 1) % 4) * 230, y: 90 + Math.floor((i + 1) / 4) * 150 }))]; return { id: f.id, name: f.name || "", trigger: f.trigger || "", status: f.status, version: f.version, nodes, edges: f.edges?.length ? f.edges : nodes.slice(1).map((n: Row, i: number) => [nodes[i].id, n.id]) }; };
  useEffect(() => { if (current && (!draft || draft.id !== current.id)) setDraft(toDraft(current)); }, [current?.id, current?.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const drag = useRef<Row | null>(null);
  const d = draft;
  const setNodes = (nodes: Row[]) => d && setDraft({ ...d, nodes, dirty: true });
  const node = d?.nodes.find((n: Row) => n.id === sel);
  const save = async () => { if (!d) return; const r = await c.post({ action: "save", kind: "flow", id: d.id, data: { name: d.name, trigger: d.trigger, nodes: d.nodes, edges: d.edges, steps: [] } }, "Saved as a draft. An administrator approves it before use."); if (r?.id) { setId(r.id); setDraft({ ...d, id: r.id, dirty: false }); } };
  const fromTemplate = (t: string) => { const nodes = TEMPLATES[t].map(([type, title, desc], i) => ({ id: `n${i + 1}`, type, title, desc, x: 40 + i * 220, y: 90 + (i % 2) * 60 })); setId(""); setSel(""); setDraft({ id: "", name: t, trigger: TEMPLATES[t][0][2].replace("Intent = ", ""), status: "New", nodes, edges: nodes.slice(1).map((n, i) => [nodes[i].id, n.id]), dirty: true }); };
  const test = async () => {
    if (!d) return; setLog(`▶ Dry run · ${d.name} · ${scenario}\n`); const byId = (x: string) => d.nodes.find((n: Row) => n.id === x); let cur = d.nodes.find((n: Row) => n.type === "trigger") || d.nodes[0], guard = 0, out = `▶ Dry run · ${d.name} · ${scenario}\n`;
    while (cur && guard++ < 25) { setRunning(cur.id); await new Promise(r => setTimeout(r, 450)); let next = d.edges.filter((e: string[]) => e[0] === cur.id).map((e: string[]) => byId(e[1])); let line = `✓ ${cur.title}`;
      if (cur.type === "verify" && scenario === "Fails verification") { out += `✗ ${cur.title}: verification failed → hand off to staff with context\n`; setLog(out); break; }
      if (cur.type === "cond") { const yes = scenario !== "Outside policy"; line = `◆ ${cur.title} → ${yes ? "yes" : "no"} (rule)`; next = [next[yes ? 0 : 1] || next[0]]; }
      if (cur.type === "human") line = `⏸ ${cur.title}: waits for a staff decision`; if (cur.type === "api") line = `⧗ ${cur.title}: needs a verified connector in production`; if (["llm", "tool"].includes(cur.type)) line = `✦ ${cur.title}: ${cur.desc}`;
      out += line + "\n"; setLog(out); cur = next[0]; }
    setRunning(""); setLog(out + "■ Dry run finished. Nothing was changed.");
  };
  const W = 1300, H = 620;
  return <>
    <Head title="Autoflows" sub="Blend agent reasoning with rule-based steps in one governed flow. Drag nodes; click a node's right port, then another node, to connect.">
      <select value={d?.id || ""} onChange={e => { setId(e.target.value); setSel(""); setLog(""); }} aria-label="Flow">{flows.map(f => <option key={f.id} value={f.id}>{f.name} · {f.status}</option>)}{d && !d.id && <option value="">{d.name} (unsaved)</option>}</select>
      <Btn onClick={() => setDev(!dev)}>{dev ? "Canvas" : "Developer view"}</Btn>
      <Btn onClick={() => d && downloadFile(`${(d.name || "flow").replace(/\W+/g, "-").toLowerCase()}.json`, JSON.stringify(d, null, 2), "application/json")} disabled={!d}><I n="dl" /> Export</Btn>
      <Btn onClick={test} disabled={!d}><I n="play" /> Dry run</Btn>
      <Btn onClick={save} disabled={!d || c.busy}>Save draft</Btn>
      <Btn kind="pri" disabled={!d?.id || d.status !== "Draft" || d.dirty || !c.data.viewer.educationAccess} onClick={() => d && c.post({ action: "approve", id: d.id }, "Autoflow approved")}><I n="check" /> Approve</Btn>
    </Head>
    {d ? <>
      <div className="hx-row"><input className="hx-inline" value={d.name} onChange={e => setDraft({ ...d, name: e.target.value, dirty: true })} aria-label="Flow name" /><input className="hx-inline" value={d.trigger} onChange={e => setDraft({ ...d, trigger: e.target.value, dirty: true })} aria-label="Trigger" placeholder="Trigger or intent" /><Pill t={d.status === "Approved" ? "g" : "a"}>{d.status}{d.version ? ` · v${d.version}` : ""}</Pill>{d.dirty && <Pill t="a">Unsaved changes</Pill>}</div>
      <div className="hx-flowwrap">
        <Card className="hx-palette"><small className="hx-eyebrow">Add node</small>{NODE_TYPES.map(([t, k, l]) => <button key={t} className="hx-btn sm" onClick={() => { const n = { id: `n${Date.now().toString(36)}`, type: t, title: l, desc: "Configure", x: 60 + (d.nodes.length % 5) * 220, y: 440 }; setNodes([...d.nodes, n]); setSel(n.id); }}><span className={`hx-dot ${k}`} />{l}</button>)}
          <small className="hx-eyebrow">New from template</small>{Object.keys(TEMPLATES).map(t => <button key={t} className="hx-btn sm ghost" onClick={() => fromTemplate(t)}><I n="plus" s={12} /> {t}</button>)}</Card>
        <div className="hx-col">
          {dev ? <pre className="hx-code">{JSON.stringify({ name: d.name, trigger: d.trigger, version: d.version, nodes: d.nodes.map(({ id, type, title, desc }: Row) => ({ id, type, title, config: desc })), edges: d.edges.map((e: string[]) => ({ from: e[0], to: e[1] })), plan: planFlow(d.nodes.filter((n: Row) => n.type !== "trigger").map((n: Row) => `${n.title} ${n.desc}`)) }, null, 2)}</pre> :
            <div className="hx-canvas" onPointerMove={e => { const g = drag.current; if (!g) return; const dx = e.clientX - g.sx, dy = e.clientY - g.sy; if (Math.abs(dx) + Math.abs(dy) > 3) g.moved = true; setNodes(d.nodes.map((n: Row) => n.id === g.id ? { ...n, x: Math.max(0, g.ox + dx), y: Math.max(0, g.oy + dy) } : n)); }} onPointerUp={() => { const g = drag.current; drag.current = null; if (g && !g.moved) { if (link && link !== g.id) { if (!d.edges.some((e: string[]) => e[0] === link && e[1] === g.id)) setDraft({ ...d, edges: [...d.edges, [link, g.id]], dirty: true }); setLink(""); } else setSel(g.id); } }}>
              <div className="hx-inner" style={{ width: W, height: H }}>
                <svg className="hx-edges" width={W} height={H}>{d.edges.map((e: string[], i: number) => { const A = d.nodes.find((n: Row) => n.id === e[0]), B = d.nodes.find((n: Row) => n.id === e[1]); if (!A || !B) return null; const x1 = A.x + 190, y1 = A.y + 30, x2 = B.x, y2 = B.y + 30, dx = Math.max(40, (x2 - x1) / 2); return <g key={i}><path d={`M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`} /><circle cx={x2} cy={y2} r={3} /></g>; })}</svg>
                {d.nodes.map((n: Row) => <div key={n.id} className={`hx-node ${kindOf(n.type)}${sel === n.id ? " sel" : ""}${running === n.id ? " run" : ""}${link === n.id ? " link" : ""}`} style={{ left: n.x, top: n.y }} onPointerDown={e => { if ((e.target as HTMLElement).dataset.port) return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { id: n.id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moved: false }; }}>
                  <span className="port in" /><b><span className={`hx-dot ${kindOf(n.type)}`} />{n.title}</b><small>{n.desc}</small><span className="port" data-port="1" role="button" aria-label={`Connect from ${n.title}`} onClick={() => { setLink(n.id); c.toast("Now click the node to connect to"); }} /></div>)}
              </div></div>}
          <div className="hx-grid g2">
            <Card title="Inspector">{node ? <div className="hx-col"><label className="hx-f">Title<input value={node.title} onChange={e => setNodes(d.nodes.map((n: Row) => n.id === node.id ? { ...n, title: e.target.value } : n))} /></label><label className="hx-f">Configuration<input value={node.desc} onChange={e => setNodes(d.nodes.map((n: Row) => n.id === node.id ? { ...n, desc: e.target.value } : n))} /></label><div className="hx-row"><Pill t={kindOf(node.type) === "ag" ? "v" : kindOf(node.type) === "hm" ? "a" : "t"}>{kindOf(node.type) === "ag" ? "Agentic" : kindOf(node.type) === "hm" ? "Human-in-the-loop" : "Rule-based"}</Pill><Btn kind="sm danger" onClick={() => { setDraft({ ...d, nodes: d.nodes.filter((n: Row) => n.id !== node.id), edges: d.edges.filter((e: string[]) => e[0] !== node.id && e[1] !== node.id), dirty: true }); setSel(""); }}>Delete node</Btn></div></div> : <p className="hx-muted">Select a node to edit it.</p>}</Card>
            <Card title="Dry-run console" actions={<select value={scenario} onChange={e => setScenario(e.target.value)} aria-label="Test scenario"><option>Verified customer</option><option>Fails verification</option><option>Outside policy</option></select>}><pre className="hx-code small">{log || "Run a dry run to walk the flow. Nothing is changed."}</pre></Card>
          </div>
        </div>
      </div></> : <Card wide><Empty>No Autoflows yet. Start from a template on the left.</Empty><div className="hx-row">{Object.keys(TEMPLATES).map(t => <Btn key={t} onClick={() => fromTemplate(t)}><I n="plus" /> {t}</Btn>)}</div></Card>}
  </>;
}

/* ================= Knowledge ================= */
export function Knowledge({ c }: ModuleProps) {
  const [tab, setTab] = useState("Gaps"), [edit, setEdit] = useState<Row>({ title: "", content: "", domain: "Admissions", source: "" }), [q, setQ] = useState(""), [drafting, setDrafting] = useState("");
  const knowledge = c.kind("knowledge");
  const gaps = useMemo(() => { const m: Record<string, { intent: string; qs: string[] }> = {}; const evs = c.data.events; evs.filter(e => e.type === "ticket.triaged" && e.details?.knowledgeGap).forEach(e => { const intent = e.details?.intent || "General support"; const msg = evs.find(x => x.sessionId === e.sessionId && (x.type === "message.received" || x.type === "transcript.received"))?.details?.text; m[intent] = m[intent] || { intent, qs: [] }; if (msg && !m[intent].qs.includes(msg)) m[intent].qs.push(msg); }); return Object.values(m).sort((a, b) => b.qs.length - a.qs.length); }, [c.data.events]);
  const draftGap = async (g: { intent: string; qs: string[] }) => { setDrafting(g.intent); const r = await c.ai("article", `Topic: ${g.intent}\nQuestions:\n${g.qs.slice(0, 8).join("\n")}`); setDrafting(""); const j = r?.json || { title: `Guidance: ${g.intent}`, content: `Customers ask: ${g.qs[0] || g.intent}. [confirm: the approved answer, steps and owner from the responsible team]` }; setEdit({ title: String(j.title), content: String(j.content), domain: g.intent.startsWith("Admissions") ? "Admissions" : g.intent.startsWith("Billing") ? "Finance" : g.intent.startsWith("Technical") ? "Technical" : "Support", source: "Drafted from knowledge gap · confirm before approval", gapIntent: g.intent }); setTab("Editor"); };
  const results = q.trim() ? retrieveGuidance(q, knowledge as any) : [];
  return <>
    <Head title="Knowledge" sub="Approved guidance is the only thing agents answer from. Drafts stay out of retrieval until an administrator approves them."><Btn kind="pri" onClick={() => { setEdit({ title: "", content: "", domain: "Admissions", source: "" }); setTab("Editor"); }}><I n="plus" /> New article</Btn></Head>
    <Seg value={tab} options={["Gaps", "Articles", "Editor", "Test retrieval"]} onChange={setTab} />
    <div className="hx-gap" />
    {tab === "Gaps" && <div className="hx-grid g2">{gaps.map(g => <Card key={g.intent} title={g.intent} actions={<Pill t="r">{g.qs.length} unanswered</Pill>}>{g.qs.slice(0, 4).map((x, i) => <p key={i} className="small">“{x}”</p>)}<Btn kind="vio sm" onClick={() => draftGap(g)} disabled={c.busy}><I n="spark" /> {drafting === g.intent ? "Drafting…" : "Draft an article"}</Btn></Card>)}{!gaps.length && <Card wide><Empty>No knowledge gaps recorded. Gaps appear when a message finds no approved guidance.</Empty></Card>}</div>}
    {tab === "Articles" && <Card wide><div className="hx-tbl"><table><thead><tr><th>Article</th><th>Domain</th><th>Source</th><th>Status</th><th /></tr></thead><tbody>{knowledge.map(k => <tr key={k.id}><td><b>{k.title}</b><small>{String(k.content).slice(0, 110)}…</small></td><td>{k.domain}</td><td><small>{k.source || "—"}</small></td><td><Pill t={k.status === "Approved" ? "g" : "a"}>{k.status} · v{k.version}</Pill>{k.sample && <Pill>Sample</Pill>}</td><td><div className="hx-row nowrap"><Btn kind="sm" onClick={() => { setEdit(k); setTab("Editor"); }}>Edit</Btn>{k.status === "Draft" && <Btn kind="sm pri" disabled={!c.data.viewer.educationAccess} onClick={() => c.post({ action: "approve", id: k.id }, "Article approved")}>Approve</Btn>}</div></td></tr>)}</tbody></table>{!knowledge.length && <Empty>No articles yet.</Empty>}</div></Card>}
    {tab === "Editor" && <Card wide title={edit.id ? "Edit article · saving returns it to Draft" : "New article"}><div className="hx-grid g2"><label className="hx-f">Title<input value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} /></label><label className="hx-f">Source or policy reference<input value={edit.source} onChange={e => setEdit({ ...edit, source: e.target.value })} /></label></div><label className="hx-f">Domain<select value={edit.domain} onChange={e => setEdit({ ...edit, domain: e.target.value })}>{["Admissions", "Support", "Technical", "Finance"].map(o => <option key={o}>{o}</option>)}</select></label><label className="hx-f">Verified answer, process and escalation rules<textarea className="tall" value={edit.content} onChange={e => setEdit({ ...edit, content: e.target.value })} /></label><div className="hx-row"><Btn kind="pri" disabled={c.busy} onClick={async () => { if (await c.post({ action: "save", kind: "knowledge", id: edit.id, data: edit }, "Saved as a draft for approval")) setTab("Articles"); }}>Save draft</Btn>{edit.id && edit.status === "Draft" && <Btn kind="ghost danger" onClick={async () => { if (await c.post({ action: "delete", id: edit.id }, "Draft deleted")) setTab("Articles"); }}>Delete draft</Btn>}</div></Card>}
    {tab === "Test retrieval" && <Card wide><input value={q} onChange={e => setQ(e.target.value)} placeholder="Ask what a customer would ask" aria-label="Retrieval test" />{results.map(r => <div className="hx-guide" key={r.id}><b>{r.title}</b><small>{r.source} · score {r.score}</small><p>{r.excerpt}</p></div>)}{q && !results.length && <Empty>No approved article matches. This would be logged as a knowledge gap.</Empty>}</Card>}
  </>;
}
