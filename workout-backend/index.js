import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dayjs from 'dayjs';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import webpush from 'web-push';

const app = express();
app.use(helmet());
app.use(rateLimit({ windowMs: 60_000, max: 120 }));
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

// --- MongoDB ---
async function connectMongo() {
  try {
    if (!process.env.MONGODB_URI) {
      console.error('Missing MONGODB_URI in .env');
      process.exit(1);
    }
    const masked = process.env.MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:<redacted>@');
    console.log('Connecting to MongoDB:', masked);
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
}
await connectMongo();

// --- Web Push ---
if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
  console.warn('⚠️ Missing VAPID keys — push notifications will be disabled.');
} else {
  webpush.setVapidDetails(
    process.env.WEB_PUSH_CONTACT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}


// --- Models ---
const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  passwordHash: String,
  firstName: { type: String, default: '' },
  lastName:  { type: String, default: '' },
  tz: { type: String, default: 'Australia/Sydney' },
  refreshHashes: [String],
  reset: {
    tokenHash: String,
    expiresAt: Date
  },
  prefs: {
    type: {
      notifications: {
        workout: {
          enabled: { type: Boolean, default: false },
          scheduleMode: { type: String, enum: ['times','interval'], default: 'times' },
          times: { type: [String], default: ['18:00'] },  // "HH:mm" local to user tz
          intervalMinutes: { type: Number, default: 180 },
          windowStart: { type: String, default: '08:00' },
          windowEnd: { type: String, default: '21:00' }
        },
        water: {
          enabled: { type: Boolean, default: false },
          showCard: { type: Boolean, default: false },
          dailyGoalMl: { type: Number, default: 2000 },
          scheduleMode: { type: String, enum: ['times','interval'], default: 'interval' },
          times: { type: [String], default: [] },
          intervalMinutes: { type: Number, default: 120 },
          windowStart: { type: String, default: '08:00' },
          windowEnd: { type: String, default: '21:00' }
        }
      }
    },
    default: {}
  },
  pushSubs: { type: [mongoose.Schema.Types.Mixed], default: [] }
}, { timestamps: true });

const TaskTemplateSchema = new mongoose.Schema({
  userId: { type: mongoose.Types.ObjectId, ref: 'User' },
  name: String,
  unit: { type: String, default: 'reps' },          // reps | minutes | distance
  dailyTarget: Number,
  defaultSetSize: Number,

  // Legacy fixed weight (kept for compatibility when weightPattern.mode === "fixed")
  weight: { type: Number, default: null },

  // Per-set weight pattern
  weightPattern: {
    mode: { type: String, enum: ['fixed','drop','ramp','custom'], default: 'fixed' },
    start: { type: Number, default: null },   // for drop/ramp (or fixed)
    end:   { type: Number, default: null },   // for drop/ramp
    step:  { type: Number, default: null },   // optional step kg per set (otherwise interpolate)
    perSet: { type: [Number], default: [] }   // for custom, array of weights per set index
  },

  schedule: {
    type: { type: String, default: 'weekly' },
    daysOfWeek: [Number],                           // 0..6 (Sun..Sat)
    startDate: String,
    endDate: { type: String, default: null }
  },
  active: { type: Boolean, default: true },

  // classification & grouping
  kind: { type: String, enum: ['calisthenics', 'gym'], default: 'calisthenics' },
  group: { type: String, default: '' },

  progression: {
    weeklyPct: { type: Number, default: 0 },
    cap: { type: Number, default: null },
  },
  deloadRule: {
    everyNWeeks: { type: Number, default: 0 },
    scale: { type: Number, default: 0.7 }
  },
  sessionMode: { type: String, enum: ['manual', 'automatic'], default: 'manual' },
  sessionBlocks: {
    type: [{
      type: { type: String, enum: ['exercise', 'rest', 'warmup', 'cooldown'], default: 'exercise' },
      name: { type: String, default: '' },
      durationSec: { type: Number, default: 45 },
      targetReps: { type: Number, default: null },
      order: { type: Number, default: 0 }
    }],
    default: []
  },
  autoSessionSettings: {
    workoutDurationMin: { type: Number, default: 20 },
    fitnessLevel: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' },
    restStyle: { type: String, enum: ['short', 'standard', 'long'], default: 'standard' },
    includeWarmup: { type: Boolean, default: true },
    includeCooldown: { type: Boolean, default: true }
  }
}, { timestamps: true });

const DailyInstanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Types.ObjectId, ref: 'User' },
  templateId: { type: mongoose.Types.ObjectId, ref: 'TaskTemplate' },
  date: String,                       // 'YYYY-MM-DD'
  target: Number,                     // target in reps (gym) or unit
  setsPlanned: [Number],              // reps per set (gym) OR chunked reps (cali)
  setsDone: [Number],                 // reps added per action/set

  // Weights
  weightsPlanned: [Number],           // planned kg per set (Gym only)
  weightsDone: [Number],              // actual kg per completed set, aligned to setsDone

  repsDone: { type: Number, default: 0 },
  status: { type: String, default: 'on-track' }, // on-track|ahead|behind|done
  notes: String,
  rpe: Number,
  weight: { type: Number, default: null },       // legacy “day weight” still supported
  group: { type: String, default: '' }           // snapshot of template.group
}, { timestamps: true });

DailyInstanceSchema.index({ userId: 1, templateId: 1, date: 1 }, { unique: true });

const DailyMetricSchema = new mongoose.Schema({
  userId: { type: mongoose.Types.ObjectId, ref: 'User' },
  date: { type: String },              // 'YYYY-MM-DD'
  weightKg: { type: Number, default: null },
  heightCm: { type: Number, default: null },
  waterMl: { type: Number, default: 0 },
  waterGoalMl: { type: Number, default: null },
}, { timestamps: true });
DailyMetricSchema.index({ userId: 1, date: 1 }, { unique: true });

const DailyMetric = mongoose.model('DailyMetric', DailyMetricSchema);
const User = mongoose.model('User', UserSchema);
const TaskTemplate = mongoose.model('TaskTemplate', TaskTemplateSchema);
const DailyInstance = mongoose.model('DailyInstance', DailyInstanceSchema);

const ACCESS_TTL = '15m';
const REFRESH_TTL_DAYS = 7;

const NotifyStateSchema = new mongoose.Schema({
  userId: { type: mongoose.Types.ObjectId, ref: 'User' },
  kind: { type: String, enum: ['workout','water'] },
  date: { type: String },            // 'YYYY-MM-DD' in user's tz
  sentKeys: { type: [String], default: [] } // e.g. ['18:00', '12:00', 'int:13:00']
}, { timestamps: true });
NotifyStateSchema.index({ userId:1, kind:1, date:1 }, { unique: true });
const NotifyState = mongoose.model('NotifyState', NotifyStateSchema);

const WorkoutSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Types.ObjectId, ref: 'User', required: true },
  dailyInstanceId: { type: mongoose.Types.ObjectId, ref: 'DailyInstance', default: null },
  dailyInstanceIds: { type: [mongoose.Types.ObjectId], ref: 'DailyInstance', default: [] },
  templateId: { type: mongoose.Types.ObjectId, ref: 'TaskTemplate', default: null },
  sessionType: { type: String, enum: ['single', 'daily'], default: 'single' },
  totalRounds: { type: Number, default: 1 },
  workoutMode: { type: String, enum: ['circuit', 'sequential'], default: 'sequential' },
  sessionSettings: { type: mongoose.Schema.Types.Mixed, default: {} },
  date: { type: String, required: true },
  startedAt: Date,
  endedAt: Date,
  durationSec: { type: Number, default: 0 },
  blocksCompleted: { type: Number, default: 0 },
  totalBlocks: { type: Number, default: 0 },
  caloriesEstimated: { type: Number, default: null },
  bodyWeightKg: { type: Number, default: null },
  calorieNote: { type: String, default: '' },
  perceivedEffort: { type: Number, default: null },
  status: { type: String, enum: ['completed', 'cancelled'], default: 'completed' },
  blockResults: {
    type: [{
      type: { type: String, enum: ['exercise', 'rest', 'warmup', 'cooldown'], default: 'exercise' },
      name: { type: String, default: '' },
      workoutName: { type: String, default: '' },
      dailyInstanceId: { type: mongoose.Types.ObjectId, ref: 'DailyInstance', default: null },
      templateId: { type: mongoose.Types.ObjectId, ref: 'TaskTemplate', default: null },
      round: { type: Number, default: null },
      setNumber: { type: Number, default: null },
      totalSets: { type: Number, default: null },
      plannedDurationSec: { type: Number, default: 0 },
      actualDurationSec: { type: Number, default: 0 },
      targetReps: { type: Number, default: null },
      completedReps: { type: Number, default: null },
      plannedWeight: { type: Number, default: null },
      completedWeight: { type: Number, default: null },
      skipped: { type: Boolean, default: false },
      workoutKind: { type: String, default: '' },
      order: { type: Number, default: 0 }
    }],
    default: []
  }
}, { timestamps: true });
WorkoutSessionSchema.index({ userId: 1, date: 1 });
const WorkoutSession = mongoose.model('WorkoutSession', WorkoutSessionSchema);

