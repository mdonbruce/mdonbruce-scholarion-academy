import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectFfmpeg, findFont } from "./render";
import { vttFromCues } from "./generate";

/**
 * Narrated media renderer: text-to-speech with ffmpeg's built-in Flite voices (offline; no
 * service is contacted), then MP3 audio and 1280×720 MP4 video with captions timed to the real
 * narration.
 *
 * Voices are SYNTHETIC and are labelled as such — they are not anyone's cloned voice. In
 * particular, the instructor's own voice is never imitated (cloning needs his recorded consent
 * through the Voice Studio consent workflow).
 *
 * Safety (same rules as the silent preview): argument arrays only, never a shell; every piece of
 * text reaches ffmpeg only as the contents of a temp file (flite textfile=, drawtext textfile=
 * with expansion=none); filter-graph paths must match a conservative character set; timeouts;
 * temp directories are always removed.
 */

export const VOICES = { narrator: "awb", hostA: "slt", hostB: "rms", video: "slt" } as const;
export const VOICE_LABEL = "Synthetic voice (Flite) — not a recording of a real person";
const SAFE_PATH = /^[A-Za-z0-9_./-]+$/;

export type Tts = { ok: true; ffmpeg: string } | { ok: false; reason: string };

/** TTS is available when ffmpeg exists and was built with libflite (Ubuntu/Debian builds are). SCHOLARION_TTS=off disables it. */
export function detectTts(env: NodeJS.ProcessEnv = process.env, ffmpeg?: string): Tts {
  if (env.SCHOLARION_TTS === "off") return { ok: false, reason: "Narration is turned off (SCHOLARION_TTS=off)." };
  const ff = ffmpeg ? { ok: true as const, bin: ffmpeg } : detectFfmpeg(env);
  if (!ff.ok) return { ok: false, reason: ff.reason };
  const f = spawnSync(ff.bin, ["-hide_banner", "-filters"], { timeout: 5000, encoding: "utf8", shell: false });
  if (!/\bflite\b/.test(f.stdout ?? "")) return { ok: false, reason: "This ffmpeg build has no Flite text-to-speech (install the distribution ffmpeg package, which includes libflite)." };
  return { ok: true, ffmpeg: ff.bin };
}

const execFileP = promisify(execFile);
/** Async ffmpeg (argument array, no shell) so long renders never block the server's event loop. */
async function run(bin: string, args: string[], timeoutMs = 120_000) {
  try {
    await execFileP(bin, args, { timeout: timeoutMs, encoding: "utf8", shell: false, maxBuffer: 8 * 1024 * 1024 });
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    throw new Error(`ffmpeg failed: ${String(err.stderr || err.message || e).slice(0, 300)}`);
  }
}

/** Duration of a 16-bit PCM WAV written by ffmpeg (reads the fmt and data chunks). */
function wavSeconds(file: string): number {
  const b = fs.readFileSync(file);
  let p = 12;
  let rate = 16000;
  let channels = 1;
  let bits = 16;
  while (p + 8 <= b.length) {
    const id = b.toString("ascii", p, p + 4);
    const size = b.readUInt32LE(p + 4);
    if (id === "fmt ") {
      channels = b.readUInt16LE(p + 10);
      rate = b.readUInt32LE(p + 12);
      bits = b.readUInt16LE(p + 22);
    } else if (id === "data") return Math.min(size, b.length - p - 8) / (rate * channels * (bits / 8));
    p += 8 + size + (size % 2);
  }
  return 0;
}

