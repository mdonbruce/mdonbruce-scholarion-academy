"use client";

import { useEffect, useState } from "react";

/** Shows an instant in the viewer's own time zone (the server renders the ET time; this adds local). */
export default function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState("");
  useEffect(() => {
    try {
      const d = new Date(iso);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz === "America/New_York") return;
      setText(`${d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} your time`);
    } catch {
      setText("");
    }
  }, [iso]);
  return text ? <span className="tiny muted"> · {text}</span> : null;
}