// --- Auth middleware ---
function auth(req, res, next) {
  const hdr = req.headers.authorization;
  if (!hdr?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const token = hdr.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.uid;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// --- Helpers ---
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validObjectId(id) {
  return mongoose.Types.ObjectId.isValid(String(id || ''));
}

function rejectBadObjectId(res, id, label = 'id') {
  if (validObjectId(id)) return false;
  res.status(400).json({ error: `Invalid ${label}` });
  return true;
}

function finiteNumber(value, { min = null, max = null, allowNull = false } = {}) {
  if ((value === null || value === '') && allowNull) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  if (min !== null && n < min) return undefined;
  if (max !== null && n > max) return undefined;
  return n;
}

function cleanDate(value, fallback = dayjs().format('YYYY-MM-DD')) {
  const d = dayjs(value || fallback);
  return d.isValid() ? d.format('YYYY-MM-DD') : fallback;
}

function normalizeSessionBlocks(input = []) {
  if (!Array.isArray(input)) return [];
  const allowed = new Set(['exercise', 'rest', 'warmup', 'cooldown']);
  return input.map((b, idx) => {
    const type = allowed.has(b?.type) ? b.type : 'exercise';
    const durationSec = finiteNumber(b?.durationSec, { min: 1, max: 60 * 60 }) ?? 45;
    const targetReps = finiteNumber(b?.targetReps, { min: 0, max: 10000, allowNull: true });
    return {
      type,
      name: String(b?.name || type).trim().slice(0, 120),
      durationSec: Math.round(durationSec),
      targetReps: targetReps == null ? null : Math.round(targetReps),
      order: Math.round(finiteNumber(b?.order, { min: 0, max: 1000 }) ?? idx)
    };
  }).sort((a, b) => a.order - b.order).map((b, idx) => ({ ...b, order: idx }));
}

function normalizeSessionResultBlocks(input = []) {
  if (!Array.isArray(input)) return [];
  const allowed = new Set(['exercise', 'rest', 'warmup', 'cooldown']);
  return input.map((b, idx) => {
    const type = allowed.has(b?.type) ? b.type : 'exercise';
    const plannedDurationSec = finiteNumber(b?.plannedDurationSec ?? b?.durationSec, { min: 0, max: 60 * 60 }) ?? 0;
    const actualDurationSec = finiteNumber(b?.actualDurationSec, { min: 0, max: 60 * 60 }) ?? plannedDurationSec;
    const targetReps = finiteNumber(b?.targetReps, { min: 0, max: 10000, allowNull: true });
    const completedReps = finiteNumber(b?.completedReps, { min: 0, max: 10000, allowNull: true });
    const plannedWeight = finiteNumber(b?.plannedWeight, { min: 0, max: 1000, allowNull: true });
    const completedWeight = finiteNumber(b?.completedWeight, { min: 0, max: 1000, allowNull: true });
    const dailyInstanceId = validObjectId(b?.dailyInstanceId) ? String(b.dailyInstanceId) : null;
    const templateId = validObjectId(b?.templateId) ? String(b.templateId) : null;
    const round = finiteNumber(b?.round, { min: 0, max: 1000, allowNull: true });
    const setNumber = finiteNumber(b?.setNumber, { min: 0, max: 1000, allowNull: true });
    const totalSets = finiteNumber(b?.totalSets, { min: 0, max: 1000, allowNull: true });
    return {
      type,
      name: String(b?.name || type).trim().slice(0, 120),
      workoutName: String(b?.workoutName || b?.name || '').trim().slice(0, 120),
      dailyInstanceId,
      templateId,
      round: round == null ? null : Math.round(round),
      setNumber: setNumber == null ? null : Math.round(setNumber),
      totalSets: totalSets == null ? null : Math.round(totalSets),
      plannedDurationSec: Math.round(plannedDurationSec),
      actualDurationSec: Math.round(actualDurationSec),
      targetReps: targetReps == null ? null : Math.round(targetReps),
      completedReps: completedReps == null ? null : Math.round(completedReps),
      plannedWeight: plannedWeight == null ? null : Number(plannedWeight),
      completedWeight: completedWeight == null ? null : Number(completedWeight),
      skipped: !!b?.skipped,
      workoutKind: String(b?.workoutKind || '').trim().slice(0, 40),
      order: Math.round(finiteNumber(b?.order, { min: 0, max: 1000 }) ?? idx)
    };
  }).sort((a, b) => a.order - b.order).map((b, idx) => ({ ...b, order: idx }));
}

function normalizeAutoSessionSettings(input = {}) {
  const fitnessLevels = ['beginner', 'intermediate', 'advanced'];
  const restStyles = ['short', 'standard', 'long'];
  return {
    workoutDurationMin: Math.round(finiteNumber(input.workoutDurationMin, { min: 5, max: 180 }) ?? 20),
    fitnessLevel: fitnessLevels.includes(input.fitnessLevel) ? input.fitnessLevel : 'beginner',
    restStyle: restStyles.includes(input.restStyle) ? input.restStyle : 'standard',
    includeWarmup: typeof input.includeWarmup === 'boolean' ? input.includeWarmup : true,
    includeCooldown: typeof input.includeCooldown === 'boolean' ? input.includeCooldown : true
  };
}

function validateTemplateNumbers({ dailyTarget, defaultSetSize, weight, weightPattern, progression, deloadRule }) {
  if (finiteNumber(dailyTarget, { min: 1, max: 10000 }) === undefined) return 'dailyTarget must be a positive number';
  if (finiteNumber(defaultSetSize ?? dailyTarget, { min: 1, max: 10000 }) === undefined) return 'defaultSetSize must be a positive number';
  if (weight !== null && typeof weight !== 'undefined' && finiteNumber(weight, { min: 0, max: 1000, allowNull: true }) === undefined) return 'weight must be a valid number';
  if (weightPattern) {
    for (const key of ['start', 'end', 'step']) {
      if (weightPattern[key] !== null && typeof weightPattern[key] !== 'undefined' && finiteNumber(weightPattern[key], { min: 0, max: 1000, allowNull: true }) === undefined) {
        return `weightPattern.${key} must be a valid number`;
      }
    }
  }
  if (progression?.weeklyPct !== undefined && finiteNumber(progression.weeklyPct, { min: 0, max: 1000 }) === undefined) return 'progression.weeklyPct must be a valid number';
  if (progression?.cap !== null && progression?.cap !== undefined && finiteNumber(progression.cap, { min: 1, max: 100000, allowNull: true }) === undefined) return 'progression.cap must be a valid number';
  if (deloadRule?.everyNWeeks !== undefined && finiteNumber(deloadRule.everyNWeeks, { min: 0, max: 520 }) === undefined) return 'deloadRule.everyNWeeks must be a valid number';
  if (deloadRule?.scale !== undefined && finiteNumber(deloadRule.scale, { min: 0.1, max: 1 }) === undefined) return 'deloadRule.scale must be between 0.1 and 1';
  return '';
}

function isActiveOnDate(tpl, date) {
  const d = dayjs(date);
  const day = d.day(); // 0..6
  if (tpl.schedule?.startDate && d.isBefore(dayjs(tpl.schedule.startDate))) return false;
  if (tpl.schedule?.endDate && d.isAfter(dayjs(tpl.schedule.endDate))) return false;
  if (tpl.schedule?.type === 'weekly') {
    return tpl.schedule.daysOfWeek?.includes(day);
  }
  return false;
}

function planSets(target, setSize) {
  const sets = [];
  let remain = target;
  while (remain > 0) {
    const size = Math.min(setSize, remain);
    sets.push(size);
    remain -= size;
  }
  return sets;
}

// Build planned weights per set for a template and set count
function buildWeightsForSets(tpl, setsCount) {
  if (tpl.kind !== 'gym' || setsCount <= 0) return [];
  const mode = tpl.weightPattern?.mode || 'fixed';

  // Back-compat: if legacy tpl.weight exists and no pattern, treat as fixed.
  if (mode === 'fixed') {
    const w = (tpl.weightPattern?.start ?? tpl.weight ?? null);
    if (w == null) return [];
    return Array.from({ length: setsCount }, () => Number(w));
  }

  if (mode === 'custom') {
    const arr = Array.isArray(tpl.weightPattern?.perSet) ? tpl.weightPattern.perSet : [];
    if (!arr.length) return [];
    // Pad/trim to setsCount
    const out = arr.slice(0, setsCount).map(n => Number(n));
    while (out.length < setsCount) out.push(out[out.length - 1] ?? 0);
    return out;
  }

  // drop (high→low) or ramp (low→high)
  const start = Number(tpl.weightPattern?.start ?? tpl.weight ?? NaN);
  const end   = Number(tpl.weightPattern?.end   ?? tpl.weight ?? NaN);
  const step  = (Number.isFinite(tpl.weightPattern?.step) ? Number(tpl.weightPattern.step) : null);

  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];

  const out = [];
  if (step && step !== 0) {
    // Step-based sequence towards end, constrained to setsCount
    let cur = start;
    for (let i = 0; i < setsCount; i++) {
      out.push(cur);
      if ((mode === 'drop' && cur > end) || (mode === 'ramp' && cur < end)) {
        cur = (mode === 'drop') ? Math.max(end, cur - Math.abs(step))
                                : Math.min(end, cur + Math.abs(step));
      }
    }
  } else {
    // Linear interpolation inclusive start→end across sets
    const n = Math.max(1, setsCount - 1);
    for (let i = 0; i < setsCount; i++) {
      const t = i / n;
      out.push(start + (end - start) * t);
    }
  }
  return out.map(Number);
}

function computeStatus(repsDone, target) {
  if (repsDone === 0) return 'on-track';
  if (repsDone < target) return 'on-track';
  if (repsDone === target) return 'done';
  return 'ahead';
}

function metForBlock(block, templateKind = 'calisthenics') {
  if (block.type === 'warmup' || block.type === 'cooldown') return 2.5;
  if (block.type === 'rest') return 1.2;
  const name = String(`${block.name || ''} ${block.workoutName || ''}`).toLowerCase();
  if (name.includes('hiit') || name.includes('circuit')) return 8.0;
  const kind = block.workoutKind || templateKind;
  if (kind === 'gym') return 6.0;
  return templateKind === 'circuit' ? 7.0 : 5.5;
}

async function bodyWeightForDate(userId, date) {
  const exact = await DailyMetric.findOne({ userId, date, weightKg: { $ne: null } }).sort({ updatedAt: -1 }).lean();
  if (exact?.weightKg) return { weightKg: Number(exact.weightKg), note: '' };
  const latest = await DailyMetric.findOne({ userId, date: { $lte: date }, weightKg: { $ne: null } }).sort({ date: -1 }).lean();
  if (latest?.weightKg) return { weightKg: Number(latest.weightKg), note: `Used latest known body weight from ${latest.date}.` };
  return { weightKg: null, note: 'Add body weight in Today metrics to estimate calories.' };
}

function estimateCalories({ blocks, durationSec, bodyWeightKg, templateKind }) {
  if (!bodyWeightKg || bodyWeightKg <= 0 || !durationSec || durationSec <= 0) return null;
  const rows = Array.isArray(blocks) && blocks.length ? blocks : [{ type: 'exercise', actualDurationSec: durationSec, name: '' }];
  const total = rows.reduce((sum, b) => {
    const secs = Number(b.actualDurationSec ?? b.plannedDurationSec ?? 0) || 0;
    const hours = secs / 3600;
    return sum + metForBlock(b, templateKind) * bodyWeightKg * hours;
  }, 0);
  return Math.max(0, Math.round(total));
}

function weeksSince(startDate, date) {
  const start = dayjs(startDate).startOf('day');
  const d = dayjs(date).startOf('day');
  if (!start.isValid() || !d.isValid()) return 0;
  const diffDays = d.diff(start, 'day');
  return Math.max(0, Math.floor(diffDays / 7));
}

function computeTargetWithRules(tpl, date) {
  let target = tpl.dailyTarget;
  const w = weeksSince(tpl.schedule?.startDate || date, date);
  if (tpl.progression?.weeklyPct && tpl.progression.weeklyPct !== 0) {
    const inc = Math.floor(target * (tpl.progression.weeklyPct / 100) * w);
    target = target + inc;
  }
  if (tpl.progression?.cap && tpl.progression.cap > 0) {
    target = Math.min(target, tpl.progression.cap);
  }
  if (tpl.deloadRule?.everyNWeeks > 0) {
    const weekNumber = w + 1;
    if (weekNumber % tpl.deloadRule.everyNWeeks === 0) {
      const scale = tpl.deloadRule.scale || 0.7;
      target = Math.floor(target * scale);
    }
  }
  target = Math.max(1, Math.round(target));
  return target;
}

function signAccess(uid) { return jwt.sign({ uid }, process.env.JWT_SECRET, { expiresIn: ACCESS_TTL }); }
function makeRefresh() { return crypto.randomBytes(48).toString('base64url'); }
function sha256(x) { return crypto.createHash('sha256').update(x).digest('hex'); }
function setRefreshCookie(res, token) {
  res.cookie('refreshToken', token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000, path: '/auth'
  });
}
function arraysEqual(a = [], b = []) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// --- Weight pattern normalization (for create & update) ---
function normalizeWeightPattern(kind, wpInput, legacyWeight) {
  if (kind !== 'gym') return undefined;

  const safeMode = (m) => (['fixed','drop','ramp','custom'].includes(m) ? m : 'fixed');
  const toNum = (v) => (v === '' || v == null ? null : Number(v));
  const toArrNum = (v) => {
    if (Array.isArray(v)) return v.map(Number).filter(n => Number.isFinite(n));
    if (typeof v === 'string') {
      return v.split(',').map(s => s.trim()).filter(Boolean).map(Number).filter(n => Number.isFinite(n));
    }
    return [];
  };

  const mode = safeMode(wpInput?.mode || 'fixed');

  if (mode === 'custom') {
    return { mode, start: null, end: null, step: null, perSet: toArrNum(wpInput?.perSet) };
  }

  const start = toNum(wpInput?.start ?? legacyWeight);
  const end   = toNum(wpInput?.end   ?? legacyWeight);
  const step  = toNum(wpInput?.step);

  if (mode === 'fixed') {
    const s = start;
    return { mode, start: s, end: s, step: null, perSet: [] };
  }
  // drop / ramp
  return { mode, start, end, step: (step === 0 ? null : step), perSet: [] };
}

