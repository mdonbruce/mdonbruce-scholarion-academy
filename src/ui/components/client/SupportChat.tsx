"use client";
import { useState } from "react";

/** HavenConnect support widget: AI agent answers from the Help Center, hands off to a person on request. */
export function SupportChat({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<{ who: "me" | "ai"; text: string; links?: { id: string; title: string }[] }[]>([
    { who: "ai", text: "Hi! I'm the Scholarion support assistant. Ask about billing, trials, certificates or your courses. Ask for a person any time." },
  ]);
  const [text, setText] = useState("");
  const [failed, setFailed] = useState(0);
  const [handoff, setHandoff] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send() {
    const message = text.trim();
    if (!message) return;
    setText("");
    setMsgs((m) => [...m, { who: "me", text: message }]);
    setBusy(true);
    try {
      if (handoff) {
        const r = await fetch("/api/v1/cx/tickets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ category: "general", subject: message.slice(0, 60), body: message }) });
        const d = (await r.json()) as { ticketId?: string; error?: { message: string } };
        setMsgs((m) => [...m, { who: "ai", text: d.ticketId ? `Ticket ${d.ticketId} is open. A person will reply by email${signedIn ? " and in your notifications" : ""}.` : d.error?.message ?? "Couldn't open a ticket." }]);
        setHandoff(false);
        return;
      }
      const r = await fetch("/api/v1/cx/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, failedAttempts: failed }) });
      const d = (await r.json()) as { reply: string; articles: { id: string; title: string }[]; handoff: boolean };
      if (!d.articles.length && !d.handoff) setFailed((f) => f + 1);
      setHandoff(d.handoff);
      setMsgs((m) => [...m, { who: "ai", text: d.reply, links: d.articles }]);
    } catch {
      setMsgs((m) => [...m, { who: "ai", text: "Chat is unavailable right now. Use the contact form in the Help Center." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn btn-primary chat-fab no-print" aria-expanded={open} aria-controls="support-chat" onClick={() => setOpen((o) => !o)}>
        {open ? "Close help" : "Need help?"}
      </button>
      {open && (
        <section id="support-chat" className="card chat-panel" aria-label="Support chat">
          <div className="card-pad" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
            <strong>Support</strong> <span className="badge badge-amber">Simulated</span>
            <div className="tiny muted">HavenConnect assistant · human handoff available</div>
          </div>
          <div className="stack" style={{ padding: 14, overflowY: "auto", flex: 1, ["--gap" as string]: "10px" }} aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={`bubble ${m.who}`}>
                {m.text}
                {m.links?.map((l) => (
                  <a key={l.id} className="cite" href={`/help#${l.id}`}>
                    {l.title}
                  </a>
                ))}
              </div>
            ))}
          </div>
          <form
            className="row"
            style={{ padding: 12, borderTop: "1px solid var(--border)", flexWrap: "nowrap" }}
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label htmlFor="support-input" className="sr-only">
              Message
            </label>
            <input id="support-input" type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder={handoff ? "Describe your issue for the team…" : "Type a question…"} />
            <button className="btn btn-primary btn-sm" disabled={busy} type="submit">
              Send
            </button>
          </form>
        </section>
      )}
    </>
  );
}
