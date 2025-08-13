// src/theme.js
const STORAGE_KEY = "app:theme"; // "light" | "dark" | "system"

function emitThemeChanged(value) {
  try {
    window.dispatchEvent(new CustomEvent("theme:changed", { detail: { value } }));
  } catch (_) {}
}

export function getSavedTheme() {
  return localStorage.getItem(STORAGE_KEY) || "system";
}

export function systemPrefersDark() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function currentResolvedTheme(saved = getSavedTheme()) {
  if (saved === "light") return "light";
  if (saved === "dark") return "dark";
  return systemPrefersDark() ? "dark" : "light"; // resolve "system"
}

export function applyTheme(theme) {
  const root = document.documentElement;
  const resolved = currentResolvedTheme(theme);

  // Tailwind dark mode toggle
  if (resolved === "dark") root.classList.add("dark");
  else root.classList.remove("dark");

  // Also expose as attribute in case any CSS targets it
  root.setAttribute("data-theme", resolved);

  emitThemeChanged(resolved);
}

export function setTheme(theme) {
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}

// Initialize once on import
(function init() {
  const saved = getSavedTheme();
  applyTheme(saved);

  // If user saved "system", keep it synced with OS changes
  try {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (getSavedTheme() === "system") applyTheme("system");
    };
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else mq.addListener?.(handler);
  } catch (_) {}
})();