// Materialize/repair the plan for a date
async function materializeForDate(userId, date) {
  const templates = await TaskTemplate.find({ userId, active: true }).lean();
  const tplById = new Map(templates.map(t => [t._id.toString(), t]));
  const existing = await DailyInstance.find({ userId, date }).lean();

  const toRemoveIds = [];
  for (const di of existing) {
    const tpl = tplById.get(di.templateId.toString());
    if (!tpl) toRemoveIds.push(di._id);
  }
  if (toRemoveIds.length) await DailyInstance.deleteMany({ _id: { $in: toRemoveIds } });

  const remain = await DailyInstance.find({ userId, date }).lean();
  const seen = new Set();
  const dupDelete = [];
  for (const di of remain) {
    const key = di.templateId.toString();
    if (seen.has(key)) dupDelete.push(di._id);
    else seen.add(key);
  }
  if (dupDelete.length) await DailyInstance.deleteMany({ _id: { $in: dupDelete } });

  const cleaned = await DailyInstance.find({ userId, date }).lean();
  for (const di of cleaned) {
    const tpl = tplById.get(di.templateId.toString());
    if (!tpl) continue;

    const base = computeTargetWithRules(tpl, date);
    let newTarget, newSets, newWeights;
    if (tpl.kind === 'gym') {
      const repsPerSet = Math.max(1, Number(tpl.defaultSetSize) || 1);
      const setsCount  = Math.max(1, Math.round(base));       // base = #sets (after prog/deload)
      newTarget        = setsCount * repsPerSet;              // target in REPS for Gym
      newSets          = Array.from({ length: setsCount }, () => repsPerSet);
      newWeights       = buildWeightsForSets(tpl, setsCount);
    } else {
      newTarget = Math.max(1, Math.round(base));               // calisthenics/etc: base is reps/mins/etc
      const setSize = Math.max(1, Number(tpl.defaultSetSize) || newTarget);
      newSets   = planSets(newTarget, setSize);
      newWeights = [];
    }
    const newGroup = tpl.group || '';

    const needsUpdate =
      di.target !== newTarget ||
      !arraysEqual(di.setsPlanned, newSets) ||
      !arraysEqual(di.weightsPlanned || [], newWeights || []) ||
      (di.group || '') !== newGroup;

    if (needsUpdate) {
      await DailyInstance.updateOne(
        { _id: di._id },
        { $set: {
            target: newTarget,
            setsPlanned: newSets,
            weightsPlanned: newWeights || [],
            group: newGroup,
            status: computeStatus(di.repsDone || 0, newTarget)
        } }
      );
    }
  }

  const ops = [];
  for (const tpl of templates) {
    if (!isActiveOnDate(tpl, date)) continue;

    const base = computeTargetWithRules(tpl, date);
    let newTarget, newSets, newWeights;
    if (tpl.kind === 'gym') {
      const repsPerSet = Math.max(1, Number(tpl.defaultSetSize) || 1);
      const setsCount  = Math.max(1, Math.round(base));       // base = #sets (after prog/deload)
      newTarget  = setsCount * repsPerSet;                    // target in REPS for Gym
      newSets    = Array.from({ length: setsCount }, () => repsPerSet); // exact #sets × reps
      newWeights = buildWeightsForSets(tpl, setsCount);
    } else {
      newTarget = Math.max(1, Math.round(base));               // calisthenics/etc: base is reps/mins/etc
      const setSize = Math.max(1, Number(tpl.defaultSetSize) || newTarget);
      newSets   = planSets(newTarget, setSize);
      newWeights = [];
    }
    const newGroup = tpl.group || '';

    ops.push({
      updateOne: {
        filter: { userId, templateId: tpl._id, date },
        update: {
          $setOnInsert: {
            userId, templateId: tpl._id, date,
            target: newTarget, setsPlanned: newSets, setsDone: [], repsDone: 0,
            weightsPlanned: newWeights || [],
            status: 'on-track', group: tpl.group || ''
          }
        },
        upsert: true, timestamps: false
      }
    });
  }
  if (ops.length) {
    try { await DailyInstance.bulkWrite(ops, { ordered: false }); }
    catch (err) { if (err?.code !== 11000) throw err; }
  }
}

async function moveOneDailyInstance(di, destDate, userId) {
  const tpl = await TaskTemplate.findOne({ _id: di.templateId, userId });
  if (!tpl) return { status: 'skipped', reason: 'template-missing', id: di._id.toString() };

  const base = computeTargetWithRules(tpl, destDate);
  let newTarget, newSetsPlanned, newWeightsPlanned;
  if (tpl.kind === 'gym') {
    const repsPerSet = Math.max(1, Number(tpl.defaultSetSize) || 1);
    const setsCount  = Math.max(1, Math.round(base));
    newTarget        = setsCount * repsPerSet;                      // reps target
    newSetsPlanned   = Array.from({ length: setsCount }, () => repsPerSet);
    newWeightsPlanned = buildWeightsForSets(tpl, setsCount);
  } else {
    newTarget        = Math.max(1, Math.round(base));
    const setSize    = Math.max(1, Number(tpl.defaultSetSize) || newTarget);
    newSetsPlanned   = planSets(newTarget, setSize);
    newWeightsPlanned = [];
  }
  const newGroup = tpl.group || '';

  const existingDest = await DailyInstance.findOne({ userId, templateId: di.templateId, date: destDate });

  if (existingDest) {
    const mergedSetsDone = [...(existingDest.setsDone || []), ...(di.setsDone || [])];
    const mergedRepsDone = (existingDest.repsDone || 0) + (di.repsDone || 0);
    const mergedNotes = [existingDest.notes, di.notes].filter(Boolean).join('\n');
    const mergedRpe = di.rpe ?? existingDest.rpe ?? null;
    const mergedWeight = di.weight ?? existingDest.weight ?? null;
    const mergedWeightsDone = [
      ...((existingDest.weightsDone || []).map(x => (Number.isFinite(Number(x)) ? Number(x) : null))),
      ...((di.weightsDone || []).map(x => (Number.isFinite(Number(x)) ? Number(x) : null)))
    ];

    await DailyInstance.updateOne(
      { _id: existingDest._id },
      {
        $set: {
          date: destDate,
          target: newTarget,
          setsPlanned: newSetsPlanned,
          weightsPlanned: newWeightsPlanned || [],
          group: newGroup,
          setsDone: mergedSetsDone,
          repsDone: mergedRepsDone,
          notes: mergedNotes,
          rpe: mergedRpe,
          weight: mergedWeight,
          weightsDone: mergedWeightsDone,
          status: computeStatus(mergedRepsDone, newTarget)
        }
      }
    );
    await DailyInstance.deleteOne({ _id: di._id });
    return { status: 'merged', from: di._id.toString(), into: existingDest._id.toString() };
  }

  await DailyInstance.updateOne(
    { userId, templateId: di.templateId, date: destDate },
    {
      $setOnInsert: {
        userId, templateId: di.templateId, date: destDate,
        target: newTarget, setsPlanned: newSetsPlanned, weightsPlanned: newWeightsPlanned || [],
        setsDone: di.setsDone || [], repsDone: di.repsDone || 0,
        weightsDone: di.weightsDone || [],
        status: computeStatus(di.repsDone || 0, newTarget),
        group: newGroup, notes: di.notes || '', rpe: di.rpe ?? null, weight: di.weight ?? null
      }
    },
    { upsert: true }
  );
  await DailyInstance.deleteOne({ _id: di._id });
  return { status: 'moved', to: destDate, id: di._id.toString() };
}

