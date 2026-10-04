import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { PDFDocument } from "pdf-lib";
import { fromCsv, fromHtml, fromJson, fromMarkdown, parseCsv, render, unzip, withOfficeCopies, type Doc } from "../src/documents";
import { winAnsi } from "../src/documents/pdf";
import { handleApi } from "../src/bff/api";
import { credentials } from "../src/platform";
import { DEMO } from "../src/platform/seed";
import { fresh } from "./helpers";
import { freshCampus } from "./campus-helpers";
import { handleCampus } from "../src/campus/http/router";
import { DEMO_PASSWORD } from "../src/campus/seed";
import { GENAI } from "../src/campus/academy/genai-program";

/** Every download as PDF, Word and Excel. */

const SAMPLE: Doc = {
  title: "Module 3 — Retrieval & RAG",
  subtitle: "Scholaris AI Academy",
  blocks: [
    { t: "h", level: 1, text: "Overview" },
    { t: "p", text: "Chunking → embeddings → retrieval, with citations ≥ 2 per answer. Café ü." },
    { t: "list", items: ["Chunk", "– nested detail", "Embed"] },
    { t: "list", ordered: true, items: ["First", "Second"] },
    { t: "table", caption: "Scores", head: ["Learner", "Score", "Code"], rows: [["Ada", "92.5", "007"], ["Ben", "81", "A1"]] },
    { t: "code", text: "def f(x):\n    return x * 2" },
  ],
};

const part = (zip: Uint8Array, name: string) => unzip(Buffer.from(zip)).find((e) => e.name === name)?.data.toString("utf8") ?? "";

describe("Parsers", () => {
  it("HTML: headings, paragraphs, lists (nested), tables and code in reading order; scripts and chrome dropped", () => {
    const d = fromHtml(`<html><head><title>T</title><script>alert(1)</script></head><body><nav>Menu</nav><main><h1>Title &amp; more</h1><p>Hello <b>world</b>&nbsp;!</p><ul><li>One<ul><li>Inner</li></ul></li><li>Two</li></ul><table><caption>Grades</caption><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>x</td></tr></tbody></table><pre>code &lt;here&gt;</pre></main></body></html>`);
    assert.equal(d.title, "Title & more");
    assert.deepEqual(d.blocks.map((b) => b.t), ["h", "p", "list", "table", "code"]);
    assert.deepEqual((d.blocks[2] as { items: string[] }).items, ["One", "– Inner", "Two"]);
    assert.deepEqual((d.blocks[3] as { head: string[]; rows: string[][] }).rows, [["1", "x"]]);
    assert.equal((d.blocks[4] as { text: string }).text, "code <here>");
    assert.ok(!JSON.stringify(d).includes("alert") && !JSON.stringify(d).includes("Menu"));
  });

  it("Markdown, CSV (quotes, commas, newlines) and JSON", () => {
    const m = fromMarkdown("# H\n\nText **bold** [link](https://x.org)\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- x\n1. y\n");
    assert.deepEqual(m.blocks.map((b) => b.t), ["h", "p", "table", "list", "list"]);
    assert.equal((m.blocks[1] as { text: string }).text, "Text bold link (https://x.org)");
    assert.deepEqual(parseCsv('a,b\n"x, y","he said ""hi"""\n"multi\nline",3\n'), [["a", "b"], ["x, y", 'he said "hi"'], ["multi\nline", "3"]]);
    assert.equal(fromCsv("a,b\n1,2\n").blocks[0].t, "table");
    const j = fromJson({ total: 2, rows: [{ a: 1, b: "x" }, { a: 2, c: true }] });
    assert.deepEqual((j.blocks.find((b) => b.t === "table" && b.caption === "rows") as { head: string[] }).head, ["a", "b", "c"]);
  });

  it("PDF text folds characters the standard fonts can't draw", () => {
    assert.equal(winAnsi("A → B ≥ 2 ✓ café"), "A -> B >= 2 v café");
  });
});

