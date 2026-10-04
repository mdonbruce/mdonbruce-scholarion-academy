import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { as, freshCampus, storeOf } from "./campus-helpers";
import { CampusError } from "../src/campus/core";
import * as C from "../src/campus/services/campaigns";
import { GENAI, genaiSessions } from "../src/campus/academy/genai-program";
import { configureConnector } from "../src/campus/services/platform";
import { offeringIdFor, programPage } from "../src/campus/services/programs";
import { moduleStudioBundle } from "../src/campus/services/studio";
import { ai801CourseId } from "../src/campus/academy/ai801-seed";
import { handleCampus } from "../src/campus/http/router";
import { DEMO_PASSWORD } from "../src/campus/seed";

/** Tab 60 — Program Marketing & Campaigns, program #39 and the module Studio folder export. */

const status = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof CampusError, String(e));
    return (e as CampusError).status;
  }
  return 200;
};
const u = (k: string) => as("academy", k, true);
const campaign = () => storeOf("academy").list("campaigns", (c) => c.key === "genai-2027")[0];

before(() => {
  freshCampus();
});

describe("GenAI program #39 schedule", () => {
  it("18 sessions from Sat 16 Jan 2027, 6:00 AM Eastern, with correct world times and the March DST shift", () => {
    const s = genaiSessions();
    assert.equal(s.length, 18);
    assert.equal(s[0].startUtc, "2027-01-16T11:00:00.000Z");
    const z = (i: number, label: RegExp) => s[i].zones.find((x) => label.test(x.label))!.time;
    assert.match(z(0, /New York/), /6:00\s?AM/);
    assert.match(z(0, /India/), /4:30\s?PM/);
    assert.match(z(0, /Sydney/), /10:00\s?PM/);
    assert.equal(s[17].startUtc, "2027-03-14T10:00:00.000Z");
    assert.match(z(17, /New York/), /6:00\s?AM/);
    assert.match(z(17, /London/), /10:00\s?AM/);
    for (const x of s) assert.ok(x.day === "Sat" ? new Date(x.startUtc).getUTCDay() === 6 : new Date(x.startUtc).getUTCDay() === 0);
  });

  it("the program page is live with 18 calendar events and the offer prices", () => {
    const p = programPage(storeOf("academy"), null, GENAI.slug);
    const o = storeOf("academy").get("offerings", offeringIdFor("academy", GENAI.code))!;
    const evs = storeOf("academy").list("calendar_events", (e) => e.courseId === o.courseId);
    assert.equal(evs.length, 18);
    assert.ok(evs.some((e) => e.startsAt === "2027-01-16T11:00:00.000Z"));
    assert.ok(JSON.stringify(p).includes(String(GENAI.offerPrice)));
  });
});

