import type { TenantStore } from "../../core";
import { hasAny, type Actor } from "../../iam";
import { campaignOverview } from "../../services/campaigns";
import { GENAI } from "../../academy/genai-program";
import { api, Chip, Hidden } from "../kit";

/** Tab 60 panel: the #39 launch kit, schedule, channels, audience and sends. */
export function CampaignsPanel({ store, actor, slug, here }: { store: TenantStore; actor: Actor; slug: string; here: string }) {
  const o = campaignOverview(store, actor);
  const admin = hasAny(actor, ["admin"]);
  const zones = GENAI.zones.map((z) => z.label);
  const assetUrl = (p: string) => api(slug, `campaigns/${o.campaign.key}/assets/${p}`);
  return (
    <div className="stack campus-campaigns">
      <section className="card card-pad stack" aria-labelledby="cmp-h">
        <div className="between">
          <h2 className="card-title" id="cmp-h">
            {o.campaign.title}
          </h2>
          <Chip s={o.campaign.state} />
        </div>
        <ul className="small">
          {o.decisions.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
        <p className="row">
          <a className="btn btn-primary btn-sm" href={api(slug, `campaigns/${o.campaign.key}/program-folder.zip`)}>
            Download Scholarion_GenAI_Agentic_Program/ (.zip)
          </a>
          <a className="btn btn-outline btn-sm" href={`/campus/${slug}/programs/${GENAI.slug}`}>
            Program page
          </a>
        </p>
      </section>

      <section className="card card-pad stack" aria-labelledby="cmp-sched">
        <h2 className="card-title" id="cmp-sched">
          Live schedule — 18 sessions in {zones.length} time zones
        </h2>
        <p className="small muted">Computed per date, including daylight-saving changes (US clocks change on 14 March 2027).</p>
        <div className="table-wrap" role="region" aria-label="Session times by time zone" tabIndex={0}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Day</th>
                <th scope="col">Topic</th>
                {zones.map((z) => (
                  <th scope="col" key={z}>
                    {z}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {o.sessions.map((s) => (
                <tr key={s.n}>
                  <td>{s.n}</td>
                  <td>
                    W{s.weekend} {s.day}
                  </td>
                  <td>{s.session.topic}</td>
                  {s.zones.map((z) => (
                    <td key={z.label}>{z.time}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card card-pad stack" aria-labelledby="cmp-assets">
        <h2 className="card-title" id="cmp-assets">
          Marketing kit
        </h2>
        <ul className="stack">
          {o.assets.map((a) => (
            <li key={a.path} className="between">
              <span>
                <a href={assetUrl(a.path)}>{a.title}</a> <span className="tiny muted">{a.path}</span>
              </span>
              {a.flags.length ? <span className="badge badge-amber">Copy Checker: {a.flags.join("; ")}</span> : <span className="badge badge-green">Copy check passed</span>}
            </li>
          ))}
          <li className="between">
            <span>60-second promo video (.mp4)</span>
            <span className="badge badge-amber">needs render</span>
          </li>
        </ul>
      </section>

      <section className="card card-pad stack" aria-labelledby="cmp-day1">
        <h2 className="card-title" id="cmp-day1">
          Day 1 join details and community link
        </h2>
        <p className="small">Entered by the instructor from the meeting platform. Scholarion never generates meeting IDs or passcodes. Until they're entered, the Day 1 flyer tells people the link is emailed after registration.</p>
        <form method="post" action={api(slug, "a/campaign.settings")} className="stack">
          <Hidden values={{ back: here, campaign: o.campaign.key }} />
          <label>
            Join link (https://)
            <input name="day1JoinUrl" type="url" defaultValue={o.campaign.day1.zoomUrl ?? ""} />
          </label>
          <label>
            Meeting ID
            <input name="day1MeetingId" defaultValue={o.campaign.day1.meetingId ?? ""} />
          </label>
          <label>
            Passcode
            <input name="day1Passcode" defaultValue={o.campaign.day1.passcode ?? ""} />
          </label>
          <label>
            WhatsApp community link
            <input name="whatsappLink" type="url" defaultValue={o.campaign.whatsappLink ?? ""} />
          </label>
          {o.campaign.whatsappLinkNote && <p className="tiny muted">{o.campaign.whatsappLinkNote}</p>}
          <button className="btn btn-outline btn-sm" type="submit">
            Save
          </button>
        </form>
      </section>

      <section className="card card-pad stack" aria-labelledby="cmp-plat">
        <h2 className="card-title" id="cmp-plat">
          Meeting platform check (3-hour sessions)
        </h2>
        {o.platforms.length ? (
          <ul className="small">
            {o.platforms.map((p) => (
              <li key={p.name}>
                <strong>{p.name}</strong>: {p.limitMinutes ? `${p.limitMinutes}-minute free limit — ${p.fitsThreeHours ? "fits" : "too short for 3-hour classes"}` : "no duration limit recorded"} (verified {p.verifiedAt})
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">No verified meeting platforms in the Free Education Resource Hub yet.</p>
        )}
      </section>

      <section className="card card-pad stack" aria-labelledby="cmp-aud">
        <h2 className="card-title" id="cmp-aud">
          Email audience and sends
        </h2>
        <p>
          {o.audience.subscribed} opted in · {o.audience.unsubscribed} unsubscribed · email provider: <Chip s={o.emailProvider === "configured" ? "LIVE" : "DISABLED"} /> {o.emailProvider === "configured" ? "configured" : "not configured — sends are held, nothing leaves Scholarion"}
        </p>
        {admin && (
          <form method="post" action={api(slug, "a/campaign.send")} className="row">
            <Hidden values={{ back: here, campaign: o.campaign.key, show_result: "1" }} />
            <label htmlFor="cmp-send-asset">Email</label>
            <select id="cmp-send-asset" name="asset">
              <option value="email_1_announcement.html">Email 1 — announcement</option>
              <option value="email_2_reminder.html">Email 2 — reminder</option>
              <option value="email_3_last_chance.html">Email 3 — last chance</option>
            </select>
            <button className="btn btn-primary btn-sm" type="submit">
              Send to opted-in contacts
            </button>
          </form>
        )}
        {o.sends.length > 0 && (
          <ul className="tiny">
            {o.sends.slice(-10).map((s, i) => (
              <li key={i}>
                {s.asset} — {s.state} — {s.at.slice(0, 16).replace("T", " ")}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card card-pad stack" aria-labelledby="cmp-ch">
        <h2 className="card-title" id="cmp-ch">
          Channels (posted by a person, never automatically)
        </h2>
        {o.channels.map((ch) => (
          <article key={ch.id} className="between campus-connector">
            <div>
              <strong>{ch.name}</strong> <Chip s={ch.state} />
              <p className="small">{ch.how}</p>
              <p className="tiny muted">{ch.rules}</p>
              {ch.postedUrl && (
                <p className="tiny">
                  Posted: <a href={ch.postedUrl}>{ch.postedUrl}</a>
                </p>
              )}
            </div>
            {ch.state !== "live" && (
              <form method="post" action={api(slug, "a/campaign.posted")} className="row">
                <Hidden values={{ back: here, channelId: ch.id }} />
                <label className="sr-only" htmlFor={`posted-${ch.id}`}>
                  Link to the post on {ch.name}
                </label>
                <input id={`posted-${ch.id}`} name="url" type="url" placeholder="https://…" />
                <button className="btn btn-outline btn-sm" type="submit">
                  Mark posted
                </button>
              </form>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}

/** Public opt-in form for program updates (shown on the program page). */
export function CampaignOptIn({ slug, back }: { slug: string; back: string }) {
  return (
    <section className="card card-pad stack" id="updates" aria-labelledby="optin-h">
      <h2 className="card-title" id="optin-h">
        Get program updates by email
      </h2>
      <form method="post" action={api(slug, "a/campaign.subscribe")} className="stack">
        <Hidden values={{ back, campaign: "genai-2027", notice: "Thanks — you're subscribed. Every email has an unsubscribe link." }} />
        <div className="grid g2">
          <div className="field">
            <label htmlFor="optin-email">Email</label>
            <input id="optin-email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="optin-name">Name (optional)</label>
            <input id="optin-name" name="name" autoComplete="name" />
          </div>
        </div>
        <label className="check small">
          <input type="checkbox" name="consent" value="true" required /> I agree to receive Scholarion program updates by email. I can unsubscribe at any time.
        </label>
        <div>
          <button className="btn btn-primary btn-sm" type="submit">
            Subscribe
          </button>
        </div>
      </form>
    </section>
  );
}
