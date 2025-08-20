// src/Today.jsx
import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import { api } from "./api";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import DatePicker from "./DatePicker.jsx";
import ProgressRing from "./components/ProgressRing.jsx";
import MonthCalendar from "./components/MonthCalendar.jsx";
import { appBus } from "./bus";

function useDebouncedEffect(fn, deps, delay = 500) {
  useEffect(() => {
    const id = setTimeout(fn, delay);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, delay]);
}

// --- Birthday helpers ---
function getBrowserTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
  catch { return "UTC"; }
}
function isMonthDayInTz(tz, mm = "08", dd = "16") {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const month = parts.find(p => p.type === "month")?.value || "";
    const day = parts.find(p => p.type === "day")?.value || "";
    return month === mm && day === dd;
  } catch {
    const now = new Date();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return m === mm && d === dd;
  }
}
function bdayTestOverride() {
  try {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("bday") === "1") return true;
    if (localStorage.getItem("bday-test") === "1") return true;
    if (import.meta.env.VITE_BDAY_TEST === "1") return true;
  } catch {}
  return false;
}

function BirthdayOverlay({ message = "Happy Birthday", onClose }) {
  const balloons = Array.from({ length: 20 }).map((_, i) => {
    const left = Math.random() * 100;
    const scale = 0.8 + Math.random() * 0.8;
    const duration = 7 + Math.random() * 6;
    const delay = Math.random() * 2.5;
    const hue = Math.floor(Math.random() * 360);
    return { i, left, scale, duration, delay, hue };
  });

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <style>{`
          @keyframes bday-float-up {
            0% { transform: translateY(110vh) rotate(0deg); opacity: 0; }
            5% { opacity: 1; }
            100% { transform: translateY(-15vh) rotate(12deg); opacity: 0.95; }
          }
        `}</style>
        {balloons.map(b => (
          <div
            key={b.i}
            className="absolute"
            style={{
              left: `${b.left}%`,
              bottom: "-12vh",
              width: `${28 * b.scale}px`,
              height: `${38 * b.scale}px`,
              borderRadius: "50% 50% 45% 55% / 60% 60% 40% 40%",
              background: `hsl(${b.hue} 85% 62% / 0.95)`,
              boxShadow: "inset -5px -10px 0 rgba(0,0,0,0.06)",
              animation: `bday-float-up ${b.duration}s linear ${b.delay}s infinite`,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: "50%",
                bottom: "-32px",
                transform: "translateX(-50%)",
                width: "2px",
                height: `${30 * b.scale}px`,
                background: "rgba(0,0,0,0.25)",
              }}
            />
          </div>
        ))}
      </div>

      <div className="relative z-10 mx-4 max-w-lg w-full rounded-2xl border border-border bg-background/95 shadow-xl p-8 text-center space-y-4">
        <div className="text-4xl md:text-5xl font-extrabold leading-tight">🎈 {message} 🎉</div>
        <div className="text-muted-foreground">
          Wishing you an amazing day filled with PBs and good vibes!
        </div>
        <div className="pt-2">
          <Button className="rounded-full px-6" onClick={onClose}>Thanks!</Button>
        </div>
      </div>
    </div>
  );
}

