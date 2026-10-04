"use client";
import { useEffect, useState } from "react";

/**
 * Display settings: light / dark / system theme and high contrast. Sets the existing
 * [data-theme] and [data-contrast="high"] attributes on <html>. The per-viewer choice is
 * kept in a cookie (read by the root layout so there's no flash) and localStorage; both
 * are optional and wrapped in try/catch so blocked storage never breaks the page.
 */

export const THEME_COOKIE = "sch_theme";
export const CONTRAST_COOKIE = "sch_contrast";
type Theme = "system" | "light" | "dark";
const EVENT = "sch-display-change";

function persist(name: string, value: string) {
  try {
    document.cookie = `${name}=${value}; path=/; max-age=${value ? 31536000 : 0}; samesite=lax`;
  } catch {
    /* cookies blocked: the choice lasts for this page only */
  }
  try {
    if (value) window.localStorage.setItem(name, value);
    else window.localStorage.removeItem(name);
  } catch {
    /* storage blocked */
  }
}

function read(): { theme: Theme; contrast: boolean } {
  const el = document.documentElement;
  const t = el.getAttribute("data-theme");
  return { theme: t === "light" || t === "dark" ? t : "system", contrast: el.getAttribute("data-contrast") === "high" };
}

export function ThemeToggle({ compact = false, idBase }: { compact?: boolean; idBase: string }) {
  const [state, setState] = useState<{ theme: Theme; contrast: boolean }>({ theme: "system", contrast: false });

  useEffect(() => {
    // No cookie yet but a saved choice in localStorage (e.g. cookies cleared): apply it.
    try {
      const el = document.documentElement;
      if (!el.hasAttribute("data-theme")) {
        const t = window.localStorage.getItem(THEME_COOKIE);
        if (t === "light" || t === "dark") el.setAttribute("data-theme", t);
      }
      if (!el.hasAttribute("data-contrast") && window.localStorage.getItem(CONTRAST_COOKIE) === "high") el.setAttribute("data-contrast", "high");
    } catch {
      /* storage blocked */
    }
    setState(read());
    const sync = () => setState(read());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  const setTheme = (theme: Theme) => {
    const el = document.documentElement;
    if (theme === "system") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", theme);
    persist(THEME_COOKIE, theme === "system" ? "" : theme);
    window.dispatchEvent(new Event(EVENT));
  };
  const toggleContrast = () => {
    const el = document.documentElement;
    const on = el.getAttribute("data-contrast") !== "high";
    if (on) el.setAttribute("data-contrast", "high");
    else el.removeAttribute("data-contrast");
    persist(CONTRAST_COOKIE, on ? "high" : "");
    window.dispatchEvent(new Event(EVENT));
  };

  return (
    <div className={`theme-toggle${compact ? " compact" : ""}`} role="group" aria-labelledby={`${idBase}-label`}>
      <span id={`${idBase}-label`} className="theme-label">
        Display
      </span>
      {(["system", "light", "dark"] as Theme[]).map((t) => (
        <button key={t} type="button" className="theme-btn" aria-pressed={state.theme === t} onClick={() => setTheme(t)}>
          {t === "system" ? "Auto" : t === "light" ? "Light" : "Dark"}
          <span className="sr-only"> theme</span>
        </button>
      ))}
      <button type="button" className="theme-btn" aria-pressed={state.contrast} onClick={toggleContrast}>
        High contrast
      </button>
    </div>
  );
}