// --- Routes: Auth ---
app.post('/auth/register', async (req, res) => {
  const { password, tz, firstName = '', lastName = '' } = req.body;
  const email = normalizeEmail(req.body?.email);
  if (!email || !password) return res.status(400).json({ error: 'Email & password required' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const exists = await User.findOne({ email });
  if (exists) return res.status(400).json({ error: 'Email already registered' });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    email,
    passwordHash,
    firstName: String(firstName || '').trim(),
    lastName: String(lastName || '').trim(),
    tz: tz || 'Australia/Sydney'
  });

  const access = signAccess(user._id.toString());
  const refresh = makeRefresh();
  const hash = sha256(refresh);
  await User.updateOne({ _id: user._id }, { $addToSet: { refreshHashes: hash } });
  setRefreshCookie(res, refresh);
  res.json({ token: access, user: { id: user._id, email: user.email, tz: user.tz, firstName: user.firstName, lastName: user.lastName } });
});

app.post('/auth/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const { password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(400).json({ error: 'Invalid credentials' });

  const access = signAccess(user._id.toString());
  const refresh = makeRefresh();
  const hash = sha256(refresh);
  await User.updateOne({ _id: user._id }, { $addToSet: { refreshHashes: hash } });
  setRefreshCookie(res, refresh);
  res.json({ token: access, user: { id: user._id, email: user.email, tz: user.tz, firstName: user.firstName, lastName: user.lastName } });
});

app.get('/me', auth, async (req, res) => {
  if (rejectBadObjectId(res, req.userId, 'user id')) return;
  const u = await User.findById(req.userId).lean();
  if (!u) return res.status(404).json({ error: 'Not found' });
  res.json({ id: u._id, email: u.email, tz: u.tz, firstName: u.firstName || '', lastName: u.lastName || '' });
});

app.patch('/me', auth, async (req, res) => {
  if (rejectBadObjectId(res, req.userId, 'user id')) return;
  const { firstName, lastName, tz } = req.body || {};
  const set = {};
  if (typeof firstName === 'string') set.firstName = firstName.trim();
  if (typeof lastName === 'string')  set.lastName  = lastName.trim();
  if (typeof tz === 'string' && tz)  set.tz        = tz.trim();

  const u = await User.findOneAndUpdate(
    { _id: req.userId },
    { $set: set },
    { new: true }
  ).lean();

  if (!u) return res.status(404).json({ error: 'Not found' });
  res.json({ id: u._id, email: u.email, tz: u.tz, firstName: u.firstName || '', lastName: u.lastName || '' });
});

app.post('/auth/refresh', async (req, res) => {
  const rt = req.cookies?.refreshToken;
  if (!rt) return res.status(401).json({ error: 'No refresh' });

  const oldHash = sha256(rt);
  const user = await User.findOne({ refreshHashes: oldHash });
  if (!user) return res.status(401).json({ error: 'Invalid refresh' });

  const access = signAccess(user._id.toString());

  const newRefresh = makeRefresh();
  const newHash = sha256(newRefresh);

  await User.updateOne({ _id: user._id }, { $pull: { refreshHashes: oldHash } });
  await User.updateOne({ _id: user._id }, { $addToSet: { refreshHashes: newHash } });

  setRefreshCookie(res, newRefresh);
  res.json({ token: access });
});

app.post('/auth/logout', async (req, res) => {
  const rt = req.cookies?.refreshToken;
  if (rt) {
    await User.updateOne({ refreshHashes: sha256(rt) }, { $pull: { refreshHashes: sha256(rt) } });
  }
  res.clearCookie('refreshToken', { path: '/auth' });
  res.json({ ok: true });
});

app.post('/auth/forgot-password', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const user = await User.findOne({ email });
  if (user) {
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 min
    await User.updateOne({ _id: user._id }, { $set: { reset: { tokenHash, expiresAt } } });
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    const resetUrl = `${frontendUrl}/reset?token=${token}&email=${encodeURIComponent(email)}`;
    console.log('🔐 Password reset link:', resetUrl);
  }
  res.json({ ok: true });
});

