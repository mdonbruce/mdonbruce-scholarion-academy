import type { ReactNode } from "react";
import type { Row } from "../core";
import { ENTITY, type FieldDef } from "../registry";
import type { Operation, Param } from "../http/ops";

/** Small server-rendered UI kit for the campus. Forms post to the campus API and come back with a notice. */

export const api = (slug: string, path: string) => `/api/campus/v1/t/${slug}/${path}`;

export function fmt(iso: unknown, withTime = false): string {
  if (!iso) return "—";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("en-GB", withTime ? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" } : { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) + (withTime ? " UTC" : "");
}

export function Flash({ sp }: { sp: Record<string, string | undefined> }) {
  if (!sp.notice && !sp.error) return null;
  return (
    <div className={`notice ${sp.error ? "notice-err" : "notice-ok"}`} role={sp.error ? "alert" : "status"}>
      {sp.error ?? sp.notice}
      {sp.result && (
        <details>
          <summary>Result</summary>
          <pre className="code tiny" tabIndex={0}>{prettyJson(sp.result)}</pre>
        </details>
      )}
    </div>
  );
}

function prettyJson(s: string) {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

const STATUS_CLASS: Record<string, string> = { LIVE: "badge-green", CONNECTED: "badge-green", SIMULATED: "badge-blue", DISABLED: "badge-amber", PLANNED: "badge", published: "badge-green", unpublished: "badge-amber", active: "badge-green", pending: "badge-amber", approved: "badge-green", rejected: "badge-red", dead: "badge-red", delivered: "badge-green", locked: "badge-amber", late: "badge-amber", missing: "badge-red", excused: "badge-blue", complete: "badge-green", not_started: "badge-amber", answered: "badge-green", focus: "badge-green", accommodations: "badge-blue", escalated: "badge-blue", boundary: "badge-amber", refused: "badge-amber" };
export function Chip({ s }: { s: string }) {
  return <span className={`badge ${STATUS_CLASS[s] ?? ""}`}>{s.replace(/_/g, " ")}</span>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card card-pad campus-empty">
      <strong>{title}</strong>
      {children && <p className="muted small">{children}</p>}
    </div>
  );
}

export function Denied({ message }: { message: string }) {
  return (
    <div className="notice notice-warn" role="alert">
      <strong>Not available.</strong> {message}
    </div>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="between campus-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

export function Hidden({ values }: { values: Record<string, string | undefined | null> }) {
  return (
    <>
      {Object.entries(values).map(([k, v]) => (v === undefined || v === null ? null : <input key={k} type="hidden" name={k} value={v} />))}
    </>
  );
}

/** One generated input for an operation parameter. */
function ParamField({ p, idp, value }: { p: Param; idp: string; value?: string }) {
  const id = `${idp}-${p.name}`;
  const label = `${p.name.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}${p.required ? "" : " (optional)"}`;
  let input: ReactNode;
  if (p.options) {
    input = (
      <select id={id} name={p.name} defaultValue={value ?? ""} required={p.required}>
        {!p.required && <option value="">—</option>}
        {p.options.map((o) => (
          <option key={o} value={o}>
            {o.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    );
  } else if (p.type === "boolean") {
    input = (
      <select id={id} name={p.name} defaultValue={value ?? (p.required ? "true" : "")}>
        {!p.required && <option value="">—</option>}
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  } else if (p.type === "text" || p.type === "json") {
    input = <textarea id={id} name={p.name} rows={p.type === "json" ? 4 : 3} required={p.required} defaultValue={value} placeholder={p.type === "json" ? "JSON" : undefined} />;
  } else {
    input = <input id={id} name={p.name} type={p.type === "number" ? "number" : p.type === "date" ? "datetime-local" : "text"} step={p.type === "number" ? "any" : undefined} required={p.required} defaultValue={value} placeholder={p.type === "list" ? "comma-separated" : undefined} />;
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {input}
      {p.help && <span className="hint">{p.help}</span>}
    </div>
  );
}

/** Form for any registered operation (commands POST; queries GET into the same page). */
export function OpForm({ slug, op, back, values = {}, hide = [], label, showResult = true, uid = "f" }: { slug: string; op: Operation; back: string; values?: Record<string, string>; hide?: string[]; label?: string; showResult?: boolean; uid?: string }) {
  const params = op.params.filter((p) => !hide.includes(p.name));
  const idp = `op-${uid}-${op.name.replace(/\W/g, "-")}`;
  if (op.kind === "query") {
    return (
      <form method="get" action={back} className="stack campus-op">
        <input type="hidden" name="run" value={op.name} />
        <Hidden values={Object.fromEntries(hide.map((h) => [h, values[h]]))} />
        {params.map((p) => (
          <ParamField key={p.name} p={p} idp={idp} value={values[p.name]} />
        ))}
        <button className="btn btn-outline btn-sm" type="submit">
          {label ?? "Run"}
        </button>
      </form>
    );
  }
  return (
    <form method="post" action={api(slug, `a/${op.name}`)} className="stack campus-op">
      <Hidden values={{ back, ...(showResult ? { show_result: "1" } : {}), ...Object.fromEntries(hide.map((h) => [h, values[h]])) }} />
      {params.map((p) => (
        <ParamField key={p.name} p={p} idp={idp} value={values[p.name]} />
      ))}
      <button className="btn btn-primary btn-sm" type="submit">
        {label ?? op.summary.split(/[.(:]/)[0]}
      </button>
    </form>
  );
}

function fieldInput(f: FieldDef, id: string, value?: unknown) {
  const v = value === undefined || value === null ? undefined : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (f.type === "enum")
    return (
      <select id={id} name={f.name} required={f.required} defaultValue={v ?? ""}>
        {!f.required && <option value="">—</option>}
        {f.options!.map((o) => (
          <option key={o} value={o}>
            {o.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    );
  if (f.type === "boolean")
    return (
      <select id={id} name={f.name} defaultValue={v ?? "false"}>
        <option value="false">No</option>
        <option value="true">Yes</option>
      </select>
    );
  if (f.type === "text" || f.type === "json") return <textarea id={id} name={f.name} rows={f.type === "json" ? 4 : 3} required={f.required} defaultValue={v} placeholder={f.type === "json" ? "JSON" : undefined} />;
  const type = f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "datetime" ? "datetime-local" : f.type === "email" ? "email" : f.type === "url" ? "url" : "text";
  return <input id={id} name={f.name} type={type} required={f.required} defaultValue={v} step={f.type === "number" ? "any" : undefined} min={f.min} max={f.max} placeholder={f.type === "tags" ? "comma-separated" : f.type === "ref" ? `${ENTITY[f.ref!]?.label ?? "record"} id` : undefined} />;
}

/** Create (or edit) form generated from the registry. */
export function EntityForm({ slug, table, back, row, fixed = {}, label }: { slug: string; table: string; back: string; row?: Row; fixed?: Record<string, string>; label?: string }) {
  const d = ENTITY[table];
  const fields = d.fields.filter((f) => !f.system && !(f.name in fixed) && !(f.secret && row));
  const idp = `f-${table}-${row?.id ?? (Object.values(fixed).join("-").replace(/\W/g, "-") || "new")}`;
  return (
    <form method="post" action={api(slug, row ? `r/${table}/${row.id}` : `r/${table}`)} className="stack campus-entity-form">
      <Hidden values={{ back, ...(row ? { _method: "PATCH", ifVersion: String(row.version) } : {}), ...fixed }} />
      <div className="grid g2">
        {fields.map((f) => (
          <div className="field" key={f.name}>
            <label htmlFor={`${idp}-${f.name}`}>
              {f.label}
              {f.required ? "" : " (optional)"}
            </label>
            {fieldInput(f, `${idp}-${f.name}`, row?.[f.name])}
            {f.help && <span className="hint">{f.help}</span>}
          </div>
        ))}
      </div>
      <button className="btn btn-primary btn-sm" type="submit">
        {label ?? (row ? `Save ${d.label.toLowerCase()}` : `Create ${d.label.toLowerCase()}`)}
      </button>
    </form>
  );
}

function cell(v: unknown, f?: FieldDef): ReactNode {
  if (v === null || v === undefined || v === "") return <span className="muted">—</span>;
  if (f?.type === "boolean" || typeof v === "boolean") return v ? "Yes" : "No";
  if (f?.type === "datetime" || f?.type === "date") return fmt(v, f.type === "datetime");
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ").slice(0, 120) : <span className="muted">—</span>;
  if (typeof v === "object") return <code className="tiny">{JSON.stringify(v).slice(0, 120)}</code>;
  const s = String(v);
  if (f?.name === "state" || f?.name === "status") return <Chip s={s} />;
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}

/** Table of rows for a registry entity, with publish/delete actions where the viewer can manage. */
export function EntityTable({ slug, table, rows, back, manage, columns }: { slug: string; table: string; rows: Record<string, unknown>[]; back: string; manage: { publish: boolean; archive: boolean }; columns?: string[] }) {
  const d = ENTITY[table];
  const cols = (columns ?? [d.titleField, ...d.fields.filter((f) => f.name !== d.titleField && !f.secret && f.type !== "json" && f.type !== "text").map((f) => f.name)].slice(0, 6)).map((n) => d.fields.find((f) => f.name === n) ?? ({ name: n, label: n } as FieldDef));
  if (!rows.length) return <Empty title={`No ${d.plural.toLowerCase()} yet.`} />;
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
      <table className="table">
        <caption className="sr-only">{d.plural}</caption>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.name} scope="col">
                {c.label}
              </th>
            ))}
            <th scope="col">Updated</th>
            {(manage.publish || manage.archive) && <th scope="col">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.id)}>
              {cols.map((c, i) => (
                <td key={c.name}>{i === 0 ? <a href={`${back.split("?")[0]}?id=${r.id}`}>{cell(r[c.name], c) || String(r.id)}</a> : cell(r[c.name], c)}</td>
              ))}
              <td className="tiny muted">{fmt(r.updatedAt)}</td>
              {(manage.publish || manage.archive) && (
                <td>
                  <div className="row">
                    {manage.publish && d.publishable && (
                      <form method="post" action={api(slug, `r/${table}/${r.id}/publish`)}>
                        <Hidden values={{ back, ...(r.state === "published" ? { _method: "DELETE" } : {}) }} />
                        <button className="btn btn-ghost btn-sm" type="submit">
                          {r.state === "published" ? "Unpublish" : "Publish"}
                        </button>
                      </form>
                    )}
                    {manage.archive && (
                      <form method="post" action={api(slug, `r/${table}/${r.id}`)}>
                        <Hidden values={{ back, _method: "DELETE" }} />
                        <button className="btn btn-ghost btn-sm" type="submit" aria-label={`Delete ${String(r[d.titleField] ?? r.id)}`}>
                          Delete
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function JsonBlock({ value, label = "Details" }: { value: unknown; label?: string }) {
  return (
    <details className="card card-pad">
      <summary>{label}</summary>
      <pre className="code tiny campus-json" tabIndex={0}>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

/** Render any query result readably: arrays of flat objects become tables. */
export function Result({ value }: { value: unknown }) {
  if (Array.isArray(value) && value.length && value.every((x) => x && typeof x === "object" && !Array.isArray(x))) {
    const keys = [...new Set(value.flatMap((x) => Object.keys(x as object)))].filter((k) => !["version", "createdAt"].includes(k)).slice(0, 8);
    return (
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
        <table className="table">
          <thead>
            <tr>
              {keys.map((k) => (
                <th key={k} scope="col">
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {value.slice(0, 200).map((x, i) => (
              <tr key={i}>
                {keys.map((k) => (
                  <td key={k}>{cell((x as Record<string, unknown>)[k])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (Array.isArray(value) && !value.length) return <Empty title="Nothing to show." />;
  return <pre className="code tiny campus-json" tabIndex={0}>{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre>;
}
