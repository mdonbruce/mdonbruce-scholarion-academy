"use client";
import type { ReactNode } from "react";
import { toMs } from "@/lib/cx-intelligence";

export type Row = Record<string, any>;
export type Data = { records: Row[]; events: Row[]; connections: Record<string, string>; viewer: Row; ai: Row; lms: Row; settings: Row; app: Row; pack: Row; apps: Row[] };
export type Ctx = {
  data: Data;
  kind: (k: string) => Row[];
  post: (body: Row, success?: string) => Promise<Row | null>;
  ai: (task: string, input: unknown, extra?: Row) => Promise<{ text: string; json?: any } | null>;
  go: (module: string) => void;
  toast: (msg: string, err?: boolean) => void;
  busy: boolean;
  student: string;
  setStudent: (id: string) => void;
  session: string;
  setSession: (id: string) => void;
};
export type ModuleProps = { c: Ctx };

const P: Record<string, string> = {
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z",
  mic: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  tag: "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  wand: "M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5",
  flow: "M3 3h6v6H3zM15 15h6v6h-6zM9 6h4a2 2 0 0 1 2 2v7",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5",
  bulb: "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z",
  route: "M6 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15",
  mega: "M3 11v2a1 1 0 0 0 1 1h3l6 5V5L7 10H4a1 1 0 0 0-1 1zM17 8a5 5 0 0 1 0 8",
  chart: "M3 3v18h18M7 15l4-4 3 3 6-6",
  grad: "M22 10 12 5 2 10l10 5zM6 12v5c3 2 9 2 12 0v-5",
  board: "M3 4h18v12H3zM8 20h8M12 16v4",
  clip: "M8 2h8v4H8zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4",
  id: "M3 4h18v16H3zM9 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM15 9h3M15 13h3M6 16h6",
  dollar: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  net: "M12 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM5 16.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM19 16.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM12 7.5v4M12 11.5 6.5 17M12 11.5l5.5 5.5",
  cloud: "M17.5 19H7a5 5 0 1 1 1.4-9.8A6 6 0 0 1 20 12a3.5 3.5 0 0 1-2.5 7z",
  plug: "M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4",
  spark: "M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8z",
  play: "M6 4l14 8-14 8z", stop: "M6 6h12v12H6z", send: "M22 2 11 13M22 2l-7 20-4-9-9-4z", x: "M18 6 6 18M6 6l12 12", plus: "M12 5v14M5 12h14", check: "M5 12l5 5L20 7",
  dl: "M12 3v12M7 10l5 5 5-5M5 21h14", refresh: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5", lock: "M4 11h16v10H4zM8 11V7a4 4 0 0 1 8 0v4", sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z", bot: "M4 8h16v12H4zM12 4v4M9 13h.01M15 13h.01M9 17h6", brain: "M12 5a3 3 0 0 0-5.9.8A3 3 0 0 0 4 11a3 3 0 0 0 2 5.5A3 3 0 0 0 12 19zM12 5a3 3 0 0 1 5.9.8A3 3 0 0 1 20 11a3 3 0 0 1-2 5.5A3 3 0 0 1 12 19z",
  tool: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z", phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z",
  back: "M15 18l-6-6 6-6", fwd: "M9 18l6-6-6-6", screen: "M5 2h14v20H5zM11 18h2",
};
export const I = ({ n, s = 16 }: { n: string; s?: number }) => <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[n] || ""} /></svg>;