app.post('/auth/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Missing token or password' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const tokenHash = sha256(token);
  const user = await User.findOne({ 'reset.tokenHash': tokenHash });
  if (!user || !user.reset?.expiresAt || user.reset.expiresAt < new Date()) {
    return res.status(400).json({ error: 'Invalid or expired token' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await User.updateOne({ _id: user._id }, { $set: { passwordHash }, $unset: { reset: 1 } });
  res.json({ ok: true });
});

// --- Routes: Daily metrics (body weight / height) ---
app.get('/metrics', auth, async (req, res) => {
  const date = (req.query.date || dayjs().format('YYYY-MM-DD')).slice(0,10);
  const doc = await DailyMetric.findOne({ userId: req.userId, date }).lean();
  res.json(doc || { date, weightKg: null, heightCm: null });
});

app.patch('/metrics', auth, async (req, res) => {
  const { date, weightKg, heightCm } = req.body || {};
  if (!date) return res.status(400).json({ error: 'date required (YYYY-MM-DD)' });

  const set = {};
  if (typeof weightKg !== 'undefined') {
    const n = finiteNumber(weightKg, { min: 0, max: 1000, allowNull: true });
    if (n === undefined) return res.status(400).json({ error: 'weightKg must be a valid number' });
    set.weightKg = n;
  }
  if (typeof heightCm !== 'undefined') {
    const n = finiteNumber(heightCm, { min: 0, max: 300, allowNull: true });
    if (n === undefined) return res.status(400).json({ error: 'heightCm must be a valid number' });
    set.heightCm = n;
  }

  const doc = await DailyMetric.findOneAndUpdate(
    { userId: req.userId, date: date.slice(0,10) },
    { $set: set, $setOnInsert: { userId: req.userId, date: date.slice(0,10) } },
    { upsert: true, new: true }
  ).lean();

  res.json(doc);
});

// --- Routes: Templates ---
app.post('/templates', auth, async (req, res) => {
  const {
    name, unit = 'reps', dailyTarget, defaultSetSize, schedule,
    kind = 'calisthenics', group = '',
    weight = null, // legacy
    weightPattern,
    progression, deloadRule
  } = req.body;

  if (!name || !dailyTarget) return res.status(400).json({ error: 'name & dailyTarget required' });
  const numberError = validateTemplateNumbers({ dailyTarget, defaultSetSize, weight, weightPattern, progression, deloadRule });
  if (numberError) return res.status(400).json({ error: numberError });

  // sanitize/normalize weightPattern for gym
  const wp = normalizeWeightPattern(kind, weightPattern ?? { mode: 'fixed', start: (weight ?? null) }, weight);
  const sessionMode = ['manual', 'automatic'].includes(req.body?.sessionMode) ? req.body.sessionMode : 'manual';
  const sessionBlocks = normalizeSessionBlocks(req.body?.sessionBlocks);
  const autoSessionSettings = normalizeAutoSessionSettings(req.body?.autoSessionSettings || {});

  const tpl = await TaskTemplate.create({
    userId: req.userId,
    name, unit, dailyTarget,
    defaultSetSize: defaultSetSize || dailyTarget,
    weight,
    ...(wp ? { weightPattern: wp } : {}),
    schedule: schedule || {
      type: 'weekly',
      daysOfWeek: [1,2,3,4,5,6,0],
      startDate: dayjs().format('YYYY-MM-DD'),
      endDate: null
    },
    active: true,
    kind, group,
    progression: progression || { weeklyPct: 0, cap: null },
    deloadRule: deloadRule || { everyNWeeks: 0, scale: 0.7 },
    sessionMode,
    sessionBlocks,
    autoSessionSettings
  });

  res.json(tpl);
});

app.get('/templates', auth, async (req, res) => {
  const list = await TaskTemplate.find({ userId: req.userId }).sort({ createdAt: -1 }).lean();
  res.json(list);
});

app.patch('/templates/:id', auth, async (req, res) => {
  if (rejectBadObjectId(res, req.params.id)) return;
  // fetch existing to handle kind/weightPattern transitions robustly
  const existing = await TaskTemplate.findOne({ _id: req.params.id, userId: req.userId });
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const patch = { ...req.body };

  const nextKind = patch.kind ?? existing.kind;
  const nextWeight = (typeof patch.weight !== 'undefined') ? patch.weight : existing.weight;
  const maybeWp = (typeof patch.weightPattern !== 'undefined') ? patch.weightPattern : existing.weightPattern;

  const wp = normalizeWeightPattern(nextKind, maybeWp, nextWeight);
  const numberError = validateTemplateNumbers({
    dailyTarget: patch.dailyTarget ?? existing.dailyTarget,
    defaultSetSize: patch.defaultSetSize ?? existing.defaultSetSize,
    weight: nextWeight,
    weightPattern: patch.weightPattern ?? existing.weightPattern,
    progression: patch.progression ?? existing.progression,
    deloadRule: patch.deloadRule ?? existing.deloadRule
  });
  if (numberError) return res.status(400).json({ error: numberError });

  if (nextKind !== 'gym') {
    // clean up gym-only fields if switching away
    patch.weight = null;
    // omit weightPattern to rely on schema default-less usage for non-gym
    patch.weightPattern = undefined;
  } else {
    patch.weightPattern = wp;
  }
  if (typeof patch.sessionMode !== 'undefined') {
    patch.sessionMode = ['manual', 'automatic'].includes(patch.sessionMode) ? patch.sessionMode : 'manual';
  }
  if (typeof patch.sessionBlocks !== 'undefined') {
    patch.sessionBlocks = normalizeSessionBlocks(patch.sessionBlocks);
  }
  if (typeof patch.autoSessionSettings !== 'undefined') {
    patch.autoSessionSettings = normalizeAutoSessionSettings(patch.autoSessionSettings || {});
  }

  const tpl = await TaskTemplate.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    patch,
    { new: true }
  );

  if (!tpl) return res.status(404).json({ error: 'Not found' });
  res.json(tpl);
});

app.delete('/templates/:id', auth, async (req, res) => {
  if (rejectBadObjectId(res, req.params.id)) return;
  await TaskTemplate.deleteOne({ _id: req.params.id, userId: req.userId });
  res.json({ ok: true });
});

// --- Routes: Plan ---
app.get('/plan', auth, async (req, res) => {
  const date = (req.query.date || dayjs().format('YYYY-MM-DD')).slice(0,10);
  await materializeForDate(req.userId, date);
  const plan = await DailyInstance.find({ userId: req.userId, date })
    .populate('templateId')
    .sort({ createdAt: 1 })
    .lean();
  res.json(plan);
});

// Seed examples
app.post('/templates/seed', auth, async (req, res) => {
  const today = dayjs().format('YYYY-MM-DD');
  const samples = [
    {
      name: 'New Calisthenics Template',
      kind: 'calisthenics',
      group: 'Push Day',
      unit: 'reps',
      dailyTarget: 120,
      defaultSetSize: 15,
      schedule: { type: 'weekly', daysOfWeek: [1,3,5], startDate: today, endDate: null },
      progression: { weeklyPct: 5, cap: 200 },
      deloadRule: { everyNWeeks: 4, scale: 0.7 }
    },
    {
      name: 'Gym Template – Back (Lat Pulldown)',
      kind: 'gym',
      group: 'Back Day',
      unit: 'reps',
      dailyTarget: 6,          // sets
      defaultSetSize: 10,      // reps per set
      weight: 60,              // legacy fixed
      weightPattern: { mode: 'drop', start: 60, end: 40, step: 10, perSet: [] },
      schedule: { type: 'weekly', daysOfWeek: [2,5], startDate: today, endDate: null },
      progression: { weeklyPct: 3, cap: 10 },
      deloadRule: { everyNWeeks: 6, scale: 0.75 }
    }
  ];
  const created = await TaskTemplate.insertMany(samples.map(s => ({ ...s, userId: req.userId })));
  res.json(created);
});

// --- Stats helpers ---
function computeVolumeKgForInstance(di) {
  const repsArr = Array.isArray(di.setsDone) ? di.setsDone : [];
  const wArr = Array.isArray(di.weightsDone) ? di.weightsDone
              : (Array.isArray(di.weightsPlanned) ? di.weightsPlanned : []);
  let vol = 0;
  for (let i = 0; i < repsArr.length; i++) {
    const r = Number(repsArr[i]) || 0;
    const w = Number(wArr[i]);
    if (Number.isFinite(w) && w > 0 && r > 0) vol += r * w;
  }
  return vol;
}

// --- Routes: Stats ---
app.get('/stats/weights', auth, async (req, res) => {
  const toD = req.query.to ? dayjs(req.query.to) : dayjs();
  const fromD = req.query.from ? dayjs(req.query.from) : toD.subtract(59, 'day');
  const from = fromD.format('YYYY-MM-DD');
  const to = toD.format('YYYY-MM-DD');
  const { templateId } = req.query;

  const filter = { userId: req.userId, date: { $gte: from, $lte: to }, weight: { $ne: null } };
  if (templateId) filter.templateId = templateId;

  const items = await DailyInstance.find(filter, { date: 1, weight: 1, templateId: 1 })
    .populate('templateId', 'name kind group weight')
    .sort({ date: 1 })
    .lean();

  const byTpl = new Map();
  for (const it of items) {
    const tid = it.templateId?._id?.toString();
    if (!tid) continue;
    if (!byTpl.has(tid)) {
      byTpl.set(tid, {
        templateId: tid,
        name: it.templateId?.name || 'Template',
        kind: it.templateId?.kind || 'calisthenics',
        group: it.templateId?.group || '',
        targetWeight: it.templateId?.weight ?? null,
        data: [],
      });
    }
    byTpl.get(tid).data.push({ date: it.date, weight: it.weight });
  }

  res.json({
    range: { from, to },
    series: Array.from(byTpl.values()).filter(s => s.data.length > 0),
  });
});

app.get('/stats/summary', auth, async (req, res) => {
  const to = req.query.to ? dayjs(req.query.to) : dayjs();
  const from = req.query.from ? dayjs(req.query.from) : to.subtract(27, 'day');

  const fromStr = from.format('YYYY-MM-DD');
  const toStr = to.format('YYYY-MM-DD');

  const items = await DailyInstance.find({ userId: req.userId, date: { $gte: fromStr, $lte: toStr } }).lean();

  const byDate = new Map();
  for (let d = from.startOf('day'); !d.isAfter(to, 'day'); d = d.add(1, 'day')) {
    byDate.set(d.format('YYYY-MM-DD'), []);
  }
  items.forEach(it => { const k = it.date; if (byDate.has(k)) byDate.get(k).push(it); });

  const days = [];
  let currentStreak = 0;
  let longestStreak = 0;

  for (let d = from.startOf('day'); !d.isAfter(to, 'day'); d = d.add(1,'day')) {
    const key = d.format('YYYY-MM-DD');
    const arr = byDate.get(key) || [];

    const targetSum = arr.reduce((s,x)=>s+(x.target||0), 0);
    const repsSum   = arr.reduce((s,x)=>s+(x.repsDone||0), 0);
    const scheduled = arr.length > 0;
    const met       = scheduled ? repsSum >= targetSum && targetSum > 0 : false;

    // DISTINCT groups for that date, using snapshot on DailyInstance
    const groupsSet = new Set(
      arr.map(x => (x.group || '').trim() || 'Ungrouped')
    );
    const groups = Array.from(groupsSet);

    // per-day training volume (kg)
    const volumeKg = arr.reduce((s, x) => s + computeVolumeKgForInstance(x), 0);

    if (scheduled) {
      if (met) { currentStreak += 1; longestStreak = Math.max(longestStreak, currentStreak); }
      else { currentStreak = 0; }
    }

    days.push({ date: key, target: targetSum, done: repsSum, scheduled, met, groups, volumeKg });
  }

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    const slice = days.slice(i, i + 7);
    if (!slice.length) break;
    const wFrom = slice[0].date;
    const wTo = slice[slice.length - 1].date;
    weeks.push({
      from: wFrom, to: wTo,
      target: slice.reduce((s,x)=>s+x.target,0),
      done: slice.reduce((s,x)=>s+x.done,0),
      scheduledDays: slice.filter(x=>x.scheduled).length,
      metDays: slice.filter(x=>x.met).length,
      volumeKg: slice.reduce((s,x)=>s+(x.volumeKg||0),0)
    });
  }

  const scheduledDays = days.filter(d => d.scheduled).length;
  const metDays = days.filter(d => d.met).length;
  const compliancePct = scheduledDays ? Math.round((metDays / scheduledDays) * 100) : 0;

  res.json({
    range: { from: fromStr, to: toStr },
    compliancePct, currentStreak, longestStreak,
    totals: {
      target: days.reduce((s,x)=>s+x.target,0),
      done: days.reduce((s,x)=>s+x.done,0),
      volumeKg: days.reduce((s,x)=>s+(x.volumeKg||0),0)
    },
    days, weeks
  });
});

