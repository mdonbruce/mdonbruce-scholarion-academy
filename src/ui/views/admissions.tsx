import type { applyVM, Viewer } from "@/bff/views";
import { fmtDate, fmtDateTime, StatusBadge } from "../components/cards";
import { Flash, PublicPage } from "../components/chrome";
import { formatMoney } from "@/platform/pricing";

type FlashProps = { notice?: string; error?: string };
const money = (n: number, currency = "USD") => formatMoney(n, currency);
const h2 = { fontFamily: "var(--font-sans)", fontSize: "1.15rem" } as const;

const STATUS_COPY: Record<string, { label: string; text: string }> = {
  submitted: { label: "In review", text: "Your application is with our admissions team. We'll email you a decision." },
  accepted: { label: "Accepted", text: "You're in. Reserve your seat below to hold your place in the cohort." },
  waitlisted: { label: "Waitlisted", text: "The cohort is full right now. We'll email you if a seat opens." },
  declined: { label: "Not accepted", text: "We weren't able to offer you a seat in this cohort. You're welcome to apply to a future one." },
  reserved: { label: "Seat reserved", text: "Your seat is reserved. Your session cards and onboarding are in Live Sessions." },
  withdrawn: { label: "Withdrawn", text: "You withdrew this application. You can apply again." },
};

/** Live program application, decision status and seat reservation (Spec §5.7). */
export function ApplyView({ viewer, vm, flash }: { viewer: Viewer; vm: NonNullable<ReturnType<typeof applyVM>>; flash: FlashProps }) {
  const p = vm.product;
  const a = vm.application;
  const canApply = !a || a.status === "declined" || a.status === "withdrawn";
  return (
    <PublicPage viewer={viewer}>
      <div className="container section" style={{ maxWidth: 980 }}>
        <nav className="crumbs" aria-label="Breadcrumb">
          <a href={`/learn/${p.slug}`}>{p.title}</a> › Apply
        </nav>
        <h1 className="page-title">Apply to {p.title}</h1>
        <p className="lede">
          {p.livePlan!.cohort} cohort · {p.livePlan!.schedule} · {vm.capacity.total} seats ({vm.capacity.free > 0 ? `${vm.capacity.free} open` : "full — new applicants join the waitlist"})
        </p>
        <Flash {...flash} />
        <div className="with-aside">
          <div className="stack">
            {a && (
              <section className="card card-pad stack" aria-labelledby="app-status">
                <div className="row between">
                  <h2 id="app-status" style={h2}>
                    Your application
                  </h2>
                  <StatusBadge status={STATUS_COPY[a.status].label} />
                </div>
                <p style={{ margin: 0 }}>{STATUS_COPY[a.status].text}</p>
                <p className="tiny muted" style={{ margin: 0 }}>
                  Submitted {fmtDate(a.createdAt)}
                  {a.decidedAt ? ` · decided ${fmtDate(a.decidedAt)}` : ""}
                  {a.decisionNote ? ` · note from admissions: “${a.decisionNote}”` : ""}
                </p>
                {a.status === "accepted" && (
                  <form method="post" action="/api/v1/commerce/checkout-sessions" className="stack" style={{ ["--gap" as string]: "10px" }}>
                    <input type="hidden" name="plan" value="live_seat" />
                    <input type="hidden" name="productId" value={p.id} />
                    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                      <legend className="small" style={{ fontWeight: 700, marginBottom: 6 }}>
                        How would you like to pay?
                      </legend>
                      <label className="check">
                        <input type="radio" name="installments" value="1" defaultChecked /> Pay in full: {money(vm.price, vm.currency)}
                      </label>
                      <label className="check">
                        <input type="radio" name="installments" value="3" /> 3 monthly installments of {money(vm.installment, vm.currency)} (first today)
                      </label>
                    </fieldset>
                    <div>
                      <button className="btn btn-primary">Reserve my seat</button>
                    </div>
                    <p className="tiny muted" style={{ margin: 0 }}>Sandbox placeholder price. You'll review the payment schedule and refund terms before confirming.</p>
                  </form>
                )}
                {a.status === "reserved" && (
                  <a className="btn btn-primary" href="/app/live" style={{ alignSelf: "flex-start" }}>
                    Go to Live Sessions
                  </a>
                )}
                {(a.status === "submitted" || a.status === "accepted" || a.status === "waitlisted") && (
                  <form method="post" action={`/api/v1/live/applications/${a.id}/withdraw`}>
                    <button className="linkish small">Withdraw my application</button>
                  </form>
                )}
              </section>
            )}

            {canApply &&
              (viewer ? (
                <form method="post" action="/api/v1/live/applications" className="panel">
                  <h2 style={h2}>Your application</h2>
                  <input type="hidden" name="productId" value={p.id} />
                  <div className="field">
                    <label htmlFor="experience">
                      Your experience <span className="hint">(what you've built or studied that prepares you; at least 50 characters)</span>
                    </label>
                    <textarea id="experience" name="experience" required minLength={50} />
                  </div>
                  <div className="field">
                    <label htmlFor="motivation">
                      Why this program, and what will you build? <span className="hint">(at least 50 characters)</span>
                    </label>
                    <textarea id="motivation" name="motivation" required minLength={50} />
                  </div>
                  <button className="btn btn-primary">Submit application</button>
                  <p className="tiny muted" style={{ marginTop: 8 }}>
                    A person reviews every application. Applying is free; you pay only if you're accepted and reserve a seat.
                  </p>
                </form>
              ) : (
                <div className="panel">
                  <p>Sign in or create a free account to apply.</p>
                  <a className="btn btn-primary" href={`/login?next=${encodeURIComponent(`/learn/${p.slug}/apply`)}`}>
                    Sign in to apply
                  </a>
                </div>
              ))}
          </div>
          <aside className="card card-pad stack" aria-label="How admission works">
            <h2 style={h2}>How it works</h2>
            <ol className="small stack" style={{ ["--gap" as string]: "6px", paddingLeft: 18, margin: 0 }}>
              <li>Apply (free).</li>
              <li>Admissions reviews and accepts, waitlists or declines.</li>
              <li>If accepted, reserve your seat: {money(vm.price, vm.currency)} in full or 3 × {money(vm.installment, vm.currency)}.</li>
              <li>Complete onboarding, then join each session's 40-minute segments.</li>
              <li>Attend at least 80% of session time and finish the work to earn the certificate.</li>
            </ol>
            {vm.sessions.length > 0 && (
              <>
                <h3 className="small" style={{ margin: "8px 0 0" }}>
                  First sessions
                </h3>
                <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
                  {vm.sessions.map((s) => (
                    <li key={s.id}>
                      {fmtDateTime(s.startsAt)} — {s.title}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </aside>
        </div>
      </div>
    </PublicPage>
  );
}
