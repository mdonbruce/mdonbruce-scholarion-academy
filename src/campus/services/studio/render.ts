import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Optional silent video preview renderer (ffmpeg).
 *
 * Safety: ffmpeg is invoked with spawnSync and an argument ARRAY (never a shell string), with a
 * timeout. All learner/instructor text reaches ffmpeg only as the CONTENTS of temp text files
 * (drawtext textfile=, expansion=none) and a WebVTT file — never as command-line arguments.
 * Paths placed in the filter graph must match a conservative character set. The temp directory
 * is always removed.
 *
 * No narration is produced (there is no text-to-speech provider), so the result is a SILENT
 * "visual preview"; the narrated MP4 stays "awaiting_rendering".
 */

export interface RenderSegment {
  start: number;
  end: number;
  title: string;
  lines: string[];
}

export type RenderResult =
  | { status: "preview_rendered_silent"; mp4: Buffer; durationSec: number; encoder: string }
  | { status: "configuration_required"; reason: string }
  | { status: "failed"; reason: string };

const SAFE_PATH = /^[A-Za-z0-9_./-]+$/;

function isExecutable(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Locate ffmpeg: SCHOLARION_FFMPEG (absolute path) or `ffmpeg` on PATH. Verified with `-version`. */
export function detectFfmpeg(env: NodeJS.ProcessEnv = process.env): { ok: true; bin: string } | { ok: false; reason: string } {
  let bin: string | null = null;
  const configured = env.SCHOLARION_FFMPEG?.trim();
  if (configured) {
    if (!path.isAbsolute(configured) || !isExecutable(configured)) return { ok: false, reason: `SCHOLARION_FFMPEG is set but "${configured}" is not an executable absolute path.` };
    bin = configured;
  } else {
    for (const dir of String(env.PATH ?? "").split(path.delimiter)) {
      if (!dir || !path.isAbsolute(dir)) continue;
      const cand = path.join(dir, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
      if (isExecutable(cand)) {
        bin = cand;
        break;
      }
    }
  }
  if (!bin) return { ok: false, reason: "ffmpeg was not found (set SCHOLARION_FFMPEG or install ffmpeg on PATH)." };
  const v = spawnSync(bin, ["-hide_banner", "-version"], { timeout: 5000, encoding: "utf8", shell: false });
  if (v.status !== 0) return { ok: false, reason: `ffmpeg at ${bin} did not run (${v.error?.message ?? `exit ${v.status}`}).` };
  return { ok: true, bin };
}

const FONT_CANDIDATES = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/TTF/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  "/usr/share/fonts/liberation/LiberationSans-Regular.ttf",
  "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
  "/Library/Fonts/DejaVuSans.ttf",
];

/** A font for drawtext: SCHOLARION_FONT or a DejaVu/Liberation font. */
export function findFont(env: NodeJS.ProcessEnv = process.env): string | null {
  const configured = env.SCHOLARION_FONT?.trim();
  const list = configured ? [configured] : FONT_CANDIDATES;
  for (const f of list) {
    try {
      if (/\.(ttf|otf)$/i.test(f) && fs.statSync(f).isFile()) return f;
    } catch {
      /* next */
    }
  }
  return null;
}

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

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Render a silent 1280×720 MP4 with one card per segment and a soft (mov_text) subtitle track. */
export function renderSegmentPreview(segments: RenderSegment[], vtt: string, opts: { ffmpeg?: string; font?: string | null; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}): RenderResult {
  const env = opts.env ?? process.env;
  const ff = opts.ffmpeg ? { ok: true as const, bin: opts.ffmpeg } : detectFfmpeg(env);
  if (!ff.ok) return { status: "configuration_required", reason: ff.reason };
  const font = opts.font === undefined ? findFont(env) : opts.font;
  if (!font) return { status: "configuration_required", reason: "No usable font found for captions on the cards (set SCHOLARION_FONT to a .ttf file)." };
  if (!SAFE_PATH.test(font)) return { status: "configuration_required", reason: "The font path contains characters that can't be used safely; use a simple path." };
  if (!segments.length) return { status: "failed", reason: "No segments to render." };
  const total = Math.max(...segments.map((s) => s.end));
  if (!(total > 0 && total <= 3600)) return { status: "failed", reason: "Invalid total duration." };

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scholarion-studio-"));
  try {
    if (!SAFE_PATH.test(dir)) return { status: "configuration_required", reason: "The temp directory path contains unsupported characters." };
    const enc = spawnSync(ff.bin, ["-hide_banner", "-encoders"], { timeout: 5000, encoding: "utf8", shell: false });
    const encoder = /\blibx264\b/.test(enc.stdout ?? "") ? "libx264" : "mpeg4";
    const filters: string[] = [];
    const header = path.join(dir, "header.txt");
    fs.writeFileSync(header, "Scholarion Academy | Agentic Cloud Labs - silent visual preview (AI DRAFT)");
    filters.push(`drawtext=fontfile='${font}':textfile='${header}':expansion=none:fontcolor=0xF2C66D:fontsize=26:x=60:y=40`);
    segments.forEach((seg, i) => {
      const title = path.join(dir, `seg_${i}_title.txt`);
      const body = path.join(dir, `seg_${i}_body.txt`);
      fs.writeFileSync(title, `${fmtTime(seg.start)}-${fmtTime(seg.end)}  ${seg.title}`);
      fs.writeFileSync(body, seg.lines.flatMap((l) => wrap(l)).slice(0, 11).join("\n"));
      const en = `gte(t,${Number(seg.start)})*lt(t,${Number(seg.end)})`;
      filters.push(`drawtext=fontfile='${font}':textfile='${title}':expansion=none:fontcolor=white:fontsize=44:x=60:y=110:enable='${en}'`);
      filters.push(`drawtext=fontfile='${font}':textfile='${body}':expansion=none:fontcolor=white:fontsize=32:line_spacing=14:x=60:y=200:enable='${en}'`);
    });
    const vttPath = path.join(dir, "captions.vtt");
    fs.writeFileSync(vttPath, vtt);
    const out = path.join(dir, "preview.mp4");
    const args = [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-f", "lavfi", "-i", `color=c=0x0B1F4D:s=1280x720:r=2:d=${total}`,
      "-i", vttPath,
      "-map", "0:v", "-map", "1:s",
      "-vf", filters.join(","),
      "-c:v", encoder, ...(encoder === "libx264" ? ["-preset", "ultrafast", "-tune", "stillimage"] : ["-q:v", "5"]),
      "-pix_fmt", "yuv420p",
      "-c:s", "mov_text", "-metadata:s:s:0", "language=eng",
      "-t", String(total), "-movflags", "+faststart",
      out,
    ];
    const r = spawnSync(ff.bin, args, { timeout: opts.timeoutMs ?? 120_000, encoding: "utf8", shell: false, maxBuffer: 4 * 1024 * 1024 });
    if (r.error || r.status !== 0) return { status: "failed", reason: `ffmpeg failed: ${(r.error?.message ?? r.stderr ?? `exit ${r.status}`).toString().slice(0, 400)}` };
    const mp4 = fs.readFileSync(out);
    if (mp4.length < 1000 || mp4.subarray(4, 8).toString() !== "ftyp") return { status: "failed", reason: "ffmpeg produced no valid MP4." };
    return { status: "preview_rendered_silent", mp4, durationSec: total, encoder };
  } catch (err) {
    return { status: "failed", reason: `Rendering error: ${(err as Error).message}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
