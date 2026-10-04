import { broker, type Tenant } from "../../core";
import { accountSettings } from "../../services/accountcfg";
import { publicPortfolio } from "../../services/portfolio";
import { api, Flash, Hidden } from "../kit";

/** Public self-registration request. Every request waits for an administrator's approval. */
export function RegisterView({ tenant, sp }: { tenant: Tenant; sp: Record<string, string | undefined> }) {
  const s = accountSettings(broker.connect({ tenantId: tenant.id, slug: tenant.slug, via: "path", traceId: "register" }));
  const here = `/campus/${tenant.slug}/register`;
  return (
    <article className="stack" style={{ maxWidth: 560 }}>
      <h1 className="page-title">Request an account</h1>
      <Flash sp={sp} />
      {s.selfRegistration === "off" ? (
        <p className="notice notice-info">This school creates accounts for you. Ask your administrator or registrar for access.</p>
      ) : (
        <form method="post" action={api(tenant.slug, "a/accounts.self_register")} className="stack card card-pad">
          <Hidden values={{ back: here, notice: "Thanks — an administrator will review your request." }} />
          <p className="small">An administrator reviews every request.{s.selfRegistrationDomains.length ? ` Use an email address at ${s.selfRegistrationDomains.join(" or ")}.` : ""}</p>
          <div className="field">
            <label htmlFor="rg-name">Full name</label>
            <input id="rg-name" name="name" required autoComplete="name" maxLength={120} />
          </div>
          <div className="field">
            <label htmlFor="rg-email">Email</label>
            <input id="rg-email" name="email" type="email" required autoComplete="email" />
          </div>
          {(s.termsUrl || s.privacyUrl) && (
            <p className="tiny">
              By asking for an account you agree to the {s.termsUrl && <a href={s.termsUrl}>terms of use</a>}
              {s.termsUrl && s.privacyUrl && " and "}
              {s.privacyUrl && <a href={s.privacyUrl}>privacy policy</a>}.
            </p>
          )}
          <button className="btn btn-primary" type="submit">
            Send request
          </button>
        </form>
      )}
    </article>
  );
}

/** Public portfolio page (only when its owner turned on the link). */
export function PublicPortfolioView({ tenant, token }: { tenant: Tenant; token: string }) {
  let p: ReturnType<typeof publicPortfolio> | null = null;
  try {
    p = publicPortfolio(broker.connect({ tenantId: tenant.id, slug: tenant.slug, via: "path", traceId: "portfolio" }), token);
  } catch {
    p = null;
  }
  if (!p) return <p className="notice notice-info">This portfolio isn't available. Its owner may have turned off the public link.</p>;
  const sections = [...new Set(p.pages.map((x) => x.section))];
  return (
    <article className="stack" style={{ maxWidth: 820 }}>
      <h1 className="page-title">{p.title}</h1>
      <p className="muted">by {p.owner}</p>
      {p.summary && <p>{p.summary}</p>}
      {sections.map((sec) => (
        <section key={sec} className="stack" aria-label={sec}>
          <h2>{sec}</h2>
          {p!.pages
            .filter((x) => x.section === sec)
            .map((pg, i) => (
              <div key={i} className="card card-pad stack">
                <h3 className="card-title">{pg.title}</h3>
                {pg.body && <p style={{ whiteSpace: "pre-wrap" }}>{pg.body}</p>}
                {pg.work.map((w, k) => (
                  <details key={k}>
                    <summary>{w.title}</summary>
                    {w.text ? <p style={{ whiteSpace: "pre-wrap" }}>{w.text}</p> : <p className="tiny muted">File or link submission — not shown publicly.</p>}
                  </details>
                ))}
              </div>
            ))}
        </section>
      ))}
      <p className="tiny muted">Shared by its owner. {tenant.name} doesn't verify portfolio content.</p>
    </article>
  );
}
