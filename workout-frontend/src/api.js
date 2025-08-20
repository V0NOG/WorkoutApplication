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
export function getToken() { return token; }

function parseJwtExp(t) {
  try {
    const [, payload] = t.split('.');
    const { exp } = JSON.parse(atob(payload));
    return typeof exp === 'number' ? exp * 1000 : 0;
  } catch { return 0; }
}

async function refreshAccessToken() {
  try {
    const res = await fetch(`${API}/auth/refresh`, { method: 'POST', credentials: 'include', cache: 'no-store' });
    if (!res.ok) return false;
    const data = await res.json();
    setToken(data.token);
    return true;
  } catch { return false; }
}

async function maybeRefreshBeforeRequest() {
  if (!token) return;
  const expMs = parseJwtExp(token);
  if (expMs && expMs - Date.now() < 30_000) {
    await refreshAccessToken().catch(() => {});
  }
}

async function safeJson(res) { try { return await res.json(); } catch { return {}; } }

async function req(path, opts = {}, _retried = false) {
  await maybeRefreshBeforeRequest();

  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API}${path}`, {
      ...opts,
      headers,
      credentials: path.startsWith('/auth') ? 'include' : 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new Error('Network error');
  }

  if (res.status === 401 && !_retried) {
    const ok = await refreshAccessToken();
    if (ok) return req(path, opts, true);
  }
  if (res.status === 429 && !_retried) {
    await new Promise(r => setTimeout(r, 500));
    return req(path, opts, true);
  }

  if (!res.ok) {
    const data = await safeJson(res);
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return safeJson(res);
}

const ts = () => `t=${Date.now()}`;

// --- Weight pattern helpers (mirror server normalization) ---
const toNum = (v) => (v === '' || v == null ? null : Number(v));
const toNumArr = (v) => {
  if (Array.isArray(v)) return v.map(Number).filter(n => Number.isFinite(n));
  if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean).map(Number).filter(Number.isFinite);
  return [];
};

function normalizeWeightPattern(kind, wp, legacyWeight) {
  if (kind !== 'gym') return undefined;
  const mode = (wp?.mode && ['fixed','drop','ramp','custom'].includes(wp.mode)) ? wp.mode : 'fixed';
  if (mode === 'custom') return { mode, start: null, end: null, step: null, perSet: toNumArr(wp?.perSet) };
  const start = toNum(wp?.start ?? legacyWeight);
  const end   = toNum(wp?.end   ?? legacyWeight);
  const step  = toNum(wp?.step);
  if (mode === 'fixed') return { mode, start, end: start, step: null, perSet: [] };
  return { mode, start, end, step: step === 0 ? null : step, perSet: [] }; // drop/ramp
}

function normalizeTemplatePayload(input) {
  const kind = input.kind || 'calisthenics';
  const payload = { ...input };

  if (payload.dailyTarget != null) payload.dailyTarget = Number(payload.dailyTarget);
  if (payload.defaultSetSize != null) payload.defaultSetSize = Number(payload.defaultSetSize);

  if (payload.schedule?.daysOfWeek) {
    payload.schedule = {
      ...payload.schedule,
      daysOfWeek: Array.from(new Set(payload.schedule.daysOfWeek.map(Number)))
        .filter(n => n >= 0 && n <= 6)
        .sort()
    };
  }

  if (kind !== 'gym') {
    payload.weight = null;
    delete payload.weightPattern;
  } else {
    const legacy = typeof payload.weight === 'number' ? payload.weight : null;
    payload.weightPattern = normalizeWeightPattern('gym', payload.weightPattern ?? { mode: 'fixed', start: legacy }, legacy);
  }
  return payload;
}

// --- Public API ---
export const api = {
  // register accepts { firstName, lastName, email, password, tz }
  register: (payload) => req('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  updateMe: (patch) => req('/me', { method: 'PATCH', body: JSON.stringify(patch) }),
  login:    (email, password) => req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout:   async () => { try { await req('/auth/logout', { method: 'POST' }); } finally { setToken(''); } },
  me:       () => req('/me'),

  listTemplates:   () => req(`/templates?${ts()}`),
  createTemplate:  (tpl) => req('/templates', { method: 'POST', body: JSON.stringify(normalizeTemplatePayload(tpl)) }),
  updateTemplate:  (id, patch) => {
    const shouldNormalize = ('kind' in patch) || ('weightPattern' in patch) || ('weight' in patch);
    const payload = shouldNormalize ? normalizeTemplatePayload({ ...patch, kind: patch.kind ?? 'gym' }) : patch;
    return req(`/templates/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
  },
  deleteTemplate:  (id) => req(`/templates/${id}`, { method: 'DELETE' }),
  seedTemplates:   () => req('/templates/seed', { method: 'POST' }),

  getPlan:   (date) => req(`/plan${date ? `?date=${date}&` : '?'}${ts()}`),
  addReps:   (dailyId, addReps) => req(`/daily/${dailyId}/progress`, { method: 'PATCH', body: JSON.stringify({ addReps }) }),
  completeSet:(dailyId, size, weightForSet) => req(`/daily/${dailyId}/progress`, { method: 'PATCH', body: JSON.stringify({ completeSet: size, weightForSet }) }),
  undoLast:  (dailyId) => req(`/daily/${dailyId}/progress`, { method: 'PATCH', body: JSON.stringify({ undoLast: true }) }),
  setMeta:   (dailyId, meta) => req(`/daily/${dailyId}/meta`, { method: 'PATCH', body: JSON.stringify(meta) }),

  statsSummary: (from, to) => req(`/stats/summary?from=${from}&to=${to}&${ts()}`),
  weightsSeries:(from, to, templateId) => req(`/stats/weights?from=${from}&to=${to}${templateId ? `&templateId=${templateId}` : ''}&${ts()}`),

  moveDaily: (dailyId, toDate) => req(`/daily/${dailyId}/move`, { method: 'POST', body: JSON.stringify({ toDate }) }),
  moveDay:   (fromDate, toDate) => req(`/daily/move-day`, { method: 'POST', body: JSON.stringify({ fromDate, toDate }) }),

  getMetrics: (date) => req(`/metrics?date=${date}`),
  setMetrics: (date, patch) => req(`/metrics`, { method: 'PATCH', body: JSON.stringify({ date, ...patch }) }),
};

export { API };