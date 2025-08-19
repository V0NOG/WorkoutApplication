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
  }
}, { timestamps: true });

const TaskTemplateSchema = new mongoose.Schema({
  userId: { type: mongoose.Types.ObjectId, ref: 'User' },
  name: String,
  unit: { type: String, default: 'reps' },          // reps | minutes | distance
  dailyTarget: Number,
  defaultSetSize: Number,
  weight: { type: Number, default: null },          // 👈 target weight for GYM
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
  }
}, { timestamps: true });

const DailyInstanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Types.ObjectId, ref: 'User' },
  templateId: { type: mongoose.Types.ObjectId, ref: 'TaskTemplate' },
  date: String,                       // 'YYYY-MM-DD'
  target: Number,
  setsPlanned: [Number],
  setsDone: [Number],
  repsDone: { type: Number, default: 0 },
  status: { type: String, default: 'on-track' }, // on-track|ahead|behind|done
  notes: String,
  rpe: Number,
  weight: { type: Number, default: null },       // 👈 user's actual weight for the day
  group: { type: String, default: '' }           // snapshot of template.group
}, { timestamps: true });

DailyInstanceSchema.index({ userId: 1, templateId: 1, date: 1 }, { unique: true });

const DailyMetricSchema = new mongoose.Schema({
  userId: { type: mongoose.Types.ObjectId, ref: 'User' },
  date: { type: String },              // 'YYYY-MM-DD'
  weightKg: { type: Number, default: null },
  heightCm: { type: Number, default: null },
}, { timestamps: true });

DailyMetricSchema.index({ userId: 1, date: 1 }, { unique: true });

const DailyMetric = mongoose.model('DailyMetric', DailyMetricSchema);

const User = mongoose.model('User', UserSchema);
const TaskTemplate = mongoose.model('TaskTemplate', TaskTemplateSchema);
const DailyInstance = mongoose.model('DailyInstance', DailyInstanceSchema);

const ACCESS_TTL = '15m';
const REFRESH_TTL_DAYS = 7;

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

