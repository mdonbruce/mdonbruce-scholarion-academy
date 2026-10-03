import type { adminArticleVM, adminBlogVM, articleVM, blogVM, hubsVM, hubVM, Viewer } from "@/bff/views";
import { fmtDate, fmtDateTime, ProductCard, TYPE_LABEL } from "../components/cards";
import { AppShell, Flash, PublicPage } from "../components/chrome";
import { Prose } from "../components/prose";
import { formatMoney } from "@/platform/pricing";

type FlashProps = { notice?: string; error?: string };
const money = (n: number, currency = "USD") => formatMoney(n, currency);
const h2 = { fontFamily: "var(--font-sans)", fontSize: "1.25rem" } as const;

/* ---------------- /hubs ---------------- */

export function HubsIndexView({ viewer, vm }: { viewer: Viewer; vm: ReturnType<typeof hubsVM> }) {
  return (
    <PublicPage viewer={viewer}>
      <div className="container section">
        <h1 className="page-title">Topics</h1>
        <p className="lede">Pick an area to see every course and program in it, compared side by side, with a suggested place to start.</p>
        <div className="grid g2" style={{ marginTop: 20 }}>
          {vm.map((h) => (
            <a key={h.slug} href={`/hubs/${h.slug}`} className="card card-pad" style={{ display: "block" }}>
              <strong style={{ fontSize: "1.15rem" }}>{h.title}</strong>
              <p className="small muted" style={{ margin: "6px 0" }}>
                {h.headline}
              </p>
              <span className="tiny">
                {h.count} course{h.count === 1 ? "" : "s"} and programs →
              </span>
            </a>
          ))}
        </div>
      </div>
    </PublicPage>
  );
}

/* ---------------- /hubs/[slug] ---------------- */

