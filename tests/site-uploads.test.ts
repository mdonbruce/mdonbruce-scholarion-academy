import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { catalog, lms } from "../src/platform";
import { SITE_FORMATS } from "../src/platform/lms";
import { getDb } from "../src/platform/store";
import { fresh } from "./helpers";

/** Site project submissions: real file uploads (Word, Excel, PDF, notebooks, Python…) and links. */

beforeEach(() => fresh());

function entitledProject() {
  for (const e of getDb().enrollments.filter((x) => x.level === "full")) {
    const p = catalog.items(e.productId).find((i) => !!i.project);
    if (p) return { userId: e.userId, item: p };
  }
  throw new Error("no entitled project in the seed");
}

describe("Site uploads", () => {
  it("accepts Word, Excel, PDF, notebooks and Python, storing the file with its checksum", () => {
    for (const x of ["docx", "xlsx", "pdf", "ipynb", "py", "zip"]) assert.ok(SITE_FORMATS.includes(x), x);
    const { userId, item } = entitledProject();
    const s = lms.submitProject(userId, item.id, "My notebook, results workbook and a short report.", undefined, { name: "results.ipynb", type: "", bytes: Buffer.from('{"cells":[]}') }, "https://colab.research.google.com/drive/abc");
    assert.equal(s.file?.name, "results.ipynb");
    assert.equal(s.file?.sha256.length, 64);
    assert.equal(s.url, "https://colab.research.google.com/drive/abc");
  });

  it("refuses executables, fake PDFs, unknown types and plain-http links", () => {
    const { userId, item } = entitledProject();
    const text = "A long enough description of the submission.";
    assert.throws(() => lms.submitProject(userId, item.id, text, undefined, { name: "run.exe", type: "", bytes: Buffer.from("MZ") }), /Accepted files/);
    assert.throws(() => lms.submitProject(userId, item.id, text, undefined, { name: "notes.txt", type: "", bytes: Buffer.from("MZ\u0090") }), /Executable/);
    assert.throws(() => lms.submitProject(userId, item.id, text, undefined, { name: "report.pdf", type: "application/pdf", bytes: Buffer.from("not a pdf") }), /real PDF/);
    assert.throws(() => lms.submitProject(userId, item.id, text, undefined, undefined, "http://example.org"), /https/);
  });
});
