"use client";
import { useEffect, useId, useRef, useState } from "react";

/** Global search with instant suggestions (Spec §4). Works without JS as a plain GET form. */
export function SearchBox({ placeholder, defaultValue = "" }: { placeholder: string; defaultValue?: string }) {
  const [q, setQ] = useState(defaultValue);
  const [items, setItems] = useState<{ title: string; slug: string; type: string }[]>([]);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/v1/catalog/suggest?q=${encodeURIComponent(q)}`);
        const d = (await r.json()) as { suggestions: typeof items };
        setItems(d.suggestions);
        setActive(-1);
      } catch {
        setItems([]);
      }
    }, 150);
  }, [q]);

  return (
    <form action="/explore" method="get" role="search" style={{ position: "relative" }}>
      <label htmlFor={`${listId}-q`} className="sr-only">
        Search the catalog
      </label>
      <input
        id={`${listId}-q`}
        type="search"
        name="q"
        value={q}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={items.length > 0}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(items.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(-1, a - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            window.location.href = `/learn/${items[active].slug}`;
          } else if (e.key === "Escape") setItems([]);
        }}
      />
      {items.length > 0 && (
        <ul id={listId} role="listbox" className="card" style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50, listStyle: "none", margin: 0, padding: 6 }}>
          {items.map((s, i) => (
            <li key={s.slug} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <a href={`/learn/${s.slug}`} style={{ display: "block", padding: "8px 10px", borderRadius: 6, textDecoration: "none", color: "var(--text)", background: i === active ? "var(--surface-2)" : undefined }}>
                {s.title} <span className="tiny muted">· {s.type.replace(/_/g, " ")}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