function MetricsCard({ date }) {
  const [loading, setLoading] = useState(true);
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("metricsCollapsed") === "true"
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const m = await api.getMetrics(date);
        if (!alive) return;
        setWeightKg(m?.weightKg ?? "");
        setHeightCm(m?.heightCm ?? "");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [date]);

  useDebouncedEffect(() => {
    if (loading) return;
    (async () => {
      await api.setMetrics(date, {
        weightKg: (weightKg === "" ? null : Number(weightKg)),
        heightCm: (heightCm === "" ? null : Number(heightCm)),
      });
    })();
  }, [weightKg, heightCm, date, loading], 600);

  return (
    <div className="card p-4 md:p-5 flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <div className="font-semibold">Today’s Metrics</div>
        <Segmented
          value={collapsed ? "off" : "on"}
          onChange={(v) => {
            const next = v === "off";
            setCollapsed(next);
            localStorage.setItem("metricsCollapsed", String(next));
          }}
          options={[
            { value: "off", label: "Hide" },
            { value: "on",  label: "Show" },
          ]}
        />
      </div>

      {!collapsed && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="inline-flex items-center gap-2">
            <span className="small text-muted-foreground w-16">Weight</span>
            <input
              type="number"
              inputMode="decimal"
              className="h-10 w-[110px] rounded-lg border border-input bg-background px-3 text-right outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring"
              placeholder="kg"
              value={weightKg}
              onChange={(e)=>setWeightKg(e.target.value)}
            />
            <span className="opacity-75 small">kg</span>
          </label>

          <label className="inline-flex items-center gap-2">
            <span className="small text-muted-foreground w-16">Height</span>
            <input
              type="number"
              inputMode="decimal"
              className="h-10 w-[110px] rounded-lg border border-input bg-background px-3 text-right outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring"
              placeholder="cm"
              value={heightCm}
              onChange={(e)=>setHeightCm(e.target.value)}
            />
            <span className="opacity-75 small">cm</span>
          </label>

          {(weightKg !== "" || heightCm !== "") && (
            <span className="small text-muted-foreground">Autosaved</span>
          )}
        </div>
      )}
    </div>
  );
}

