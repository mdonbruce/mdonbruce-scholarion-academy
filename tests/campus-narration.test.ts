import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { before, describe, it } from "node:test";
import { as, freshCampus, storeOf } from "./campus-helpers";
import { detectTts, renderAudio, renderVideo, speakable, VOICES } from "../src/campus/services/studio/narrate";
import * as studio from "../src/campus/services/studio";
import { startBackgroundJob } from "../src/campus/services/accountcfg";

/** Narrated media: offline synthetic voices (ffmpeg + Flite), captions timed to the audio. */

const tts = detectTts();
const skip = tts.ok ? false : `text-to-speech unavailable here: ${!tts.ok ? tts.reason : ""}`;

before(() => {
  freshCampus();
});

describe("Narration renderer", () => {
  it("strips citations, links and markup before speaking", () => {
    assert.equal(speakable("Agents plan [S2] and **act**. See https://example.edu/x for more."), "Agents plan and act . See for more.");
  });

  it("renders two-host MP3 with captions that follow the real audio", { skip }, async () => {
    if (!tts.ok) return;
    const a = await renderAudio(tts, [
      { voice: VOICES.hostA, speaker: "Host A (Alex)", text: "Why do agents need bounded tools?" },
      { voice: VOICES.hostB, speaker: "Host B", text: "Because a tool that can run anything can break anything." },
    ]);
    assert.ok(a.mp3.length > 5000);
    assert.ok(a.durationSec > 3 && a.durationSec < 20, String(a.durationSec));
    assert.match(a.vtt, /Host A \(Alex\): Why do agents/);
    assert.deepEqual(a.voices.sort(), [VOICES.hostA, VOICES.hostB].sort());
  });

  it("renders a 1280×720 MP4 with narration, captions and the instructor photo at native size", { skip }, async () => {
    if (!tts.ok) return;
    const v = await renderVideo(tts, [{ title: "Hook", lines: ["Build a bounded tool runner."], narration: "In this lab you build a bounded tool runner.", minSec: 6 }, { title: "Grading", lines: ["Architecture 30 points."], narration: "Four criteria decide your grade.", minSec: 4 }], { header: "Scholarion Academy | test", photo: { file: `${process.cwd()}/public/brand/faculty/martins-idahosa-original.png`, caption: "Dr. Martins Donbruce Idahosa" } });
    assert.equal(v.mp4.subarray(4, 8).toString(), "ftyp");
    assert.ok(v.durationSec >= 10);
    const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height", "-of", "json", "-"], { input: v.mp4, encoding: "utf8" });
    if (probe.status === 0) {
      const streams = (JSON.parse(probe.stdout).streams as { codec_type: string; width?: number; height?: number }[]).map((s) => s.codec_type).sort();
      assert.deepEqual(streams, ["audio", "subtitle", "video"]);
    }
    assert.match(v.vtt, /In this lab you build a bounded tool runner/);
  });
});

describe("Studio narration", () => {
  it("without text-to-speech, every narrated file says exactly what's needed (no fake media)", async () => {
    const lead = as("academy", "lead");
    const run = storeOf("academy").list("studio_runs")[0];
    const r = await studio.renderNarration(lead.store, lead.actor, run.id, { env: { ...process.env, SCHOLARION_TTS: "off" } });
    const media = storeOf("academy").list("studio_outputs", (o) => o.runId === run.id && o.setVersion === r.outputsVersion && /(audio_lecture|deep_dive)\.mp3$|video_overview\.mp4$|_requirements\.mp4$/.test(String(o.relPath)));
    assert.ok(media.length >= 4);
    for (const o of media) {
      assert.equal(o.status, "configuration_required", String(o.relPath));
      assert.match(String(o.reason), /SCHOLARION_TTS=off/);
    }
  });

  it("learners can't start rendering", async () => {
    const st = as("academy", "student1", false);
    const run = storeOf("academy").list("studio_runs")[0];
    await assert.rejects(() => studio.renderNarration(st.store, st.actor, run.id), /permission|forbidden|Only/i);
  });

  it("background jobs record completion and failure without holding the request", async () => {
    const adm = as("academy", "admin");
    const ok = startBackgroundJob(adm.store, adm.actor, "test_job", { n: 1 }, async () => ({ resultRef: "x/1" }));
    const bad = startBackgroundJob(adm.store, adm.actor, "test_job", { n: 2 }, async () => {
      throw new Error("boom");
    });
    assert.equal(ok.state, "running");
    for (let i = 0; i < 200 && [ok.id, bad.id].some((id) => storeOf("academy").get("async_jobs", id)!.state === "running"); i++) await new Promise((r) => setTimeout(r, 10));
    assert.equal(storeOf("academy").get("async_jobs", ok.id)!.state, "completed");
    assert.equal(storeOf("academy").get("async_jobs", bad.id)!.state, "failed");
  });
});