function computeStatus(repsDone, target) {
  if (repsDone === 0) return 'on-track';
  if (repsDone < target) return 'on-track';
  if (repsDone === target) return 'done';
  return 'ahead';
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

// Materialize/repair the plan for a date
async function materializeForDate(userId, date) {
  const templates = await TaskTemplate.find({ userId, active: true }).lean();
  const tplById = new Map(templates.map(t => [t._id.toString(), t]));
  const existing = await DailyInstance.find({ userId, date }).lean();

  const toRemoveIds = [];
  for (const di of existing) {
    const tpl = tplById.get(di.templateId.toString());
    if (!tpl || !isActiveOnDate(tpl, date)) toRemoveIds.push(di._id);
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

    const newTarget = computeTargetWithRules(tpl, date);
    const newSets = planSets(newTarget, tpl.defaultSetSize || newTarget);
    const newGroup = tpl.group || '';

    const needsUpdate =
      di.target !== newTarget ||
      !arraysEqual(di.setsPlanned, newSets) ||
      (di.group || '') !== newGroup;

    if (needsUpdate) {
      await DailyInstance.updateOne(
        { _id: di._id },
        { $set: { target: newTarget, setsPlanned: newSets, group: newGroup, status: computeStatus(di.repsDone || 0, newTarget) } }
      );
    }
  }

  const ops = [];
  for (const tpl of templates) {
    if (!isActiveOnDate(tpl, date)) continue;

    const newTarget = computeTargetWithRules(tpl, date);
    const newSets = planSets(newTarget, tpl.defaultSetSize || newTarget);

    ops.push({
      updateOne: {
        filter: { userId, templateId: tpl._id, date },
        update: {
          $setOnInsert: {
            userId, templateId: tpl._id, date,
            target: newTarget, setsPlanned: newSets, setsDone: [], repsDone: 0,
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

  const newTarget = computeTargetWithRules(tpl, destDate);
  const newSetsPlanned = planSets(newTarget, tpl.defaultSetSize || newTarget);
  const newGroup = tpl.group || '';

  const existingDest = await DailyInstance.findOne({ userId, templateId: di.templateId, date: destDate });

  if (existingDest) {
    const mergedSetsDone = [...(existingDest.setsDone || []), ...(di.setsDone || [])];
    const mergedRepsDone = (existingDest.repsDone || 0) + (di.repsDone || 0);
    const mergedNotes = [existingDest.notes, di.notes].filter(Boolean).join('\n');
    const mergedRpe = di.rpe ?? existingDest.rpe ?? null;
    const mergedWeight = di.weight ?? existingDest.weight ?? null;

    await DailyInstance.updateOne(
      { _id: existingDest._id },
      {
        $set: {
          date: destDate, target: newTarget, setsPlanned: newSetsPlanned, group: newGroup,
          setsDone: mergedSetsDone, repsDone: mergedRepsDone, notes: mergedNotes,
          rpe: mergedRpe, weight: mergedWeight, status: computeStatus(mergedRepsDone, newTarget)
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
        target: newTarget, setsPlanned: newSetsPlanned,
        setsDone: di.setsDone || [], repsDone: di.repsDone || 0,
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
  const { email, password, tz, firstName = '', lastName = '' } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email & password required' });

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
  const { email, password } = req.body;
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
  const u = await User.findById(req.userId).lean();
  res.json({ id: u._id, email: u.email, tz: u.tz, firstName: u.firstName || '', lastName: u.lastName || '' });
});

app.patch('/me', auth, async (req, res) => {
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
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (user) {
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 min
    await User.updateOne({ _id: user._id }, { $set: { reset: { tokenHash, expiresAt } } });
    const resetUrl = `http://localhost:5173/reset?token=${token}&email=${encodeURIComponent(email)}`;
    console.log('🔐 Password reset link:', resetUrl);
  }
  res.json({ ok: true });
});

app.post('/auth/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Missing token or password' });

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
  if (typeof weightKg !== 'undefined') set.weightKg = (weightKg === null ? null : Number(weightKg));
  if (typeof heightCm !== 'undefined') set.heightCm = (heightCm === null ? null : Number(heightCm));

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
    kind = 'calisthenics', group = '', weight = null, progression, deloadRule
  } = req.body;

  if (!name || !dailyTarget) return res.status(400).json({ error: 'name & dailyTarget required' });

  const tpl = await TaskTemplate.create({
    userId: req.userId,
    name, unit, dailyTarget,
    defaultSetSize: defaultSetSize || dailyTarget,
    weight,
    schedule: schedule || {
      type: 'weekly',
      daysOfWeek: [1,2,3,4,5,6,0],
      startDate: dayjs().format('YYYY-MM-DD'),
      endDate: null
    },
    active: true,
    kind, group,
    progression: progression || { weeklyPct: 0, cap: null },
    deloadRule: deloadRule || { everyNWeeks: 0, scale: 0.7 }
  });

  res.json(tpl);
});

app.get('/templates', auth, async (req, res) => {
  const list = await TaskTemplate.find({ userId: req.userId }).sort({ createdAt: -1 }).lean();
  res.json(list);
});

app.patch('/templates/:id', auth, async (req, res) => {
  const tpl = await TaskTemplate.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    req.body,
    { new: true }
  );
  if (!tpl) return res.status(404).json({ error: 'Not found' });
  res.json(tpl);
});

app.delete('/templates/:id', auth, async (req, res) => {
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
      dailyTarget: 60,
      defaultSetSize: 10,
      weight: 40,
      schedule: { type: 'weekly', daysOfWeek: [2,5], startDate: today, endDate: null },
      progression: { weeklyPct: 3, cap: 100 },
      deloadRule: { everyNWeeks: 6, scale: 0.75 }
    }
  ];
  const created = await TaskTemplate.insertMany(samples.map(s => ({ ...s, userId: req.userId })));
  res.json(created);
});

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
    const repsSum = arr.reduce((s,x)=>s+(x.repsDone||0), 0);
    const scheduled = arr.length > 0;
    const met = scheduled ? repsSum >= targetSum && targetSum > 0 : false;

    if (scheduled) {
      if (met) { currentStreak += 1; longestStreak = Math.max(longestStreak, currentStreak); }
      else { currentStreak = 0; }
    }
    days.push({ date: key, target: targetSum, done: repsSum, scheduled, met });
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
      metDays: slice.filter(x=>x.met).length
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
      done: days.reduce((s,x)=>s+x.done,0)
    },
    days, weeks
  });
});