describe("Marketing kit", () => {
  it("seeds the campaign with every channel ready and nothing marked posted", () => {
    const c = campaign();
    assert.ok(c);
    const ch = storeOf("academy").list("campaign_channels", (x) => x.campaignId === c.id);
    assert.equal(ch.length, C.CHANNELS.length);
    assert.ok(ch.every((x) => (x.key === "landing" ? x.state === "live" : x.state === "ready") && !x.postedUrl));
  });

  it("flyers carry the approved faculty photo with name and title, computed times, and no invented meeting details", () => {
    const assets = C.kitAssets(storeOf("academy"), campaign());
    const day1 = assets.find((a) => a.path.startsWith("flyer_day1"))!.body;
    const prog = assets.find((a) => a.path.startsWith("flyer_program"))!.body;
    for (const f of [day1, prog]) {
      assert.match(f, /<img [^>]*alt="[^"]*Idahosa/);
      assert.match(f, /Lead Faculty &amp; Director of AI Innovation|Lead Faculty & Director of AI Innovation/);
      assert.match(f, /SCHOLARION ACADEMY/);
      assert.doesNotMatch(f, /Oak ?Haven/i);
    }
    assert.match(day1, /4:30\s?PM/);
    assert.doesNotMatch(day1, /3:30\s?PM/);
    assert.doesNotMatch(day1, /Meeting ID<\/td>/);
    assert.match(day1, /join link is emailed to registered learners/);
    assert.ok(assets.find((a) => a.path === "calendar.ics")!.body.split("BEGIN:VEVENT").length - 1 === 18);
    for (const e of assets.filter((a) => a.path.startsWith("email_"))) assert.match(e.body, /\{\{unsubscribe_url\}\}/);
  });

  it("meeting details appear only after the instructor enters them", () => {
    const a = u("admin");
    assert.equal(status(() => C.updateCampaignSettings(a.store, a.actor, "genai-2027", { day1JoinUrl: "http://insecure.example" })), 422);
    C.updateCampaignSettings(a.store, a.actor, "genai-2027", { day1JoinUrl: "https://meet.example.org/scholarion-day1", day1MeetingId: "999 000 111" });
    const day1 = C.kitAssets(a.store, campaign()).find((x) => x.path.startsWith("flyer_day1"))!.body;
    assert.match(day1, /meet\.example\.org\/scholarion-day1/);
    assert.match(day1, /999 000 111/);
    C.updateCampaignSettings(a.store, a.actor, "genai-2027", { day1JoinUrl: "", day1MeetingId: "" });
  });

  it("every kit asset passes the Copy Checker, and the checker flags superlatives", () => {
    const a = u("admin");
    const o = C.campaignOverview(a.store, a.actor);
    for (const x of o.assets) assert.deepEqual(x.flags, [], x.path);
    const { copyCheck } = require("../src/campus/services/claims") as typeof import("../src/campus/services/claims");
    assert.ok(copyCheck(a.store, "Learn the most in-demand skill in tech").length > 0);
  });

  it("the overview lists the free meeting plans that can't hold a 3-hour class", () => {
    const a = u("admin");
    const zoom = C.platformCheck(a.store).find((p) => /Zoom/i.test(p.name));
    assert.ok(zoom);
    assert.equal(zoom!.limitMinutes, 40);
    assert.equal(zoom!.fitsThreeHours, false);
  });

  it("learners can't open the campaign workspace", () => {
    const st = u("student1");
    assert.equal(status(() => C.campaignOverview(st.store, st.actor)), 403);
  });
});

describe("Audience, sends and channels", () => {
  it("opt-in requires consent; sends are held without a provider and reach only opted-in, subscribed contacts", () => {
    const s = storeOf("academy");
    assert.equal(status(() => C.subscribeContact(s, { email: "no-consent@example.org", consent: false })), 422);
    const yes = C.subscribeContact(s, { email: "Learner.One@example.org", consent: true });
    const two = C.subscribeContact(s, { email: "learner.two@example.org", consent: true });
    C.unsubscribe(s, String(two.token));
    const a = u("admin");
    const r = C.sendEmail(a.store, a.actor, "genai-2027", "email_1_announcement.html");
    assert.equal(r.provider, "not_configured");
    assert.equal(r.recipients, 1);
    const sends = s.list("campaign_sends", (x) => x.asset === "email_1_announcement.html");
    assert.equal(sends.length, 1);
    assert.equal(sends[0].contactId, yes.id);
    assert.equal(sends[0].state, "held_no_provider");
    // Repeat sends don't duplicate.
    assert.equal(C.sendEmail(a.store, a.actor, "genai-2027", "email_1_announcement.html").skipped, 1);
    // Only admins send.
    const d = u("designer");
    assert.equal(status(() => C.sendEmail(d.store, d.actor, "genai-2027", "email_1_announcement.html")), 403);
  });

  it("the email connector can't be marked connected from staging, so sends stay held", () => {
    const a = u("admin");
    assert.equal(status(() => configureConnector(a.store, a.actor, "havenroute", { mode: "connected", consent: true })), 409);
    assert.equal(C.campaignOverview(a.store, a.actor).emailProvider, "not_configured");
  });

  it("channels are only marked posted by a person, with an https link", () => {
    const a = u("advisor");
    const ch = a.store.list("campaign_channels", (x) => x.key === "linkedin")[0];
    assert.equal(status(() => C.markPosted(a.store, a.actor, ch.id, "javascript:alert(1)")), 422);
    C.markPosted(a.store, a.actor, ch.id, "https://www.linkedin.com/posts/scholarion-example");
    const after = a.store.get("campaign_channels", ch.id)!;
    assert.equal(after.state, "posted");
    assert.equal(after.postedBy, a.actor.id);
  });
});