// --- Routes: Guided workout sessions ---
app.post('/sessions', auth, async (req, res) => {
  const {
    dailyInstanceId = null,
    dailyInstanceIds = [],
    templateId = null,
    date,
    startedAt,
    endedAt,
    perceivedEffort,
    status = 'completed',
    sessionType = 'single',
    workoutMode = 'sequential',
    totalRounds = 1,
    sessionSettings = {},
    updateDailyProgress = true
  } = req.body || {};

  if (dailyInstanceId && rejectBadObjectId(res, dailyInstanceId, 'dailyInstanceId')) return;
  if (templateId && rejectBadObjectId(res, templateId, 'templateId')) return;
  const cleanDailyInstanceIds = Array.isArray(dailyInstanceIds)
    ? [...new Set(dailyInstanceIds.filter(Boolean).map(String))]
    : [];
  for (const id of cleanDailyInstanceIds) {
    if (rejectBadObjectId(res, id, 'dailyInstanceIds')) return;
  }

  const cleanStatus = ['completed', 'cancelled'].includes(status) ? status : 'completed';
  const cleanSessionType = sessionType === 'daily' ? 'daily' : 'single';
  const cleanWorkoutMode = ['circuit', 'sequential'].includes(workoutMode) ? workoutMode : 'sequential';
  const cleanTotalRounds = Math.round(finiteNumber(totalRounds, { min: 1, max: 1000 }) ?? 1);
  const blockResults = normalizeSessionResultBlocks(req.body?.blockResults || []);
  const computedDuration = blockResults.reduce((s, b) => s + (Number(b.actualDurationSec) || 0), 0);
  const durationSec = Math.round(
    finiteNumber(req.body?.durationSec, { min: 0, max: 24 * 60 * 60 }) ?? computedDuration
  );
  const effort = finiteNumber(perceivedEffort, { min: 1, max: 10, allowNull: true });
  if (effort === undefined) return res.status(400).json({ error: 'perceivedEffort must be between 1 and 10' });

  let daily = null;
  let dailies = [];
  if (dailyInstanceId) {
    daily = await DailyInstance.findOne({ _id: dailyInstanceId, userId: req.userId }).populate('templateId');
    if (!daily) return res.status(404).json({ error: 'Daily workout not found' });
  }
  if (cleanDailyInstanceIds.length) {
    dailies = await DailyInstance.find({ _id: { $in: cleanDailyInstanceIds }, userId: req.userId }).populate('templateId');
    if (dailies.length !== cleanDailyInstanceIds.length) return res.status(404).json({ error: 'One or more daily workouts were not found' });
  }

  let template = null;
  const resolvedTemplateId = templateId || daily?.templateId?._id;
  if (resolvedTemplateId) {
    template = daily?.templateId?._id ? daily.templateId : await TaskTemplate.findOne({ _id: resolvedTemplateId, userId: req.userId }).lean();
    if (!template) return res.status(404).json({ error: 'Template not found' });
  }

  const sessionDate = cleanDate(date || daily?.date || dailies[0]?.date);
  const { weightKg, note } = await bodyWeightForDate(req.userId, sessionDate);
  const caloriesEstimated = estimateCalories({
    blocks: blockResults,
    durationSec,
    bodyWeightKg: weightKg,
    templateKind: cleanSessionType === 'daily' && cleanWorkoutMode === 'circuit'
      ? 'circuit'
      : (template?.kind || daily?.templateId?.kind || dailies[0]?.templateId?.kind || 'calisthenics')
  });

  const completedBlocks = blockResults.filter(b => {
    if (cleanStatus !== 'completed') return false;
    if (b.type === 'rest') return true;
    return (Number(b.actualDurationSec) || 0) > 0 || (Number(b.completedReps) || 0) > 0;
  }).length;

  const doc = await WorkoutSession.create({
    userId: req.userId,
    dailyInstanceId: daily?._id || null,
    dailyInstanceIds: cleanDailyInstanceIds,
    templateId: template?._id || resolvedTemplateId || null,
    sessionType: cleanSessionType,
    totalRounds: cleanTotalRounds,
    workoutMode: cleanWorkoutMode,
    sessionSettings,
    date: sessionDate,
    startedAt: startedAt ? new Date(startedAt) : new Date(),
    endedAt: endedAt ? new Date(endedAt) : new Date(),
    durationSec,
    blocksCompleted: completedBlocks,
    totalBlocks: blockResults.length,
    caloriesEstimated,
    bodyWeightKg: weightKg,
    calorieNote: note,
    perceivedEffort: effort,
    status: cleanStatus,
    blockResults
  });

  if (cleanStatus === 'completed' && updateDailyProgress) {
    const dailyMap = new Map();
    if (daily) dailyMap.set(daily._id.toString(), daily);
    for (const row of dailies) dailyMap.set(row._id.toString(), row);

    for (const [id, row] of dailyMap.entries()) {
      const related = blockResults.filter(b => b.type === 'exercise' && String(b.dailyInstanceId || '') === id);
      const completedReps = related.reduce((s, b) => s + (Number(b.completedReps) || Number(b.targetReps) || 0), 0);
      const nextDone = Math.max(
        Number(row.repsDone || 0),
        completedReps > 0 ? Math.min(completedReps, Number(row.target || completedReps)) : Number(row.target || 0)
      );
      row.repsDone = nextDone;
      row.status = computeStatus(row.repsDone, row.target);
      if (!Array.isArray(row.setsDone)) row.setsDone = [];
      if (!row.setsDone.length && related.length) {
        row.setsDone = related.map(b => Number(b.completedReps) || Number(b.targetReps) || 0).filter(n => n > 0);
      }
      if (!Array.isArray(row.weightsDone)) row.weightsDone = [];
      if (!row.weightsDone.length && related.length) {
        row.weightsDone = related.map(b => {
          const n = Number(b.completedWeight ?? b.plannedWeight);
          return Number.isFinite(n) ? n : null;
        });
      }
      await row.save();
    }
  }

  res.json(doc);
});

