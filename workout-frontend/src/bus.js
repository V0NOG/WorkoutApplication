// src/bus.js
// Singleton EventTarget that survives HMR and prevents duplicate module instances.
if (!window.__APP_BUS__) {
  window.__APP_BUS__ = new EventTarget();
}
export const appBus = window.__APP_BUS__;

// Helper to broadcast to other tabs/modules as a fallback
export function pingTemplatesChanged() {
  try {
    localStorage.setItem("templates:changed", Date.now().toString());
  } catch (_) {
    // ignore
  }
  appBus.dispatchEvent(new Event("templates:changed"));
}