describe("Program folder and HTTP", () => {
  it("exports Scholarion_GenAI_Agentic_Program/ with folders 00–07 and a manifest", () => {
    const a = u("admin");
    const pf = C.programFolder(a.store, a.actor);
    const paths = (pf.manifest.files as { path: string }[]).map((f) => f.path);
    for (const d of ["00_Program_Overview", "01_Curriculum", "02_Labs_and_Projects", "03_Assessments_and_Rubrics", "04_Studio_Outputs", "05_Tools_Covered", "06_Marketing_Kit", "07_Operations"]) assert.ok(paths.some((p) => p.startsWith(`Scholarion_GenAI_Agentic_Program/${d}/`)), d);
    assert.equal(paths.filter((p) => /01_Curriculum\/Weekend_\d\d\.md$/.test(p)).length, 9);
    assert.ok(pf.manifest.files.some((f: { path: string; status: string }) => f.path.endsWith(".mp4") && f.status === "needs render"));
    assert.equal(pf.zip.subarray(0, 2).toString(), "PK");
  });

  const H = "http://localhost:3000/api/campus/v1/t/academy/";
  it("public opt-in and one-click unsubscribe work over HTTP; assets need staff sign-in", async () => {
    const r = await handleCampus(new Request(`${H}a/campaign.subscribe`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: "http://localhost:3000", host: "localhost:3000" }, body: new URLSearchParams({ email: "web@example.org", consent: "true", campaign: "genai-2027", back: "/campus/academy/programs" }) }), "v1/t/academy/a/campaign.subscribe");
    assert.ok(r.status === 303 || r.status === 200, String(r.status));
    const ct = storeOf("academy").list("campaign_contacts", (x) => x.email === "web@example.org")[0];
    assert.ok(ct && ct.consentAt);
    const un = await handleCampus(new Request(`${H}campaigns/unsubscribe?token=${ct.token}`), "v1/t/academy/campaigns/unsubscribe");
    assert.equal(un.status, 200);
    assert.ok(storeOf("academy").get("campaign_contacts", ct.id)!.unsubscribedAt);
    const anon = await handleCampus(new Request(`${H}campaigns/genai-2027/assets/flyer_program_1080x1350.html`), "v1/t/academy/campaigns/genai-2027/assets/flyer_program_1080x1350.html");
    assert.equal(anon.status, 401);
    const si = await handleCampus(new Request(`${H}auth/signin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "advisor@academy.scholarion.test", password: DEMO_PASSWORD }) }), "v1/t/academy/auth/signin");
    const cookie = si.headers.get("set-cookie")!.split(";")[0];
    const ok = await handleCampus(new Request(`${H}campaigns/genai-2027/assets/flyer_program_1080x1350.html`, { headers: { cookie } }), "v1/t/academy/campaigns/genai-2027/assets/flyer_program_1080x1350.html");
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get("content-type") ?? "", /text\/html/);
  });
});

describe("Module Studio folder export (Prompt 3 layout)", () => {
  it("staff get the full module folder; learners get no instructor files or answer keys", () => {
    const course = ai801CourseId(storeOf("academy"));
    const lead = u("lead");
    const staff = moduleStudioBundle(lead.store, lead.actor, course, 1);
    const sm = staff.manifest as { files: { path: string; access: string }[]; checks: { studentFilesWithoutAnswers: boolean } };
    assert.match(staff.root, /_Module_01_Studio$/);
    assert.ok(sm.files.some((f) => f.path.includes("/00_Cover/")));
    assert.ok(sm.files.some((f) => f.access === "instructor"));
    const st = as("academy", "student1", false);
    let learner: ReturnType<typeof moduleStudioBundle> | null = null;
    try {
      learner = moduleStudioBundle(st.store, st.actor, course, 1);
    } catch (e) {
      // Nothing released yet for learners is also acceptable.
      assert.ok(e instanceof CampusError && [403, 404].includes(e.status));
    }
    if (learner) {
      const lm = learner.manifest as typeof sm;
      assert.ok(lm.files.every((f) => f.access === "learner"));
      assert.ok(lm.files.every((f) => !/answer_key|instructor_solution|_EXECUTED/.test(f.path)));
      assert.equal(lm.checks.studentFilesWithoutAnswers, true);
    }
  });
});