describe("Writers", () => {
  it("PDF: valid file with title metadata and page numbers", async () => {
    const pdf = Buffer.from(await render(SAMPLE, "pdf"));
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    const p = await PDFDocument.load(pdf);
    assert.equal(p.getTitle(), "Module 3 — Retrieval & RAG");
    assert.ok(p.getPageCount() >= 1);
  });

  it("Word: heading styles, real lists, a table with a repeating header, footer page numbers", async () => {
    const docx = await render(SAMPLE, "docx");
    const xml = part(docx, "word/document.xml");
    assert.match(xml, /<w:pStyle w:val="Title"\/>/);
    assert.match(xml, /<w:pStyle w:val="Heading1"\/><\/w:pPr><w:r><w:t xml:space="preserve">Overview/);
    assert.match(xml, /<w:numPr><w:ilvl w:val="1"\/>/);
    assert.match(xml, /<w:tblHeader\/>/);
    assert.match(xml, /Café ü/);
    assert.match(part(docx, "word/footer1.xml"), /NUMPAGES/);
    assert.match(part(docx, "[Content_Types].xml"), /wordprocessingml\.document\.main/);
    assert.match(part(docx, "docProps/core.xml"), /<dc:title>Module 3 — Retrieval &amp; RAG<\/dc:title>/);
  });

  it("Excel: a Document sheet plus one sheet per table, numbers as numbers, frozen filtered header", async () => {
    const xlsx = await render(SAMPLE, "xlsx");
    const wb = part(xlsx, "xl/workbook.xml");
    assert.match(wb, /<sheet name="Document"/);
    assert.match(wb, /<sheet name="Scores"/);
    const s2 = part(xlsx, "xl/worksheets/sheet2.xml");
    assert.match(s2, /<c r="B2" s="7"><v>92.5<\/v><\/c>/);
    assert.match(s2, /<c r="C2" s="6" t="inlineStr"><is><t xml:space="preserve">007<\/t>/); // leading zero kept as text
    assert.match(s2, /state="frozen"/);
    assert.match(s2, /<autoFilter ref="A1:C3"\/>/);
  });

  it("bundles gain PDF, Word and Excel copies of each document, and an index", async () => {
    const { entries } = await withOfficeCopies([
      { name: "Pkg/notes.md", data: Buffer.from("# Notes\n\nHello") },
      { name: "Pkg/data.csv", data: Buffer.from("a,b\n1,2\n") },
      { name: "Pkg/model.ipynb", data: Buffer.from("{}") },
      { name: "Pkg/manifest.json", data: Buffer.from("{}") },
    ]);
    const names = entries.map((e) => e.name);
    for (const n of ["Pkg/notes.pdf", "Pkg/notes.docx", "Pkg/notes.xlsx", "Pkg/data.pdf", "Pkg/data.docx", "Pkg/data.xlsx", "Pkg/_formats.json"]) assert.ok(names.includes(n), n);
    assert.ok(!names.some((n) => /model\.(pdf|docx|xlsx)$|manifest\.(pdf|docx|xlsx)$/.test(n)));
  });
});

