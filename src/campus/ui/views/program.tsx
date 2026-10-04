import type { Tenant, TenantStore } from "../../core";
import { CampusError } from "../../core";
import type { Actor } from "../../iam";
import * as prog from "../../services/programs";
import { api, Chip, Denied, Empty, Hidden } from "../kit";
import LocalTime from "../../../ui/components/client/LocalTime";

type SP = Record<string, string | undefined>;

const etFmt = (iso: string, withTime = true) => {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: withTime ? "short" : undefined, month: "short", day: "numeric", year: withTime ? undefined : "numeric", hour: withTime ? "numeric" : undefined, minute: withTime ? "2-digit" : undefined, timeZoneName: withTime ? "short" : undefined }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16);
  }
};
const money = (n: number, c: string) => `${c} ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** Programs index (Academy). */
export function ProgramIndexView({ tenant, store }: { tenant: Tenant; store: TenantStore }) {
  const list = prog.programIndex(store);
  return (
    <div className="stack">
      <h1 className="page-title">Programs</h1>
      <p className="muted">Certificate programs from {tenant.name}. Non-credit professional training; fees shown are sandbox prices on this staging site.</p>
      {list.length ? (
        <ul className="grid g2 campus-cards" aria-label="Programs">
          {list.map((p) => (
            <li key={p.slug} className="card card-pad stack">
              <p className="tiny muted">
                Program {p.code} · {p.weeks} weeks · {p.track}
              </p>
              <h2 className="card-title">
                <a href={`/campus/${tenant.slug}/programs/${p.slug}`}>{p.title}</a>
              </h2>
              <p className="small">{p.valueStatement}</p>
              <p className="small">
                <strong>{money(p.price, p.currency)}</strong> <span className="tiny muted">(sandbox)</span>
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="No programs are published yet." />
      )}
    </div>
  );
}

/** One program website page — every section generated from the program design and the catalog. */
export function ProgramPageView({ tenant, store, actor, slug, sp }: { tenant: Tenant; store: TenantStore; actor: Actor | null; slug: string; sp: SP }) {
  let p: ReturnType<typeof prog.programPage>;
  try {
    p = prog.programPage(store, actor, slug);
  } catch (e) {
    return <Denied message={e instanceof CampusError ? e.message : String(e)} />;
  }
  const s = p.spec;
  const here = `/campus/${tenant.slug}/programs/${p.slug}`;
  const myApp = actor ? store.list("applications", (x) => x.offeringId === p.offeringId && x.userId === actor.id).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)))[0] : undefined;
  const enrolled = actor ? store.list("offering_enrollments", (e) => e.offeringId === p.offeringId && e.userId === actor.id && e.state !== "cancelled").length > 0 : false;
  const passedCheck = actor ? store.list("selfcheck_attempts", (x) => x.offeringId === p.offeringId && x.userId === actor.id && !!x.passed).length > 0 : false;
  const selfResult = sp.selfcheck ? store.get("selfcheck_attempts", sp.selfcheck) : undefined;
  const cur = p.facts.currency;
  return (
    <article className="stack campus-program" aria-labelledby="pg-title">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(p.jsonLd).replace(/</g, "\\u003c") }} />
      {sp.notice && (
        <p className="notice notice-ok" role="status">
          {sp.notice}
        </p>
      )}
      {sp.error && (
        <p className="notice notice-err" role="alert">
          {sp.error}
        </p>
      )}

      {/* 1. Hero */}
      <header className="card card-pad stack campus-program-hero">
        <p className="eyebrow">
          Scholaris AI Academy · Program {s.code} · {s.track}
        </p>
        <h1 id="pg-title" className="page-title">
          {s.title}
        </h1>
        <p className="lead">{s.valueStatement}</p>
        <dl className="campus-facts">
          <div>
            <dt>Start date</dt>
            <dd>{p.facts.startDate ? etFmt(p.facts.startDate, false) : "To be announced"}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{p.facts.duration}</dd>
          </div>
          <div>
            <dt>Format</dt>
            <dd>{s.formatText}</dd>
          </div>
          <div>
            <dt>Weekly time</dt>
            <dd>{p.facts.weeklyHours}</dd>
          </div>
          <div>
            <dt>Fee</dt>
            <dd>
              {money(p.fees.earlyBird?.price ?? p.fees.price, cur)}
              {p.fees.earlyBird ? ` early registration (then ${money(p.fees.price, cur)})` : ""} <span className="tiny muted">sandbox price</span>
            </dd>
          </div>
          {p.facts.lastDayToEnroll && (
            <div>
              <dt>Last day to enroll</dt>
              <dd>{etFmt(p.facts.lastDayToEnroll)}</dd>
            </div>
          )}
        </dl>
        <div className="row">
          <a className="btn btn-primary" href="#apply">
            Apply Now
          </a>
          <a className="btn btn-outline" href={p.brochureUrl}>
            Download Brochure (PDF)
          </a>
          <a className="btn btn-outline" href="#teams">
            Team enrollment
          </a>
        </div>
      </header>

      {/* 2. Overview */}
      <section className="card card-pad stack" aria-labelledby="pg-overview">
        <h2 id="pg-overview" className="card-title">
          Program overview
        </h2>
        {s.overview.map((t) => (
          <p key={t}>{t}</p>
        ))}
      </section>

      {/* 3. Outcomes */}
      <section className="card card-pad stack" aria-labelledby="pg-learn">
        <h2 id="pg-learn" className="card-title">
          What you&apos;ll learn
        </h2>
        <ol>
          {s.outcomes.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ol>
      </section>

      {/* 4. Audience */}
      <section className="card card-pad stack" aria-labelledby="pg-who">
        <h2 id="pg-who" className="card-title">
          Who it&apos;s for and prerequisites
        </h2>
        <ul>
          {s.audience.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <p>
          <strong>Prerequisites:</strong> {s.prerequisites}
        </p>
        <p>
          <strong>{s.codingRequirement}</strong>
        </p>
      </section>

      {/* Prerequisite self-check (#26) */}
      {s.selfCheck && (
        <section className="card card-pad stack" id="self-check" aria-labelledby="pg-sc">
          <h2 id="pg-sc" className="card-title">
            Prerequisite self-check
          </h2>
          <p className="small">Required before you apply. {s.selfCheck.questions.length} short questions; {s.selfCheck.passMin} correct answers needed.</p>
          {selfResult && (
            <p className={`notice ${selfResult.passed ? "notice-ok" : "notice-warn"}`} role="status">
              You scored {String(selfResult.score)}/{String(selfResult.of)}.{" "}
              {selfResult.passed ? "You're ready — continue to Apply." : `We recommend starting with ${((selfResult.routeTo as string[]) ?? []).join(" or ")} first. A program advisor can help you choose.`}
            </p>
          )}
          {passedCheck && !selfResult ? (
            <p className="notice notice-ok">You passed the self-check.</p>
          ) : (
            <form method="post" action={api(tenant.slug, "a/programs.self_check")} className="stack">
              <Hidden values={{ back: `${here}#self-check`, offeringId: p.offeringId, result_param: "selfcheck", notice: "Self-check scored." }} />
              {s.selfCheck.questions.map((q, i) => (
                <fieldset key={q.id} className="card card-pad">
                  <legend>
                    {i + 1}. {q.prompt}
                  </legend>
                  {q.options.map((o) => (
                    <label key={o} className="check">
                      <input type="radio" name={`ans__${q.id}`} value={o} required /> {o}
                    </label>
                  ))}
                </fieldset>
              ))}
              <div>
                <button className="btn btn-outline btn-sm" type="submit">
                  Check my readiness
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* 5. Curriculum */}
      <section className="card card-pad stack" aria-labelledby="pg-cur">
        <h2 id="pg-cur" className="card-title">
          Curriculum
        </h2>
        {s.blocks.length > 1 && (
          <p className="small">
            {s.blocks.map((b) => `${b.title} (Weeks ${b.weeks})`).join(" · ")}
          </p>
        )}
        {s.curriculum.map((w) => (
          <details key={w.week} className="campus-acc">
            <summary>
              Week {w.week}: {w.title} {w.optional && <span className="badge">optional</span>} {w.kind === "capstone" && <span className="badge badge-gold">capstone</span>}
              {w.kind === "midterm" && <span className="badge badge-blue">midterm</span>}
            </summary>
            <p>{w.focus}</p>
            {w.labs && (
              <ul>
                <li>Lab A: {w.labs[0]}</li>
                <li>Lab B: {w.labs[1]}</li>
              </ul>
            )}
          </details>
        ))}
        {s.electives?.length ? (
          <p className="small">
            <strong>Optional electives</strong> (don&apos;t count toward completion): {s.electives.join("; ")}.
          </p>
        ) : null}
      </section>

      {/* Live schedule (#26) */}
      {p.liveSchedule.length > 0 && (
        <section className="card card-pad stack" aria-labelledby="pg-sched">
          <h2 id="pg-sched" className="card-title">
            Live schedule
          </h2>
          <p className="small">Times in Eastern Time (ET) with your local time. Sessions run 90 minutes; schedule subject to change.</p>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Live schedule">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Session</th>
                  <th scope="col">When (ET)</th>
                </tr>
              </thead>
              <tbody>
                {p.liveSchedule.map((e) => (
                  <tr key={`${e.title}-${e.startsAt}`}>
                    <td>{e.title}</td>
                    <td>
                      <time dateTime={e.startsAt}>{etFmt(e.startsAt)}</time>
                      <LocalTime iso={e.startsAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 6. Projects */}
      <section className="card card-pad stack" aria-labelledby="pg-proj">
        <h2 id="pg-proj" className="card-title">
          Projects and capstone
        </h2>
        <ul className="grid g2">
          {s.projects.map((pr) => (
            <li key={pr.key} className="card card-pad stack">
              <p className="tiny muted">{pr.kind === "capstone" ? "Capstone" : pr.kind === "midterm" ? "Midterm project" : "Project"} · Week {pr.week}</p>
              <h3 className="card-title">{pr.name}</h3>
              <p className="small">{pr.description}</p>
              <p className="tiny">Skills: {pr.skills.join(", ")}</p>
            </li>
          ))}
        </ul>
        <p className="tiny muted">All project data is synthetic or properly licensed and comes with a data card.</p>
      </section>

      {/* Research case studies (#26) */}
      {s.research?.length ? (
        <section className="card card-pad stack" aria-labelledby="pg-res">
          <h2 id="pg-res" className="card-title">
            Research case studies
          </h2>
          <ul>
            {s.research.map((r) => (
              <li key={r.title}>
                {r.authors} ({r.year}). <cite>{r.title}</cite>. {r.venue}. <span className="tiny muted">Week {r.week}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 7. Tools */}
      <section className="card card-pad stack" aria-labelledby="pg-tools">
        <h2 id="pg-tools" className="card-title">
          Tools you&apos;ll use
        </h2>
        <dl className="campus-dl">
          {s.tools.map((g) => (
            <div key={g.family}>
              <dt>{g.family}</dt>
              <dd>{g.items.join(", ")}</dd>
            </div>
          ))}
        </dl>
        <p className="tiny muted">{p.trademark} Versions are verified and pinned in the Scholaris Cloud Lab at cohort start. Model API access uses Scholaris-issued sandbox keys with spend caps and automatic expiry.</p>
      </section>

      {/* 8. Learning experience */}
      <section className="card card-pad stack" aria-labelledby="pg-exp">
        <h2 id="pg-exp" className="card-title">
          Learning experience
        </h2>
        <ul>
          {s.learningExperience.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </section>

      {/* 9. Faculty (confirmed only) */}
      <section className="card card-pad stack" aria-labelledby="pg-fac">
        <h2 id="pg-fac" className="card-title">
          Faculty and mentors
        </h2>
        <ul>
          {s.faculty.map((f) => (
            <li key={f.name}>
              <strong>{f.name}</strong>, {f.role}
              {f.bio ? <p className="small">{f.bio}</p> : null}
            </li>
          ))}
        </ul>
        <p className="tiny muted">Additional faculty, facilitators and mentors are listed once confirmed.</p>
      </section>

      {/* 10. Certificate */}
      <section className="card card-pad stack" aria-labelledby="pg-cert">
        <h2 id="pg-cert" className="card-title">
          Certificate
        </h2>
        <figure className="campus-cert-sample" aria-label="Sample certificate">
          <p className="tiny muted">SAMPLE</p>
          <p className="campus-cert-name">Learner Legal Name</p>
          <p>{s.credential.certificate}</p>
          <p className="tiny">Verification ID: SAMPLE-0000 · Scholaris AI Academy</p>
        </figure>
        <p>{s.credential.description}</p>
        <p>
          <strong>Badge:</strong> {s.credential.badge}
        </p>
        <p>{p.ceuStatement}</p>
        <p>{s.creditStatement}</p>
        <p className="small">
          Verify any credential at <a href={`/campus/${tenant.slug}/verify/SAMPLE`}>the verification page</a> using its ID.
        </p>
      </section>

      {/* 11. Career services */}
      <section className="card card-pad stack" aria-labelledby="pg-car">
        <h2 id="pg-car" className="card-title">
          Career services
        </h2>
        <ul>
          {s.careerServices.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <p className="tiny muted">We don&apos;t publish pay or placement figures unless they come from verified Scholaris data with a citation.</p>
      </section>

      {/* 12. Fees and financing */}
      <section className="card card-pad stack" id="fees" aria-labelledby="pg-fees">
        <h2 id="pg-fees" className="card-title">
          Fees and financing
        </h2>
        <p>
          <strong>Program fee:</strong> {money(p.fees.price, cur)}
          {p.fees.earlyBird ? ` · Early registration ${money(p.fees.earlyBird.price, cur)} until ${etFmt(p.fees.earlyBird.endsAt)}` : ""}
        </p>
        {p.parts.length > 0 && (
          <ul>
            {p.parts.map((pt) => (
              <li key={pt.code}>
                {pt.code} {pt.title} on its own: {money(pt.price, cur)} (Weeks {pt.weeks})
              </li>
            ))}
          </ul>
        )}
        <ul>
          <li>{p.fees.installments.terms}</li>
          <li>Team and group pricing: {p.fees.team}</li>
          <li>Referral credit: {p.fees.referral}</li>
          <li>Employer sponsorship: we provide a sponsorship letter and invoice on request.</li>
        </ul>
        <p className="small">{s.fundingStatement}</p>
        <p className="notice notice-info">Staging site: all fees are admin-configured sandbox values and payments are sandbox only until go-live.</p>
      </section>

      {/* 13. Cohorts */}
      <section className="card card-pad stack" aria-labelledby="pg-coh">
        <h2 id="pg-coh" className="card-title">
          Cohort schedule and deadlines
        </h2>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Cohorts">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Cohort</th>
                <th scope="col">Starts</th>
                <th scope="col">Application deadline</th>
                <th scope="col">Early-bird deadline</th>
                <th scope="col">Seats left</th>
              </tr>
            </thead>
            <tbody>
              {p.cohorts.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.code}
                    <br />
                    <span className="tiny muted">{c.schedule}</span>
                  </td>
                  <td>{etFmt(c.startsAt)}</td>
                  <td>{etFmt(c.applicationDeadline)}</td>
                  <td>{p.fees.earlyBird ? etFmt(p.fees.earlyBird.endsAt) : "—"}</td>
                  <td>{c.seatsLeft}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny muted">
          Times in Eastern Time ({p.cohorts[0]?.timeZone ?? "America/New_York"}). Late enrollment is allowed up to {s.lateEnrollmentDays} days after the start{s.code === "#26" ? "; Week 1 lab deadlines extend automatically" : ""}. Access lasts {s.accessMonths} months from the start date.
        </p>
      </section>

      {/* 14. How to apply */}
      <section className="card card-pad stack" id="apply" aria-labelledby="pg-apply">
        <h2 id="pg-apply" className="card-title">
          How to apply
        </h2>
        <ol>
          {p.howToApply.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ol>
        {enrolled ? (
          <p className="notice notice-ok">
            You&apos;re enrolled. <a href={`/campus/${tenant.slug}/dashboard`}>Go to your dashboard</a> for orientation.
          </p>
        ) : !actor ? (
          <p>
            <a className="btn btn-primary" href={`/campus/${tenant.slug}/signin?next=${encodeURIComponent(`${here}#apply`)}`}>
              Sign in to apply
            </a>
          </p>
        ) : myApp?.state === "admitted" ? (
          <form method="post" action={api(tenant.slug, "a/commerce.checkout")} className="stack card card-pad">
            <p className="notice notice-ok">You&apos;ve been admitted. Reserve your seat (sandbox payment).</p>
            <Hidden values={{ back: `${here}#apply`, offeringId: p.offeringId, sectionId: p.nextCohort?.id, sandboxCard: "tok_sandbox_visa", notice: "Seat reserved (sandbox). Orientation is in your course." }} />
            <fieldset>
              <legend className="small">Payment plan</legend>
              <label className="check">
                <input type="radio" name="plan" value="full" defaultChecked /> Pay in full
              </label>
              <label className="check">
                <input type="radio" name="plan" value="installments" /> {p.fees.installments.terms}
              </label>
              <input type="hidden" name="installments" value={String(p.fees.installments.count)} />
            </fieldset>
            <div>
              <button className="btn btn-primary" type="submit">
                Reserve my seat
              </button>
            </div>
          </form>
        ) : myApp ? (
          <p className="notice notice-info">
            Application status: <Chip s={String(myApp.state)} />
          </p>
        ) : s.selfCheck && !passedCheck ? (
          <p className="notice notice-warn">
            Complete the <a href="#self-check">prerequisite self-check</a> before applying.
          </p>
        ) : (
          <form method="post" action={api(tenant.slug, "a/programs.apply")} className="stack">
            <Hidden values={{ back: `${here}#apply`, offeringId: p.offeringId, sectionId: p.nextCohort?.id, notice: "Application submitted. We'll notify you of the decision." }} />
            <div className="field">
              <label htmlFor="pg-stmt">Why this program, and what do you want to build? (required)</label>
              <textarea id="pg-stmt" name="statement" rows={5} required minLength={40} maxLength={5000} />
            </div>
            <div className="field">
              <label htmlFor="pg-exp">Relevant experience (optional)</label>
              <textarea id="pg-exp" name="experience" rows={3} maxLength={2000} />
            </div>
            <div>
              <button className="btn btn-primary" type="submit">
                Submit application
              </button>
            </div>
          </form>
        )}
      </section>

      {/* 15. Teams */}
      <section className="card card-pad stack" id="teams" aria-labelledby="pg-teams">
        <h2 id="pg-teams" className="card-title">
          For teams and organizations
        </h2>
        <p className="small">{p.fees.team}</p>
        <form method="post" action={api(tenant.slug, "a/programs.inquire")} className="stack">
          <Hidden values={{ back: `${here}#teams`, offeringId: p.offeringId, kind: "team", notice: "Thanks — a program advisor will contact you about team enrollment within 2 business days." }} />
          <div className="grid g2">
            <div className="field">
              <label htmlFor="tm-name">Your name</label>
              <input id="tm-name" name="name" required autoComplete="name" />
            </div>
            <div className="field">
              <label htmlFor="tm-email">Work email</label>
              <input id="tm-email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="field">
              <label htmlFor="tm-org">Organization</label>
              <input id="tm-org" name="organization" required autoComplete="organization" />
            </div>
            <div className="field">
              <label htmlFor="tm-seats">Seats</label>
              <input id="tm-seats" name="seats" type="number" min={2} max={1000} required />
            </div>
          </div>
          <div className="field">
            <label htmlFor="tm-msg">Anything we should know? (optional)</label>
            <textarea id="tm-msg" name="message" rows={3} maxLength={2000} />
          </div>
          <div>
            <button className="btn btn-outline btn-sm" type="submit">
              Send team inquiry
            </button>
          </div>
        </form>
      </section>

      {/* 16. FAQs */}
      <section className="card card-pad stack" aria-labelledby="pg-faq">
        <h2 id="pg-faq" className="card-title">
          FAQs
        </h2>
        {s.faqs.map((f) => (
          <details key={f.q} className="campus-acc">
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </section>

      {/* 17. Contact */}
      <section className="card card-pad stack" aria-labelledby="pg-contact">
        <h2 id="pg-contact" className="card-title">
          Talk to a program advisor
        </h2>
        {p.contact.advisorEmail && (
          <p className="small">
            Email: <a href={`mailto:${p.contact.advisorEmail}`}>{p.contact.advisorEmail}</a>
            {p.contact.advisorPhone ? ` · Phone: ${p.contact.advisorPhone}` : ""}
          </p>
        )}
        <form method="post" action={api(tenant.slug, "a/programs.inquire")} className="stack">
          <Hidden values={{ back: `${here}#pg-contact`, offeringId: p.offeringId, kind: "advisor", notice: "Thanks — an advisor will email you to confirm a time." }} />
          <div className="grid g2">
            <div className="field">
              <label htmlFor="ad-name">Your name</label>
              <input id="ad-name" name="name" required autoComplete="name" />
            </div>
            <div className="field">
              <label htmlFor="ad-email">Email</label>
              <input id="ad-email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="field">
              <label htmlFor="ad-time">Preferred day and time</label>
              <input id="ad-time" name="preferredTime" placeholder="e.g. Tuesday afternoon" />
            </div>
            <div className="field">
              <label htmlFor="ad-tz">Your time zone</label>
              <input id="ad-tz" name="timeZone" placeholder="e.g. Africa/Lagos" />
            </div>
          </div>
          <div>
            <button className="btn btn-outline btn-sm" type="submit">
              Request an advisor call
            </button>
          </div>
        </form>
      </section>

      {/* 18. Social proof — only consented Scholaris testimonials; hidden otherwise */}
      {p.showSocialProof && (
        <section className="card card-pad stack" aria-labelledby="pg-voices">
          <h2 id="pg-voices" className="card-title">
            From our learners
          </h2>
          {p.testimonials.map((t) => (
            <blockquote key={t.name + t.quote}>
              <p>{t.quote}</p>
              <footer className="small">— {t.name}</footer>
            </blockquote>
          ))}
        </section>
      )}
    </article>
  );
}
