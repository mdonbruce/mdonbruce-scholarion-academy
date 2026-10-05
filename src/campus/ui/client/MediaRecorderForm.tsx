"use client";

import { useEffect, useRef, useState } from "react";

/**
 * In-browser recording for the media library. Records audio or camera video with the browser's
 * MediaRecorder, then uploads the recording through the normal scanned upload route
 * (purpose "media"). Without camera/microphone permission or MediaRecorder support it says so
 * and the plain file upload form beside it still works.
 */
export default function MediaRecorderForm({ action, back }: { action: string; back: string }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"audio" | "video">("audio");
  const [state, setState] = useState<"idle" | "recording" | "ready" | "uploading" | "error">("idle");
  const [message, setMessage] = useState("");
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const blob = useRef<Blob | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const preview = useRef<HTMLVideoElement | null>(null);
  const [title, setTitle] = useState("");

  useEffect(() => {
    setSupported(typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  async function start() {
    setMessage("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia(mode === "video" ? { audio: true, video: { width: 1280, height: 720 } } : { audio: true });
      const chunks: Blob[] = [];
      const r = new MediaRecorder(stream);
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        blob.current = new Blob(chunks, { type: r.mimeType || (mode === "video" ? "video/webm" : "audio/webm") });
        if (preview.current) preview.current.src = URL.createObjectURL(blob.current);
        setState("ready");
      };
      recorder.current = r;
      r.start(1000);
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => {
        if (s + 1 >= 300) stop(); // 5-minute cap keeps files under the upload limit
        return s + 1;
      }), 1000);
      setState("recording");
    } catch {
      setState("error");
      setMessage("The browser didn't allow the microphone or camera. Check permissions, or upload a file instead.");
    }
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  async function upload() {
    if (!blob.current) return;
    setState("uploading");
    const ext = blob.current.type.includes("mp4") ? "mp4" : blob.current.type.includes("ogg") ? "ogg" : "webm";
    const fd = new FormData();
    fd.append("file", new File([blob.current], `${(title || "recording").replace(/[^A-Za-z0-9 _-]/g, "").trim() || "recording"}.${ext}`, { type: blob.current.type.split(";")[0] }));
    fd.append("purpose", "media");
    fd.append("title", title || "Recording");
    fd.append("back", back);
    fd.append("notice", "Recording saved to your media library.");
    try {
      const res = await fetch(action, { method: "POST", body: fd, redirect: "follow" });
      if (res.redirected) window.location.href = res.url;
      else if (res.ok) window.location.reload();
      else {
        setState("error");
        setMessage("Upload failed. Try a shorter recording.");
      }
    } catch {
      setState("error");
      setMessage("Upload failed. Check your connection and try again.");
    }
  }

  if (supported === false) return <p className="tiny muted">This browser can't record here. Upload an audio or video file instead.</p>;
  return (
    <div className="stack" aria-live="polite">
      <div className="row wrap">
        <label>
          <input type="radio" name="rec-mode" checked={mode === "audio"} onChange={() => setMode("audio")} disabled={state === "recording"} /> Audio
        </label>
        <label>
          <input type="radio" name="rec-mode" checked={mode === "video"} onChange={() => setMode("video")} disabled={state === "recording"} /> Video (720p)
        </label>
        <label className="sr-only" htmlFor="rec-title">
          Recording title
        </label>
        <input id="rec-title" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      </div>
      <div className="row wrap">
        {state !== "recording" ? (
          <button type="button" className="btn btn-outline btn-sm" onClick={start} disabled={state === "uploading"}>
            ● Record
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={stop}>
            ■ Stop ({Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")})
          </button>
        )}
        {state === "ready" && (
          <button type="button" className="btn btn-primary btn-sm" onClick={upload}>
            Save to library
          </button>
        )}
        {state === "uploading" && <span className="small">Uploading and scanning…</span>}
      </div>
      <video ref={preview} controls hidden={state !== "ready"} style={{ maxWidth: "100%" }} aria-label="Recording preview" />
      {message && (
        <p className="small" role="alert">
          {message}
        </p>
      )}
      <p className="tiny muted">Recordings are limited to 5 minutes. Add captions after saving.</p>
    </div>
  );
}
