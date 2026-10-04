import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { before, describe, it } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { as, freshCampus, storeOf } from "./campus-helpers";
import { fitSize, LEAD_FACULTY } from "../src/brand/faculty";
import { FacultyCard, FacultyPhoto } from "../src/ui/components/faculty";
import { brochurePdf } from "../src/campus/services/programs";
import { coverHtml } from "../src/campus/services/covers";
import { simLabHtml } from "../src/campus/services/simlab";
import { ProgramPageView } from "../src/campus/ui/views/program";
import { CourseView } from "../src/campus/ui/views/course";
import { broker, CampusError } from "../src/campus/core";

// The test runner compiles TSX with the classic runtime; views expect React in scope.
(globalThis as unknown as { React: typeof React }).React = React;

/** The approved photograph of Dr. Martins Donbruce Idahosa: one source asset, used everywhere, never stretched. */

const pub = (p: string) => path.join(process.cwd(), "public", p);
const pngSize = (file: string) => {
  const b = fs.readFileSync(file);
  assert.equal(b.subarray(1, 4).toString(), "PNG");
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
};

describe("Approved faculty photograph", () => {
  before(() => {
    freshCampus();
  });

  it("keeps the original file byte-for-byte; the only derived file is a square crop with no upscaling", () => {
    const orig = fs.readFileSync(pub(LEAD_FACULTY.photo.src));
    assert.equal(crypto.createHash("sha256").update(orig).digest("hex"), LEAD_FACULTY.approval.sha256);
    assert.deepEqual(pngSize(pub(LEAD_FACULTY.photo.src)), { width: LEAD_FACULTY.photo.width, height: LEAD_FACULTY.photo.height });
    const av = pngSize(pub(LEAD_FACULTY.photo.avatar));
    assert.equal(av.width, av.height);
    assert.ok(av.width <= LEAD_FACULTY.photo.width, "never upscaled");
    assert.deepEqual(fs.readdirSync(pub("brand/faculty")).sort(), ["martins-idahosa-avatar.png", "martins-idahosa-original.png"], "no other or generated likeness");
  });

  it("display sizes keep the photo's proportions and never upscale", () => {
    for (const [w, h] of [[64, 74], [148, 148], [400, 400], [40, 1000]]) {
      const d = fitSize(LEAD_FACULTY.photo, w, h);
      assert.ok(d.width <= LEAD_FACULTY.photo.width && d.height <= LEAD_FACULTY.photo.height);
      assert.ok(Math.abs(d.width / d.height - LEAD_FACULTY.photo.width / LEAD_FACULTY.photo.height) < 0.03);
    }
    const card = renderToStaticMarkup(FacultyCard({}));
    assert.match(card, /Dr\. Martins Donbruce Idahosa/);
    assert.match(card, /Lead Faculty &(amp;)? Director of AI Innovation, Scholarion Academy/);
    const img = renderToStaticMarkup(FacultyPhoto({ size: 1000 }));
    assert.match(img, new RegExp(`width="${LEAD_FACULTY.photo.width}" height="${LEAD_FACULTY.photo.height}"`), "rendered at the source size, not stretched");
    assert.match(img, /alt="Dr\. Martins Donbruce Idahosa, Lead Faculty &amp; Director of AI Innovation, Scholarion Academy"/);
  });

  it("appears on program pages, campus course pages and the brochure PDF", async () => {
    const store = storeOf("academy");
    const t = broker.tenant("academy")!;
    const page = renderToStaticMarkup(ProgramPageView({ tenant: t, store, actor: null, slug: "agentic-ai-engineering-weekend", sp: {} }));
    assert.ok(page.includes(LEAD_FACULTY.photo.src));
    const inst = as("academy", "admin");
    const lead = store.list("enrollments", (e) => e.userId === "usr_academy_lead" && e.role === "instructor")[0];
    assert.ok(lead, "lead faculty teaches seeded courses");
    const course = renderToStaticMarkup(CourseView({ store, actor: inst.actor, slug: "academy", courseId: String(lead.courseId), rest: ["modules"], sp: {} }));
    assert.ok(course.includes(LEAD_FACULTY.photo.avatar));
    const pdf = Buffer.from(await brochurePdf(store, "agentic-ai-engineering-weekend")).toString("latin1");
    assert.match(pdf, /\/Subtype\s*\/Image/);
  });

  it("lab guides, worksheets, cover slides and video title cards carry the embedded original with name and branding", () => {
    const store = storeOf("academy");
    for (const ed of ["student", "instructor", "app"] as const) {
      const html = simLabHtml("haven-guest-services", ed);
      assert.match(html, /<img src="data:image\/png;base64,/);
      assert.match(html, /Dr\. Martins Donbruce Idahosa/);
      assert.match(html, /Scholarion Academy/);
    }
    const b64 = fs.readFileSync(pub(LEAD_FACULTY.photo.src)).toString("base64");
    for (const kind of ["slide", "title-card"] as const) {
      const html = coverHtml(store, "off_academy_15", "3", kind);
      assert.ok(html.includes(b64), "the original bytes, embedded");
      assert.match(html, /Lead Faculty &(amp;)? Director of AI Innovation, Scholarion Academy/);
      assert.match(html, /aspect-ratio:16\/9/);
    }
    assert.throws(() => coverHtml(store, "off_academy_15", "99", "slide"), (e: unknown) => (e as CampusError).status === 404);
  });
});