function TaskCard({ item, onChanged }) {
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(item.notes || "");
  const [rpe, setRpe] = useState(item.rpe ?? "");
  const [weight, setWeight] = useState(item.weight ?? item.meta?.weight ?? "");
  const [showFeedback, setShowFeedback] = useState(false);

  const [moving, setMoving] = useState(false);
  const [moveDate, setMoveDate] = useState(dayjs().format("YYYY-MM-DD"));

  async function moveToSelected() {
    const dest = dayjs(moveDate).format("YYYY-MM-DD");
    await api.moveDaily(item._id, dest);
    setMoving(false);
    await onChanged?.({ from: dayjs(item.date).format("YYYY-MM-DD"), to: dest, jumpTo: false });
  }
  async function moveToToday() {
    const todayStr = dayjs().format("YYYY-MM-DD");
    await api.moveDaily(item._id, todayStr);
    setMoving(false);
    await onChanged?.({ from: dayjs(item.date).format("YYYY-MM-DD"), to: todayStr, jumpTo: true });
  }

  const [customReps, setCustomReps] = useState("");
  async function addCustom() {
    const n = Number(customReps);
    if (!Number.isFinite(n) || n <= 0) return;
    await add(n);
    setCustomReps("");
  }

  const isGym = item?.templateId?.kind === "gym";
  const unit = isGym ? "reps" : (item?.templateId?.unit || "reps");

  const repsPerSet = Number(item?.templateId?.defaultSetSize ?? 0);
  const plannedRaw = Array.isArray(item?.setsPlanned) ? item.setsPlanned : [];
  const planned = plannedRaw.map(n => Number(n));

  const setsCountFromPlanned = planned.length === 1 && Number.isFinite(planned[0]) ? Number(planned[0]) : 0;
  const setsFromTpl = (Number(item?.templateId?.dailyTarget ?? 0) || setsCountFromPlanned);
  const looksLikeSizes =
    planned.length > 0 &&
    !(planned.length === 1 && planned[0] === setsFromTpl) &&
    planned.some(n => Number.isFinite(n) && n > 1);

  const sumPlanned = looksLikeSizes
    ? planned.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0)
    : 0;

  const computedTargetReps = looksLikeSizes
    ? sumPlanned
    : (setsFromTpl > 0 && repsPerSet > 0 ? setsFromTpl * repsPerSet : 0);

  const backendTarget = Number(item?.target || 0);
  const done = Number(item.repsDone || 0);
  const target = isGym ? (computedTargetReps > 0 ? computedTargetReps : backendTarget) : backendTarget;
  const pct = Math.min(1, done / Math.max(1, target));

  // ---- NEW: per-set planned weights and "next set weight" input ----
  const plannedWeights = Array.isArray(item?.weightsPlanned) ? item.weightsPlanned.map(Number) : [];
  const nextIndex = (item.setsDone?.length ?? 0);
  const nextSetSize = looksLikeSizes ? ((planned[nextIndex] ?? repsPerSet) || 10) : (repsPerSet || 10);
  const plannedText = looksLikeSizes ? planned.join(" / ") : (setsFromTpl > 0 ? String(setsFromTpl) : (planned.length ? String(planned[0]) : "—"));

  // default the "nextSetWeight" to the planned weight for that set (if any)
  const [nextSetWeight, setNextSetWeight] = useState(() => {
    const w = plannedWeights[nextIndex];
    return Number.isFinite(w) ? String(w) : "";
  });

  // keep it in sync when you complete sets or when planned changes
  useEffect(() => {
    const w = plannedWeights[nextIndex];
    setNextSetWeight(Number.isFinite(w) ? String(w) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextIndex, item._id]); // item changes when plan reloads

  async function add(n) {
    await api.addReps(item._id, n);
    await onChanged();
  }

  async function completeSet() {
    const size = nextSetSize;
    const wNum = Number(nextSetWeight);
    const weightForSet = (isGym && Number.isFinite(wNum)) ? wNum : undefined;
    await api.completeSet(item._id, size, weightForSet);
    await onChanged();
  }

  async function undo() {
    await api.undoLast(item._id);
    await onChanged();
  }

  async function saveMeta() {
    try {
      setSaving(true);
      await api.setMeta(item._id, { notes, rpe: rpe === "" ? null : Number(rpe) });
      await onChanged();
    } finally {
      setSaving(false);
    }
  }

  // Auto-save legacy day weight field for gym items (unchanged)
  useDebouncedEffect(() => {
    if (!isGym) return;
    (async () => {
      await api.setMeta(item._id, { weight: weight === "" ? null : Number(weight) });
      await onChanged();
    })();
  }, [weight], 600);

  const targetWeight = isGym ? (item?.templateId?.weight ?? null) : null;
  const showTargetWeightText = isGym && Number(targetWeight) > 0;

  return (
    <div className="card p-4 md:p-6 space-y-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="shrink-0">
          <ProgressRing size={48} stroke={7} value={pct} />
        </div>
        <div className="mr-auto min-w-0">
          <div className="font-semibold truncate">{item?.templateId?.name || "Task"}</div>
          <div className="small text-muted-foreground">
            {done}/{target} {unit}{showTargetWeightText ? ` • ${targetWeight}kg` : ""}
          </div>
        </div>
        <div className="hidden sm:block small px-2 py-0.5 rounded-full border border-border capitalize shrink-0">
          {item.status}
        </div>
      </div>

      {/* ---- NEW: Next-set weight row (shows only for gym) ---- */}
      {isGym && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="small text-muted-foreground">Next set:</div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-input bg-background px-2 py-1">
            <span className="small">Weight</span>
            <button
              type="button"
              className="px-2 rounded-md border border-input hover:bg-muted"
              onClick={() => setNextSetWeight(prev => {
                const n = Number(prev);
                return Number.isFinite(n) ? String(Math.max(0, n - 2.5)) : "0";
              })}
            >−</button>
            <input
              type="number"
              inputMode="decimal"
              className="h-9 w-[90px] rounded-md border border-input bg-background px-3 text-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring"
              placeholder={plannedWeights[nextIndex] != null ? String(plannedWeights[nextIndex]) : "kg"}
              value={nextSetWeight}
              onChange={(e) => setNextSetWeight(e.target.value)}
            />
            <span className="opacity-75 small">kg</span>
            <button
              type="button"
              className="px-2 rounded-md border border-input hover:bg-muted"
              onClick={() => setNextSetWeight(prev => {
                const n = Number(prev);
                return Number.isFinite(n) ? String(n + 2.5) : "2.5";
              })}
            >+</button>
          </div>
          {Number.isFinite(Number(plannedWeights[nextIndex])) && (
            <div className="small text-muted-foreground">
              Planned: <span className="font-medium">{plannedWeights[nextIndex]} kg</span>
            </div>
          )}
        </div>
      )}

      {/* ===== MOBILE ACTIONS ===== */}
      <div className="sm:hidden space-y-2">
        <Button className="w-full rounded-full h-11" onClick={completeSet}>
          Complete set (+{nextSetSize})
        </Button>

        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" className="rounded-full h-10" onClick={() => add(1)}>+1</Button>
          <Button variant="outline" className="rounded-full h-10" onClick={() => add(5)}>+5</Button>
          <Button variant="outline" className="rounded-full h-10" onClick={undo}>Undo</Button>
        </div>

        {!moving ? (
          <Button
            variant="outline"
            className="w-full rounded-full h-10 text-[13px]"
            onClick={() => {
              setMoveDate(dayjs(item.date).format("YYYY-MM-DD"));
              setMoving(true);
            }}
          >
            Another day…
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <DatePicker value={moveDate} onChange={setMoveDate} />
            <Button className="rounded-full" onClick={moveToSelected}>Move</Button>
            <Button variant="outline" className="rounded-full" onClick={() => setMoving(false)}>Cancel</Button>
          </div>
        )}
      </div>

      {/* ===== DESKTOP/TABLET ACTIONS ===== */}
      <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-2">
        <Button className="rounded-full px-4" onClick={completeSet}>
          Complete set (+{nextSetSize})
        </Button>
        <Button variant="outline" className="rounded-full px-3" onClick={() => add(10)}>+10</Button>
        <Button variant="outline" className="rounded-full px-3" onClick={() => add(5)}>+5</Button>
        <Button variant="outline" className="rounded-full px-3" onClick={() => add(1)}>+1</Button>

        <div className="hidden md:inline-flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            min={1}
            placeholder="+"
            value={customReps}
            onChange={(e) => setCustomReps(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }}
            className="h-9 w-14 rounded-full px-3 text-center border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring transition-colors hover:bg-muted"
          />
          <Button
            variant="outline"
            className="rounded-full px-3"
            onClick={addCustom}
            disabled={!customReps || Number(customReps) <= 0}
          >
            Add
          </Button>
        </div>

        <Button variant="outline" className="rounded-full px-3" onClick={undo}>Undo</Button>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => setShowFeedback((s) => !s)}
          >
            {showFeedback ? "Hide feedback" : "Add feedback"}
          </Button>

          {dayjs(item.date).format("YYYY-MM-DD") !== dayjs().format("YYYY-MM-DD") && (
            <Button variant="outline" size="sm" className="rounded-full" onClick={moveToToday}>
              Do today
            </Button>
          )}

          {!moving ? (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => {
                setMoveDate(dayjs(item.date).format("YYYY-MM-DD"));
                setMoving(true);
              }}
            >
              Do on another day…
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <DatePicker value={moveDate} onChange={setMoveDate} />
              <Button size="sm" className="rounded-full" onClick={moveToSelected}>Move</Button>
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => setMoving(false)}>Cancel</Button>
            </div>
          )}
        </div>
      </div>

      {showFeedback && (
        <div className="hidden sm:grid grid-cols-1 md:grid-cols:[1fr_220px] gap-3 items-start">
          <Textarea
            className="h-[88px]"
            placeholder="How did it feel?"
            value={notes}
            onChange={(e)=>setNotes(e.target.value)}
          />
          <div className="flex flex-col gap-2 md:h-[88px]">
            <Input
              type="number"
              min="1"
              max="10"
              placeholder="RPE"
              value={rpe}
              onChange={(e)=>setRpe(e.target.value)}
              className="h-full md:h-0 flex-1 text-center"
            />
            <Button onClick={saveMeta} disabled={saving} className="h-full md:h-0 flex-1">
              {saving ? "Saving…" : "Save notes/RPE"}
            </Button>
          </div>
        </div>
      )}

      <div className="small text-muted-foreground">Planned sets: {plannedText}</div>
    </div>
  );
}

