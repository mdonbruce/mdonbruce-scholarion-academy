"use client";
import { useEffect, useState } from "react";
import { I, Pill, Card, Empty, Head, Btn, Bars, PAL, pct, ago, type Row } from "./ui";

export type AppsProps = { apps: Row[]; platformAdmin: boolean; current: string; switchApp: (slug: string) => void; reload: () => Promise<void>; toast: (m: string, err?: boolean) => void };
const PACK_OPTS: [string, string][] = [["standard", "Standard"], ["hospitality", "Hospitality"], ["education", "Education · student records"], ["health", "Health · PHI"], ["finance", "Finance · trading"]];
const tone = (s: string) => s === "Live" ? "g" : s === "Pilot" ? "b" : s === "Archived" ? "" : "a";

/* ================= Portfolio: every Haven product in one view ================= */
export function Portfolio({ apps, switchApp }: AppsProps) {
  const [rows, setRows] = useState<Row[] | null>(null), [err, setErr] = useState("");
  const load = async () => { try { const r = await fetch("/api/agentic-ai?scope=portfolio", { cache: "no-store" }); const j = await r.json(); if (!r.ok) throw new Error(j.error || "Portfolio unavailable"); setRows(j.apps || []); setErr(""); } catch (e: any) { setErr(e.message); } };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const ok = (rows || []).filter(r => r.kpis), active = ok.filter(r => r.kpis.open + r.kpis.resolved > 0);
  const sum = (k: string) => ok.reduce((a, r) => a + (r.kpis?.[k] || 0), 0);
  return <>
    <Head title="Haven Portfolio" sub="Every Haven Digital Systems product you can enter, side by side. Each figure comes from that product's own room; nothing is pooled across rooms except these totals."><Btn onClick={load}><I n="refresh" /> Refresh</Btn></Head>
    {err && <div className="hx-note r">{err}</div>}
    <div className="hx-kpis"><article className="hx-card hx-kpi"><small>Products you can enter</small><strong>{apps.filter(a => a.canEnter !== false).length}</strong><span>{apps.length} registered</span></article><article className="hx-card hx-kpi t"><small>Open sessions</small><strong>{sum("open")}</strong><span>across rooms</span></article><article className="hx-card hx-kpi v"><small>Resolved</small><strong>{sum("resolved")}</strong><span>across rooms</span></article><article className="hx-card hx-kpi r"><small>Human handoffs</small><strong>{sum("handoffs")}</strong><span>across rooms</span></article></div>
    {active.length > 0 && <Card title="Sessions by product" actions={<small>Rooms with activity</small>}><Bars labels={active.map(r => r.name.length > 12 ? r.name.slice(0, 11) + "…" : r.name)} series={[{ name: "Open", values: active.map(r => r.kpis.open), color: PAL[0] }, { name: "Resolved", values: active.map(r => r.kpis.resolved), color: PAL[1] }]} h={170} /></Card>}
    <div className="hx-roomgrid">{(rows || apps).map(r => { const a = apps.find(x => x.slug === r.slug) || r; return <div className="hx-room" key={r.slug} style={{ borderTopColor: a.color }}>
      <div className="hx-row between"><b>{a.name}</b><Pill t={tone(a.status)}>{a.status}</Pill></div><small>{a.category}</small>
      {r.kpis ? <div className="hx-grid g3 tight"><div className="hx-mini"><small>Open</small><b>{r.kpis.open}</b></div><div className="hx-mini"><small>FCR</small><b>{pct(r.kpis.fcr)}</b></div><div className="hx-mini"><small>CSAT</small><b>{pct(r.kpis.csat)}</b></div></div> : r.error ? <p className="hx-muted small">{r.error}</p> : !rows ? <p className="hx-muted small">Loading…</p> : <p className="hx-muted small">You're not a member of this room.</p>}
      <div className="hx-row between"><small>{r.lastActivity ? `Last activity ${ago(r.lastActivity)}` : "No activity yet"}</small>{r.kpis && <Btn kind="sm" onClick={() => switchApp(r.slug)}>Enter room</Btn>}</div></div>; })}</div>
    {!apps.length && <Empty>No products registered.</Empty>}
  </>;
}

/* ================= Apps & Rooms: registry of products ================= */
export function AppsRooms({ apps, platformAdmin, current, switchApp, reload, toast }: AppsProps) {
  const blank: Row = { name: "", category: "", description: "", pack: "standard", isolation: "shared", education: false, color: "#91a3aa", status: "Planned", members: [] };
  const [edit, setEdit] = useState<Row | null>(null), [busy, setBusy] = useState(false);
  const save = async () => {
    if (!edit) return; setBusy(true);
    try { const r = await fetch("/api/agentic-ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "app.save", data: { ...edit, members: typeof edit.members === "string" ? edit.members.split(/[\s,]+/).filter(Boolean) : edit.members } }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || "Could not save"); toast(j.result || "Saved"); setEdit(null); await reload(); }
    catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  };
  return <>
    <Head title="Apps & Rooms" sub="Each Haven product has its own room: its own agents, knowledge, routing, campaigns, alerts and audit log. Add a product here when it's ready for the Agentic AI.">{platformAdmin && !edit && <Btn kind="pri" onClick={() => setEdit(blank)}><I n="plus" /> Add product</Btn>}</Head>
    {edit && <Card wide title={edit.slug ? `Edit ${edit.name}` : "Add a product"}>
      <div className="hx-grid g3">
        <label className="hx-f">Product name<input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} disabled={Boolean(edit.slug)} placeholder="e.g. HomePilot" /></label>
        <label className="hx-f">Category<input value={edit.category} onChange={e => setEdit({ ...edit, category: e.target.value })} placeholder="e.g. Property · smart home" /></label>
        <label className="hx-f">Status<select value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value })}>{["Live", "Pilot", "Planned", "Archived"].map(o => <option key={o}>{o}</option>)}</select></label>
        <label className="hx-f">Guardrail pack<select value={edit.pack} onChange={e => setEdit({ ...edit, pack: e.target.value })}>{PACK_OPTS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label className="hx-f">Data storage<select value={edit.isolation} onChange={e => setEdit({ ...edit, isolation: e.target.value })}><option value="shared">Shared database, separated by room</option><option value="dedicated">Dedicated database</option></select></label>
        <label className="hx-f">Color<input type="color" value={edit.color} onChange={e => setEdit({ ...edit, color: e.target.value })} /></label>
      </div>
      <label className="hx-f">Description<input value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} /></label>
      <label className="hx-f">Members (emails or @domains, comma separated)<input value={Array.isArray(edit.members) ? edit.members.join(", ") : edit.members} onChange={e => setEdit({ ...edit, members: e.target.value })} placeholder="ops@oakhavensuites.com, @scholarisglobal.com" /></label>
      <label className="hx-li check"><input type="checkbox" checked={Boolean(edit.education)} onChange={e => setEdit({ ...edit, education: e.target.checked })} /> Show the Education modules (Student 360, Classroom, Admissions, Faculty)</label>
      {edit.education && <label className="hx-f">Scholaris tenant for grade sync<input value={edit.scholarisTenant || ""} onChange={e => setEdit({ ...edit, scholarisTenant: e.target.value })} placeholder="e.g. oakhaven-global-university" /></label>}
      <div className="hx-row"><Btn kind="pri" onClick={save} disabled={busy || !String(edit.name).trim()}>Save product</Btn><Btn kind="ghost" onClick={() => setEdit(null)}>Cancel</Btn></div>
    </Card>}
    <div className="hx-roomgrid">{apps.map(a => <div className={`hx-room${a.slug === current ? " on" : ""}`} key={a.slug} style={{ borderTopColor: a.color }}>
      <div className="hx-row between"><b>{a.name}</b><Pill t={tone(a.status)}>{a.status}</Pill></div>
      <small>{a.category}</small><p className="small">{a.description || "No description yet."}</p>
      <div className="hx-list small">
        <div className="hx-li"><span className="hx-grow">Guardrails</span><b>{a.packLabel || a.pack}</b></div>
        <div className="hx-li"><span className="hx-grow">Storage</span>{a.isolation === "dedicated" ? a.databaseBound ? <Pill t="g">Dedicated · bound</Pill> : <Pill t="a">Needs {a.databaseBinding}</Pill> : <Pill>Shared</Pill>}</div>
        <div className="hx-li"><span className="hx-grow">Inbound API</span>{a.inboundConfigured ? <Pill t="g">Enabled</Pill> : <span title={`Set ${a.inboundSecret}`}><Pill>Not enabled</Pill></span>}</div>
        <div className="hx-li"><span className="hx-grow">Members</span><b>{a.slug === "oak-haven" && !(a.members || []).length ? "All Oak Haven staff" : (a.members || []).length || "Admins only"}</b></div>
      </div>
      <div className="hx-row">{a.canEnter !== false && <Btn kind={a.slug === current ? "" : "pri"} onClick={() => switchApp(a.slug)} disabled={a.slug === current}>{a.slug === current ? "You're here" : "Enter room"}</Btn>}{platformAdmin && <Btn kind="sm" onClick={() => setEdit({ ...a })}>Edit</Btn>}</div>
    </div>)}</div>
    <Card title="Connecting a product"><div className="hx-list small">
      <div className="hx-li">1 · Add the product here and choose its guardrail pack and storage.</div>
      <div className="hx-li">2 · For dedicated storage, create a D1 database, bind it as the name shown above, and apply the migrations in drizzle/.</div>
      <div className="hx-li">3 · Set the room's inbound secret (HAVEN_INBOUND_SECRET_ plus the product name) and have the product's backend post signed messages to /api/agentic-ai/inbound. See MULTI_APP.md.</div>
      <div className="hx-li">4 · Add members, then load sample data inside the room to rehearse before going live.</div></div></Card>
  </>;
}