export function HubView({ viewer, vm }: { viewer: Viewer; vm: NonNullable<ReturnType<typeof hubVM>> }) {
  const h = vm.hub;
  return (
    <PublicPage viewer={viewer}>
      <section className="hero">
        <div className="container" style={{ display: "block", paddingTop: 32, paddingBottom: 32 }}>
          <nav className="crumbs" aria-label="Breadcrumb" style={{ color: "#c9d4f0" }}>
            <a href="/hubs" style={{ color: "#dbe4fb" }}>
              Topics
            </a>{" "}
            › {h.title}
          </nav>
          <h1 style={{ fontSize: "clamp(2rem,4vw,2.6rem)", margin: "10px 0 6px" }}>{h.headline}</h1>
          <p style={{ fontSize: "1.1rem", maxWidth: "70ch" }}>{h.intro}</p>
        </div>
      </section>
      <div className="container section stack" style={{ ["--gap" as string]: "32px" }}>
        <div className="grid g2" style={{ alignItems: "start" }}>
          <section>
            <h2 style={h2}>Who it's for</h2>
            <ul>
              {h.whoFor.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </section>
          {vm.startHere && (
            <section className="card card-pad">
              <span className="badge badge-gold">Start here</span>
              <h2 style={{ ...h2, margin: "8px 0 4px" }}>
                <a href={`/learn/${vm.startHere.slug}`}>{vm.startHere.title}</a>
              </h2>
              <p className="small" style={{ margin: 0 }}>
                {vm.startHere.tagline}
              </p>
              <p className="tiny muted" style={{ marginTop: 6 }}>
                {TYPE_LABEL[vm.startHere.type]} · {vm.startHere.level} · about {vm.startHere.hours} hours{vm.startHere.freeToAudit ? " · free to audit" : ""}
              </p>
            </section>
          )}
        </div>

        <section aria-labelledby="hub-progs">
          <h2 id="hub-progs" style={h2}>
            All {h.title} courses and programs ({vm.products.length})
          </h2>
          <div className="grid g3" style={{ marginTop: 12 }}>
            {vm.products.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        </section>

        {vm.compare.length > 1 && (
          <section aria-labelledby="hub-compare">
            <h2 id="hub-compare" style={h2}>
              Compare
            </h2>
            <div className="card table-wrap">
              <table className="table compare-table">
                <caption className="sr-only">Comparison of {h.title} programs</caption>
                <thead>
                  <tr>
                    <th scope="col">Program</th>
                    <th scope="col">Type</th>
                    <th scope="col">Level</th>
                    <th scope="col">Hours</th>
                    <th scope="col">Format</th>
                    <th scope="col">Free to audit</th>
                    <th scope="col">In Plus</th>
                    <th scope="col">From</th>
                  </tr>
                </thead>
                <tbody>
                  {vm.compare.map(({ product: p, from }) => (
                    <tr key={p.id}>
                      <th scope="row" className="small" style={{ fontWeight: 600 }}>
                        <a href={`/learn/${p.slug}`}>{p.title}</a>
                      </th>
                      <td className="small">{TYPE_LABEL[p.type]}</td>
                      <td className="small">{p.level}</td>
                      <td className="small">{p.hours}</td>
                      <td className="small">{p.format === "live" ? "Live cohort (apply)" : "Self-paced"}</td>
                      <td className="small">{p.freeToAudit ? "Yes" : "No"}</td>
                      <td className="small">{p.plusEligible ? "Yes" : "No"}</td>
                      <td className="small">{from ? `${money(from.price, from.currency)} ${from.label}` : <a href="/pricing">See pricing</a>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tiny muted" style={{ marginTop: 6 }}>
              Prices are sandbox placeholders until pricing is confirmed. All credentials are non-credit professional training.
            </p>
          </section>
        )}

        {vm.articles.length > 0 && (
          <section aria-labelledby="hub-read">
            <h2 id="hub-read" style={h2}>
              Read more
            </h2>
            <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
              {vm.articles.map((a) => (
                <li key={a.id}>
                  <a href={`/blog/${a.slug}`} style={{ fontWeight: 600 }}>
                    {a.title}
                  </a>
                  <div className="small muted">{a.summary}</div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="hub-faq">
          <h2 id="hub-faq" style={h2}>
            Questions
          </h2>
          {h.faq.map((f) => (
            <details key={f.q} className="acc">
              <summary>{f.q}</summary>
              <div className="muted">{f.a}</div>
            </details>
          ))}
        </section>
      </div>
    </PublicPage>
  );
}

/* ---------------- /blog ---------------- */

export function BlogIndexView({ viewer, vm }: { viewer: Viewer; vm: ReturnType<typeof blogVM> }) {
  return (
    <PublicPage viewer={viewer} current="/blog">
      <div className="container section" style={{ maxWidth: 900 }}>
        <h1 className="page-title">Blog</h1>
        <p className="lede">Practical guidance on learning AI and programming, from the Scholarion Academy team.</p>
        {vm.tags.length > 0 && (
          <nav aria-label="Topics" className="row" style={{ ["--gap" as string]: "6px", flexWrap: "wrap", margin: "12px 0 20px" }}>
            <a className={`badge ${!vm.tag ? "badge-blue" : ""}`} href="/blog">
              All
            </a>
            {vm.tags.map((t) => (
              <a key={t} className={`badge ${vm.tag === t ? "badge-blue" : ""}`} href={`/blog?tag=${encodeURIComponent(t)}`}>
                {t}
              </a>
            ))}
          </nav>
        )}
        {vm.articles.length === 0 && <div className="panel muted">No articles yet.</div>}
        <ul className="stack" style={{ listStyle: "none", padding: 0, ["--gap" as string]: "18px" }}>
          {vm.articles.map((a) => (
            <li key={a.id} className="card card-pad">
              <a href={`/blog/${a.slug}`} style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                {a.title}
              </a>
              <p style={{ margin: "6px 0" }}>{a.summary}</p>
              <div className="tiny muted">
                {fmtDate(a.publishedAt)} · {a.minutes} min read
              </div>
            </li>
          ))}
        </ul>
      </div>
    </PublicPage>
  );
}

/* ---------------- /blog/[slug] ---------------- */

export function ArticleView({ viewer, vm }: { viewer: Viewer; vm: NonNullable<ReturnType<typeof articleVM>> }) {
  const a = vm.article;
  return (
    <PublicPage viewer={viewer} current="/blog">
      <article className="container section" style={{ maxWidth: 820 }}>
        <nav className="crumbs" aria-label="Breadcrumb">
          <a href="/blog">Blog</a>
        </nav>
        <h1 className="page-title" style={{ marginBottom: 6 }}>
          {a.title}
        </h1>
        <p className="lede" style={{ marginTop: 0 }}>
          {a.summary}
        </p>
        <p className="small muted">
          {a.authorName} · {fmtDate(a.publishedAt, { dateStyle: "long" })}
          {a.updatedAt && a.publishedAt && a.updatedAt.slice(0, 10) > a.publishedAt.slice(0, 10) ? ` · updated ${fmtDate(a.updatedAt)}` : ""} · {vm.minutes} min read
        </p>
        <Prose text={a.body} />
        {a.sources.length > 0 && (
          <section style={{ marginTop: 24 }}>
            <h2 style={{ ...h2, fontSize: "1rem" }}>Sources</h2>
            <ol className="small">
              {a.sources.map((s) => (
                <li key={s}>
                  <a href={s} rel="noopener noreferrer nofollow" target="_blank">
                    {s}
                  </a>
                </li>
              ))}
            </ol>
          </section>
        )}
        {vm.hubs.length > 0 && (
          <p className="small" style={{ marginTop: 24 }}>
            Explore:{" "}
            {vm.hubs.map((h, i) => (
              <span key={h.slug}>
                {i > 0 && " · "}
                <a href={`/hubs/${h.slug}`}>{h.title}</a>
              </span>
            ))}
          </p>
        )}
        {vm.more.length > 0 && (
          <aside className="card card-pad" style={{ marginTop: 28 }} aria-label="More articles">
            <h2 style={{ ...h2, fontSize: "1rem" }}>More from the blog</h2>
            <ul style={{ margin: 0 }}>
              {vm.more.map((m) => (
                <li key={m.id}>
                  <a href={`/blog/${m.slug}`}>{m.title}</a>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </article>
    </PublicPage>
  );
}

/* ---------------- /admin/blog ---------------- */

function ArticleForm({ a, hubs }: { a?: NonNullable<ReturnType<typeof adminArticleVM>>["article"]; hubs: { slug: string; title: string }[] }) {
  return (
    <form method="post" action="/api/v1/admin/blog" className="panel">
      {a && <input type="hidden" name="id" value={a.id} />}
      <div className="field">
        <label htmlFor="ar-title">Title</label>
        <input id="ar-title" name="title" defaultValue={a?.title} required minLength={8} maxLength={140} />
      </div>
      <div className="field">
        <label htmlFor="ar-sum">
          Summary <span className="hint">(30–300 characters; listings and search results)</span>
        </label>
        <textarea id="ar-sum" name="summary" rows={2} defaultValue={a?.summary} required minLength={30} maxLength={300} />
      </div>
      <div className="field">
        <label htmlFor="ar-body">
          Article <span className="hint">(blank line between paragraphs; "## " for headings; "- " for lists; [text](https://…) for links)</span>
        </label>
        <textarea id="ar-body" name="body" rows={18} defaultValue={a?.body} required />
      </div>
      <div className="grid g2">
        <div className="field">
          <label htmlFor="ar-tags">Tags (comma-separated)</label>
          <input id="ar-tags" name="tags" defaultValue={a?.tags.join(", ")} />
        </div>
        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <legend className="small" style={{ fontWeight: 700 }}>
            Show on topic pages
          </legend>
          {hubs.map((h) => (
            <label key={h.slug} className="check">
              <input type="checkbox" name={`hub_${h.slug}`} defaultChecked={a?.hubSlugs.includes(h.slug)} /> {h.title}
            </label>
          ))}
        </fieldset>
      </div>
      <div className="field">
        <label htmlFor="ar-src">
          Sources <span className="hint">(https links, one per line; required for any salary or outcome figure)</span>
        </label>
        <textarea id="ar-src" name="sources" rows={3} defaultValue={a?.sources.join("\n")} />
      </div>
      <button className="btn btn-primary btn-sm">{a ? "Save" : "Create draft"}</button>
    </form>
  );
}

export function AdminBlogView({ viewer, vm, hubs, flash }: { viewer: NonNullable<Viewer>; vm: ReturnType<typeof adminBlogVM>; hubs: { slug: string; title: string }[]; flash: FlashProps }) {
  return (
    <AppShell viewer={viewer} current="/admin">
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href="/admin">Staff & Admin</a>
      </nav>
      <h1 className="page-title">Blog</h1>
      <Flash {...flash} />
      <div className="with-aside">
        <div className="stack">
          {vm.map((a) => (
            <section key={a.id} className="card card-pad row between" style={{ flexWrap: "wrap" }}>
              <span>
                <a href={`/admin/blog/${a.id}`} style={{ fontWeight: 600 }}>
                  {a.title}
                </a>
                <span className="tiny muted"> · updated {fmtDateTime(a.updatedAt ?? a.createdAt)}</span>
              </span>
              <span className="row" style={{ ["--gap" as string]: "6px" }}>
                {a.issues > 0 && <span className="badge badge-red">{a.issues} claim issue{a.issues === 1 ? "" : "s"}</span>}
                <span className={`badge ${a.status === "published" ? "badge-green" : ""}`}>{a.status === "published" ? "Published" : "Draft"}</span>
              </span>
            </section>
          ))}
        </div>
        <aside>
          <h2 style={{ ...h2, fontSize: "1.05rem" }}>New article</h2>
          <ArticleForm hubs={hubs} />
        </aside>
      </div>
    </AppShell>
  );
}

export function AdminArticleView({ viewer, vm, flash }: { viewer: NonNullable<Viewer>; vm: NonNullable<ReturnType<typeof adminArticleVM>>; flash: FlashProps }) {
  const a = vm.article;
  return (
    <AppShell viewer={viewer} current="/admin">
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href="/admin">Staff & Admin</a> › <a href="/admin/blog">Blog</a>
      </nav>
      <h1 className="page-title">{a.title}</h1>
      <Flash {...flash} />
      <div className="row" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        <span className={`badge ${a.status === "published" ? "badge-green" : ""}`}>{a.status === "published" ? "Published" : "Draft"}</span>
        {a.status === "published" ? (
          <>
            <a className="small" href={`/blog/${a.slug}`}>
              View live
            </a>
            <form method="post" action={`/api/v1/admin/blog/${a.id}/unpublish`}>
              <button className="btn btn-ghost btn-sm">Unpublish</button>
            </form>
          </>
        ) : (
          <form method="post" action={`/api/v1/admin/blog/${a.id}/publish`}>
            <button className="btn btn-primary btn-sm" disabled={vm.issues.length > 0}>
              Publish
            </button>
          </form>
        )}
      </div>
      {vm.issues.length > 0 && (
        <div className="notice notice-err" role="alert">
          <strong>Claims check: fix before publishing.</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {vm.issues.map((i, k) => (
              <li key={k}>
                “{i.match}”: {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid g2" style={{ alignItems: "start" }}>
        <ArticleForm a={a} hubs={vm.hubs} />
        <section className="card card-pad" aria-label="Preview">
          <div className="tiny muted" style={{ marginBottom: 8 }}>
            Preview
          </div>
          <h2 style={h2}>{a.title}</h2>
          <p className="muted">{a.summary}</p>
          <Prose text={a.body} />
        </section>
      </div>
    </AppShell>
  );
}