/** Robust: is a template active on a date?
 * Accepts 0–6, 1–7, "Mon"/"Tue"... strings, boolean arrays, or empty (-> every day).
 */
function isActiveOnDate(tpl, dateStr) {
  const d = dayjs(dateStr);

  const startOk = !tpl.schedule?.startDate || !d.isBefore(dayjs(tpl.schedule.startDate), "day");
  const endOk   = !tpl.schedule?.endDate   || !d.isAfter(dayjs(tpl.schedule.endDate), "day");
  if (!startOk || !endOk) return false;

  const type = tpl.schedule?.type || "weekly";
  if (type !== "weekly") return true;

  const raw = tpl.schedule?.daysOfWeek ?? [];

  const isBoolArr = Array.isArray(raw) && raw.length && raw.every(v => typeof v === "boolean");
  if (isBoolArr) {
    const nums = raw.map((v, idx) => (v ? idx : -1)).filter(n => n >= 0);
    if (!nums.length) return true;
    const sun0 = d.day();
    const mon1 = ((sun0 + 6) % 7) + 1;
    return nums.includes(sun0) || nums.includes(mon1);
  }

  const DAY_MAP = { sun:0, mon:1, tue:2, tues:2, wed:3, thu:4, thur:4, thurs:4, fri:5, sat:6 };
  const norm = []
    .concat(raw)
    .map(v => {
      if (typeof v === "number") return v;
      if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        if (/^\d+$/.test(s)) return Number(s);
        return DAY_MAP[s];
      }
      return undefined;
    })
    .filter(v => Number.isFinite(v));

  if (!norm.length) return true;

  const sun0 = d.day();
  const mon1 = ((sun0 + 6) % 7) + 1;
  return norm.includes(sun0) || norm.includes(mon1);
}

