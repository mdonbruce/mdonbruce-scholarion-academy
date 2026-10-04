"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Lesson player. Real lessons stream HLS from the LMS video pipeline; until a course's
 * video is uploaded the player runs the transcript as a timed caption track so captions,
 * speed, transcript sync, resume position and completion tracking all work end to end.
 */
type Note = { id: string; kind: "note" | "bookmark"; atSec: number; text: string };

export function VideoPlayer({ itemId, title, durationSec, transcript, captions, resumeSec, completed, notes: initialNotes = [], notesEnabled = false }: { itemId: string; title: string; durationSec: number; transcript: string; captions: string[]; resumeSec: number; completed: boolean; notes?: Note[]; notesEnabled?: boolean }) {
  const sentences = transcript.split(/(?<=\.)\s+/).filter(Boolean);
  const per = durationSec / Math.max(1, sentences.length);
  const [t, setT] = useState(resumeSec);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [cc, setCc] = useState(true);
  const [done, setDone] = useState(completed);
  const lastSent = useRef<number>(resumeSec);
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);

  const send = (status: "started" | "completed", sec: number) =>
    fetch("/api/v1/lms/progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId, status, resumeSec: String(Math.round(sec)) }) }).catch(() => undefined);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setT((x) => {
        const nx = Math.min(durationSec, x + speed * 2);
        if (nx - (lastSent.current ?? 0) >= 10) {
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

  const addNote = async (kind: "note" | "bookmark") => {
    if (kind === "note" && !draft.trim()) {
      setStatus("Write something for your note first.");
      return;
    }
    setBusy(true);
    const at = Math.round(t);
    try {
      const res = await fetch(`/api/v1/lms/items/${itemId}/notes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ atSec: at, text: kind === "note" ? draft : draft.trim() || "", kind }) });
      const data = (await res.json()) as { note?: Note; error?: { message: string } };
      if (!res.ok || !data.note) throw new Error(data.error?.message ?? "Couldn't save. Try again.");
      setNotes((n) => [...n, data.note!].sort((a, b) => a.atSec - b.atSec));
      setDraft("");
      setStatus(`${kind === "bookmark" ? "Bookmark" : "Note"} saved at ${fmt(at)}.`);
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeNote = async (n: Note) => {
    try {
      const res = await fetch(`/api/v1/lms/notes/${n.id}/delete`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (!res.ok) throw new Error("Couldn't delete. Try again.");
      setNotes((x) => x.filter((y) => y.id !== n.id));
      setStatus(`Deleted the ${n.kind} at ${fmt(n.atSec)}.`);
    } catch (err) {
      setStatus((err as Error).message);
    }
  };

  const jump = (sec: number) => {
    setT(Math.min(durationSec, Math.max(0, sec)));
    setStatus(`Jumped to ${fmt(sec)}.`);
    playerRef.current?.focus();
  };

  return (
    <div className="stack">
      <div
        ref={playerRef}
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
      {notesEnabled && (
        <section className="panel video-notes" aria-labelledby={`vn-${itemId}`}>
          <h2 id={`vn-${itemId}`} className="vn-title">
            Notes &amp; bookmarks
          </h2>
          <p className="tiny muted" style={{ margin: "0 0 8px" }}>
            Private to you. Each one is pinned to the current video time ({fmt(t)}).
          </p>
          <label htmlFor={`vn-text-${itemId}`} className="small">
            Note at {fmt(t)}
          </label>
          <textarea id={`vn-text-${itemId}`} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} rows={2} />
          <div className="row" style={{ ["--gap" as string]: "8px", marginTop: 8 }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void addNote("note")}>
              Save note at {fmt(t)}
            </button>
            <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void addNote("bookmark")}>
              Bookmark {fmt(t)}
            </button>
          </div>
          <p role="status" aria-live="polite" className="tiny" style={{ minHeight: "1.2em", margin: "6px 0" }}>
            {status}
          </p>
          {notes.length === 0 ? (
            <p className="small muted" style={{ margin: 0 }}>
              No notes yet.
            </p>
          ) : (
            <ul className="vn-list">
              {notes.map((n) => (
                <li key={n.id}>
                  <button type="button" className="btn btn-ghost btn-sm mono" onClick={() => jump(n.atSec)} aria-label={`Jump to ${fmt(n.atSec)}: ${n.text}`}>
                    {fmt(n.atSec)}
                  </button>
                  <span className="vn-kind tiny">{n.kind === "bookmark" ? "Bookmark" : "Note"}</span>
                  <span className="small vn-text">{n.text}</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void removeNote(n)} aria-label={`Delete ${n.kind} at ${fmt(n.atSec)}`}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
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
