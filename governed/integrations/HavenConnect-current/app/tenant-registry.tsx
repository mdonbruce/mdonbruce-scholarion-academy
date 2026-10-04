"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, CloudCog, Download, Fingerprint, KeyRound, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { environments, isolationModes, type TenantConfig } from "@/lib/tenant-registry";
import "./tenant-registry.css";

type Row = Record<string, any>;
type Inventory = { viewer: Row; tenants: Row[]; changes: Row[]; validations: Row[]; audits: Row[]; outbox: Row[]; alerts: Row[] };
const empty: TenantConfig = { slug: "", name: "", environment: "Development", customDomain: "", primaryRegion: "", isolationMode: "", identityRealm: "", secretRef: "", kmsRef: "" };
const tabs = [
  ["health", "Health"], ["metadata", "Metadata"], ["domain", "Domain validation"],
  ["isolation", "Isolation & region"], ["identity", "Identity realm"], ["encryption", "Encryption refs"],
  ["governance", "Governance"], ["evidence", "Audit & evidence"],
];
const formatTime = (value: string) => value ? new Date(value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`).toLocaleString() : "—";

export function TenantRegistry() {
  const [data, setData] = useState<Inventory | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<TenantConfig>(empty);
  const [newTenant, setNewTenant] = useState<TenantConfig>(empty);
  const [reason, setReason] = useState("");
  const [tab, setTab] = useState("health");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const load = async () => {
    try {
      const response = await fetch("/api/tenant-registry", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Registry unavailable");
      setData(result); setError("");
    } catch (e: any) { setError(e.message); }
  };
  useEffect(() => { load(); const id = window.setInterval(load, 8000); return () => window.clearInterval(id); }, []);
  useEffect(() => { if (data?.tenants.length && !selectedId) choose(data.tenants[0].id, data.tenants); }, [data, selectedId]);
  const choose = (id: string, tenants = data?.tenants || []) => {
    const tenant = tenants.find(t => t.id === id);
    setSelectedId(id); setAnalysis(""); setReason("");
    if (tenant) setForm(Object.fromEntries(Object.keys(empty).map(key => [key, tenant[key] || ""])) as TenantConfig);
  };
  const selected = data?.tenants.find(t => t.id === selectedId);
  const validations = data?.validations.filter(v => v.tenantId === selectedId) || [];
  const changes = data?.changes.filter(c => c.tenantId === selectedId) || [];
  const audits = data?.audits.filter(a => a.tenantId === selectedId) || [];
  const queue = data?.outbox.filter(o => o.tenantId === selectedId) || [];
  const metrics = useMemo(() => {
    const items = data?.tenants || [], total = items.length;
    const reviewed = (data?.changes || []).filter(c => c.reviewedAt);
    const approvalHours = reviewed.length ? Math.round(reviewed.reduce((sum, c) => sum + (Date.parse(`${c.reviewedAt.replace(" ", "T")}Z`) - Date.parse(`${c.createdAt.replace(" ", "T")}Z`)) / 3600000, 0) / reviewed.length * 10) / 10 : null;
    const checks = data?.validations || [];
    const validationSeconds = checks.length ? Math.round(checks.reduce((sum, c) => sum + c.durationMs, 0) / checks.length / 1000 * 10) / 10 : null;
    return [
      ["Tenants", total, "Across configured environments"],
      ["Domains verified", items.filter(t => t.domainStatus === "Verified").length, "DNS challenge passed"],
      ["Primary region", total ? `${Math.round(items.filter(t => t.primaryRegion).length / total * 100)}%` : "—", "Configuration coverage"],
      ["Isolation ready", total ? `${Math.round(items.filter(t => t.assessment.checks.isolation).length / total * 100)}%` : "—", "Mode selected"],
      ["Realm aligned", total ? `${Math.round(items.filter(t => t.assessment.checks.realm).length / total * 100)}%` : "—", "Slug match"],
      ["Reference integrity", total ? `${Math.round(items.filter(t => t.assessment.checks.encryption).length / total * 100)}%` : "—", "Syntax and presence only"],
      ["DNS check time", validationSeconds === null ? "—" : `${validationSeconds}s`, `${checks.length} recorded checks`],
      ["Change review time", approvalHours === null ? "—" : `${approvalHours}h`, `${reviewed.length} reviewed proposals`],
    ];
  }, [data]);
  const post = async (body: Row) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/tenant-registry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Action failed");
      setNotice(result.status || (body.action === "propose" ? `${result.classification} change submitted for review` : `${body.action} completed`));
      await load(); return result;
    } catch (e: any) { setError(e.message); return null; }
    finally { setBusy(false); }
  };
  const propose = async () => {
    if (!selected) return;
    const result = await post({ action: "propose", tenantId: selected.id, config: form, reason });
    if (result) setReason("");
  };
  const create = async () => {
    const result = await post({ action: "create", config: newTenant });
    if (result) { setNewTenant(empty); setSelectedId(""); setTab("metadata"); await load(); }
  };
  const patch = (key: keyof TenantConfig, value: string) => setForm(current => ({ ...current, [key]: value }));
  const exportEvidence = () => {
    if (!selected) return;
    const blob = new Blob([JSON.stringify({ tenant: selected, changes, validations, audits, queue, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = `${selected.slug}-${selected.environment.toLowerCase()}-evidence.json`; link.click(); URL.revokeObjectURL(url);
  };
  if (error && !data) return <div className="tr-blocked"><LockKeyhole/><h2>Protected Tenant Registry</h2><p>{error}</p><a href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in with an authorized administrator account</a><Button onClick={load}>Retry</Button></div>;
  if (!data) return <div className="tr-blocked"><RefreshCw/><p>Loading protected tenant records…</p></div>;
  return <section className="tr-shell" aria-label="Protected Tenant Registry">
    <header className="tr-header"><div><span className="tr-kicker"><ShieldCheck size={17}/> HAVENCONNECT · CONTROL PLANE</span><h2>Protected Tenant Registry</h2><p>Govern configuration, verify domains, and release only ready tenants to downstream systems.</p></div><div className="tr-header-actions"><span>{data.viewer.role} · {data.viewer.email}</span><Button variant="outline" onClick={load}><RefreshCw size={16}/> Refresh</Button></div></header>
    {error && <div className="tr-banner tr-error" role="alert">{error}<button onClick={() => setError("")}>Dismiss</button></div>}
    {notice && <div className="tr-banner" role="status">{notice}<button onClick={() => setNotice("")}>Dismiss</button></div>}
    <div className="tr-top"><div className="tr-tenant-pick"><label htmlFor="tenant-picker">Tenant and environment</label><Select value={selectedId} onValueChange={id => choose(id)}><SelectTrigger id="tenant-picker"><SelectValue placeholder="Select a tenant"/></SelectTrigger><SelectContent>{data.tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name} · {t.environment}</SelectItem>)}</SelectContent></Select></div>{selected && <span className={`tr-status ${selected.assessment.ready ? "ready" : "draft"}`}>{selected.status} · {selected.assessment.score}% health</span>}</div>
    <Tabs value={tab} onValueChange={setTab} className="tr-tabs"><TabsList variant="line" className="tr-tablist">{tabs.map(([value,label]) => <TabsTrigger value={value} key={value}>{label}</TabsTrigger>)}</TabsList>
      <TabsContent value="health"><div className="tr-metrics">{metrics.map(([label,value,detail]) => <article className="tr-card" key={label}><small>{label}</small><strong>{value}</strong><span>{detail}</span></article>)}</div><div className="tr-columns"><article className="tr-card"><h3>Tenant health</h3>{data.tenants.length ? data.tenants.map(t => <button className={`tr-tenant-row ${selectedId === t.id ? "active" : ""}`} key={t.id} onClick={() => choose(t.id)}><span><b>{t.name}</b><small>{t.environment} · {t.slug}</small></span><strong>{t.assessment.score}%</strong></button>) : <p>No tenants yet. Create the first record in Metadata.</p>}</article><article className="tr-card"><h3>Configuration intelligence</h3>{selected ? <><p>Readiness is calculated from domain, region, isolation, identity realm, and encryption reference checks.</p>{selected.assessment.recommendations.length ? <ul>{selected.assessment.recommendations.map((r: string) => <li key={r}>{r}</li>)}</ul> : <p className="tr-good"><CheckCircle2 size={16}/> All registry checks pass. Verify vault targets and downstream policy before activation.</p>}<div className="tr-actions"><Button onClick={() => { setTab("governance"); }} variant="outline">Review changes</Button><Button onClick={async () => { const result = await post({ action: "analyze", tenantId: selected.id }); if (result) setAnalysis(result.summary || "No analysis returned"); }} disabled={busy || !data.viewer.aiAvailable}>Generate AI review</Button></div>{!data.viewer.aiAvailable && <small>AI review requires the server-side model connection. Rule checks remain active.</small>}{analysis && <p className="tr-analysis">{analysis}</p>}</> : <p>Select a tenant to see recommendations.</p>}</article></div><article className="tr-card tr-alerts"><h3>Proactive alerts</h3>{data.alerts?.length ? data.alerts.map((alert, index) => <button key={`${alert.tenantId}-${index}`} onClick={() => { choose(alert.tenantId); setTab(alert.message.includes("region") ? "isolation" : alert.message.includes("realm") ? "identity" : alert.message.includes("Encryption") ? "encryption" : "domain"); }}><AlertTriangle size={17}/><span><b>{data.tenants.find(t => t.id === alert.tenantId)?.name}</b> · {alert.message}</span><em>{alert.severity}</em></button>) : <p>No configuration alerts. Checks refresh automatically.</p>}</article></TabsContent>
      <TabsContent value="metadata"><div className="tr-columns"><article className="tr-card"><h3>Create tenant record</h3><p>New records begin in Draft. Domains receive a unique DNS challenge and an automatic validation attempt.</p><Field label="Tenant name" value={newTenant.name} onChange={value => setNewTenant({ ...newTenant, name: value })}/><Field label="Slug" value={newTenant.slug} onChange={value => setNewTenant({ ...newTenant, slug: value })} placeholder="example-university"/><label className="tr-field">Environment<Pick value={newTenant.environment} options={environments} change={value => setNewTenant({ ...newTenant, environment: value })}/></label><Field label="Custom domain (optional)" value={newTenant.customDomain} onChange={value => setNewTenant({ ...newTenant, customDomain: value })} placeholder="support.example.edu"/><Button onClick={create} disabled={busy || !newTenant.name || !newTenant.slug}>Create draft</Button></article><article className="tr-card"><h3>Controlled metadata</h3>{selected ? <><p>{selected.slug} · {selected.environment} · version {selected.version}</p><Field label="Display name" value={form.name} onChange={value => patch("name", value)}/><p>Slug and environment are immutable registry keys. Submit edits with a reason; sensitive fields require review.</p><Proposal reason={reason} setReason={setReason} submit={propose} busy={busy}/></> : <p>Create a tenant to edit its metadata.</p>}</article></div></TabsContent>
      <TabsContent value="domain"><div className="tr-columns"><article className="tr-card"><h3>Domain validation</h3>{selected ? <><Field label="Custom domain" value={form.customDomain} onChange={value => patch("customDomain", value)} placeholder="support.example.edu"/><Proposal reason={reason} setReason={setReason} submit={propose} busy={busy}/><div className="tr-challenge"><small>Publish this DNS record for the approved domain</small><code>{selected.customDomain ? `_havenconnect.${selected.customDomain} TXT havenconnect-verify=${selected.domainToken}` : "Add and approve a domain to generate the challenge"}</code></div><p>Status: <b>{selected.domainStatus}</b>. A DNS challenge verifies control of the name; hosting and certificate activation are separate steps.</p><Button disabled={busy || !selected.customDomain} onClick={() => post({ action: "validate", tenantId: selected.id })}><CloudCog size={16}/> Validate domain now</Button></> : <p>Select a tenant.</p>}</article><article className="tr-card"><h3>Validation evidence</h3>{validations.length ? validations.map(v => <div className="tr-event" key={v.id}><b>{v.status}</b><span>{v.domain} · {formatTime(v.checkedAt)} · {v.durationMs} ms</span><small>{v.evidence?.query} · {v.evidence?.observedTxtCount ?? 0} TXT records observed</small></div>) : <p>No validation runs recorded.</p>}</article></div></TabsContent>
      <TabsContent value="isolation"><div className="tr-columns"><article className="tr-card"><h3>Isolation and region</h3>{selected ? <><Field label="Primary region" value={form.primaryRegion} onChange={value => patch("primaryRegion", value)} placeholder="us-east-1"/><label className="tr-field">Isolation mode<Pick value={form.isolationMode} options={isolationModes} change={value => patch("isolationMode", value)} placeholder="Choose isolation"/></label><Proposal reason={reason} setReason={setReason} submit={propose} busy={busy}/></> : <p>Select a tenant.</p>}</article><article className="tr-card"><h3>Readiness assessment</h3>{selected ? <><Check label="Primary region" passed={selected.assessment.checks.region} detail={selected.primaryRegion || "Missing"}/><Check label="Isolation policy" passed={selected.assessment.checks.isolation} detail={selected.isolationMode || "Missing"}/><p>These are metadata readiness checks. Physical database isolation is verified during downstream provisioning.</p></> : <p>Select a tenant.</p>}</article></div></TabsContent>
      <TabsContent value="identity"><div className="tr-columns"><article className="tr-card"><h3>Identity realm</h3>{selected ? <><Field label="Realm identifier" value={form.identityRealm} onChange={value => patch("identityRealm", value)} placeholder={`realm:${selected.slug}`}/><Proposal reason={reason} setReason={setReason} submit={propose} busy={busy}/></> : <p>Select a tenant.</p>}</article><article className="tr-card"><h3>Alignment and version</h3>{selected ? <><Check label="Realm matches tenant" passed={selected.assessment.checks.realm} detail={selected.identityRealm || "Missing"}/><p>Current registry version: {selected.version}. Identity provider binding and access-policy tests must be completed before activation.</p></> : <p>Select a tenant.</p>}</article></div></TabsContent>
      <TabsContent value="encryption"><div className="tr-columns"><article className="tr-card"><h3>Encryption references</h3>{selected ? <><Field label="Secret reference" value={form.secretRef} onChange={value => patch("secretRef", value)} placeholder="secret-ref://vault/team/tenant"/><Field label="KMS reference" value={form.kmsRef} onChange={value => patch("kmsRef", value)} placeholder="kms-ref://provider/key/tenant"/><p>Only opaque references are accepted. Never paste credentials or key material.</p><Proposal reason={reason} setReason={setReason} submit={propose} busy={busy}/></> : <p>Select a tenant.</p>}</article><article className="tr-card"><h3>Integrity check</h3>{selected ? <><Check label="Reference format" passed={selected.assessment.checks.encryption} detail="Both reference identifiers present"/><p>Registry validation checks format and presence. A connected vault and KMS adapter must verify existence, permissions, and rotation status.</p></> : <p>Select a tenant.</p>}</article></div></TabsContent>
      <TabsContent value="governance"><div className="tr-columns"><article className="tr-card"><h3>Change approvals</h3>{changes.length ? changes.map(change => <div className="tr-change" key={change.id}><div><b>{change.classification} · {change.status}</b><small>v{change.baseVersion} · {change.submittedBy} · {formatTime(change.createdAt)}</small><p>{change.reason}</p></div>{change.status === "Pending" && <div className="tr-actions"><Button disabled={busy || (selected?.environment === "Production" && change.submittedBy === data.viewer.email)} onClick={() => post({ action: "approve", tenantId: selectedId, changeId: change.id })}>Approve</Button><Button variant="outline" disabled={busy} onClick={() => post({ action: "reject", tenantId: selectedId, changeId: change.id, reason: "Declined during review" })}>Reject</Button></div>}</div>) : <p>No changes proposed for this tenant.</p>}<p>Production changes require a second authorized administrator.</p></article><article className="tr-card"><h3>Downstream release</h3>{selected ? <><p>Registry readiness: <b>{selected.assessment.ready ? "Ready" : "Incomplete"}</b>. The release queues a versioned event for a future provisioning adapter; it does not claim that resources were provisioned.</p><Button disabled={busy || !selected.assessment.ready || selected.status === "Ready for downstream"} onClick={() => post({ action: "queue", tenantId: selected.id })}>Queue for provisioning</Button>{queue.map(o => <div className="tr-event" key={o.id}><b>{o.eventType}</b><span>{o.status} · {formatTime(o.createdAt)}</span></div>)}</> : <p>Select a tenant.</p>}</article></div></TabsContent>
      <TabsContent value="evidence"><article className="tr-card"><div className="tr-section-head"><div><h3>Append only history</h3><p>Metadata decisions, domain checks, model reviews, and downstream releases.</p></div><Button variant="outline" onClick={exportEvidence} disabled={!selected}><Download size={16}/> Export evidence</Button></div>{audits.length ? <Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Action</TableHead><TableHead>Actor</TableHead><TableHead>Evidence</TableHead></TableRow></TableHeader><TableBody>{audits.map(a => <TableRow key={a.id}><TableCell>{formatTime(a.createdAt)}</TableCell><TableCell>{a.action}</TableCell><TableCell>{a.actor}</TableCell><TableCell><code>{JSON.stringify(a.details).slice(0, 180)}</code></TableCell></TableRow>)}</TableBody></Table> : <p>No audit events for this tenant.</p>}</article></TabsContent>
    </Tabs>
  </section>;
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) { return <label className="tr-field">{label}<Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}/></label>; }
function Pick({ value, options, change, placeholder }: { value: string; options: string[]; change: (v: string) => void; placeholder?: string }) { return <Select value={value || undefined} onValueChange={change}><SelectTrigger><SelectValue placeholder={placeholder || "Select"}/></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>; }
function Check({ label, passed, detail }: { label: string; passed: boolean; detail: string }) { return <div className="tr-check"><span>{passed ? <CheckCircle2 size={18}/> : <AlertTriangle size={18}/>}<b>{label}</b></span><small>{detail}</small></div>; }
function Proposal({ reason, setReason, submit, busy }: { reason: string; setReason: (v: string) => void; submit: () => void; busy: boolean }) { return <div className="tr-proposal"><Field label="Reason for change" value={reason} onChange={setReason} placeholder="What changed and why?"/><Button onClick={submit} disabled={busy || !reason.trim()}>Submit governed change</Button></div>; }
