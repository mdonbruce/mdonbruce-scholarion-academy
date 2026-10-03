import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, it } from "node:test";
import manifest from "../src/app/manifest";
import { viewerOf } from "../src/bff/views";
import { catalog, checkClaims, commerce, content, cx, identity } from "../src/platform";
import { DEMO } from "../src/platform/seed";
import { getDb } from "../src/platform/store";
import { fresh } from "./helpers";

beforeEach(() => fresh());

describe("Topic hubs", () => {
  it("every hub has programs, a valid start, and copy that passes the claims checker", () => {
    for (const h of content.hubs()) {
      const vm = content.hub(h.slug)!;
      assert.ok(vm.products.length >= 2, `${h.slug} has programs`);
      assert.ok(catalog.get(h.startHere), `${h.slug} start-here exists`);
      assert.deepEqual(checkClaims(content.hubCopy(h)), [], `${h.slug} copy is clean`);
      assert.ok(vm.products.every((p) => p.status === "published" && p.type !== "degree"));
    }
  });
  it("FAQ statements match the catalog", () => {
    assert.equal(catalog.get("prd_agentic_foundations")!.freeToAudit, true);
    assert.ok(catalog.all().filter((p) => p.format === "live").every((p) => commerce.offers(p.id).some((o) => o.code === "live_seat")));
  });
  it("unknown hubs return nothing", () => {
    assert.equal(content.hub("nope"), null);
  });
});

describe("Blog", () => {
  it("seeded articles are published and pass the claims checker", () => {
    const arts = content.articles();
    assert.equal(arts.length, 3);
    for (const a of arts) assert.deepEqual(content.checkArticle(a), [], a.slug);
  });

  it("drafts are private; publishing runs the claims check; sources unlock cited figures", () => {
    const body = "Graduates of this kind of program earn $120,000 per year according to a survey. ".repeat(12);
    const a = content.saveArticle("usr_admin", { title: "What AI engineers earn", summary: "A look at pay for people who build AI systems, with sources.", body });
    assert.equal(content.article(a.slug), undefined);
    assert.throws(() => content.publishArticle("usr_admin", a.id), /claims check/);
    content.saveArticle("usr_admin", { id: a.id, title: a.title, summary: a.summary, body, sources: "https://www.bls.gov/ooh/ not-a-url" });
    assert.deepEqual(content.draft(a.id)!.sources, ["https://www.bls.gov/ooh/"]);
    content.publishArticle("usr_admin", a.id);
    assert.equal(content.article(a.slug)!.id, a.id);
  });

  it("degree and credit claims block publishing even with sources", () => {
    const body = "This certificate counts as transferable college credit at many schools. ".repeat(12);
    const a = content.saveArticle("usr_admin", { title: "Credit for your certificate", summary: "How our certificates turn into credit at other schools.", body, sources: "https://example.org/x" });
    assert.throws(() => content.publishArticle("usr_admin", a.id), /claims check/);
  });

  it("editing a published article into a claim moves it back to draft", () => {
    const a = content.articles()[0];
    assert.throws(() => content.saveArticle("usr_admin", { id: a.id, title: a.title, summary: a.summary, body: `${a.body}\n\nWe guarantee a job after you finish.` }), /back to draft/);
    assert.equal(content.draft(a.id)!.status, "draft");
  });

  it("only staff can write", () => {
    assert.throws(() => content.saveArticle("usr_amara", { title: "My article title", summary: "x".repeat(40), body: "word ".repeat(100) }), /staff/);
  });
});

describe("In-app notifications", () => {
  it("mirror HavenRoute emails, except sign-in links, and track read state", () => {
    identity.signIn(DEMO.learner.email, DEMO.learner.password);
    identity.requestPasswordReset(DEMO.learner.email);
    identity.changePassword("usr_amara", DEMO.learner.password, "AnotherPass123");
    const notices = cx.notices("usr_amara");
    assert.ok(notices.some((n) => n.kind === "password_changed" && n.href === "/app/security"));
    assert.ok(!notices.some((n) => n.kind === "password_reset"), "reset links stay email-only");
    assert.ok(getDb().outbox.some((e) => e.template === "password_reset"));
    assert.equal(viewerOf(identity.getUser("usr_amara")!)!.unread, notices.length);
    const href = cx.openNotice("usr_amara", notices[0].id);
    assert.equal(href, notices[0].href);
    assert.equal(cx.unreadCount("usr_amara"), notices.length - 1);
    cx.markAllRead("usr_amara");
    assert.equal(cx.unreadCount("usr_amara"), 0);
    assert.throws(() => cx.openNotice("usr_tunde", notices[0].id), /not found/i);
  });
  it("never include URLs", () => {
    identity.changePassword("usr_amara", DEMO.learner.password, "AnotherPass123");
    assert.ok(getDb().notices.every((n) => !/https?:\/\//.test(n.body)));
  });
});

describe("Installable app (PWA)", () => {
  it("manifest icons exist and start inside the app", () => {
    const m = manifest();
    assert.equal(m.display, "standalone");
    assert.match(String(m.start_url), /^\/app/);
    for (const i of (m.icons ?? []) as { src: string }[]) assert.ok(fs.existsSync(path.join("public", i.src)), i.src);
    assert.ok(m.icons?.some((i) => i.purpose === "maskable"));
  });
  it("the service worker never caches pages or the API", () => {
    const sw = fs.readFileSync("public/sw.js", "utf8");
    assert.match(sw, /req\.mode === "navigate"\) event\.respondWith\(fetch\(req\)\.catch\(\(\) => caches\.match\(OFFLINE\)\)\)/);
    assert.ok(!/caches\.open\([^)]*\)\.then\(\(c\) => c\.put\(req[^;]*navigate/.test(sw));
    assert.ok(!sw.includes("/api/") || !/cache.*\/api\//.test(sw));
  });
});
