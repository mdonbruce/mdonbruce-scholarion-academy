import type { joinVM, orgVM, teamsQuote, Viewer } from "@/bff/views";
import { fmtDate, Progress, Stat, StatusBadge } from "../components/cards";
import { AppShell, Flash, PublicPage } from "../components/chrome";

type V = NonNullable<Viewer>;
type FlashProps = { notice?: string; error?: string };
const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const h2 = { fontFamily: "var(--font-sans)", fontSize: "1.1rem" } as const;

/* ======================= Organization admin dashboard ======================= */

export function OrgView({ viewer, vm, flash, origin }: { viewer: V; vm: ReturnType<typeof orgVM>; flash: FlashProps; origin: string }) {
  const o = vm.org;
  const back = `/org/${o.id}`;
  return (
    <AppShell viewer={viewer} current="/org">
      <div className="row between" style={{ alignItems: "flex-end" }}>
        <div>
          <div className="small muted">Scholarion for Teams · organization admin</div>
          <h1 className="page-title" style={{ margin: 0 }}>
            {o.name}
          </h1>
        </div>
        <a className="btn btn-outline btn-sm" href={`/api/v1/teams/orgs/${o.id}/report.csv`}>
          Export progress (CSV)
        </a>
      </div>
      <div className="dev-banner" style={{ margin: "14px 0" }}>
        Sandbox: seat purchases record an order but take no payment. Organization sign-in is simulated by email domain until SAML/OIDC SSO is connected.
      </div>
      <Flash {...flash} />

      <div className="grid g4" style={{ marginBottom: 20 }}>
        <Stat icon="users" value={`${vm.seats.used}/${vm.seats.total}`} label="Seats in use" />
        <Stat icon="chart" value={`${vm.totals.avgProgress}%`} label="Average progress" />
        <Stat icon="check" value={vm.totals.completions} label="Programs completed" />
        <Stat icon="award" value={vm.totals.credentials} label="Credentials earned" />
      </div>

      <div className="with-aside">
        <section className="card table-wrap">
          <table className="table">
            <caption style={{ textAlign: "left", padding: "14px 12px 4px", fontWeight: 700 }}>People</caption>
            <thead>
              <tr>
                <th scope="col">Learner</th>
                {vm.programs.map((p) => (
                  <th key={p.id} scope="col">
                    {p.code ?? p.title}
                  </th>
                ))}
                <th scope="col">Last active</th>
                <th scope="col" className="num">
                  Seat
                </th>
              </tr>
            </thead>
            <tbody>
              {vm.members.length === 0 && (
                <tr>
                  <td colSpan={vm.programs.length + 3} className="muted small">
                    No one has a seat yet. Invite people on the right{o.ssoEnabled ? `, or share the sign-in link with anyone at @${o.domain}` : ""}.
                  </td>
                </tr>
              )}
              {vm.members.map((m) => (
                <tr key={m.userId} style={{ opacity: m.status === "revoked" ? 0.6 : 1 }}>
                  <td>
                    <strong className="small">{m.name}</strong>
                    <div className="tiny muted">
                      {m.email} · joined {fmtDate(m.joinedAt)} by {m.via === "sso" ? "organization sign-in" : m.via}
                    </div>
                  </td>
                  {m.progress.map((p) => (
                    <td key={p.productId} style={{ minWidth: 120 }}>
                      {p.completed ? (
                        <span className="badge badge-green">Completed</span>
                      ) : (
                        <>
                          <Progress value={p.percent} label={`${m.name} progress`} />
                          <span className="tiny muted">{p.percent}%</span>
                        </>
                      )}
                    </td>
                  ))}
                  <td className="small">{m.lastActive ? fmtDate(m.lastActive) : "—"}</td>
                  <td className="num">
                    {m.status === "active" ? (
                      <form method="post" action={`/api/v1/teams/orgs/${o.id}/members/${m.userId}/revoke`}>
                        <input type="hidden" name="back" value={back} />
                        <button className="btn btn-ghost btn-sm">Free seat</button>
                      </form>
                    ) : (
                      <StatusBadge status="Seat freed" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {vm.totals.skillsGained.length > 0 && (
            <p className="small" style={{ padding: "0 12px 12px", margin: 0 }}>
              <strong>Skills gained:</strong> {vm.totals.skillsGained.join(", ")}
            </p>
          )}
        </section>

        <aside className="stack">
          <section className="card card-pad">
            <h2 style={h2}>Academy programs</h2>
            {vm.programs.length === 0 && <p className="small muted">Add a program to give every member access.</p>}
            <ul className="item-list">
              {vm.programs.map((p) => (
                <li key={p.id} className="li small" style={{ justifyContent: "space-between" }}>
                  <a href={`/learn/${p.slug}`}>
                    {p.code} {p.title}
                  </a>
                  <form method="post" action={`/api/v1/teams/orgs/${o.id}/programs/${p.id}/remove`}>
                    <input type="hidden" name="back" value={back} />
                    <button className="linkish tiny">Remove</button>
                  </form>
                </li>
              ))}
            </ul>
            <form method="post" action={`/api/v1/teams/orgs/${o.id}/programs`} className="stack" style={{ ["--gap" as string]: "8px" }}>
              <input type="hidden" name="back" value={back} />
              <label htmlFor="assign" className="small" style={{ margin: 0 }}>
                Add a program
              </label>
              <select id="assign" name="productId" required defaultValue="">
                <option value="" disabled>
                  Choose a course or certificate…
                </option>
                {vm.assignable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code ? `${p.code} · ` : ""}
                    {p.title}
                  </option>
                ))}
              </select>
              <button className="btn btn-primary btn-sm">Add to academy</button>
            </form>
          </section>

          <section className="card card-pad">
            <h2 style={h2}>Invite people</h2>
            <form method="post" action={`/api/v1/teams/orgs/${o.id}/invites`} className="stack" style={{ ["--gap" as string]: "8px" }}>
              <input type="hidden" name="back" value={back} />
              <label htmlFor="emails" className="small" style={{ margin: 0 }}>
                Work emails <span className="hint">(comma or one per line)</span>
              </label>
              <textarea id="emails" name="emails" style={{ minHeight: 80 }} placeholder="ada@yourcompany.com" />
              <button className="btn btn-primary btn-sm" disabled={vm.seats.free <= 0}>
                Send invitations
              </button>
              {vm.seats.free <= 0 && <p className="tiny muted">All seats are in use. Add seats or free one up.</p>}
            </form>
            {vm.invites.length > 0 && (
              <>
                <h3 className="small" style={{ marginTop: 14 }}>
                  Waiting to accept
                </h3>
                <ul className="item-list">
                  {vm.invites.map((i) => (
                    <li key={i.token} className="li small" style={{ display: "block" }}>
                      <div className="row between">
                        <span>{i.email}</span>
                        <form method="post" action={`/api/v1/teams/orgs/${o.id}/invites/${i.token}/revoke`}>
                          <input type="hidden" name="back" value={back} />
                          <button className="linkish tiny">Cancel</button>
                        </form>
                      </div>
                      <div className="tiny muted mono" style={{ wordBreak: "break-all" }}>
                        {origin}/join/{i.token}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="card card-pad">
            <h2 style={h2}>Organization sign-in</h2>
            <p className="small muted">People who sign in with this email domain can take a free seat without an invitation.</p>
            <form method="post" action={`/api/v1/teams/orgs/${o.id}/sso`} className="stack" style={{ ["--gap" as string]: "8px" }}>
              <input type="hidden" name="back" value={back} />
              <label htmlFor="domain" className="small" style={{ margin: 0 }}>
                Email domain
              </label>
              <input id="domain" name="domain" type="text" defaultValue={o.domain ?? ""} placeholder="yourcompany.com" />
              <label className="check small">
                <input type="checkbox" name="enabled" defaultChecked={o.ssoEnabled} /> Allow sign-in by domain
              </label>
              <button className="btn btn-outline btn-sm">Save</button>
            </form>
          </section>

          <section className="card card-pad">
            <h2 style={h2}>Seats & billing</h2>
            <p className="small">
              {o.seats} seats at {money(vm.seatPrice)} per seat per year (placeholder price).
            </p>
            <form method="post" action={`/api/v1/teams/orgs/${o.id}/seats`} className="row">
              <input type="hidden" name="back" value={back} />
              <label htmlFor="extra" className="sr-only">
                Seats to add
              </label>
              <input id="extra" name="extra" type="number" min={1} max={500} defaultValue={5} style={{ width: 90 }} />
              <button className="btn btn-ghost btn-sm">Add seats</button>
            </form>
            <ul className="tiny muted" style={{ paddingLeft: 16, marginTop: 10 }}>
              {vm.orders.map((x) => (
                <li key={x.id}>
                  {fmtDate(x.createdAt)} · {x.description} · {money(x.amount)}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}

/* ======================= Invitation ======================= */

export function JoinView({ viewer, vm, token, flash }: { viewer: Viewer; vm: ReturnType<typeof joinVM>; token: string; flash: FlashProps }) {
  return (
    <PublicPage viewer={viewer}>
      <div className="container section" style={{ maxWidth: 640 }}>
        <Flash {...flash} />
        {!vm ? (
          <div className="panel">
            <h1 className="page-title">This invitation isn't valid</h1>
            <p className="muted">It may have been cancelled. Ask your administrator to send a new one.</p>
          </div>
        ) : vm.invite.acceptedAt ? (
          <div className="panel">
            <h1 className="page-title">Invitation already accepted</h1>
            <a className="btn btn-primary" href="/app">
              Go to My Learning
            </a>
          </div>
        ) : (
          <div className="card card-pad stack">
            <div className="small muted">Scholarion for Teams</div>
            <h1 className="page-title" style={{ margin: 0 }}>
              {vm.org.name} invited you
            </h1>
            <p>
              Your seat includes {vm.programs.length ? vm.programs.map((p) => p.title).join(", ") : "the programs your administrator assigns"}, with graded work, Cloud Lab, the AI Tutor and certificates.
            </p>
            <p className="small muted">
              The invitation is for <strong>{vm.invite.email}</strong>. Your administrator will see your progress on these programs.
            </p>
            {viewer ? (
              <form method="post" action={`/api/v1/teams/invites/${token}/accept`}>
                <input type="hidden" name="back" value={`/join/${token}`} />
                <button className="btn btn-primary">Accept and join {vm.org.name}</button>
              </form>
            ) : (
              <div className="row">
                <a className="btn btn-primary" href={`/signup?next=${encodeURIComponent(`/join/${token}`)}`}>
                  Create account
                </a>
                <a className="btn btn-outline" href={`/login?next=${encodeURIComponent(`/join/${token}`)}`}>
                  Sign in
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </PublicPage>
  );
}

/* ======================= Buy seats (on /teams) ======================= */

export function BuySeatsPanel({ signedIn, quote, error }: { signedIn: boolean; quote: ReturnType<typeof teamsQuote>; error?: string }) {
  return (
    <section className="card card-pad" aria-labelledby="buy-seats">
      <h2 id="buy-seats" style={h2}>
        Buy seats now
      </h2>
      <p className="small muted">
        {money(quote.perSeat)} per seat per year (placeholder price, sandbox — no payment taken). You become the organization's admin.
      </p>
      {error && (
        <div className="notice notice-err" role="alert">
          {error}
        </div>
      )}
      {signedIn ? (
        <form method="post" action="/api/v1/teams/orgs">
          <input type="hidden" name="back" value="/teams" />
          <div className="field">
            <label htmlFor="org-name">Organization name</label>
            <input id="org-name" name="name" type="text" required autoComplete="organization" />
          </div>
          <div className="grid g2" style={{ ["--gap" as string]: "12px" }}>
            <div className="field">
              <label htmlFor="org-seats">Seats</label>
              <input id="org-seats" name="seats" type="number" min={1} max={5000} defaultValue={quote.seats} required />
            </div>
            <div className="field">
              <label htmlFor="org-domain">
                Email domain <span className="hint">(optional)</span>
              </label>
              <input id="org-domain" name="domain" type="text" placeholder="yourcompany.com" />
            </div>
          </div>
          <label className="check small field">
            <input type="checkbox" name="sso" defaultChecked /> Let people with this email domain join through organization sign-in
          </label>
          <button className="btn btn-primary btn-block">Buy seats (sandbox)</button>
          <p className="tiny muted" style={{ marginTop: 8 }}>
            Example: {quote.label}. Annual plan; add seats or free them up any time.
          </p>
        </form>
      ) : (
        <a className="btn btn-primary btn-block" href="/login?next=/teams">
          Sign in to buy seats
        </a>
      )}
    </section>
  );
}
