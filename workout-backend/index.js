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
    cap: { type: Number, default: null }
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
  group: { type: String, default: '' }           // snapshot of template.group
}, { timestamps: true });

// Ensure only one DailyInstance per user/template/date
DailyInstanceSchema.index({ userId: 1, templateId: 1, date: 1 }, { unique: true });

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

function signAccess(uid) {
  return jwt.sign({ uid }, process.env.JWT_SECRET, { expiresIn: ACCESS_TTL });
}
function makeRefresh() {
  return crypto.randomBytes(48).toString('base64url');
}
function sha256(x) {
  return crypto.createHash('sha256').update(x).digest('hex');
}
function setRefreshCookie(res, token) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: '/auth'
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

  // (A) Remove rows whose template is gone or inactive on that date
  const toRemoveIds = [];
  for (const di of existing) {
    const tpl = tplById.get(di.templateId.toString());
    if (!tpl || !isActiveOnDate(tpl, date)) toRemoveIds.push(di._id);
  }
  if (toRemoveIds.length) {
    await DailyInstance.deleteMany({ _id: { $in: toRemoveIds } });
  }

  // (B) Deduplicate: keep the first, delete the rest for the same templateId
  const remain = await DailyInstance.find({ userId, date }).lean();
  const seen = new Set();
  const dupDelete = [];
  for (const di of remain) {
    const key = di.templateId.toString();
    if (seen.has(key)) dupDelete.push(di._id);
    else seen.add(key);
  }
  if (dupDelete.length) {
    await DailyInstance.deleteMany({ _id: { $in: dupDelete } });
  }

  // (C) Update snapshots if template-derived fields changed
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
        {
          $set: {
            target: newTarget,
            setsPlanned: newSets,
            group: newGroup,
            status: computeStatus(di.repsDone || 0, newTarget)
          }
        }
      );
    }
  }

  // (D) Upsert missing rows (disable timestamps in the upsert to avoid updatedAt conflicts)
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
            userId,
            templateId: tpl._id,
            date,
            target: newTarget,
            setsPlanned: newSets,
            setsDone: [],
            repsDone: 0,
            status: 'on-track',
            group: tpl.group || ''
          }
        },
        upsert: true,
        timestamps: false // 👈 prevent Mongoose from writing updatedAt in both places
      }
    });
  }

  if (ops.length) {
    try {
      await DailyInstance.bulkWrite(ops, { ordered: false });
    } catch (err) {
      if (err?.code !== 11000) throw err; // swallow dup races
    }
  }
}

// --- Routes: Auth ---
app.post('/auth/register', async (req, res) => {
  const { email, password, tz } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email & password required' });

  const exists = await User.findOne({ email });
  if (exists) return res.status(400).json({ error: 'Email already registered' });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ email, passwordHash, tz: tz || 'Australia/Sydney' });

  const access = signAccess(user._id.toString());
  const refresh = makeRefresh();
  const hash = sha256(refresh);

  // only addToSet (avoid duplicate/conflict)
  await User.updateOne({ _id: user._id }, { $addToSet: { refreshHashes: hash } });

  setRefreshCookie(res, refresh);
  res.json({ token: access, user: { id: user._id, email: user.email, tz: user.tz } });
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
  res.json({ token: access, user: { id: user._id, email: user.email, tz: user.tz } });
});

app.get('/me', auth, async (req, res) => {
  const u = await User.findById(req.userId).lean();
  res.json({ id: u._id, email: u.email, tz: u.tz });
});

app.post('/auth/refresh', async (req, res) => {
  const rt = req.cookies?.refreshToken;
  if (!rt) return res.status(401).json({ error: 'No refresh' });

  const oldHash = sha256(rt);
  const user = await User.findOne({ refreshHashes: oldHash });
  if (!user) return res.status(401).json({ error: 'Invalid refresh' });

  const access = signAccess(user._id.toString());

  // rotate
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
  await User.updateOne({ _id: user._id }, { 
    $set: { passwordHash }, 
    $unset: { reset: 1 }
  });
  res.json({ ok: true });
});

// --- Routes: Templates ---
app.post('/templates', auth, async (req, res) => {
  const { name, unit = 'reps', dailyTarget, defaultSetSize, schedule, kind = 'calisthenics', group = '' } = req.body;
  if (!name || !dailyTarget) return res.status(400).json({ error: 'name & dailyTarget required' });
  const tpl = await TaskTemplate.create({
    userId: req.userId,
    name,
    unit,
    dailyTarget,
    defaultSetSize: defaultSetSize || dailyTarget,
    schedule: schedule || {
      type: 'weekly',
      daysOfWeek: [1,2,3,4,5,6,0],
      startDate: dayjs().format('YYYY-MM-DD'),
      endDate: null
    },
    active: true,
    kind,      // 👈 ensure these are saved
    group      // 👈 ensure these are saved
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

// Seed examples (optional)
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
      schedule: { type: 'weekly', daysOfWeek: [2,5], startDate: today, endDate: null },
      progression: { weeklyPct: 3, cap: 100 },
      deloadRule: { everyNWeeks: 6, scale: 0.75 }
    }
  ];

  const created = await TaskTemplate.insertMany(
    samples.map(s => ({ ...s, userId: req.userId }))
  );
  res.json(created);
});

// --- Routes: Stats ---
app.get('/stats/summary', auth, async (req, res) => {
  const to = req.query.to ? dayjs(req.query.to) : dayjs();
  const from = req.query.from ? dayjs(req.query.from) : to.subtract(27, 'day');

  const fromStr = from.format('YYYY-MM-DD');
  const toStr = to.format('YYYY-MM-DD');

  const items = await DailyInstance.find({
    userId: req.userId,
    date: { $gte: fromStr, $lte: toStr }
  }).lean();

  const byDate = new Map();
  for (let d = from.startOf('day'); !d.isAfter(to, 'day'); d = d.add(1, 'day')) {
    byDate.set(d.format('YYYY-MM-DD'), []);
  }
  items.forEach(it => {
    const k = it.date;
    if (byDate.has(k)) byDate.get(k).push(it);
  });

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

  const scheduledDays = days.filter(d => d.scheduled).length;
  const metDays = days.filter(d => d.met).length;
  const compliancePct = scheduledDays ? Math.round((metDays / scheduledDays) * 100) : 0;

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

  res.json({
    range: { from: fromStr, to: toStr },
    compliancePct,
    currentStreak,
    longestStreak,
    totals: {
      target: days.reduce((s,x)=>s+x.target,0),
      done: days.reduce((s,x)=>s+x.done,0)
    },
    days,
    weeks
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
  const { notes, rpe } = req.body;
  const di = await DailyInstance.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { $set: { notes, rpe } },
    { new: true }
  );
  if (!di) return res.status(404).json({ error: 'Not found' });
  res.json(di);
});

app.listen(process.env.PORT, () => {
  console.log(`API running on http://localhost:${process.env.PORT}`);
});