app.get('/sessions/summary', auth, async (req, res) => {
  const to = cleanDate(req.query.to);
  const from = cleanDate(req.query.from || dayjs(to).subtract(27, 'day').format('YYYY-MM-DD'));
  const items = await WorkoutSession.find({ userId: req.userId, date: { $gte: from, $lte: to } }).lean();
  const completed = items.filter(s => s.status === 'completed');
  const effortValues = completed.map(s => Number(s.perceivedEffort)).filter(Number.isFinite);
  const caloriesEstimated = completed.reduce((s, x) => s + (Number(x.caloriesEstimated) || 0), 0);
  const totalDurationSec = completed.reduce((s, x) => s + (Number(x.durationSec) || 0), 0);
  const weeks = [];
  const byDate = new Map();
  for (let d = dayjs(from).startOf('day'); !d.isAfter(dayjs(to), 'day'); d = d.add(1, 'day')) {
    byDate.set(d.format('YYYY-MM-DD'), { date: d.format('YYYY-MM-DD'), caloriesEstimated: 0, durationSec: 0, sessions: 0 });
  }
  for (const item of completed) {
    const row = byDate.get(item.date);
    if (!row) continue;
    row.caloriesEstimated += Number(item.caloriesEstimated) || 0;
    row.durationSec += Number(item.durationSec) || 0;
    row.sessions += 1;
  }
  const days = Array.from(byDate.values());
  for (let i = 0; i < days.length; i += 7) {
    const slice = days.slice(i, i + 7);
    weeks.push({
      from: slice[0]?.date,
      to: slice[slice.length - 1]?.date,
      caloriesEstimated: slice.reduce((s, x) => s + x.caloriesEstimated, 0),
      durationSec: slice.reduce((s, x) => s + x.durationSec, 0),
      sessions: slice.reduce((s, x) => s + x.sessions, 0)
    });
  }

  res.json({
    range: { from, to },
    completedSessions: completed.length,
    cancelledSessions: items.length - completed.length,
    caloriesEstimated,
    totalDurationSec,
    averageEffort: effortValues.length ? Math.round((effortValues.reduce((s, n) => s + n, 0) / effortValues.length) * 10) / 10 : null,
    days,
    weeks
  });
});

app.get('/sessions', auth, async (req, res) => {
  const to = cleanDate(req.query.to);
  const from = cleanDate(req.query.from || dayjs(to).subtract(27, 'day').format('YYYY-MM-DD'));
  const items = await WorkoutSession.find({ userId: req.userId, date: { $gte: from, $lte: to } })
    .populate('templateId', 'name kind group')
    .sort({ startedAt: -1 })
    .lean();
  res.json({ range: { from, to }, items });
});

app.get('/sessions/:id', auth, async (req, res) => {
  if (rejectBadObjectId(res, req.params.id)) return;
  const item = await WorkoutSession.findOne({ _id: req.params.id, userId: req.userId })
    .populate('templateId', 'name kind group')
    .lean();
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

// --- Routes: Daily progress ---
app.patch('/daily/:id/progress', auth, async (req, res) => {
  if (rejectBadObjectId(res, req.params.id)) return;
  const { addReps, completeSet, undoLast, weightForSet } = req.body;

  const di = await DailyInstance.findOne({ _id: req.params.id, userId: req.userId });
  if (!di) return res.status(404).json({ error: 'Not found' });

  if (undoLast) {
    if (di.setsDone.length) {
      const lastReps = di.setsDone.pop();
      di.repsDone = Math.max(0, di.repsDone - lastReps);
      // remove last weight if any
      if (Array.isArray(di.weightsDone) && di.weightsDone.length) di.weightsDone.pop();
    }
  } else if (typeof completeSet !== 'undefined') {
    const n = finiteNumber(completeSet, { min: 1, max: 10000 });
    if (n === undefined) return res.status(400).json({ error: 'completeSet must be a positive number' });
    di.setsDone.push(n);
    di.repsDone += n;
    const w =
      Number.isFinite(Number(weightForSet)) ? Number(weightForSet)
      : (Array.isArray(di.weightsPlanned) ? di.weightsPlanned[di.setsDone.length - 1] : null);
    if (weightForSet !== undefined && finiteNumber(weightForSet, { min: 0, max: 1000 }) === undefined) {
      return res.status(400).json({ error: 'weightForSet must be a valid number' });
    }
    if (!Array.isArray(di.weightsDone)) di.weightsDone = [];
    di.weightsDone.push(Number.isFinite(w) ? Number(w) : null);
  } else if (typeof addReps !== 'undefined') {
    const n = finiteNumber(addReps, { min: 1, max: 10000 });
    if (n === undefined) return res.status(400).json({ error: 'addReps must be a positive number' });
    // free-form adds: record reps, weight unknown
    di.setsDone.push(n);
    di.repsDone += n;
    if (!Array.isArray(di.weightsDone)) di.weightsDone = [];
    di.weightsDone.push(null);
  }

  di.status = computeStatus(di.repsDone, di.target);
  await di.save();
  res.json(di);
});

app.patch('/daily/:id/meta', auth, async (req, res) => {
  if (rejectBadObjectId(res, req.params.id)) return;
  const { notes, rpe, weight } = req.body;

  const set = {};
  if (typeof notes !== 'undefined') set.notes = notes;
  if (typeof rpe !== 'undefined') {
    const n = finiteNumber(rpe, { min: 1, max: 10, allowNull: true });
    if (n === undefined) return res.status(400).json({ error: 'rpe must be between 1 and 10' });
    set.rpe = n;
  }
  if (typeof weight !== 'undefined') {
    const n = finiteNumber(weight, { min: 0, max: 1000, allowNull: true });
    if (n === undefined) return res.status(400).json({ error: 'weight must be a valid number' });
    set.weight = n;
  }

  const di = await DailyInstance.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { $set: set },
    { new: true }
  );
  if (!di) return res.status(404).json({ error: 'Not found' });
  res.json(di);
});

// --- Routes: Daily move/reschedule ---
app.post('/daily/:id/move', auth, async (req, res) => {
  if (rejectBadObjectId(res, req.params.id)) return;
  const { toDate } = req.body;
  if (!toDate) return res.status(400).json({ error: 'toDate required (YYYY-MM-DD)' });
  const destDate = dayjs(toDate).format('YYYY-MM-DD');

  const di = await DailyInstance.findOne({ _id: req.params.id, userId: req.userId });
  if (!di) return res.status(404).json({ error: 'Not found' });

  const result = await moveOneDailyInstance(di, destDate, req.userId);
  res.json({ ok: true, ...result });
});

// --- Routes: Bulk move all items from a day ---
app.post('/daily/move-day', auth, async (req, res) => {
  const { fromDate, toDate } = req.body || {};
  if (!fromDate || !toDate) return res.status(400).json({ error: 'fromDate and toDate required (YYYY-MM-DD)' });

  const src = dayjs(fromDate).format('YYYY-MM-DD');
  const dst = dayjs(toDate).format('YYYY-MM-DD');
  if (src === dst) return res.status(400).json({ error: 'fromDate and toDate are the same' });

  const items = await DailyInstance.find({ userId: req.userId, date: src }).lean();
  if (!items.length) return res.json({ ok: true, moved: 0, merged: 0, skipped: 0, details: [] });

  const details = [];
  let moved = 0, merged = 0, skipped = 0;

  for (const di of items) {
    const result = await moveOneDailyInstance(di, dst, req.userId);
    details.push(result);
    if (result.status === 'moved') moved += 1;
    else if (result.status === 'merged') merged += 1;
    else skipped += 1;
  }

  res.json({ ok: true, from: src, to: dst, moved, merged, skipped, details });
});

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
