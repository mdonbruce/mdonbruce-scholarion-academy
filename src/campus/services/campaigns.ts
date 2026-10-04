import crypto from "node:crypto";
import { broker, CampusError, nowIso, type Row, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import { audit } from "./common";
import { copyCheck } from "./claims";
import { zip } from "./files";
import { approvedPolicy, offeringIdFor } from "./programs";
import { GENAI, NOT_AFFILIATED, PROJECTS, TOOL_GROUPS, WEEKENDS, genaiSessions } from "../academy/genai-program";
import { LEAD_FACULTY, fitSize } from "../../brand/faculty";
import { facultyDataUri } from "../../brand/faculty-assets";
import { T as ECO } from "./ecosystem/shared";
import { connectorStatus } from "./platform";

/**
 * Program Marketing & Campaigns (Tab 60): the #39 marketing kit, consented audiences and
 * outreach. Rules that keep it honest and lawful:
 * - Every asset is original Scholarion copy, checked by the Catalog Copy Checker (no invented
 *   statistics, rankings, salaries or guarantees). Offer prices carry their end date.
 * - Email goes only to people who opted in, every message has a working unsubscribe link and the
 *   sender's contact details, and nothing is sent unless an email provider is configured.
 * - Third-party platforms (event sites, forums, social networks) are never posted to
 *   automatically: the kit prepares the copy and each platform's rules, and a person posts it
 *   and records the link. Meeting IDs and passcodes are entered by the instructor, never invented.
 */

const STAFF = ["admin", "designer", "advisor"] as const;
const requireStaff = (store: TenantStore, a: Actor, action: string) => {
  if (!hasAny(a, [...STAFF])) {
    store.audit({ actorId: a.id, actorRoles: a.roles, action, resource: "campaigns", outcome: "denied", reason: "role" });
    throw new CampusError("forbidden", "Marketing staff only.", 403);
  }
};
const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const money = (n: number) => `${GENAI.currency} ${n.toLocaleString("en-US")}`;

export const CHANNELS: { key: string; name: string; how: string; rules: string }[] = [
  { key: "landing", name: "Scholarion program page", how: "Published automatically from the catalog (this site).", rules: "Copy passes the Copy Checker; offer end date shown." },
  { key: "email", name: "Email to opted-in contacts", how: "Sent from Scholarion through the configured email provider.", rules: "Opt-in only; unsubscribe link and sender contact details in every message (CAN-SPAM / GDPR / NDPR)." },
  { key: "whatsapp", name: "WhatsApp broadcast / community", how: "Copy the broadcast text into WhatsApp Business; send only to contacts who opted in.", rules: "Recipients must have opted in and saved the number; respect WhatsApp Business policies." },
  { key: "linkedin", name: "LinkedIn post", how: "Post the prepared text from the Scholarion page or the instructor's profile.", rules: "Post manually; follow LinkedIn's Professional Community Policies." },
  { key: "instagram", name: "Instagram post / story", how: "Use the 1080×1350 program flyer and the prepared caption.", rules: "Post manually from the Scholarion account." },
  { key: "eventbrite", name: "Eventbrite (free Day 1 class)", how: "Create a free event for Day 1 and paste the prepared description.", rules: "One accurate listing; follow Eventbrite's community guidelines." },
  { key: "meetup", name: "Meetup", how: "Only in a group Scholarion runs, or with the organizer's permission.", rules: "No posting to other groups without permission." },
  { key: "classcentral", name: "Class Central", how: "Submit the program through Class Central's own provider process.", rules: "Their editors decide on listing; no automated submission." },
  { key: "reddit", name: "Reddit communities", how: "Only where a community's rules allow self-promotion, and from an account that participates there.", rules: "Read each subreddit's rules first; many forbid promotion. Never automate." },
  { key: "github", name: "GitHub Discussions", how: "Only in Scholarion's own repositories.", rules: "Don't post course ads in other projects' discussions." },
];

/* ---------------- shared pieces ---------------- */

function photo(maxH = 200) {
  const f = LEAD_FACULTY;
  const size = fitSize(f.photo, Math.round((maxH * f.photo.width) / f.photo.height), maxH);
  return `<img src="${facultyDataUri(f) ?? f.photo.src}" width="${size.width}" height="${size.height}" alt="${esc(f.photo.alt)}" style="border-radius:14px;border:3px solid #f2c66d;object-fit:cover;object-position:top">`;
}

function offerEnd(store: TenantStore) {
  const o = store.get("offerings", offeringIdFor(broker.tenant(store.tenantId)!.slug, GENAI.code));
  return (o?.earlyBirdEndsAt as string) ?? null;
}

export function liveSetting(store: TenantStore, campaign: Row) {
  return { zoomUrl: (campaign.day1JoinUrl as string) ?? null, meetingId: (campaign.day1MeetingId as string) ?? null, passcode: (campaign.day1Passcode as string) ?? null, whatsappLink: (campaign.whatsappLink as string) ?? null };
}

/** Meeting platforms whose verified free limit can't hold a 3-hour session. */
export function platformCheck(store: TenantStore) {
  const meetings = store.list(ECO.resources, (r) => r.category === "meeting" && r.status === "verified");
  return meetings.map((m) => {
    const lim = ((m.limits as { metric: string; value: number | string; unit: string }[]) ?? []).find((l) => /duration/.test(l.metric) && !/one_to_one/.test(l.metric) && typeof l.value === "number");
    return { name: String(m.name), limitMinutes: lim ? Number(lim.value) : null, fitsThreeHours: lim ? Number(lim.value) >= GENAI.sessionMinutes : null, verifiedAt: String(m.verifiedAt ?? "").slice(0, 10) };
  });
}

/* ---------------- kit assets ---------------- */

export interface Asset {
  path: string;
  kind: "html" | "md" | "txt" | "ics" | "csv";
  title: string;
  body: string;
  audience: "public" | "staff";
}

const FLYER_CSS = `*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#060d24}.f{margin:0 auto;background:#0b1f4d;color:#fff;overflow:hidden;position:relative}.top{padding:40px 48px 24px;background:linear-gradient(135deg,#0b1f4d,#13306e)}.brand{display:inline-block;background:#f2c66d;color:#0b1f4d;font-weight:800;letter-spacing:.08em;padding:6px 14px;border-radius:999px;font-size:18px}h1{font:900 64px/1.02 Arial,sans-serif;margin:18px 0 8px;text-transform:uppercase}.y{color:#f2c66d}.c{color:#7dd3fc}.band{background:#f2c66d;color:#0b1f4d;padding:18px 48px;font-weight:800;font-size:24px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:28px 48px}.box{background:#06122e;border:1px solid #2b4a8b;border-radius:16px;padding:18px}.box h2{margin:0 0 10px;font-size:20px;color:#f2c66d;text-transform:uppercase}.box li{margin:6px 0;font-size:17px}.tools{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.tools span{background:#0b1f4d;border:1px solid #2b4a8b;border-radius:8px;padding:6px;font-size:14px;text-align:center}.who{display:flex;gap:18px;align-items:center;padding:0 48px 24px}.price{font-size:44px;font-weight:900}.foot{background:#06122e;border-top:4px solid #c0392b;padding:20px 48px;font-size:17px;line-height:1.5}.small{font-size:13px;opacity:.85}.red{background:#c0392b;color:#fff;display:inline-block;padding:6px 14px;border-radius:8px;font-weight:800}table{border-collapse:collapse;width:100%}.compact .top{padding:30px 48px 18px}.compact h1{font-size:54px;margin:12px 0 6px}.compact .band{padding:12px 48px;font-size:21px}.compact .grid{padding:18px 48px;gap:14px}.compact .box{padding:14px}.compact .box li{font-size:16px;margin:4px 0}.compact .price{font-size:38px;margin:4px 0}.compact .box p{margin:6px 0}.compact .who{padding:0 48px 14px}.compact .foot{position:absolute;bottom:0;left:0;right:0;padding:14px 48px;font-size:16px}td{border:1px solid #2b4a8b;padding:8px;font-size:17px;text-align:center}`;

function flyerProgram(store: TenantStore, campaign: Row) {
  const ses = genaiSessions();
  const end = offerEnd(store);
  const s = liveSetting(store, campaign);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=1080"><title>${esc(GENAI.title)} — program flyer</title><style>${FLYER_CSS}</style></head><body>
<article class="f compact" style="width:1080px;height:1350px" aria-label="Program flyer">
<header class="top"><span class="brand">SCHOLARION ACADEMY</span><h1>GenAI, Agentic AI <span class="y">&amp;</span> AI Agents</h1><p class="c" style="font-size:30px;font-weight:800;margin:0">HANDS-ON PROFESSIONAL PROGRAM</p><p style="font-size:22px;margin:12px 0 0">Build a real AI application every weekend — live, guided and hands-on.</p></header>
<div class="band">9 WEEKENDS · ${esc(fmtDate(ses[0].startUtc))} – ${esc(fmtDate(ses[ses.length - 1].startUtc))} · SAT &amp; SUN 6:00–9:00 AM US EASTERN</div>
<section class="grid"><div class="box"><h2>What you'll build skills in</h2><ul>${WEEKENDS.map((w) => `<li>${esc(w.title)}</li>`).join("")}</ul></div>
<div class="box"><h2>Tools you'll use</h2><div class="tools">${TOOL_GROUPS.flatMap((g) => g.items).filter((x) => x.name !== "Python").slice(0, 15).map((x) => `<span>${esc(x.name)}</span>`).join("")}</div><p class="small">${esc(NOT_AFFILIATED)}</p></div>
<div class="box"><h2>Projects you'll ship</h2><ul>${PROJECTS.map((p) => `<li>${esc(p.name.replace(/^P\d /, ""))}</li>`).join("")}</ul></div>
<div class="box"><h2>Tuition</h2><p class="price">${esc(money(GENAI.offerPrice))}</p><p>Regular ${esc(money(GENAI.listPrice))}${end ? ` · offer ends ${esc(fmtDate(end))}` : " · offer end date to be confirmed"}</p><p class="small">Returning Scholarion learners: ask about a returning-student discount by phone.</p>${GENAI.freeDay1 ? `<p><span class="red">DAY 1 IS FREE</span></p>` : ""}</div></section>
<div class="who">${photo(170)}<div><p style="font-size:24px;font-weight:800;margin:0">${esc(LEAD_FACULTY.name)}</p><p style="margin:4px 0">${esc(LEAD_FACULTY.role)}, Scholarion Academy</p><p class="small">Live instructor-led · recordings within 24 hours · labs in the Scholarion Agentic Cloud Labs · verifiable certificate</p></div></div>
<footer class="foot"><strong>Register:</strong> ${esc(GENAI.contact.website)} · <strong>Email:</strong> ${esc(GENAI.contact.email)} · <strong>Phone / WhatsApp:</strong> ${esc(GENAI.contact.phone)}${s.whatsappLink ? `<br><strong>WhatsApp community:</strong> ${esc(s.whatsappLink)}` : ""}<br><span class="small">No AI experience required. Every lab can be completed at no cost with local and open-source tools; paid APIs are optional.</span></footer>
</article></body></html>`;
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: GENAI.timeZone, day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

function flyerDay1(store: TenantStore, campaign: Row) {
  const first = genaiSessions()[0];
  const s = liveSetting(store, campaign);
  const join = s.zoomUrl || s.meetingId ? `<table><tr><td>Join link</td><td>${esc(s.zoomUrl ?? "—")}</td></tr><tr><td>Meeting ID</td><td>${esc(s.meetingId ?? "—")}</td></tr><tr><td>Passcode</td><td>${esc(s.passcode ?? "—")}</td></tr></table>` : `<p style="font-size:22px">Register at <strong>${esc(GENAI.contact.website)}</strong> — the join link is emailed to registered learners before class.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=1080"><title>Free Day 1 live class — flyer</title><style>${FLYER_CSS}</style></head><body>
<article class="f" style="width:1080px;min-height:1620px" aria-label="Day 1 free class flyer">
<header class="top" style="background:#c0392b"><span class="brand">SCHOLARION ACADEMY</span><p class="red" style="background:#0b1f4d;margin-top:16px">FREE LIVE CLASS · DAY 1</p><h1>Start building with GenAI &amp; AI Agents</h1><p style="font-size:24px;margin:0">3-hour live hands-on session · ${esc(first.zones[1].time)}</p></header>
<section class="grid" style="grid-template-columns:1fr"><div class="box"><h2>Live times — ${esc(fmtDate(first.startUtc))}</h2><table>${first.zones.map((z) => `<tr><td>${esc(z.label)}</td><td><strong>${esc(z.time.replace(/^[A-Za-z]{3}, /, ""))}</strong></td></tr>`).join("")}</table><p class="small">Times computed for this date, including daylight-saving rules in each city.</p></div>
<div class="box"><h2>How to join</h2>${join}</div>
<div class="box"><h2>In 3 hours you will</h2><ul>${first.session.objectives.map((o) => `<li>${esc(o)}</li>`).join("")}<li>See a live demo: ${esc(first.session.demo)}</li></ul></div>
<div class="box"><h2>Please share</h2><p style="font-size:19px">Know a student, graduate or colleague who wants to start building with AI? Forward this invitation.</p></div></section>
<div class="who">${photo(170)}<div><p style="font-size:24px;font-weight:800;margin:0">${esc(LEAD_FACULTY.name)}</p><p style="margin:4px 0">${esc(LEAD_FACULTY.role)}, Scholarion Academy</p></div></div>
<footer class="foot">${esc(GENAI.contact.website)} · ${esc(GENAI.contact.email)} · ${esc(GENAI.contact.phone)}${s.whatsappLink ? ` · WhatsApp community: ${esc(s.whatsappLink)}` : ""}</footer>
</article></body></html>`;
}

function emailHtml(subject: string, intro: string, bullets: string[], cta: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(subject)}</title></head><body style="margin:0;background:#f4f6fb;font-family:Arial,sans-serif;color:#0f1a33"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px">
<tr><td style="background:#0b1f4d;color:#fff;padding:20px 28px;font-weight:800;letter-spacing:.06em">SCHOLARION ACADEMY</td></tr>
<tr><td style="padding:24px 28px;font-size:16px;line-height:1.5"><h1 style="font-size:22px;margin:0 0 12px">${esc(subject)}</h1><p>${esc(intro)}</p><ul>${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul><p><a href="${esc(GENAI.contact.website)}" style="background:#0b1f4d;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">${esc(cta)}</a></p>
<p style="font-size:13px;color:#4a5672">You're receiving this because you asked Scholarion Academy for program updates. <a href="{{unsubscribe_url}}">Unsubscribe</a> at any time.<br>Scholarion Academy · ${esc(GENAI.contact.email)} · ${esc(GENAI.contact.phone)} · {{postal_address}}</p></td></tr></table></td></tr></table></body></html>`;
}

export function kitAssets(store: TenantStore, campaign: Row): Asset[] {
  const ses = genaiSessions();
  const end = offerEnd(store);
  const first = ses[0];
  const priceLine = `${money(GENAI.offerPrice)} (regular ${money(GENAI.listPrice)})${end ? `, offer ends ${fmtDate(end)}` : ""}`;
  const dates = `${fmtDate(first.startUtc)} – ${fmtDate(ses[ses.length - 1].startUtc)}`;
  const s = liveSetting(store, campaign);
  const timesShort = first.zones.filter((z) => !/GMT \/ UTC/.test(z.label)).map((z) => `${z.label}: ${z.time.replace(/^[A-Za-z]{3}, [A-Za-z]{3} \d+, /, "")}`).join(" · ");
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Scholarion Academy//GenAI Program//EN", "CALSCALE:GREGORIAN", ...ses.flatMap((x) => ["BEGIN:VEVENT", `UID:${GENAI.slug}-${x.n}@scholarion.academy`, `DTSTAMP:${nowIso().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}`, `DTSTART:${x.startUtc.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}`, `DTEND:${x.endUtc.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}`, `SUMMARY:Scholarion GenAI W${x.weekend} ${x.day}: ${x.session.topic.replace(/[,;]/g, " ").slice(0, 120)}`, `DESCRIPTION:Live 3-hour session. Join link on the course home.`, "END:VEVENT"]), "END:VCALENDAR"].join("\r\n") + "\r\n";
  const sched = ["| # | Weekend | Day | Topic | " + GENAI.zones.map((z) => z.label).join(" | ") + " |", "|" + "---|".repeat(4 + GENAI.zones.length), ...ses.map((x) => `| ${x.n} | ${x.weekend} | ${x.day} | ${x.session.topic} | ${x.zones.map((z) => z.time).join(" | ")} |`)].join("\n");
  const csv = ["n,weekend,day,date,start_utc,end_utc,topic," + GENAI.zones.map((z) => `"${z.label}"`).join(","), ...ses.map((x) => [x.n, x.weekend, x.day, x.date, x.startUtc, x.endUtc, `"${x.session.topic.replace(/"/g, "'")}"`, ...x.zones.map((z) => `"${z.time}"`)].join(","))].join("\n") + "\n";
  const tools = TOOL_GROUPS.flatMap((g) => g.items.map((x) => x.name)).join(" • ");
  return [
    { path: "flyer_program_1080x1350.html", kind: "html", title: "Program flyer (portrait 1080×1350)", body: flyerProgram(store, campaign), audience: "public" },
    { path: "flyer_day1_free_class_1080x1620.html", kind: "html", title: "Free Day 1 class flyer (1080×1620)", body: flyerDay1(store, campaign), audience: "public" },
    { path: "landing_page.md", kind: "md", title: "Landing page outline", audience: "staff", body: `# ${GENAI.title}\n\nLive page: /campus/{tenant}/programs/${GENAI.slug}\n\nSections: hero, outcomes, curriculum by weekend, tools (with the no-affiliation note), projects, instructor profile with the approved photo, schedule with time zones, pricing (${priceLine}), FAQ, register button.\n` },
    { path: "social_linkedin.md", kind: "md", title: "LinkedIn post", audience: "public", body: `Build with AI, live, for nine weekends.\n\nThe Scholarion GenAI, Agentic AI & AI Agents Professional Program runs ${dates}, Saturdays and Sundays 6:00–9:00 AM US Eastern. Each session is three hours of guided, hands-on building: prompts and custom assistants, RAG over your own documents, agents with CrewAI and LangGraph, MCP, FastAPI and Streamlit apps, local models with Ollama, fine-tuning and evaluation.\n\nSix portfolio projects and a live capstone demo. No AI experience needed; every lab can be done at no cost.\n\n${GENAI.freeDay1 ? `Day 1 (${fmtDate(first.startUtc)}) is free. ` : ""}Tuition: ${priceLine}.\n\nRegister: ${GENAI.contact.website}\n\n${NOT_AFFILIATED}\n` },
    { path: "social_instagram.md", kind: "md", title: "Instagram caption", audience: "public", body: `9 weekends. 18 live sessions. 6 projects you can show.\n\nGenAI, Agentic AI & AI Agents — hands-on with Dr. Martins Idahosa, starting ${fmtDate(first.startUtc)}.${GENAI.freeDay1 ? " Day 1 is free." : ""}\n\nLink in bio → ${GENAI.contact.website}\n\n#GenerativeAI #AIAgents #AgenticAI #LearnAI #ScholarionAcademy\n` },
    { path: "whatsapp_status.txt", kind: "txt", title: "WhatsApp status", audience: "public", body: `New: 9-weekend hands-on GenAI & AI Agents program starts ${fmtDate(first.startUtc)}.${GENAI.freeDay1 ? " Day 1 is FREE." : ""} ${GENAI.contact.website}\n` },
    { path: "whatsapp_broadcast.txt", kind: "txt", title: "WhatsApp broadcast (opted-in contacts only)", audience: "public", body: `*GenAI, Agentic AI & AI Agents — 9-weekend hands-on program*\n\n${GENAI.freeDay1 ? `*Free Day 1 live class:* ${fmtDate(first.startUtc)}, 3 hours\n` : ""}${timesShort}\n\n*Program:* ${dates} · Sat & Sun 6:00–9:00 AM US Eastern\n*Format:* live instructor-led · hands-on cloud labs · recordings within 24 hours\n*Tuition:* ${priceLine}\n*Returning Scholarion learners:* ask about a returning-student discount.\n\n*Tools covered:* ${tools}\n_${NOT_AFFILIATED}_\n\n${s.whatsappLink ? `Join the community: ${s.whatsappLink}\n` : ""}Register: ${GENAI.contact.website}\nEmail: ${GENAI.contact.email} · Phone/WhatsApp: ${GENAI.contact.phone}\n\nReply STOP to stop receiving these messages.\n` },
    { path: "promo_video_60s_script.md", kind: "md", title: "60-second promo video script", audience: "staff", body: `# 60-second promo — ${GENAI.title}\n\n| Time | Visual | Voice-over / on-screen text |\n|---|---|---|\n| 0–5 s | Title card with the approved photo of ${LEAD_FACULTY.name} and Scholarion Academy branding | "Want to build with AI — not just use it?" |\n| 5–20 s | Screen capture: prompt test set, then a RAG answer with citations | "In nine weekends you'll build prompts, assistants and RAG apps over your own documents." |\n| 20–35 s | Agent run log; an MCP server; a Streamlit app | "Then agents with real tools and safe limits, connected through MCP, shipped as APIs and web apps." |\n| 35–48 s | Local model in Ollama; evaluation dashboard | "Run models locally, fine-tune one, and measure quality with evaluation and guardrails." |\n| 48–60 s | Dates, time zones, price with offer end date, website | "Live, Saturdays and Sundays, starting ${fmtDate(first.startUtc)}.${GENAI.freeDay1 ? " Day 1 is free." : ""} Register at scholarion.academy." |\n\nCaptions required. Video renders once a narration/video tool is configured (status: needs render).\n` },
    { path: "email_1_announcement.html", kind: "html", title: "Email 1 — announcement", audience: "public", body: emailHtml("Nine weekends of hands-on GenAI and AI agents", `The Scholarion GenAI, Agentic AI & AI Agents Professional Program runs ${dates}, Saturdays and Sundays 6:00–9:00 AM US Eastern, live with ${LEAD_FACULTY.name}.`, [`Six portfolio projects and a live capstone demo`, `Every lab doable at no cost with local and open-source tools`, GENAI.freeDay1 ? `Day 1 (${fmtDate(first.startUtc)}) is a free live class` : `Recordings within 24 hours`, `Tuition: ${priceLine}`], "See the program") },
    { path: "email_2_reminder.html", kind: "html", title: "Email 2 — reminder", audience: "public", body: emailHtml(`Reminder: Day 1 is ${fmtDate(first.startUtc)}`, "Here are the live times for the first class in several cities:", first.zones.map((z) => `${z.label}: ${z.time}`), "Register now") },
    { path: "email_3_last_chance.html", kind: "html", title: "Email 3 — last chance for the offer", audience: "public", body: emailHtml(end ? `The ${money(GENAI.offerPrice)} offer ends ${fmtDate(end)}` : "Registration is open", `Tuition is ${priceLine}.`, ["18 live sessions over 9 weekends", "Recordings, office hours and a community channel", "A verifiable certificate when you complete the requirements"], "Reserve your seat") },
    { path: "schedule_time_zones.md", kind: "md", title: "All 18 sessions in 7 time zones", audience: "public", body: `# Live schedule — ${GENAI.title}\n\nAll sessions 3 hours, 6:00–9:00 AM US Eastern. Times are computed per date; US daylight saving time starts on Sunday 14 March 2027, so that session is earlier in cities that don't change clocks that day.\n\n${sched}\n` },
    { path: "schedule.csv", kind: "csv", title: "Schedule (CSV)", audience: "public", body: csv },
    { path: "calendar.ics", kind: "ics", title: "Calendar invites (.ics, 18 sessions)", audience: "public", body: ics },
  ];
}

/* ---------------- campaign records ---------------- */

export function ensureGenAICampaign(store: TenantStore) {
  if (store.list("campaigns", (c) => c.key === "genai-2027").length) return;
  store.tx(() => {
    const c = store.insert("campaigns", { key: "genai-2027", title: `${GENAI.title} — launch`, programCode: GENAI.code, state: "draft", whatsappLink: GENAI.whatsappLink, whatsappLinkNote: "Provided in the brief; check it opens before publishing.", day1JoinUrl: null, day1MeetingId: null, day1Passcode: null }, "cmp");
    for (const ch of CHANNELS) store.insert("campaign_channels", { campaignId: c.id, key: ch.key, name: ch.name, how: ch.how, rules: ch.rules, state: ch.key === "landing" ? "live" : "ready", postedUrl: null, postedBy: null, postedAt: null }, "cch");
  });
}

const campaignRow = (store: TenantStore, id: string) => {
  const c = store.get("campaigns", id) ?? store.list("campaigns", (x) => x.key === id)[0];
  if (!c) throw new CampusError("not_found", "Campaign not found", 404);
  return c;
};

export function campaignOverview(store: TenantStore, a: Actor, id = "genai-2027") {
  requireStaff(store, a, "campaign.view");
  const c = campaignRow(store, id);
  const assets = kitAssets(store, c).map((x) => ({ path: x.path, title: x.title, kind: x.kind, audience: x.audience, flags: copyCheck(store, x.body.replace(/<[^>]+>/g, " ")).map((f) => `${f.label}: "${f.match}"`) }));
  const contacts = store.list("campaign_contacts", (x) => x.campaignId === c.id);
  return {
    campaign: { id: c.id, key: String(c.key), title: String(c.title), state: String(c.state), whatsappLink: (c.whatsappLink as string) ?? null, whatsappLinkNote: (c.whatsappLinkNote as string) ?? null, day1: liveSetting(store, c) },
    sessions: genaiSessions(),
    assets,
    channels: store.list("campaign_channels", (x) => x.campaignId === c.id).map((x) => ({ id: x.id, key: String(x.key), name: String(x.name), how: String(x.how), rules: String(x.rules), state: String(x.state), postedUrl: (x.postedUrl as string) ?? null, postedAt: (x.postedAt as string) ?? null })),
    audience: { total: contacts.length, subscribed: contacts.filter((x) => !x.unsubscribedAt).length, unsubscribed: contacts.filter((x) => !!x.unsubscribedAt).length },
    sends: store.list("campaign_sends", (x) => x.campaignId === c.id).slice(-50).map((x) => ({ asset: String(x.asset), state: String(x.state), at: String(x.createdAt) })),
    platforms: platformCheck(store),
    emailProvider: emailProviderStatus(store),
    decisions: [
      "Cohort dates: 11 Jan 2027 is a Monday; scheduled Sat 16 Jan – Sun 14 Mar 2027 (confirm).",
      "The brief's Day 1 times for India (3:30 PM) and Sydney (8:00 PM) don't match 6:00 AM US Eastern on 16 Jan 2027 — the correct times are 4:30 PM IST and 10:00 PM AEDT. The kit uses computed times.",
      "Free Zoom/Webex plans stop at 40 minutes; 3-hour classes need a paid plan or self-hosted platform.",
      "Day 1 meeting ID and passcode: added below by the instructor; never generated.",
    ],
  };
}

function emailProviderStatus(store: TenantStore) {
  const s = connectorStatus(store, "havenroute");
  return s === "LIVE" || s === "CONNECTED" ? "configured" : "not_configured";
}

export function updateCampaignSettings(store: TenantStore, a: Actor, id: string, input: { day1JoinUrl?: string; day1MeetingId?: string; day1Passcode?: string; whatsappLink?: string }) {
  requireStaff(store, a, "campaign.update");
  const c = campaignRow(store, id);
  const url = (v?: string) => {
    if (!v) return null;
    if (!/^https:\/\/[^\s]+$/i.test(v)) throw new CampusError("invalid", "Links must start with https://.", 422);
    return v.slice(0, 300);
  };
  return store.tx(() => store.update("campaigns", c.id, { day1JoinUrl: input.day1JoinUrl !== undefined ? url(input.day1JoinUrl) : c.day1JoinUrl ?? null, day1MeetingId: input.day1MeetingId !== undefined ? String(input.day1MeetingId).slice(0, 40) || null : c.day1MeetingId ?? null, day1Passcode: input.day1Passcode !== undefined ? String(input.day1Passcode).slice(0, 40) || null : c.day1Passcode ?? null, whatsappLink: input.whatsappLink !== undefined ? url(input.whatsappLink) : c.whatsappLink ?? null }));
}

/** Public opt-in: explicit consent required; a token powers one-click unsubscribe. */
export function subscribeContact(store: TenantStore, input: { email: string; name?: string; consent: boolean; campaign?: string }) {
  const email = String(input.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new CampusError("invalid", "Enter a valid email address.", 422);
  if (!input.consent) throw new CampusError("invalid", "Tick the box to agree to receive program updates.", 422);
  const c = campaignRow(store, input.campaign ?? "genai-2027");
  const ex = store.list("campaign_contacts", (x) => x.campaignId === c.id && x.email === email)[0];
  if (ex) return store.tx(() => store.update("campaign_contacts", ex.id, { unsubscribedAt: null, consentAt: nowIso() }));
  return store.tx(() => store.insert("campaign_contacts", { campaignId: c.id, email, name: String(input.name ?? "").slice(0, 120) || null, source: "opt_in_form", consentAt: nowIso(), consentText: "I agree to receive Scholarion program updates by email. I can unsubscribe at any time.", unsubscribedAt: null, token: crypto.randomBytes(16).toString("hex") }, "ccn"));
}

export function unsubscribe(store: TenantStore, token: string) {
  const ct = store.list("campaign_contacts", (x) => x.token === token)[0];
  if (!ct) throw new CampusError("not_found", "This unsubscribe link isn't valid.", 404);
  store.tx(() => store.update("campaign_contacts", ct.id, { unsubscribedAt: nowIso() }));
  return { unsubscribed: true };
}

/** Queue an email to opted-in contacts only. Without a configured provider nothing leaves Scholarion. */
export function sendEmail(store: TenantStore, a: Actor, id: string, assetPath: string) {
  if (!hasAny(a, ["admin"])) throw new CampusError("forbidden", "Administrators only.", 403);
  const c = campaignRow(store, id);
  const asset = kitAssets(store, c).find((x) => x.path === assetPath && x.path.startsWith("email_"));
  if (!asset) throw new CampusError("invalid", "Choose one of the campaign emails.", 422);
  const flags = copyCheck(store, asset.body.replace(/<[^>]+>/g, " "));
  if (flags.length) throw new CampusError("copy_check", `Copy Checker: ${flags.map((f) => f.label).join(", ")}. Fix the wording first.`, 422);
  const provider = emailProviderStatus(store);
  const recipients = store.list("campaign_contacts", (x) => x.campaignId === c.id && !x.unsubscribedAt && !!x.consentAt);
  let queued = 0;
  let skipped = 0;
  store.tx(() => {
    for (const r of recipients) {
      if (store.list("campaign_sends", (s) => s.campaignId === c.id && s.asset === assetPath && s.contactId === r.id).length) {
        skipped++;
        continue;
      }
      store.insert("campaign_sends", { campaignId: c.id, asset: assetPath, contactId: r.id, state: provider === "configured" ? "queued" : "held_no_provider", unsubscribeUrl: `/api/campus/v1/t/${broker.tenant(store.tenantId)!.slug}/campaigns/unsubscribe?token=${r.token}` }, "csd");
      if (provider === "configured") store.emit("email.requested", "campaign_sends", { to: r.email, subject: asset.title, campaignId: c.id });
      queued++;
    }
  });
  audit(store, a, "campaign.send", `campaigns/${c.id}`, `${assetPath}: ${queued} ${provider === "configured" ? "queued" : "held (no provider)"}, ${skipped} already sent`);
  return { recipients: recipients.length, queued, skipped, provider, note: provider === "configured" ? "Queued for delivery." : "Held: no email provider is configured, so nothing was sent." };
}

/** A person posted the prepared copy on a platform; record where. Scholarion never posts automatically. */
export function markPosted(store: TenantStore, a: Actor, channelId: string, url: string) {
  requireStaff(store, a, "campaign.posted");
  const ch = store.get("campaign_channels", channelId);
  if (!ch) throw new CampusError("not_found", "Channel not found", 404);
  if (url && !/^https:\/\/[^\s]+$/i.test(url)) throw new CampusError("invalid", "Link must start with https://.", 422);
  return store.tx(() => store.update("campaign_channels", channelId, { state: "posted", postedUrl: url || null, postedBy: a.id, postedAt: nowIso() }));
}

export function assetFile(store: TenantStore, a: Actor, id: string, path: string) {
  requireStaff(store, a, "campaign.asset");
  const c = campaignRow(store, id);
  const asset = kitAssets(store, c).find((x) => x.path === path);
  if (!asset) throw new CampusError("not_found", "Asset not found", 404);
  return asset;
}

/* ---------------- program folder (Scholarion_GenAI_Agentic_Program/) ---------------- */

const RUBRIC = (name: string) => `# Rubric — ${name}\n\n| Criterion | Weight | Exemplary (90–100%) | Proficient (70–89%) | Developing (50–69%) | Beginning (<50%) |\n|---|---|---|---|---|---|\n| Functional correctness (mandatory) | 40 | Works on all required cases | Works on most cases | Partly works | Doesn't run |\n| Real-world requirements | 20 | Every requirement met and explained | Most met | Some met | Not addressed |\n| Tools and environment | 15 | Tools used correctly, secrets safe | Minor issues | Several issues | Unsafe or missing |\n| Testing and evaluation | 15 | Tests/evaluation with a baseline | Tests present | Partial | None |\n| Documentation and demo | 10 | Clear README and demo | Mostly clear | Thin | Missing |\n\nPass mark 70%; the mandatory criterion must be met. Two graded attempts; the highest counts. Scores post to the gradebook automatically.\n`;

export function programFolder(store: TenantStore, a: Actor) {
  requireStaff(store, a, "campaign.program_folder");
  ensureGenAICampaign(store);
  const c = campaignRow(store, "genai-2027");
  const root = "Scholarion_GenAI_Agentic_Program";
  const files: { name: string; data: string; status: string; note?: string }[] = [];
  const add = (name: string, data: string, status = "complete", note?: string) => files.push({ name: `${root}/${name}`, data, status, note });
  const ses = genaiSessions();
  const end = offerEnd(store);
  add("00_Program_Overview/program_overview.md", `# ${GENAI.title}\n\nLead Faculty: ${LEAD_FACULTY.name}, ${LEAD_FACULTY.role}, Scholarion Academy\n\nGenerative AI, agentic AI and AI agents are changing how work gets done in many industries, and organizations need people who can build and run these systems in practice. This program teaches those skills by building real AI applications every weekend.\n\n- Dates: ${fmtDate(ses[0].startUtc)} – ${fmtDate(ses[ses.length - 1].startUtc)} (9 weekends, 18 × 3-hour live sessions)\n- Times: Saturdays and Sundays 6:00–9:00 AM US Eastern (see 07_Operations/schedule_time_zones.md)\n- Tuition: ${money(GENAI.offerPrice)} (regular ${money(GENAI.listPrice)})${end ? `; offer ends ${fmtDate(end)}` : ""}\n- Day 1 free trial class: ${GENAI.freeDay1 ? "yes" : "no"}\n- Audience: no AI experience required; students, IT professionals and career changers\n\n${NOT_AFFILIATED}\n`);
  WEEKENDS.forEach((wk, i) => {
    const sat = ses[i * 2];
    const sun = ses[i * 2 + 1];
    const block = (x: typeof sat) => `## ${x.day} ${x.date} — ${x.session.topic}\n\n**When:** ${x.zones.map((z) => `${z.label} ${z.time}`).join(" · ")}\n\n**Objectives**\n${x.session.objectives.map((o) => `- ${o}`).join("\n")}\n\n**Demo:** ${x.session.demo}\n\n**Hands-on lab:** ${x.session.lab}\n\n**Deliverable:** ${x.session.deliverable}\n`;
    add(`01_Curriculum/Weekend_${String(i + 1).padStart(2, "0")}.md`, `# Weekend ${i + 1}: ${wk.title}\n\n${block(sat)}\n${block(sun)}\n${wk.project ? `**Project:** ${wk.project}\n` : ""}\n**Per-weekend package (Scholarion standard):** 2 auto-graded mini labs · 1 hands-on in-class activity (Scholarion template; 2–3-page APA paper with embedded code, explanations and output screenshots, uploaded as Word or PDF, due Sunday 11:59 PM) · 10-question quiz (answers after grading) · Module_${String(i + 1).padStart(2, "0")}_Student_Lab.html · Module_${String(i + 1).padStart(2, "0")}_Instructor_Lab.html (PIN lock, Switch to Student View) · Module_${String(i + 1).padStart(2, "0")}_Simulated_Application_Demo_APP.html · a working agentic demo · the full Course Studio output set.\n`);
  });
  for (const p of PROJECTS) {
    add(`02_Labs_and_Projects/${p.key}.md`, `# ${p.name}\n\nWeekend ${p.week}\n\n${p.description}\n\nSkills: ${p.skills.join(", ")}\n${"requirements" in p && p.requirements ? `\n## Requirements\n${(p.requirements as string[]).map((r) => `- ${r}`).join("\n")}\n` : ""}\nA ~5-minute requirements video (720p) opens on the Scholarion title card with the approved photo — status: needs render.\n`);
    add(`03_Assessments_and_Rubrics/${p.key}_rubric.md`, RUBRIC(p.name));
  }
  add("04_Studio_Outputs/README.md", `# Studio outputs\n\nEach weekend's full Course Studio set (10-slide deck with the Scholarion cover, audio overview, study guide, mind map, flashcards, infographic, lecture notes, environments, mini-labs, rubrics, requirements-video scripts) is generated in the Lecture Studio from the instructor's sources and released after review. Status per weekend: not generated yet — add sources, then generate.\n`, "pending", "Generate in the Course Studio after sources are added.");
  const toolRows = TOOL_GROUPS.flatMap((g) => g.items.map((x) => {
    const r = x.key ? store.list(ECO.resources, (y) => y.key === x.key)[0] : null;
    const lim = r ? ((r.limits as { metric: string; value: unknown; unit: string }[]) ?? []).map((l) => `${l.metric.replace(/_/g, " ")} ${String(l.value)} ${l.unit}`).join("; ") : "";
    return `| ${g.family} | ${x.name} | ${r ? `${String(r.classification).replace(/_/g, " ")}${r.license ? ` (${r.license})` : ""}` : "open source (python.org)"} | ${r ? `${String(r.apiAccess)}` : "—"} | ${lim || "—"} | ${r ? `${r.status} ${String(r.verifiedAt ?? "").slice(0, 10)}` : "—"} | ${r ? r.officialUrl : "https://www.python.org/"} |`;
  }));
  add("05_Tools_Covered/tools.md", `# Tools covered\n\nEvery lab can be completed at no cost (local models via Ollama, free tiers, open-source tools); paid APIs are optional. Free-plan terms below come from the Scholarion Free Education Resource Hub, verified on each vendor's official page, and are re-checked monthly.\n\n| Family | Tool | Free option | API access | Verified limits | Status | Official site |\n|---|---|---|---|---|---|---|\n${toolRows.join("\n")}\n\n${NOT_AFFILIATED}\n`);
  for (const x of kitAssets(store, c)) add(`06_Marketing_Kit/${x.path}`, x.body);
  add("06_Marketing_Kit/promo_video_60s.mp4", "", "needs render", "No narration/video renderer is configured.");
  const platforms = platformCheck(store);
  const refund = approvedPolicy(store, "refund");
  add("07_Operations/operations.md", `# Operations\n\n## Registration and payment\nRegistration and checkout run on the program page (${GENAI.contact.website}); this staging site uses sandbox payments only. Payment provider: to be configured.\n\n## Live class platform\nSessions are 3 hours. Verified free-plan limits:\n${platforms.map((p) => `- ${p.name}: ${p.limitMinutes ? `${p.limitMinutes}-minute limit — ${p.fitsThreeHours ? "fits" : "too short for 3-hour classes"}` : "no duration limit recorded (self-hosted or open source)"} (verified ${p.verifiedAt})`).join("\n")}\nChoose a paid meeting plan that allows 3-hour sessions, or a self-hosted platform.\n\n## Calendar invites\n\`calendar.ics\` has all 18 sessions in UTC; calendar apps show each learner's local time.\n\n## Attendance and recordings\nAttendance is tracked per session; recordings are posted within 24 hours to the course.\n\n## Refunds\n${refund ? refund.text : "Refund policy: not yet approved."}\n`);
  add("07_Operations/schedule_time_zones.md", kitAssets(store, c).find((x) => x.path === "schedule_time_zones.md")!.body);
  add("07_Operations/calendar.ics", kitAssets(store, c).find((x) => x.path === "calendar.ics")!.body);
  const manifest = { root, generatedAt: nowIso(), program: GENAI.title, files: files.map((f) => ({ path: f.name, status: f.status, note: f.note ?? null })), needsInput: ["Confirm cohort dates (11 Jan 2027 is a Monday)", "Offer end date", "Live platform plan for 3-hour sessions", "Day 1 meeting details", "Payment provider", "Legal review of marketing and refund terms"] };
  const entries = files.filter((f) => f.data.length).map((f) => ({ name: f.name, data: Buffer.from(f.data, "utf8") }));
  entries.push({ name: `${root}/manifest.json`, data: Buffer.from(JSON.stringify(manifest, null, 2)) });
  audit(store, a, "campaign.program_folder", "campaigns/genai-2027");
  return { zip: zip(entries), manifest };
}