export const ago = (t: unknown) => { const ms = toMs(t); if (!ms) return "—"; const s = Math.max(1, Math.round((Date.now() - ms) / 1000)); if (s < 60) return `${s}s ago`; const m = Math.round(s / 60); if (m < 60) return `${m}m ago`; const h = Math.round(m / 60); return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`; };
export const when = (t: unknown) => { const ms = toMs(t); return ms ? new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"; };
export const pct = (v: number | null | undefined) => v === null || v === undefined ? "—" : `${v}%`;
export const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
export const initials = (n: string) => String(n || "?").split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
const GRADS = ["#2ad5b1,#1a8fc7", "#a855f7,#e04fd0", "#f2b33d,#e0602f", "#4aa8ff,#6d5ae6", "#4ade80,#12a0a6", "#e04fd0,#f2b33d"];
export const Av = ({ name, lg }: { name: string; lg?: boolean }) => { const h = [...String(name)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7); return <span className={`hx-av${lg ? " lg" : ""}`} style={{ background: `linear-gradient(135deg,${GRADS[h % GRADS.length]})` }}>{initials(name)}</span>; };
export const Pill = ({ t = "", children }: { t?: string; children: ReactNode }) => <span className={`hx-pill ${t}`}>{children}</span>;
export const Card = ({ title, actions, children, wide, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; wide?: boolean; className?: string }) => <article className={`hx-card${wide ? " wide" : ""} ${className}`}>{(title || actions) && <div className="hx-chd">{title && <h3>{title}</h3>}{actions && <div className="hx-row">{actions}</div>}</div>}{children}</article>;
export const Kpi = ({ label, value, note, tone = "" }: { label: string; value: ReactNode; note?: ReactNode; tone?: string }) => <article className={`hx-card hx-kpi ${tone}`}><small>{label}</small><strong>{value}</strong>{note && <span>{note}</span>}</article>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="hx-empty">{children}</div>;
export const Head = ({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) => <div className="hx-head"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>{children && <div className="hx-row">{children}</div>}</div>;
export const Btn = ({ onClick, children, kind = "", disabled, title, type = "button" }: { onClick?: () => void; children: ReactNode; kind?: string; disabled?: boolean; title?: string; type?: "button" | "submit" }) => <button type={type} className={`hx-btn ${kind}`} onClick={onClick} disabled={disabled} title={title}>{children}</button>;
export const Seg = ({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) => <div className="hx-seg" role="tablist">{options.map(o => <button key={o} role="tab" aria-selected={value === o} className={value === o ? "on" : ""} onClick={() => onChange(o)}>{o}</button>)}</div>;
export const Toggle = ({ on, onChange, label, disabled }: { on: boolean; onChange: () => void; label: string; disabled?: boolean }) => <button className={`hx-sw${on ? " on" : ""}`} onClick={onChange} aria-pressed={on} aria-label={label} disabled={disabled} />;

export function downloadFile(name: string, content: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const toCSV = (rows: unknown[][]) => rows.map(r => r.map(v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\n");

/* ---------- charts: one scale per chart, theme colors from CSS variables ---------- */
export const PAL = ["#2ad5b1", "#a855f7", "#4aa8ff", "#f2b33d", "#e04fd0", "#4ade80", "#ff5f6d", "#6d5ae6"];
const nice = (v: number) => { if (v <= 0) return 4; if (v <= 8) return 4 * Math.ceil(v / 4); const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
export function Bars({ labels, series, h = 190, stacked = false, fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1)) }: { labels: string[]; series: { name: string; values: number[]; color: string }[]; h?: number; stacked?: boolean; fmt?: (v: number) => string }) {
  const W = 560, L = 36, B = 24, T = 10, R = 8, iw = W - L - R, ih = h - T - B;
  const tot = labels.map((_, i) => stacked ? series.reduce((a, s) => a + (s.values[i] || 0), 0) : Math.max(0, ...series.map(s => s.values[i] || 0)));
  const mx = nice(Math.max(1, ...tot)), bw = iw / Math.max(1, labels.length);
  return <svg className="hx-chart" viewBox={`0 0 ${W} ${h}`} role="img" aria-label={series.map(s => s.name).join(", ")}>
    {[0, 1, 2, 3, 4].map(k => { const y = T + ih - ih * k / 4; return <g key={k}><line x1={L} x2={W - R} y1={y} y2={y} className="grid" /><text x={L - 6} y={y + 3} textAnchor="end">{fmt(mx * k / 4)}</text></g>; })}
    {labels.map((lb, i) => { let acc = 0; const gw = stacked ? bw * .6 : bw * .72 / Math.max(1, series.length); return <g key={i}>{series.map((s, j) => { const v = s.values[i] || 0, hh = ih * v / mx, x = L + i * bw + (stacked ? bw * .2 : bw * .14 + j * gw), y = T + ih - hh - (stacked ? ih * acc / mx : 0); if (stacked) acc += v; return <rect key={j} x={x} y={y} width={Math.max(1, gw - 2)} height={Math.max(0, hh)} rx={3} fill={s.color}><title>{`${s.name} · ${lb}: ${fmt(v)}`}</title></rect>; })}<text x={L + i * bw + bw / 2} y={h - 7} textAnchor="middle">{lb}</text></g>; })}
  </svg>;
}
export function Line({ labels, series, h = 190, fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1)), min0 = true }: { labels: string[]; series: { name: string; values: number[]; color: string; dash?: boolean; fill?: boolean }[]; h?: number; fmt?: (v: number) => string; min0?: boolean }) {
  const W = 560, L = 40, B = 24, T = 12, R = 12, iw = W - L - R, ih = h - T - B, all = series.flatMap(s => s.values);
  const mx = nice(Math.max(1, ...all)), mn = min0 ? 0 : Math.floor(Math.min(...all)), X = (i: number) => L + i * iw / Math.max(1, labels.length - 1), Y = (v: number) => T + ih - (v - mn) / Math.max(1e-9, mx - mn) * ih;
  return <svg className="hx-chart" viewBox={`0 0 ${W} ${h}`} role="img" aria-label={series.map(s => s.name).join(", ")}>
    {[0, 1, 2, 3, 4].map(k => { const v = mn + (mx - mn) * k / 4; return <g key={k}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} className="grid" /><text x={L - 6} y={Y(v) + 3} textAnchor="end">{fmt(v)}</text></g>; })}
    {labels.map((lb, i) => <text key={i} x={X(i)} y={h - 7} textAnchor="middle">{lb}</text>)}
    {series.map((s, k) => { const d = s.values.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" "), li = s.values.length - 1; return <g key={k}>{s.fill && <path d={`${d} L${X(li)} ${T + ih} L${L} ${T + ih}Z`} fill={s.color} opacity={.12} />}<path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dash ? "5 4" : undefined} />{li >= 0 && <circle cx={X(li)} cy={Y(s.values[li])} r={3.5} fill={s.color} />}</g>; })}
  </svg>;
}
export function Donut({ parts, size = 140, label = "", sub = "" }: { parts: { label: string; value: number; color: string }[]; size?: number; label?: ReactNode; sub?: string }) {
  const tot = parts.reduce((a, p) => a + p.value, 0) || 1, r = size / 2 - 12, c = size / 2, C = 2 * Math.PI * r; let off = 0;
  return <svg className="hx-chart" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={parts.map(p => `${p.label} ${p.value}`).join(", ")}><circle cx={c} cy={c} r={r} fill="none" className="track" strokeWidth={16} />
    {parts.map((p, i) => { const len = C * p.value / tot, el = <circle key={i} cx={c} cy={c} r={r} fill="none" stroke={p.color} strokeWidth={16} strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-off} transform={`rotate(-90 ${c} ${c})`}><title>{`${p.label}: ${p.value}`}</title></circle>; off += len; return el; })}
    <text x={c} y={c + 3} textAnchor="middle" className="big">{label}</text><text x={c} y={c + 20} textAnchor="middle">{sub}</text></svg>;
}
export const Spark = ({ values, color = "#2ad5b1", w = 110, h = 32 }: { values: number[]; color?: string; w?: number; h?: number }) => {
  if (values.length < 2) return null; const mx = Math.max(...values), mn = Math.min(...values), r = mx - mn || 1;
  const pts = values.map((v, i) => [i / (values.length - 1) * (w - 4) + 2, h - 3 - (v - mn) / r * (h - 8)]); const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" "), last = pts[pts.length - 1];
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><path d={`${d} L${w - 2} ${h} L2 ${h}Z`} fill={color} opacity={.12} /><path d={d} fill="none" stroke={color} strokeWidth={1.8} /><circle cx={last[0]} cy={last[1]} r={2.6} fill={color} /></svg>;
};
export const Ring = ({ value, color = "#2ad5b1", size = 64, label }: { value: number | null; color?: string; size?: number; label?: string }) => { const r = size / 2 - 6, C = 2 * Math.PI * r; return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="hx-chart" role="img" aria-label={label || `${value ?? "—"}%`}><circle cx={size / 2} cy={size / 2} r={r} fill="none" className="track" strokeWidth={6} /><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${C * (value || 0) / 100} ${C}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} /><text x={size / 2} y={size / 2 + 4} textAnchor="middle" className="mid">{value === null ? "—" : `${value}%`}</text></svg>; };
export const Legend = ({ items }: { items: { name: string; color: string }[] }) => <div className="hx-legend">{items.map(i => <span key={i.name}><i style={{ background: i.color }} />{i.name}</span>)}</div>;