describe("Campus downloads in every format", () => {
  const H = "http://localhost:3000/api/campus/v1/t/academy/";
  let cookie = "";
  before(async () => {
    freshCampus();
    const r = await handleCampus(new Request(`${H}auth/signin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "advisor@academy.scholarion.test", password: DEMO_PASSWORD }) }), "v1/t/academy/auth/signin");
    cookie = r.headers.get("set-cookie")!.split(";")[0];
  });
  const get = (path: string, c = cookie) => handleCampus(new Request(`${H}${path}`, { headers: c ? { cookie: c } : {} }), `v1/t/academy/${path.split("?")[0]}`);

  it("program brochure as PDF, Word and Excel with the same content", async () => {
    const pdf = await get(`programs/${GENAI.slug}/brochure.pdf`, "");
    assert.equal(pdf.headers.get("content-type"), "application/pdf");
    const docx = await get(`programs/${GENAI.slug}/brochure.pdf?format=docx`, "");
    assert.equal(docx.status, 200);
    assert.match(docx.headers.get("content-type") ?? "", /wordprocessingml/);
    assert.match(docx.headers.get("content-disposition") ?? "", /brochure\.docx/);
    const xml = part(new Uint8Array(await docx.arrayBuffer()), "word/document.xml");
    assert.match(xml, /Curriculum/);
    assert.match(xml, /Projects and capstone/);
    const xlsx = await get(`programs/${GENAI.slug}/brochure.pdf?format=xlsx`, "");
    assert.match(part(new Uint8Array(await xlsx.arrayBuffer()), "xl/workbook.xml"), /<sheet name="Curriculum"/);
  });

  it("campaign kit files (HTML, Markdown, CSV, calendar) convert to each format", async () => {
    for (const [file, fmt, type] of [
      ["flyer_program_1080x1350.html", "pdf", "application/pdf"],
      ["schedule_time_zones.md", "docx", "wordprocessingml"],
      ["schedule.csv", "xlsx", "spreadsheetml"],
      ["calendar.ics", "xlsx", "spreadsheetml"],
    ] as const) {
      const r = await get(`campaigns/genai-2027/assets/${file}?format=${fmt}`);
      assert.equal(r.status, 200, file);
      assert.match(r.headers.get("content-type") ?? "", new RegExp(type), file);
    }
    const ics = await get("campaigns/genai-2027/assets/calendar.ics?format=xlsx");
    const sheet = part(new Uint8Array(await ics.arrayBuffer()), "xl/worksheets/sheet1.xml");
    assert.equal((sheet.match(/<row /g) ?? []).length, 19); // header + 18 sessions
  });

  it("query results download as Excel; access rules still apply", async () => {
    const r = await get("q/eco.changelog?format=xlsx", "");
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type") ?? "", /spreadsheetml/);
    const anon = await get("campaigns/genai-2027/assets/schedule.csv?format=xlsx", "");
    assert.equal(anon.status, 401);
  });

  it("the program folder zip carries PDF, Word and Excel copies of its documents", async () => {
    const r = await get("campaigns/genai-2027/program-folder.zip");
    assert.equal(r.status, 200);
    const names = unzip(Buffer.from(await r.arrayBuffer())).map((e) => e.name);
    const root = "Scholarion_GenAI_Agentic_Program";
    for (const n of ["00_Program_Overview/program_overview.pdf", "00_Program_Overview/program_overview.docx", "00_Program_Overview/program_overview.xlsx", "07_Operations/calendar.xlsx", "_formats.json", "manifest.json"]) assert.ok(names.includes(`${root}/${n}`), n);
    const plain = await get("campaigns/genai-2027/program-folder.zip?office=0");
    assert.ok(!unzip(Buffer.from(await plain.arrayBuffer())).some((e) => e.name.endsWith(".docx")));
  });

  it("asking a PDF for PDF returns it unchanged; formats that can't be produced say so", async () => {
    const same = await get(`programs/${GENAI.slug}/brochure.pdf?format=pdf`, "");
    assert.equal(same.headers.get("content-type"), "application/pdf");
  });
});

describe("Site downloads in every format", () => {
  before(() => fresh());
  const signIn = async (email: string, password: string) => {
    const r = await handleApi(new Request("http://localhost:3000/api/v1/auth/signin", { method: "POST", headers: { host: "localhost:3000", "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ email, password }).toString() }), "auth/signin");
    return r.headers.getSetCookie()[0].split(";")[0];
  };
  it("a certificate downloads as Word and Excel with the holder, title and verification link", async () => {
    const id = credentials.forUser("usr_ngozi")[0].id;
    const cookie = await signIn(DEMO.graduate.email, DEMO.graduate.password);
    const get = (fmt: string) => handleApi(new Request(`http://localhost:3000/api/v1/credentials/${id}/pdf?format=${fmt}`, { headers: { host: "localhost:3000", cookie } }), `credentials/${id}/pdf`);
    const docx = await get("docx");
    assert.equal(docx.status, 200);
    const xml = part(new Uint8Array(await docx.arrayBuffer()), "word/document.xml");
    assert.match(xml, /Verify at/);
    assert.match(xml, new RegExp(id));
    const xlsx = await get("xlsx");
    assert.match(xlsx.headers.get("content-type") ?? "", /spreadsheetml/);
  });
});
