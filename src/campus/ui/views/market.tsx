import type { Tenant, TenantStore } from "../../core";
import { hasAny, type Actor } from "../../iam";
import { AID_GUIDANCE, aidQueue, enrollOptions, myAid, mySubscriptions, PLAN_LABEL, planSettings, quotePlan } from "../../services/plans";
import { api, Chip, Hidden } from "../kit";

const money = (cur: string, n: number) => `${cur} ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function TermsForm({ slug, kind, offeringId, back, label, disclosure, signedIn, next }: { slug: string; kind: string; offeringId?: string; back: string; label: string; disclosure: string; signedIn: boolean; next: string }) {
  if (!signedIn)
    return (
      <a className="btn btn-primary btn-sm" href={`/campus/${slug}/signin?next=${encodeURIComponent(next)}`}>
        Sign in to {label.charAt(0).toLowerCase() + label.slice(1)}
      </a>
    );
  const id = `t-${kind}-${offeringId ?? "all"}`;
  return (
    <form method="post" action={api(slug, "a/plans.start")} className="stack">
      <Hidden values={{ back, kind, ...(offeringId ? { offeringId } : {}), sandboxCard: "tok_sandbox_visa", notice: "Started (sandbox). Manage it any time from your account." }} />
      <p className="small terms-box" id={`${id}-terms`}>
        {disclosure}
      </p>
      <label className="check small">
        <input type="checkbox" name="acceptTerms" value="true" required aria-describedby={`${id}-terms`} /> I've read the price, renewal, cancellation and refund terms above.
      </label>
      <div>
        <button className="btn btn-primary btn-sm" type="submit">
          {label}
        </button>
      </div>
    </form>
  );
}

/** Enroll options on a course or program page — each choice says what's included and excluded. */
export function EnrollOptions({ store, slug, offeringId, actor, here }: { store: TenantStore; slug: string; offeringId: string; actor: Actor | null; here: string }) {
  const v = enrollOptions(store, offeringId, actor?.id);
  const aidHref = `/campus/${slug}/financial-aid?offeringId=${encodeURIComponent(offeringId)}`;
  return (
    <section className="stack enroll-options" aria-labelledby={`eo-${offeringId}`}>
      <h3 id={`eo-${offeringId}`} className="card-title">
        Ways to enroll
      </h3>
      {v.placeholderPrices && <p className="tiny muted">Prices are placeholders until the program team sets them. Sandbox: no real payment is taken.</p>}
      <div className="grid g2">
        {v.options.map((o) => (
          <article key={o.key} className="card card-pad stack">
            <h4>{o.title}</h4>
            <p className="small">
              <strong>{o.price}</strong>
            </p>
            <p className="tiny">Included: {o.includes.join("; ")}.</p>
            <p className="tiny muted">Not included: {o.excludes.join("; ")}.</p>
            {!o.available ? (
              <p className="tiny">{o.note}</p>
            ) : o.key === "aid" ? (
              <a className="btn btn-outline btn-sm" href={aidHref}>
                Apply for financial aid
              </a>
            ) : o.key === "program_monthly" || o.key === "plus_monthly" ? (
              <TermsForm slug={slug} kind={o.key} offeringId={o.key === "program_monthly" ? offeringId : undefined} back={here} label={o.key === "plus_monthly" ? "Start Scholaris Plus" : "Subscribe to this program"} disclosure={quotePlan(store, o.key, o.key === "program_monthly" ? offeringId : undefined, actor?.id).disclosure} signedIn={!!actor} next={here} />
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

/** Public pricing page: plan comparison, monthly vs annual cost, FAQ. */
export function PricingView({ tenant, store, actor }: { tenant: Tenant; store: TenantStore; actor: Actor | null }) {
  const s = planSettings(store);
  const pm = quotePlan(store, "plus_monthly", undefined, actor?.id);
  const pa = quotePlan(store, "plus_annual", undefined, actor?.id);
  const yearOfMonthly = s.plusMonthly * 12;
  const back = `/campus/${tenant.slug}/pricing`;
  return (
    <article className="stack">
      <h1 className="page-title">Plans and pricing</h1>
      <p>Learn free by auditing, buy a single program, subscribe to one program, or get Scholaris Plus for every eligible self-paced program. Financial aid is available.</p>
      {s.placeholder && <p className="notice notice-info">Prices shown are placeholders set for the staging site; the program team confirms final prices before launch. Sandbox: no real payment is taken.</p>}
      <div className="table-wrap" role="region" aria-label="Plan comparison" tabIndex={0}>
        <table className="table">
          <caption>Compare plans</caption>
          <thead>
            <tr>
              <th scope="col">Plan</th>
              <th scope="col">Price</th>
              <th scope="col">What you get</th>
              <th scope="col">Certificate</th>
              <th scope="col">Cancel / refund</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Audit</th>
              <td>Free</td>
              <td>Videos and readings; no graded work, labs or AI Teaching Assistant help on graded work</td>
              <td>No</td>
              <td>—</td>
            </tr>
            <tr>
              <th scope="row">One program</th>
              <td>Program price, one time (installments for live programs)</td>
              <td>Everything in that program</td>
              <td>Yes</td>
              <td>Per the program's refund policy</td>
            </tr>
            <tr>
              <th scope="row">{PLAN_LABEL.program_monthly}</th>
              <td>{money(s.currency, s.programMonthly)}/month</td>
              <td>One specialization or professional certificate while subscribed; progress kept if you pause</td>
              <td>Yes</td>
              <td>Cancel any time in one step; no partial-month refunds</td>
            </tr>
            <tr>
              <th scope="row">{PLAN_LABEL.plus_monthly}</th>
              <td>
                {money(s.currency, s.plusMonthly)}/month{pm.trialDays ? ` after a ${pm.trialDays}-day free trial` : ""}
              </td>
              <td>Every Plus-eligible self-paced program (live programs excluded unless marked)</td>
              <td>Yes</td>
              <td>Cancel any time in one step; trial reminder before the first charge</td>
            </tr>
            <tr>
              <th scope="row">{PLAN_LABEL.plus_annual}</th>
              <td>{money(s.currency, s.plusAnnual)}/year</td>
              <td>Same as Plus monthly</td>
              <td>Yes</td>
              <td>{s.refundDays}-day money-back guarantee</td>
            </tr>
            <tr>
              <th scope="row">Financial aid</th>
              <td>Up to {s.aidMaxPct}% off</td>
              <td>Apply per program; a person reviews within {s.aidDecisionDays} days</td>
              <td>Yes</td>
              <td>—</td>
            </tr>
          </tbody>
        </table>
      </div>
      <section className="card card-pad stack" aria-labelledby="calc-h">
        <h2 id="calc-h" className="card-title">
          Monthly vs annual
        </h2>
        <p>
          Twelve months of Plus monthly costs {money(s.currency, yearOfMonthly)}; Plus annual costs {money(s.currency, s.plusAnnual)}
          {yearOfMonthly > s.plusAnnual ? ` — ${money(s.currency, Math.round((yearOfMonthly - s.plusAnnual) * 100) / 100)} less if you stay subscribed for the whole year.` : "."} Annual only saves money if you'd keep Plus for most of the year.
        </p>
      </section>
      <section className="grid g2">
        <article className="card card-pad stack">
          <h2 className="card-title">{PLAN_LABEL.plus_monthly}</h2>
          <TermsForm slug={tenant.slug} kind="plus_monthly" back={back} label={pm.trialDays ? "Start free trial" : "Start Plus monthly"} disclosure={pm.disclosure} signedIn={!!actor} next={back} />
        </article>
        <article className="card card-pad stack">
          <h2 className="card-title">{PLAN_LABEL.plus_annual}</h2>
          <TermsForm slug={tenant.slug} kind="plus_annual" back={back} label="Start Plus annual" disclosure={pa.disclosure} signedIn={!!actor} next={back} />
        </article>
      </section>
      <section className="card card-pad stack" aria-labelledby="faq-h">
        <h2 id="faq-h" className="card-title">
          Questions
        </h2>
        <dl className="campus-dl">
          <dt>When am I charged?</dt>
          <dd>Plus monthly with a trial: nothing until the trial ends; we remind you {s.trialReminderDays} day(s) before. Other plans: on the day you start, then on each renewal date shown before you confirm.</dd>
          <dt>How do I cancel?</dt>
          <dd>Account → Subscriptions → Cancel. One step. You keep access to the end of the period you've paid for, and your progress stays saved.</dd>
          <dt>Can I pause?</dt>
          <dd>Yes, paid subscriptions can pause for 1–3 months; your progress is kept.</dd>
          <dt>What isn't included in Plus?</dt>
          <dd>Live cohort and weekend programs, unless a program page says it's included. Scholaris AI Academy certificates are non-credit.</dd>
          <dt>Are prices final?</dt>
          <dd>Not yet — this is a staging site with placeholder prices and sandbox payments.</dd>
        </dl>
      </section>
    </article>
  );
}

export function PlusView({ tenant, store, actor }: { tenant: Tenant; store: TenantStore; actor: Actor | null }) {
  const pm = quotePlan(store, "plus_monthly", undefined, actor?.id);
  const s = planSettings(store);
  const eligible = store.list("offerings", (o) => o.state === "published" && (!!o.inPlus || !!o.selfPaced) && o.productType !== "degree_track").slice(0, 12);
  return (
    <article className="stack">
      <h1 className="page-title">Scholaris Plus</h1>
      <p>One subscription for every Plus-eligible self-paced course, specialization and professional certificate in the Scholaris AI Academy.</p>
      <section className="grid g2">
        <article className="card card-pad">
          <h2 className="card-title">Included</h2>
          <ul>
            {pm.includes.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </article>
        <article className="card card-pad">
          <h2 className="card-title">Not included</h2>
          <ul>
            {pm.excludes.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </article>
      </section>
      <section className="card card-pad stack" aria-labelledby="plus-terms">
        <h2 id="plus-terms" className="card-title">
          Trial and refund terms
        </h2>
        <ul>
          <li>{pm.trialDays ? `${pm.trialDays}-day free trial for first-time subscribers; reminder ${s.trialReminderDays} day(s) before the first charge.` : "You've used your free trial; Plus starts on the day you subscribe."}</li>
          <li>
            Monthly: {money(s.currency, s.plusMonthly)}/month. Annual: {money(s.currency, s.plusAnnual)}/year with a {s.refundDays}-day money-back guarantee.
          </li>
          <li>Cancel in one step from your account; access continues to the end of the paid period.</li>
        </ul>
        <a className="btn btn-primary btn-sm" href={`/campus/${tenant.slug}/pricing`}>
          Compare plans and start
        </a>
      </section>
      <section className="card card-pad">
        <h2 className="card-title">Some of what's included</h2>
        <ul>
          {eligible.map((o) => (
            <li key={String(o.id)}>
              {String(o.code)} {String(o.title)}
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

export function AidView({ tenant, store, actor, offeringId, sp }: { tenant: Tenant; store: TenantStore; actor: Actor | null; offeringId?: string; sp: Record<string, string | undefined> }) {
  const s = planSettings(store);
  const programs = store.list("offerings", (o) => o.state === "published" && o.productType !== "degree_track").sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));
  const back = `/campus/${tenant.slug}/financial-aid`;
  return (
    <article className="stack">
      <h1 className="page-title">Financial aid</h1>
      <p>
        If the fee is a barrier, apply for financial aid for a specific program. Aid covers up to {s.aidMaxPct}% of the fee. A person on the Academy team reviews every application within {s.aidDecisionDays} days and emails you the decision. We only ask for what we need to decide — no documents unless the policy changes.
      </p>
      {sp.notice && <p className="notice notice-ok">{sp.notice}</p>}
      {sp.error && <p className="notice notice-error">{sp.error}</p>}
      <ol>
        <li>Choose the program and tell us about your background, financial need and goals.</li>
        <li>A reviewer reads your application (an AI may summarize it for them, but a person decides).</li>
        <li>If approved, you get a single-use aid code for your account that applies the approved discount at checkout.</li>
      </ol>
      {!actor ? (
        <a className="btn btn-primary" href={`/campus/${tenant.slug}/signin?next=${encodeURIComponent(back)}`}>
          Sign in to apply
        </a>
      ) : (
        <form method="post" action={api(tenant.slug, "a/aid.apply")} className="card card-pad stack" aria-labelledby="aid-form">
          <h2 id="aid-form" className="card-title">
            Apply
          </h2>
          <Hidden values={{ back, notice: "Application received. A person will review it and email you the decision." }} />
          <div className="field">
            <label htmlFor="aid-program">Program</label>
            <select id="aid-program" name="offeringId" defaultValue={offeringId ?? ""} required>
              <option value="">Choose a program</option>
              {programs.map((o) => (
                <option key={String(o.id)} value={String(o.id)}>
                  {String(o.code)} {String(o.title)}
                </option>
              ))}
            </select>
          </div>
          {(
            [
              ["background", "Your background (education, work, what you're doing now)"],
              ["need", "Financial need — why the fee is a barrier"],
              ["goals", "Career goals — how this program helps"],
            ] as const
          ).map(([k, l]) => (
            <div className="field" key={k}>
              <label htmlFor={`aid-${k}`}>{l}</label>
              <p className="tiny muted" id={`aid-${k}-hint`}>
                {AID_GUIDANCE[k][0]}–{AID_GUIDANCE[k][1]} words.
              </p>
              <textarea id={`aid-${k}`} name={k} rows={5} required aria-describedby={`aid-${k}-hint`} />
            </div>
          ))}
          <div className="field">
            <label htmlFor="aid-pct">Aid requested (%)</label>
            <input id="aid-pct" name="requestedPct" type="number" min={10} max={s.aidMaxPct} defaultValue={s.aidMaxPct} />
          </div>
          <label className="check small">
            <input type="checkbox" name="commitment" value="true" required /> I commit to completing the program's requirements.
          </label>
          <div>
            <button className="btn btn-primary" type="submit">
              Submit application
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

/** Account: subscriptions (cancel, pause, resume, switch, refund) and financial aid applications. */
export function AccountPlans({ store, actor, slug }: { store: TenantStore; actor: Actor; slug: string }) {
  const subs = mySubscriptions(store, actor).filter((x) => x.kind !== "legacy" || x.state === "active");
  const aid = myAid(store, actor);
  const back = `/campus/${slug}/account`;
  const form = (op: string, id: string, label: string, extra: Record<string, string> = {}, cls = "btn btn-outline btn-sm") => (
    <form method="post" action={api(slug, `a/${op}`)} key={op + label}>
      <Hidden values={{ back, subscriptionId: id, show_result: "1", ...extra }} />
      <button className={cls} type="submit">
        {label}
      </button>
    </form>
  );
  return (
    <section className="card card-pad stack" aria-labelledby="acct-plans">
      <h2 id="acct-plans" className="card-title">
        Subscriptions and financial aid
      </h2>
      {subs.length === 0 ? (
        <p className="small">
          No subscriptions. <a href={`/campus/${slug}/pricing`}>See plans</a>.
        </p>
      ) : (
        subs.map((s) => (
          <article key={s.id} className="between campus-connector">
            <div>
              <strong>{s.plan}</strong> <Chip s={s.state} />
              <p className="small">
                {money(s.currency, s.price)}/{s.period}
                {s.trialEndsAt && s.state === "trialing" ? ` · trial ends ${s.trialEndsAt.slice(0, 10)}` : ""}
                {s.state === "canceling" ? ` · canceled — access until ${s.currentPeriodEnd.slice(0, 10)}` : s.state === "paused" ? ` · paused until ${String(s.pauseUntil).slice(0, 10)}` : s.state === "ended" ? "" : ` · renews ${s.currentPeriodEnd.slice(0, 10)}`}
              </p>
            </div>
            <div className="row">
              {["trialing", "active", "paused"].includes(s.state) && form("plans.cancel", s.id, "Cancel")}
              {s.state === "active" && s.kind !== "legacy" && form("plans.pause", s.id, "Pause 1 month", { months: "1" }, "btn btn-ghost btn-sm")}
              {(s.state === "paused" || s.state === "canceling") && form("plans.resume", s.id, "Resume")}
              {s.kind === "plus_monthly" && ["trialing", "active"].includes(s.state) && form("plans.switch", s.id, "Switch to annual", { to: "plus_annual" }, "btn btn-ghost btn-sm")}
              {s.kind === "plus_annual" && s.state !== "ended" && form("plans.refund", s.id, "Request refund", {}, "btn btn-ghost btn-sm")}
            </div>
          </article>
        ))
      )}
      <h3 className="small">Financial aid applications</h3>
      {aid.length === 0 ? (
        <p className="small">
          None. <a href={`/campus/${slug}/financial-aid`}>Apply for financial aid</a>.
        </p>
      ) : (
        <ul className="small">
          {aid.map((x) => (
            <li key={x.id}>
              {x.program} <Chip s={x.state} />
              {x.approvedPct ? ` ${x.approvedPct}% — your aid code ${x.couponCode} (single use)` : x.state === "submitted" ? ` · decision by ${x.decisionDueAt.slice(0, 10)}` : x.note ? ` · ${x.note}` : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Commerce tab: the financial-aid review queue (a person decides) and plan settings. */
export function AidQueuePanel({ store, actor, slug, here }: { store: TenantStore; actor: Actor; slug: string; here: string }) {
  const q = hasAny(actor, ["admin", "registrar", "advisor"]) ? aidQueue(store, actor) : [];
  const s = planSettings(store);
  const decider = hasAny(actor, ["admin", "registrar"]);
  return (
    <div className="stack">
      <section className="card card-pad stack" aria-labelledby="aidq">
        <h2 id="aidq" className="card-title">
          Financial aid review queue
        </h2>
        <p className="small">The summary is an extract to speed reading. A person decides every application.</p>
        {q.length === 0 ? (
          <p className="small">No applications.</p>
        ) : (
          q.map((x) => (
            <article key={x.id} className="card card-pad stack">
              <p>
                <strong>{x.learner}</strong> · {x.program} <Chip s={x.state} /> {x.overdue && <span className="badge badge-red">overdue</span>}
              </p>
              <p className="tiny muted">{x.summary.label}</p>
              <p className="small">Background: {x.summary.background}</p>
              <p className="small">Need: {x.summary.need}</p>
              <p className="small">Goals: {x.summary.goals}</p>
              {decider && x.state === "submitted" && (
                <form method="post" action={api(slug, "a/aid.decide")} className="row">
                  <Hidden values={{ back: here, applicationId: x.id }} />
                  <label htmlFor={`d-${x.id}`}>Decision</label>
                  <select id={`d-${x.id}`} name="decision">
                    <option value="approved">Approve</option>
                    <option value="denied">Deny</option>
                  </select>
                  <label htmlFor={`p-${x.id}`}>Aid %</label>
                  <input id={`p-${x.id}`} name="approvedPct" type="number" min={1} max={s.aidMaxPct} defaultValue={x.requestedPct} />
                  <label className="sr-only" htmlFor={`n-${x.id}`}>
                    Note to the learner
                  </label>
                  <input id={`n-${x.id}`} name="note" placeholder="Note to the learner" />
                  <button className="btn btn-primary btn-sm" type="submit">
                    Record decision
                  </button>
                </form>
              )}
            </article>
          ))
        )}
      </section>
      {hasAny(actor, ["admin"]) && (
        <section className="card card-pad stack" aria-labelledby="plset">
          <h2 id="plset" className="card-title">
            Plan settings (placeholders)
          </h2>
          <form method="post" action={api(slug, "a/plans.settings")} className="grid g2">
            <Hidden values={{ back: here }} />
            {(
              [
                ["programMonthly", "Program monthly price", s.programMonthly],
                ["plusMonthly", "Plus monthly price", s.plusMonthly],
                ["plusAnnual", "Plus annual price", s.plusAnnual],
                ["trialDays", "Trial days", s.trialDays],
                ["refundDays", "Annual refund window (days)", s.refundDays],
                ["trialReminderDays", "Trial reminder (days before)", s.trialReminderDays],
                ["aidDecisionDays", "Aid decision time (days)", s.aidDecisionDays],
                ["aidMaxPct", "Maximum aid %", s.aidMaxPct],
              ] as const
            ).map(([k, l, v]) => (
              <div className="field" key={k}>
                <label htmlFor={`ps-${k}`}>{l}</label>
                <input id={`ps-${k}`} name={k} type="number" defaultValue={v} />
              </div>
            ))}
            <div>
              <button className="btn btn-outline btn-sm" type="submit">
                Save settings
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
