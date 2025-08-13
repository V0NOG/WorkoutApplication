import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getSavedTheme, setTheme, currentResolvedTheme } from "../theme";

/* icons */
const Sun = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...props}>
    <path d="M12 4V2m0 20v-2M4.93 4.93 3.51 3.51m16.98 16.98-1.42-1.42M4 12H2m20 0h-2M4.93 19.07 3.51 20.49m16.98-16.98-1.42 1.42" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round"/>
    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" fill="none"/>
  </svg>
);
const Moon = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...props}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round"/>
  </svg>
);

export default function ThemeToggle() {
  const [mode, setMode] = useState(() => {
    const saved = getSavedTheme();
    return saved === "system" ? currentResolvedTheme("system") : saved; // "light" | "dark"
  });

  const rootRef = useRef(null);
  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const thumbRef = useRef(null);

  useEffect(() => { setTheme(mode); }, [mode]);

  const layout = () => {
    const root = rootRef.current, thumb = thumbRef.current, left = leftRef.current, right = rightRef.current;
    if (!root || !thumb || !left || !right) return;
    const selected = mode === "dark" ? right : left;
    const rRect = root.getBoundingClientRect();
    const sRect = selected.getBoundingClientRect();
    const PAD = 4; // inner padding
    const width = Math.round(sRect.width);
    const height = Math.round(rRect.height - PAD * 2);
    thumb.style.width = `${Math.max(32, width - PAD * 2)}px`;
    thumb.style.height = `${Math.max(24, height)}px`;
    thumb.style.transform = `translateX(${Math.round(sRect.left - rRect.left + PAD)}px)`;
  };

  useLayoutEffect(() => {
    layout();
    const ro = new ResizeObserver(layout);
    if (rootRef.current) ro.observe(rootRef.current);
    if (leftRef.current) ro.observe(leftRef.current);
    if (rightRef.current) ro.observe(rightRef.current);
    window.addEventListener("resize", layout);
    const relayout = () => layout();
    window.addEventListener("theme:changed", relayout);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", layout);
      window.removeEventListener("theme:changed", relayout);
    };
  }, [mode]);

  const isDark = mode === "dark";

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label="Theme"
      className={[
        "relative inline-flex items-center h-10 rounded-xl border border-input",
        "bg-[var(--card)] text-foreground shadow-xs px-2 select-none"
      ].join(" ")}
    >
      {/* sliding thumb */}
      <span
        ref={thumbRef}
        aria-hidden="true"
        className={[
          "absolute top-1 rounded-lg",
          "bg-secondary border border-input",
          "transition-transform duration-200 will-change-transform"
        ].join(" ")}
        style={{ left: 0 }}
      />

      {/* Light */}
      <button
        ref={leftRef}
        type="button"
        onClick={() => setMode("light")}
        className={[
          "relative z-10 flex items-center gap-1.5 px-3 h-8 text-sm",
          !isDark ? "font-semibold" : "text-muted-foreground hover:text-foreground"
        ].join(" ")}
        aria-pressed={!isDark}
      >
        <Sun /> Light
      </button>

      {/* Dark */}
      <button
        ref={rightRef}
        type="button"
        onClick={() => setMode("dark")}
        className={[
          "relative z-10 flex items-center gap-1.5 px-3 h-8 text-sm",
          isDark ? "font-semibold" : "text-muted-foreground hover:text-foreground"
        ].join(" ")}
        aria-pressed={isDark}
      >
        <Moon /> Dark
      </button>
    </div>
  );
}