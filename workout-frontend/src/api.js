// src/api.js
const API =
  import.meta.env.VITE_API_BASE
  || (location.hostname.endsWith('octarep.com') ? 'https://api.octarep.com' : 'http://localhost:5050');


let token = localStorage.getItem('token') || '';
export function setToken(t) {
  token = t;
  if (t) localStorage.setItem('token', t);
  else localStorage.removeItem('token');
}

async function refreshAccessToken() {
  const res = await fetch(`${API}/auth/refresh`, { method: 'POST', credentials: 'include' });
  if (!res.ok) return false;
  const data = await res.json();
  setToken(data.token);
  return true;
}

async function safeJson(res) { try { return await res.json(); } catch { return {}; } }

async function req(path, opts = {}, _retried = false) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers,
    credentials: path.startsWith('/auth') ? 'include' : 'same-origin',
    cache: 'no-store',
  });

  if (res.status === 401 && !_retried) {
    const ok = await refreshAccessToken();
    if (ok) return req(path, opts, true);
  }

  if (!res.ok) {
    const data = await safeJson(res);
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return safeJson(res);
}

const ts = () => `t=${Date.now()}`;

export const api = {
  // CHANGED: register now accepts an object { firstName, lastName, email, password, tz }
  register: (payload) => req('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  updateMe: (patch) => req('/me', { method: 'PATCH', body: JSON.stringify(patch) }),
  login:    (email, password) => req('/auth/login',    { method: 'POST', body: JSON.stringify({ email, password }) }),
  me:       () => req('/me'),
  listTemplates: () => req(`/templates?${ts()}`),
  createTemplate: (tpl) => req('/templates', { method: 'POST', body: JSON.stringify(tpl) }),
  updateTemplate: (id, patch) => req(`/templates/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteTemplate: (id) => req(`/templates/${id}`, { method: 'DELETE' }),
  getPlan: (date) => req(`/plan${date ? `?date=${date}&` : '?'}${ts()}`),
  addReps: (dailyId, addReps) => req(`/daily/${dailyId}/progress`, { method: 'PATCH', body: JSON.stringify({ addReps }) }),
  completeSet: (dailyId, size) => req(`/daily/${dailyId}/progress`, { method: 'PATCH', body: JSON.stringify({ completeSet: size }) }),
  undoLast: (dailyId) => req(`/daily/${dailyId}/progress`, { method: 'PATCH', body: JSON.stringify({ undoLast: true }) }),
  setMeta: (dailyId, meta) => req(`/daily/${dailyId}/meta`, { method: 'PATCH', body: JSON.stringify(meta) }),
  statsSummary: (from, to) => req(`/stats/summary?from=${from}&to=${to}&${ts()}`),
  requestPasswordReset: (email) => req('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token, password) => req('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
  weightsSeries: (from, to, templateId) => req(`/stats/weights?from=${from}&to=${to}${templateId ? `&templateId=${templateId}` : ''}`),
  moveDaily: (dailyId, toDate) => req(`/daily/${dailyId}/move`, { method: 'POST', body: JSON.stringify({ toDate }) }),
  moveDay: (fromDate, toDate) => req(`/daily/move-day`, { method: 'POST', body: JSON.stringify({ fromDate, toDate }) }),
};