import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { openApi } from "../src/campus/http/openapi";

/** Contracts in /contracts are versioned and must match the code (regenerate with `npm run campus:docs`). */
describe("Campus contracts", () => {
  it("OpenAPI document in /contracts is up to date", () => {
    const committed = JSON.parse(fs.readFileSync("contracts/campus/v1/openapi.json", "utf8"));
    assert.deepEqual(committed, JSON.parse(JSON.stringify(openApi())));
  });
  it("gRPC proto declares the served service", () => {
    const proto = fs.readFileSync("contracts/campus/v1/campus.proto", "utf8");
    for (const m of ["Health", "ListCourses", "ListEnrollments", "ListEvents"]) assert.match(proto, new RegExp(`rpc ${m}\\(`));
  });
});
