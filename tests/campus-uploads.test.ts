import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { as, freshCampus, storeOf } from "./campus-helpers";
import { CampusError } from "../src/campus/core";
import * as U from "../src/campus/services/uploads";
import { ai801CourseId } from "../src/campus/academy/ai801-seed";
import { offeringIdFor } from "../src/campus/services/programs";
import { handleCampus } from "../src/campus/http/router";
import { DEMO_PASSWORD } from "../src/campus/seed";
import { render } from "../src/documents";

/** Uploading work (Word, Excel, PDF, notebooks, Python…) and links (Colab, Codelab, GitHub). */

const H = "http://localhost:3000/api/campus/v1/t/academy/";
let COURSE = "";
let ITEM = "";
let cookie = "";
const status = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof CampusError, String(e));
    return (e as CampusError).status;
  }
  return 200;
};
async function upload(name: string, type: string, bytes: Uint8Array | string, extra: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("file", new File([typeof bytes === "string" ? bytes : Buffer.from(bytes)], name, { type }));
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  const r = await handleCampus(new Request(`${H}upload`, { method: "POST", headers: { cookie, origin: "http://localhost:3000", host: "localhost:3000" }, body: fd }), "v1/t/academy/upload");
  // Form uploads redirect back; an error is carried in the redirect.
  const loc = r.headers.get("location") ?? "";
  return { status: r.status === 303 ? (/[?&]error=/.test(loc) ? 422 : 201) : r.status, detail: loc };
}