/** Text → speech-friendly text (drop URLs, citations and markup; keep sentences). */
export function speakable(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\[[^\]]{1,40}\]/g, "")
    .replace(/[*_`#>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

async function synth(bin: string, dir: string, idx: number, voice: string, text: string): Promise<{ file: string; sec: number }> {
  const txt = path.join(dir, `line_${idx}.txt`);
  const wav = path.join(dir, `line_${idx}.wav`);
  fs.writeFileSync(txt, speakable(text) || "...");
  await run(bin, ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-f", "lavfi", "-i", `flite=textfile=${txt}:voice=${voice}`, "-ar", "22050", "-ac", "1", "-c:a", "pcm_s16le", wav]);
  return { file: wav, sec: wavSeconds(wav) };
}

/** Join WAV files with optional gaps into one track, encoded as MP3 (or AAC in M4A for video). */
async function concatAudio(bin: string, dir: string, parts: { file: string; padTo?: number; gap?: number }[], out: string, codec: "mp3" | "aac", tempo = 1) {
  const list: string[] = [];
  for (const [k, p] of parts.entries()) {
    let f = p.file;
    if (p.padTo || p.gap) {
      const padded = path.join(dir, `pad_${k}.wav`);
      const af = p.padTo ? `apad=whole_dur=${p.padTo.toFixed(3)}` : `apad=pad_dur=${(p.gap ?? 0).toFixed(3)}`;
      await run(bin, ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", f, "-af", af, "-c:a", "pcm_s16le", padded]);
      f = padded;
    }
    list.push(`file '${f}'`);
  }
  const listFile = path.join(dir, "concat.txt");
  fs.writeFileSync(listFile, list.join("\n"));
  const filters = tempo !== 1 ? ["-af", `atempo=${tempo.toFixed(3)}`] : [];
  await run(bin, ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-f", "concat", "-safe", "0", "-i", listFile, ...filters, ...(codec === "mp3" ? ["-c:a", "libmp3lame", "-b:a", "64k"] : ["-c:a", "aac", "-b:a", "96k"]), out], 600_000);
}

async function withTemp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scholarion-narrate-"));
  try {
    if (!SAFE_PATH.test(dir)) throw new Error("The temp directory path contains unsupported characters.");
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export type AudioResult = { mp3: Buffer; durationSec: number; vtt: string; voices: string[] };

/**
 * Narrated audio from spoken lines. `targetSec` (e.g. the ~16-minute deep dive) may slow the
 * delivery slightly (never below 0.85×) to approach the target; it never adds filler content.
 */
export async function renderAudio(tts: Extract<Tts, { ok: true }>, lines: { voice: string; text: string; speaker?: string }[], opts: { gapSec?: number; targetSec?: number } = {}): Promise<AudioResult> {
  if (!lines.length) throw new Error("Nothing to narrate.");
  return withTemp(async (dir) => {
    const gap = opts.gapSec ?? 0.35;
    const parts: ({ file: string; sec: number } & { l: (typeof lines)[number] })[] = [];
    for (const [k, l] of lines.entries()) parts.push({ ...(await synth(tts.ffmpeg, dir, k, l.voice, l.text)), l });
    const natural = parts.reduce((s, p) => s + p.sec + gap, 0);
    const tempo = opts.targetSec && natural < opts.targetSec ? Math.max(0.85, natural / opts.targetSec) : 1;
    const out = path.join(dir, "out.mp3");
    await concatAudio(tts.ffmpeg, dir, parts.map((p) => ({ file: p.file, gap })), out, "mp3", tempo);
    let t = 0;
    const cues = parts.map((p) => {
      const start = t / tempo;
      t += p.sec + gap;
      return { start, end: (t - gap) / tempo, text: `${p.l.speaker ? `${p.l.speaker}: ` : ""}${speakable(p.l.text)}` };
    });
    return { mp3: fs.readFileSync(out), durationSec: t / tempo, vtt: vttFromCues(cues), voices: [...new Set(lines.map((l) => l.voice))] };
  });
}

export type VideoSegment = { title: string; lines: string[]; narration: string; minSec: number };
export type VideoResult = { mp4: Buffer; durationSec: number; vtt: string; width: 1280; height: 720; encoder: string };

function wrap(text: string, width = 52): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if ((line + " " + w).trim().length > width) {
      if (line) out.push(line);
      line = w;
    } else line = (line + " " + w).trim();
  }
  if (line) out.push(line);
  return out;
}

/**
 * Narrated 1280×720 MP4: one branded card per segment, held for at least `minSec` and never
 * shorter than its narration; soft captions (mov_text) plus the returned WebVTT, both timed to
 * the synthesized audio.
 */
export async function renderVideo(tts: Extract<Tts, { ok: true }>, segments: VideoSegment[], opts: { header: string; voice?: string; font?: string | null; env?: NodeJS.ProcessEnv; photo?: { file: string; caption: string } | null }): Promise<VideoResult> {
  const font = opts.font === undefined ? findFont(opts.env ?? process.env) : opts.font;
  if (!font || !SAFE_PATH.test(font)) throw new Error("No usable font found (set SCHOLARION_FONT to a .ttf file with a simple path).");
  if (!segments.length) throw new Error("No segments.");
  return withTemp(async (dir) => {
    const voice = opts.voice ?? VOICES.video;
    const segAudio: { file: string; padTo: number }[] = [];
    const cues: { start: number; end: number; text: string }[] = [];
    const windows: { start: number; end: number }[] = [];
    let t = 0;
    for (const [i, seg] of segments.entries()) {
      // Synthesize sentence by sentence so captions follow the real speech.
      const sentences = speakable(seg.narration).match(/[^.!?]+[.!?]*/g)?.map((x) => x.trim()).filter(Boolean) ?? [];
      const parts: { file: string; sec: number; s: string }[] = [];
      for (const [k, sentence] of sentences.entries()) parts.push({ ...(await synth(tts.ffmpeg, dir, i * 1000 + k, voice, sentence)), s: sentence });
      const lead = 0.6;
      let local = lead;
      for (const p of parts) {
        cues.push({ start: t + local, end: t + local + p.sec, text: p.s });
        local += p.sec + 0.25;
      }
      const dur = Math.max(seg.minSec, local + 0.8);
      // Segment audio: lead-in silence + sentences, padded to the card duration.
      const segList = path.join(dir, `seg_${i}.txt`);
      const silence = path.join(dir, `sil_${i}.wav`);
      await run(tts.ffmpeg, ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-f", "lavfi", "-i", `anullsrc=r=22050:cl=mono`, "-t", String(lead), "-c:a", "pcm_s16le", silence]);
      const gapFile = path.join(dir, `gap_${i}.wav`);
      await run(tts.ffmpeg, ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-f", "lavfi", "-i", `anullsrc=r=22050:cl=mono`, "-t", "0.25", "-c:a", "pcm_s16le", gapFile]);
      fs.writeFileSync(segList, [silence, ...parts.flatMap((p) => [p.file, gapFile])].map((f) => `file '${f}'`).join("\n"));
      const segWav = path.join(dir, `segaudio_${i}.wav`);
      await run(tts.ffmpeg, ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-f", "concat", "-safe", "0", "-i", segList, "-c:a", "pcm_s16le", segWav]);
      segAudio.push({ file: segWav, padTo: dur });
      windows.push({ start: t, end: t + dur });
      t += dur;
    }
    const total = t;
    const audio = path.join(dir, "narration.m4a");
    await concatAudio(tts.ffmpeg, dir, segAudio, audio, "aac");
    const filters: string[] = [];
    const header = path.join(dir, "header.txt");
    fs.writeFileSync(header, opts.header);
    filters.push(`drawtext=fontfile='${font}':textfile='${header}':expansion=none:fontcolor=0xF2C66D:fontsize=26:x=60:y=40`);
    const voiceNote = path.join(dir, "voice.txt");
    fs.writeFileSync(voiceNote, "Narration: synthetic voice");
    filters.push(`drawtext=fontfile='${font}':textfile='${voiceNote}':expansion=none:fontcolor=0xB7C0D6:fontsize=20:x=60:y=680`);
    segments.forEach((seg, i) => {
      const title = path.join(dir, `t_${i}.txt`);
      const body = path.join(dir, `b_${i}.txt`);
      fs.writeFileSync(title, seg.title);
      fs.writeFileSync(body, seg.lines.flatMap((l) => wrap(speakable(l))).slice(0, 11).join("\n"));
      const en = `gte(t,${windows[i].start.toFixed(3)})*lt(t,${windows[i].end.toFixed(3)})`;
      filters.push(`drawtext=fontfile='${font}':textfile='${title}':expansion=none:fontcolor=white:fontsize=46:x=60:y=110:enable='${en}'`);
      filters.push(`drawtext=fontfile='${font}':textfile='${body}':expansion=none:fontcolor=white:fontsize=32:line_spacing=14:x=60:y=200:enable='${en}'`);
    });
    const vtt = vttFromCues(cues);
    const vttPath = path.join(dir, "captions.vtt");
    fs.writeFileSync(vttPath, vtt);
    const enc = spawnSync(tts.ffmpeg, ["-hide_banner", "-encoders"], { timeout: 5000, encoding: "utf8", shell: false });
    const encoder = /\blibx264\b/.test(enc.stdout ?? "") ? "libx264" : "mpeg4";
    const out = path.join(dir, "video.mp4");
    // Approved instructor photo at its native size (never upscaled), top-right, with name and role.
    const photo = opts.photo && SAFE_PATH.test(opts.photo.file) && fs.existsSync(opts.photo.file) ? opts.photo : null;
    if (photo) {
      const cap = path.join(dir, "photo_caption.txt");
      fs.writeFileSync(cap, photo.caption);
      filters.push(`drawtext=fontfile='${font}':textfile='${cap}':expansion=none:fontcolor=0xF2C66D:fontsize=18:x=w-text_w-60:y=200`);
    }
    const graph = photo ? `[0:v][3:v]overlay=x=W-w-60:y=40,${filters.join(",")}[v]` : `[0:v]${filters.join(",")}[v]`;
    await run(
      tts.ffmpeg,
      [
        "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
        "-f", "lavfi", "-i", `color=c=0x0B1F4D:s=1280x720:r=10:d=${total.toFixed(3)}`,
        "-i", audio,
        "-i", vttPath,
        ...(photo ? ["-loop", "1", "-i", photo.file] : []),
        "-filter_complex", graph,
        "-map", "[v]", "-map", "1:a", "-map", "2:s",
        "-c:v", encoder, ...(encoder === "libx264" ? ["-preset", "ultrafast", "-tune", "stillimage"] : ["-q:v", "5"]),
        "-pix_fmt", "yuv420p", "-c:a", "copy",
        "-c:s", "mov_text", "-metadata:s:s:0", "language=eng",
        "-t", total.toFixed(3), "-movflags", "+faststart",
        out,
      ],
      900_000,
    );
    const mp4 = fs.readFileSync(out);
    if (mp4.length < 1000 || mp4.subarray(4, 8).toString() !== "ftyp") throw new Error("ffmpeg produced no valid MP4.");
    return { mp4, durationSec: total, vtt, width: 1280, height: 720, encoder };
  });
}