// ✅ Prefer the real "group" name if present, then fall back gracefully.
function pickGroupLabel(tpl) {
  const candidates = [
    tpl?.group,
    tpl?.groupName,
    tpl?.templateGroup,
    tpl?.label,
    tpl?.name,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return ""; // no label -> skip
}

function Segmented({ value, onChange, options, className = "" }) {
  return (
    <div className={["inline-flex h-10 items-center rounded-lg border border-input bg-muted px-1", "max-w-full", className].join(" ")}>
      {options.map(({ value: v, label }) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={[
              "px-3 py-1.5 rounded-md text-sm font-medium transition",
              "whitespace-nowrap",
              active ? "bg-background text-foreground shadow-sm border border-input" : "text-muted-foreground"
            ].join(" ")}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export default function Today() {
  const [items, setItems] = useState([]);
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));

  const [loadingPlan, setLoadingPlan] = useState(true);
  const [planLoadedOnce, setPlanLoadedOnce] = useState(false);

  const [visibleMonth, setVisibleMonth] = useState(dayjs());
  const [statusByDate, setStatusByDate] = useState({});
  const [groupsByDate, setGroupsByDate] = useState({});
  const [templates, setTemplates] = useState([]);

  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkToDate, setBulkToDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [bulkBusy, setBulkBusy] = useState(false);

  const [me, setMe] = useState(null);
  const [showBday, setShowBday] = useState(false);

  const handleItemChanged = async ({ from, to, jumpTo } = {}) => {
    await loadPlan(date);
    await loadRollingCalendarData(visibleMonth, 4, templates);
    if (jumpTo && to) setDate(to);
  };

  async function loadPlan(d = date) {
    setLoadingPlan(true);
    try {
      const plan = await api.getPlan(d);
      setItems(plan || []);
      setPlanLoadedOnce(true);
    } finally {
      setLoadingPlan(false);
    }
  }

  // Load templates and return them so callers can recompute with freshest data
  async function loadTemplates() {
    try {
      const tpl = (await api.listTemplates?.()) ??
                  (await api.getTemplates?.()) ??
                  (await api.templates?.list?.()) ??
                  [];
      const list = Array.isArray(tpl) ? tpl : [];
      setTemplates(list);
      return list;
    } catch {
      setTemplates([]);
      return [];
    }
  }

  // Compute calendar heat map + groups (optionally with a fresh templates list to avoid races)
  async function loadRollingCalendarData(anchorMonth = visibleMonth, monthsAhead = 4, templatesOverride = null) {
    const startOfMonth = anchorMonth.startOf("month");
    const gridStart = startOfMonth.subtract(startOfMonth.day(), "day");
    const endMonth = anchorMonth.add(monthsAhead, "month").endOf("month");
    const gridEnd = endMonth.add(6 - endMonth.day(), "day");

    const from = gridStart.format("YYYY-MM-DD");
    const to = gridEnd.format("YYYY-MM-DD");

    const s = await api.statsSummary(from, to);

    const todayStr = dayjs().format("YYYY-MM-DD");
    const statusMap = {};
    for (const d of s?.days ?? []) {
      if (d.date === todayStr) {
        const done = Number(d?.done ?? 0);
        const target = Number(d?.target ?? 0);
        let status = "none";
        if (target > 0) {
          if (done >= target) status = "done";
          else if (done > 0) status = "partial";
          else status = "missed";
        } else if (done > 0) {
          status = "partial";
        }
        statusMap[d.date] = status;
      } else {
        statusMap[d.date] = "none";
      }
    }
    setStatusByDate(statusMap);

    // Base groups from API (unique)
    const gmap = {};
    for (const d of s?.days ?? []) {
      gmap[d.date] = Array.isArray(d.groups) ? [...new Set(d.groups)] : [];
    }

    // Merge recurring template groups
    const tplList = Array.isArray(templatesOverride) ? templatesOverride : (Array.isArray(templates) ? templates : []);
    if (tplList.length) {
      let cursor = gridStart;
      while (!cursor.isAfter(gridEnd, "day")) {
        const ds = cursor.format("YYYY-MM-DD");
        const set = new Set(gmap[ds] || []);
        for (const tpl of tplList) {
          const grp = pickGroupLabel(tpl);
          if (!grp) continue;
          if (isActiveOnDate(tpl, ds)) set.add(grp);
        }
        gmap[ds] = Array.from(set);
        cursor = cursor.add(1, "day");
      }
    }

    setGroupsByDate(gmap);
  }

  async function refreshAll(d = date) {
    await Promise.all([loadPlan(d), loadRollingCalendarData(visibleMonth, 4, templates)]);
  }

  async function bulkMove(to) {
    setBulkBusy(true);
    try {
      await api.moveDay(date, to);
      const dest = dayjs(to).format("YYYY-MM-DD");
      setDate(dest);
      await refreshAll(dest);
    } finally {
      setBulkBusy(false);
      setBulkMoveOpen(false);
    }
  }
  async function bulkMoveToToday() {
    await bulkMove(dayjs().format("YYYY-MM-DD"));
  }

  useEffect(() => {
    (async () => {
      await loadPlan(date);
      setVisibleMonth(dayjs(date));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // INITIAL LOAD: fetch templates, then compute with the fetched list
  useEffect(() => {
    (async () => {
      const latest = await loadTemplates();
      await loadRollingCalendarData(visibleMonth, 4, latest);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recompute when month or templates actually change
  useEffect(() => {
    loadRollingCalendarData(visibleMonth, 4, templates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleMonth, templates]);

  // Template bus / storage / tab-visibility — always refetch then recompute with newest list
  useEffect(() => {
    const handler = () => {
      (async () => {
        const latest = await loadTemplates();
        await loadPlan(date);
        await loadRollingCalendarData(visibleMonth, 4, latest);
      })();
    };

    appBus.addEventListener("templates:changed", handler);
    const onStorage = (e) => { if (e.key === "templates:changed") handler(); };
    window.addEventListener("storage", onStorage);
    const onVisibility = () => { if (!document.hidden) handler(); };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      appBus.removeEventListener("templates:changed", handler);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, visibleMonth]);

  // birthday check on mount
  useEffect(() => {
    (async () => {
      try {
        const m = await api.me();
        setMe(m);
        const emails = (import.meta.env.VITE_BDAY_EMAILS || "")
          .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
        const okEmail = emails.includes((m?.email || "").toLowerCase());
        const tz = getBrowserTimeZone();
        const override = bdayTestOverride();
        const isRealBirthday = isMonthDayInTz(tz, "08", "16");
        const shouldShow = override || (okEmail && isRealBirthday);
        const todayInTz = new Intl.DateTimeFormat("en-CA", {
          timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date());
        const seenKey = `bday-shown:${(m?.email || "unknown").toLowerCase()}:${todayInTz}`;
        const alreadyShown = localStorage.getItem(seenKey);
        if (shouldShow && !alreadyShown) {
          setShowBday(true);
          localStorage.setItem(seenKey, "1");
        }
      } catch {}
    })();
  }, []);

  function prevDay() { setDate(dayjs(date).subtract(1, "day").format("YYYY-MM-DD")); }
  function nextDay() { setDate(dayjs(date).add(1, "day").format("YYYY-MM-DD")); }
  function today()   { setDate(dayjs().format("YYYY-MM-DD")); }

  const grouped = Object.entries(
    (items || []).reduce((acc, it) => {
      const g = (it.group || it.templateId?.group || "").trim() || "Ungrouped";
      if (!acc[g]) acc[g] = [];
      acc[g].push(it);
      return acc;
    }, {})
  ).sort(([ga], [gb]) => ga.localeCompare(gb));

  return (
    <div className="stack">
      <div className="card p-3 md:p-4 flex flex-wrap items-center gap-1.5">
        {/* Left: arrows + date */}
        <div
          className={[
            "flex items-center gap-1.5 min-w-0",
            "flex-1",
            bulkMoveOpen ? "hidden sm:flex" : ""
          ].join(" ")}
        >
          <Button variant="outline" size="icon" onClick={prevDay} aria-label="Previous day">←</Button>

          <div className="min-w-0 w-auto sm:flex-1">
            <DatePicker value={date} onChange={setDate} className="w-full" />
          </div>

          <Button variant="outline" size="icon" onClick={nextDay} aria-label="Next day">→</Button>
          <Button variant="outline" onClick={today} className="hidden sm:inline-flex">Today</Button>
        </div>

        {/* Right: bulk move controls */}
        <div
          className={[
            "flex items-center gap-1.5 shrink-0",
            bulkMoveOpen ? "ml-0 w-full justify-start sm:ml-auto sm:w-auto" : "ml-auto"
          ].join(" ")}
        >
          {dayjs(date).format("YYYY-MM-DD") !== dayjs().format("YYYY-MM-DD") && (
            <Button
              variant="outline"
              onClick={bulkMoveToToday}
              disabled={bulkBusy}
              className="h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm"
            >
              <span className="sm:hidden">Move to today</span>
              <span className="hidden sm:inline">Move all to today</span>
            </Button>
          )}

          {!bulkMoveOpen ? (
            <Button
              variant="outline"
              onClick={() => {
                setBulkToDate(dayjs(date).format("YYYY-MM-DD"));
                setBulkMoveOpen(true);
              }}
              className="h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm"
            >
              <span className="sm:hidden">Move…</span>
              <span className="hidden sm:inline">Move all…</span>
            </Button>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="w-[9.5rem] sm:w-auto">
                <DatePicker value={bulkToDate} onChange={setBulkToDate} className="w-full" />
              </div>
              <Button onClick={() => bulkMove(bulkToDate)} disabled={bulkBusy} className="h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm">
                Move
              </Button>
              <Button
                variant="outline"
                onClick={() => setBulkMoveOpen(false)}
                disabled={bulkBusy}
                className="h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm"
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>
      {loadingPlan && !planLoadedOnce ? null : (
        grouped.map(([groupName, rows]) => (
          <div key={groupName} className="space-y-3">
            <div className="px-1 text-sm font-semibold text-muted-foreground">{groupName}</div>
            {rows.map((it) => (
              <TaskCard key={it._id} item={it} onChanged={handleItemChanged} />
            ))}
          </div>
        ))
      )}

      <MetricsCard date={date} />

      {planLoadedOnce && (
        <MonthCalendar
          month={visibleMonth}
          statusByDate={statusByDate}
          groupsByDate={groupsByDate}
          selectedDate={date}
          onPrev={() => {
            const prev = visibleMonth.subtract(1, "month");
            setVisibleMonth(prev);
            const dayNum = dayjs(date).date();
            const clamped = Math.min(dayNum, prev.daysInMonth());
            setDate(prev.date(clamped).format("YYYY-MM-DD"));
          }}
          onNext={() => {
            const next = visibleMonth.add(1, "month");
            setVisibleMonth(next);
            const dayNum = dayjs(date).date();
            const clamped = Math.min(dayNum, next.daysInMonth());
            let newSel = next.date(clamped);
            if (newSel.isAfter(dayjs(), "day")) newSel = dayjs();
            setDate(newSel.format("YYYY-MM-DD"));
          }}
          onSelect={(dateStr) => setDate(dateStr)}
        />
      )}

      {showBday && (
        <BirthdayOverlay message="Happy Birthday Jenn" onClose={() => setShowBday(false)} />
      )}
    </div>
  );
}