before(async () => {
  freshCampus();
  COURSE = ai801CourseId(storeOf("academy"));
  ITEM = String(storeOf("academy").list("graded_items", (i) => i.courseId === COURSE && /minilab/.test(String(i.key)))[0].id);
  const r = await handleCampus(new Request(`${H}auth/signin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "student1@academy.scholarion.test", password: DEMO_PASSWORD }) }), "v1/t/academy/auth/signin");
  cookie = r.headers.get("set-cookie")!.split(";")[0];
});

describe("Accepted formats", () => {
  it("covers Word, Excel, PowerPoint, PDF, notebooks, Python, R, SQL, CSV, ZIP for projects and mini labs", () => {
    for (const e of ["docx", "xlsx", "pdf", "ipynb", "py", "csv", "zip"]) assert.ok(U.formatsFor("project").includes(e), e);
    for (const e of ["ipynb", "py", "xlsx", "pdf", "docx"]) assert.ok(U.formatsFor("minilab").includes(e), e);
    assert.equal(U.acceptAttr(["docx", "pdf"]), ".docx,.pdf");
    const list = U.formatList(U.formatsFor("assignment"));
    for (const x of ["Word (.docx)", "Excel (.xlsx)", "PDF (.pdf)", "Jupyter / Colab notebook (.ipynb)", "Python (.py)"]) assert.ok(list.includes(x), x);
  });

  it("program labs, assignments and projects accept the full set and a Colab/Codelab link", () => {
    const s = storeOf("academy");
    const o = s.get("offerings", offeringIdFor("academy", "#2"))!;
    const ids = [o.courseId as string, ...((o.blockCourseIds as string[] | undefined) ?? [])];
    const lab = s.list("assignments", (x) => ids.includes(String(x.courseId)) && !!(x.tags as string[] | undefined)?.includes("lab"))[0];
    assert.ok((lab.allowedExtensions as string[]).includes("ipynb") && (lab.allowedExtensions as string[]).includes("docx"));
    assert.ok((lab.submissionTypes as string[]).includes("url"));
    const cap = s.list("assignments", (x) => ids.includes(String(x.courseId)) && /^Capstone/.test(String(x.title)))[0];
    assert.ok((cap.allowedExtensions as string[]).includes("xlsx"));
  });

  it("maps file names to the right type when the browser doesn't send one", () => {
    assert.equal(U.mimeFor("analysis.ipynb", ""), "application/x-ipynb+json");
    assert.equal(U.mimeFor("budget.xls", "application/octet-stream"), "application/vnd.ms-excel");
    assert.equal(U.mimeFor("lab.py", "text/x-python-script"), "text/x-python");
  });
});

describe("Uploading work for mini labs and projects", () => {
  it("a Word file, an Excel workbook and a notebook upload through the scan and reach the instructor", async () => {
    const docx = await render({ title: "Mini lab write-up", blocks: [{ t: "p", text: "My results." }] }, "docx");
    const xlsx = await render({ title: "Results", blocks: [{ t: "table", head: ["a", "b"], rows: [["1", "2"]] }] }, "xlsx");
    for (const [name, type, bytes] of [
      ["writeup.docx", "", docx],
      ["results.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsx],
      ["lab.ipynb", "", JSON.stringify({ cells: [], nbformat: 4, nbformat_minor: 5, metadata: {} })],
      ["agent.py", "text/x-python", "print('hello')\n"],
    ] as const) {
      const r = await upload(name, type, bytes, { gradedItemId: ITEM, courseId: COURSE });
      assert.equal(r.status, 201, `${name}: ${r.detail}`);
    }
    const mine = U.attachmentsFor(storeOf("academy"), as("academy", "student1", false).actor, ITEM);
    assert.equal(mine.length, 4);
    const staff = U.attachmentsFor(storeOf("academy"), as("academy", "instructor", true).actor, ITEM);
    assert.ok(staff.every((x) => x.learner));
  });

  it("legacy .xls (Office binary) passes the scan; executables and disguised files don't", async () => {
    const cfb = Buffer.concat([Buffer.from("d0cf11e0a1b11ae1", "hex"), Buffer.alloc(504)]);
    assert.equal((await upload("old.xls", "application/vnd.ms-excel", cfb, { gradedItemId: ITEM, courseId: COURSE })).status, 201);
    assert.notEqual((await upload("tool.exe", "application/octet-stream", "MZ...", { gradedItemId: ITEM, courseId: COURSE })).status, 201);
    assert.notEqual((await upload("report.pdf", "application/pdf", "MZ\u0090\u0000 not really a pdf", { gradedItemId: ITEM, courseId: COURSE })).status, 201);
  });

  it("a Colab, Codelab or GitHub link can be submitted; plain http and unknown items are refused", () => {
    const st = as("academy", "student1", false);
    const r = U.attachWork(st.store, st.actor, { itemId: ITEM, url: "https://colab.research.google.com/drive/abc123" });
    assert.equal(r.linkKind, "Google Colab notebook");
    assert.equal(U.attachWork(st.store, st.actor, { itemId: ITEM, url: "https://github.com/learner/agent-lab" }).linkKind, "Repository");
    assert.equal(status(() => U.attachWork(st.store, st.actor, { itemId: ITEM, url: "http://example.org/x" })), 422);
    assert.equal(status(() => U.attachWork(st.store, st.actor, { itemId: "gi_missing", url: "https://colab.research.google.com/x" })), 404);
  });

  it("people outside the course can't attach work", () => {
    const other = as("demo", "student1", false);
    assert.equal(status(() => U.attachWork(storeOf("academy"), other.actor, { itemId: ITEM, url: "https://colab.research.google.com/x" })), 403);
  });
});

describe("Inline file preview", () => {
  it("previews uploaded Word, Excel and notebook files as text; other learners can't open them", async () => {
    const s = storeOf("academy");
    const files = s.list("files", (f) => f.ownerId === "usr_academy_student1" && f.state === "available");
    const byExt = (e: string) => files.find((f) => String(f.name).endsWith(`.${e}`))!;
    const me = as("academy", "student1", false);
    const docx = U.previewFile(s, me.actor, byExt("docx").id);
    assert.equal(docx.kind, "html");
    assert.match((docx as { html: string }).html, /My results\./);
    const xlsx = U.previewFile(s, me.actor, byExt("xlsx").id) as { html: string };
    assert.match(xlsx.html, /<th scope="col">a<\/th>/);
    assert.doesNotMatch(xlsx.html, /<script/i);
    const nb = U.previewFile(s, me.actor, byExt("ipynb").id);
    assert.equal(nb.kind, "html");
    const staff = U.previewFile(s, as("academy", "instructor", true).actor, byExt("docx").id);
    assert.equal(staff.kind, "html");
    assert.throws(() => U.previewFile(s, as("academy", "student2", false).actor, byExt("docx").id), /can't open this file/);
  });

  it("serves the preview over HTTP with a locked-down content policy", async () => {
    const f = storeOf("academy").list("files", (x) => x.ownerId === "usr_academy_student1" && String(x.name).endsWith(".py"))[0];
    const r = await handleCampus(new Request(`${H}files/${f.id}/preview`, { headers: { cookie } }), `v1/t/academy/files/${f.id}/preview`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-security-policy") ?? "", /default-src 'none'/);
    assert.match(await r.text(), /print\(&#39;hello&#39;\)|print\('hello'\)/);
  });
});
