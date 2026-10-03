"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Lesson player. Real lessons stream HLS from the LMS video pipeline; until a course's
 * video is uploaded the player runs the transcript as a timed caption track so captions,
 * speed, transcript sync, resume position and completion tracking all work end to end.
 */
export function VideoPlayer({ itemId, title, durationSec, transcript, captions, resumeSec, completed }: { itemId: string; title: string; durationSec: number; transcript: string; captions: string[]; resumeSec: number; completed: boolean }) {
  const sentences = transcript.split(/(?<=\.)\s+/).filter(Boolean);
  const per = durationSec / Math.max(1, sentences.length);
  const [t, setT] = useState(resumeSec);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [cc, setCc] = useState(true);
  const [done, setDone] = useState(completed);
  const lastSent = useRef(resumeSec);

  const send = (status: "started" | "completed", sec: number) =>
    fetch("/api/v1/lms/progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId, status, resumeSec: String(Math.round(sec)) }) }).catch(() => undefined);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setT((x) => {
        const nx = Math.min(durationSec, x + speed * 2);
        if (nx - lastSent.current >= 10) {
          lastSent.current = nx;
          void send("started", nx);
        }
        if (nx >= durationSec * 0.9 && !done) {
          setDone(true);
          void send("completed", nx);
        }
        if (nx >= durationSec) setPlaying(false);
        return nx;
      });
    }, 1000 / 2);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed]);

  const idx = Math.min(sentences.length - 1, Math.floor(t / per));
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="stack">
      <div
        className="video"
        tabIndex={0}
        aria-label={`${title} video player`}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "k") {
            e.preventDefault();
            setPlaying((p) => !p);
          } else if (e.key === "ArrowRight") setT((x) => Math.min(durationSec, x + 10));
          else if (e.key === "ArrowLeft") setT((x) => Math.max(0, x - 10));
          else if (e.key === "c") setCc((c) => !c);
        }}
      >
        <button className="play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
          {playing ? "❚❚" : "▶"}
        </button>
        {cc && <div className="cc">{sentences[idx]}</div>}
      </div>
      <div className="row between small">
        <div className="row" style={{ ["--gap" as string]: "8px" }}>
          <span className="mono">
            {fmt(t)} / {fmt(durationSec)}
          </span>
          <input aria-label="Seek" type="range" min={0} max={durationSec} value={t} onChange={(e) => setT(Number(e.target.value))} style={{ width: 200 }} />
        </div>
        <div className="row" style={{ ["--gap" as string]: "8px" }}>
          <label className="sr-only" htmlFor="speed">
            Playback speed
          </label>
          <select id="speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} style={{ width: 90, minHeight: 34 }}>
            {[0.75, 1, 1.25, 1.5, 2].map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" aria-pressed={cc} onClick={() => setCc((c) => !c)}>
            CC
          </button>
          <span className="tiny muted">Captions: {captions.join(", ")} · keys: space, ←/→, c</span>
        </div>
      </div>
      {done && <span className="badge badge-green">Completed</span>}
      <details className="acc">
        <summary>Interactive transcript</summary>
        <div className="small">
          {sentences.map((s, i) => (
            <button key={i} className="linkish" style={{ textDecoration: "none", color: i === idx ? "var(--primary)" : "var(--text)", fontWeight: i === idx ? 700 : 400, textAlign: "left", display: "inline" }} onClick={() => setT(i * per)}>
              {s}{" "}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
