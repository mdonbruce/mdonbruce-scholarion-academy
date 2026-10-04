import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lib = readFileSync(new URL("../lib/voice-synthesis.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/voice-synthesis/route.ts", import.meta.url), "utf8");
const studio = readFileSync(new URL("../app/agentic/build.tsx", import.meta.url), "utf8");
const live = readFileSync(new URL("../app/agentic/operate.tsx", import.meta.url), "utf8");

test("dynamic Amara synthesis is consent and provider gated", () => {
  for (const key of ["HAVEN_TTS_ENDPOINT", "HAVEN_TTS_PROVIDER", "HAVEN_TTS_API_KEY", "AMARA_VOICE_ID", "AMARA_VOICE_CONSENT_ID"]) assert.match(lib, new RegExp(key));
  assert.match(lib, /watermark: true/);
  assert.match(route, /sensitive text not stored/);
});

test("Agent Studio and Live Sync use dynamic synthesis and label backup playback", () => {
  for (const source of [studio, live]) {
    assert.match(source, /\/api\/voice-synthesis/);
    assert.match(source, /Play backup recording/);
  }
  assert.match(live, /await speak\(answer\)/);
});