// --- Routes: Daily progress ---
app.patch('/daily/:id/progress', auth, async (req, res) => {
  const { addReps, completeSet, undoLast } = req.body;

  const di = await DailyInstance.findOne({ _id: req.params.id, userId: req.userId });
  if (!di) return res.status(404).json({ error: 'Not found' });

  if (undoLast) {
    if (di.setsDone.length) {
      const last = di.setsDone.pop();
      di.repsDone = Math.max(0, di.repsDone - last);
    }
  } else if (typeof completeSet === 'number' && completeSet > 0) {
    di.setsDone.push(completeSet);
    di.repsDone += completeSet;
  } else if (typeof addReps === 'number' && addReps > 0) {
    di.setsDone.push(addReps);
    di.repsDone += addReps;
  }

  di.status = computeStatus(di.repsDone, di.target);
  await di.save();
  res.json(di);
});

app.patch('/daily/:id/meta', auth, async (req, res) => {
  const { notes, rpe, weight } = req.body;

  const set = {};
  if (typeof notes !== 'undefined') set.notes = notes;
  if (typeof rpe !== 'undefined')   set.rpe = rpe;
  if (typeof weight !== 'undefined') set.weight = (weight === null ? null : Number(weight));

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
  const { toDate } = req.body;
  if (!toDate) return res.status(400).json({ error: 'toDate required (YYYY-MM-DD)' });

  const destDate = dayjs(toDate).format('YYYY-MM-DD');

  const di = await DailyInstance.findOne({ _id: req.params.id, userId: req.userId });
  if (!di) return res.status(404).json({ error: 'Not found' });

  const tpl = await TaskTemplate.findOne({ _id: di.templateId, userId: req.userId });
  if (!tpl) return res.status(400).json({ error: 'Template missing' });

  const newTarget = computeTargetWithRules(tpl, destDate);
  const newSetsPlanned = planSets(newTarget, tpl.defaultSetSize || newTarget);
  const newGroup = tpl.group || '';

  const existingDest = await DailyInstance.findOne({ userId: req.userId, templateId: di.templateId, date: destDate });

  if (existingDest) {
    const mergedSetsDone = [...(existingDest.setsDone || []), ...(di.setsDone || [])];
    const mergedRepsDone = (existingDest.repsDone || 0) + (di.repsDone || 0);
    const mergedNotes = [existingDest.notes, di.notes].filter(Boolean).join('\n');
    const mergedRpe = di.rpe ?? existingDest.rpe ?? null;
    const mergedWeight = di.weight ?? existingDest.weight ?? null;

    await DailyInstance.updateOne(
      { _id: existingDest._id },
      {
        $set: {
          date: destDate, target: newTarget, setsPlanned: newSetsPlanned, group: newGroup,
          setsDone: mergedSetsDone, repsDone: mergedRepsDone, notes: mergedNotes,
          rpe: mergedRpe, weight: mergedWeight, status: computeStatus(mergedRepsDone, newTarget)
        }
      }
    );
    await DailyInstance.deleteOne({ _id: di._id });

    return res.json({ ok: true, movedTo: destDate, mergedInto: existingDest._id.toString() });
  }

  await DailyInstance.updateOne(
    { userId: req.userId, templateId: di.templateId, date: destDate },
    {
      $setOnInsert: {
        userId: req.userId, templateId: di.templateId, date: destDate,
        target: newTarget, setsPlanned: newSetsPlanned,
        setsDone: di.setsDone || [], repsDone: di.repsDone || 0,
        status: computeStatus(di.repsDone || 0, newTarget),
        group: newGroup, notes: di.notes || '', rpe: di.rpe ?? null, weight: di.weight ?? null
      }
    },
    { upsert: true }
  );

  await DailyInstance.deleteOne({ _id: di._id });
  res.json({ ok: true, movedTo: destDate });
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

app.listen(process.env.PORT, () => {
  console.log(`API running on http://localhost:${process.env.PORT}`);
});