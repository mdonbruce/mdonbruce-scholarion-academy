"use client";

import { useEffect } from "react";

/**
 * Keyboard navigation for an editable grid: arrow keys move between cell inputs, Enter moves
 * down (Shift+Enter up), Escape restores the cell's original value. Works on any table whose
 * inputs carry data-row and data-col.
 */
export default function GridKeys({ gridId }: { gridId: string }) {
  useEffect(() => {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLInputElement;
      if (!el?.dataset?.row) return;
      const r = Number(el.dataset.row);
      const c = Number(el.dataset.col);
      let nr = r;
      let nc = c;
      if (e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey)) nr = r + 1;
      else if (e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey)) nr = r - 1;
      else if (e.key === "ArrowRight" && el.selectionStart === el.value.length) nc = c + 1;
      else if (e.key === "ArrowLeft" && el.selectionStart === 0) nc = c - 1;
      else if (e.key === "Escape") {
        el.value = el.defaultValue;
        return;
      } else return;
      const next = grid.querySelector<HTMLInputElement>(`input[data-row="${nr}"][data-col="${nc}"]`);
      if (next) {
        e.preventDefault();
        next.focus();
        next.select();
      } else if (e.key === "Enter") e.preventDefault();
    };
    grid.addEventListener("keydown", onKey);
    return () => grid.removeEventListener("keydown", onKey);
  }, [gridId]);
  return null;
}
