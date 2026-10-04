import test from "node:test";
import assert from "node:assert/strict";
import { apiAccess } from "../lib/api-boundary.ts";

test("legacy staff APIs reject anonymous and outside-room accounts", () => {
  for (const path of ["/api/data/messages", "/api/files/1", "/api/agent-actions", "/api/communications/status", "/api/tenant-registry"]) {
    assert.equal(apiAccess(path, null, "owner@example.com"), "unauthorized", path);
    assert.equal(apiAccess(path, "partner@scholarisglobal.com", "owner@example.com"), "unauthorized", path);
    assert.equal(apiAccess(path, "desk@oakhavensuites.com", "owner@example.com"), "staff", path);
    assert.equal(apiAccess(path, "owner@example.com", "owner@example.com"), "staff", path);
  }
});

test("only exact independently authenticated paths reach their own verifier", () => {
  for (const path of ["/api/agentic-ai", "/api/agentic-ai/inbound", "/api/hooks/123", "/api/communications/voice", "/api/communications/whatsapp", "/api/communications/ivr"]) {
    assert.equal(apiAccess(path, null, ""), "handler", path);
  }
  assert.equal(apiAccess("/api/hooks/123/edit", null, ""), "unauthorized");
  assert.equal(apiAccess("/api/agentic-ai/private", null, ""), "unauthorized");
});
