import type { CapabilityStatus, Product } from "@/platform/types";
import { Icon } from "./icons";

export const TYPE_LABEL: Record<string, string> = {
  course: "Course",
  guided_project: "Guided Project",
  specialization: "Specialization",
  professional_certificate: "Professional Certificate",
  live_program: "Live Program",
  bundle: "Pathway",
  degree: "Degree",
};

const ART: Record<string, string> = {
  Foundation: "linear-gradient(135deg,#0b2a6b,#1f56e0)",
  Builder: "linear-gradient(135deg,#0d3b2a,#1f8a4c)",
  Advanced: "linear-gradient(135deg,#4a1d06,#c45a12)",
  Leadership: "linear-gradient(135deg,#25145e,#5b3fc4)",
  Core: "linear-gradient(135deg,#0b1f4d,#2e5bd8)",
};

/** Original geometric motif — no stock imagery. */
function Motif() {
  return (
    <svg className="motif" width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
      <g fill="none" stroke="#fff" strokeWidth="1.5">
        <circle cx="36" cy="36" r="30" opacity=".35" />
        <path d="M36 66V30M36 44l-12-10M36 38l12-12M24 34l-8-4M48 26l8-6" />
      </g>
      <g fill="#f3d37b">
        <circle cx="16" cy="30" r="3" />
        <circle cx="56" cy="20" r="3" />
      </g>
      <g fill="#fff">
        <circle cx="24" cy="34" r="2.5" />
        <circle cx="48" cy="26" r="2.5" />
        <circle cx="36" cy="30" r="3" />
      </g>
    </svg>
  );
}

export function ProductCard({ p }: { p: Product }) {
  return (
    <a className="pcard" href={`/learn/${p.slug}`}>
      <div className="pcard-art" style={{ background: ART[p.track ?? "Core"] }}>
        <Motif />
        <span className="code">{p.code ?? ""}</span>
      </div>
      <div className="pcard-body">
        <div className="row" style={{ ["--gap" as string]: "6px" }}>
          <span className="badge badge-blue">{TYPE_LABEL[p.type]}</span>
          {p.freeToAudit && <span className="badge badge-green">Free to audit</span>}
          {p.format === "live" && <span className="badge badge-gold">Live</span>}
          {p.status === "legacy" && <span className="badge">Legacy</span>}
        </div>
        <div className="pcard-title">{p.title}</div>
        <div className="tiny muted">{p.educator}</div>
        <div className="tiny muted">Skills: {p.skills.slice(0, 3).join(" · ")}</div>
        <div className="pcard-meta">
          {p.level} · {p.durationLabel}
          <span className="sr-only">. No ratings yet.</span>
        </div>
      </div>
    </a>
  );
}

export function Progress({ value, label, green }: { value: number; label: string; green?: boolean }) {
  return (
    <div className={`progress ${green ? "green" : ""}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

const STATUS_CLASS: Record<string, string> = {
  LIVE: "badge-green",
  CONNECTED: "badge-blue",
  SIMULATED: "badge-amber",
  DISABLED: "badge-red",
  PLANNED: "",
  Graded: "badge-green",
  Submitted: "badge-blue",
  "In Progress": "badge-amber",
  "Not Started": "",
  Locked: "",
};

export function StatusBadge({ status }: { status: CapabilityStatus | string }) {
  return <span className={`badge dot ${STATUS_CLASS[status] ?? ""}`}>{status}</span>;
}

export function Stat({ icon, value, label }: { icon: string; value: number | string; label: string }) {
  return (
    <div className="card card-pad stat">
      <span className="ico">
        <Icon name={icon} />
      </span>
      <span>
        <strong>{value}</strong>
        <span className="small muted">{label}</span>
      </span>
    </div>
  );
}

export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", ...opts });
}
export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";
}
