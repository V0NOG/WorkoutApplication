import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { api } from "./api";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import DatePicker from "./DatePicker.jsx";
import ProgressRing from "./components/ProgressRing.jsx";
import MonthCalendar from "./components/MonthCalendar.jsx";
import { appBus } from "./bus";
import ThemeToggle from "./components/ThemeToggle.jsx";

function useDebouncedEffect(fn, deps, delay = 500) {
  useEffect(() => {
    const id = setTimeout(fn, delay);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, delay]);
}

function TaskCard({ item, onChanged }) {
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(item.notes || "");
  const [rpe, setRpe] = useState(item.rpe ?? "");
  const [weight, setWeight] = useState(item.weight ?? item.meta?.weight ?? ""); // user actual
  const [showFeedback, setShowFeedback] = useState(false); // feedback toggle (default hidden)

  // NEW: custom reps input
  const [customReps, setCustomReps] = useState("");
  async function addCustom() {
    const n = Number(customReps);
    if (!Number.isFinite(n) || n <= 0) return;
    await add(n);
    setCustomReps("");
  }

  const unit = item?.templateId?.unit || "reps";
  const target = Number(item.target || 0);
  const done = Number(item.repsDone || 0);
  const pct = Math.min(1, done / Math.max(1, target));

  const isGym = item?.templateId?.kind === "gym";
  const targetWeight = isGym ? (item?.templateId?.weight ?? null) : null;
  const showTargetWeightText = isGym && Number(targetWeight) > 0; // show "of Xkg" only when > 0

  async function add(n) { await api.addReps(item._id, n); await onChanged(); }
  async function completeSet() {
    const nextIndex = (item.setsDone?.length ?? 0);
    const size = item.setsPlanned?.[nextIndex] ?? item.templateId?.defaultSetSize ?? 10;
    await api.completeSet(item._id, size); await onChanged();
  }
  async function undo() { await api.undoLast(item._id); await onChanged(); }
  async function saveMeta() {
    try {
      setSaving(true);
      await api.setMeta(item._id, {
        notes,
        rpe: rpe === "" ? null : Number(rpe),
        // weight is autosaved separately
      });
      await onChanged();
    } finally { setSaving(false); }
  }

  // --- Autosave ACTUAL weight (debounced) ---
  useDebouncedEffect(() => {
    if (!isGym) return;
    (async () => {
      await api.setMeta(item._id, { weight: weight === "" ? null : Number(weight) });
      await onChanged();
    })();
  }, [weight], 600);

  const firstSetSize = item.setsPlanned?.[0] ?? item.templateId?.defaultSetSize ?? 10;

  return (
    <div className="card p-5 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <ProgressRing size={56} stroke={8} value={pct} />

        <div className="mr-auto min-w-0">
          <div className="font-semibold flex flex-wrap items-center gap-2">
            <span className="truncate">{item?.templateId?.name || "Task"}</span>

            {/* Show target + actual for Gym inline */}
            {isGym && (
              <>
                {targetWeight != null && Number(targetWeight) > 0 && (
                  <span className="small px-2 py-0.5 rounded-full border border-border">
                    Target: {targetWeight} kg
                  </span>
                )}

                <span className="small text-muted-foreground">•</span>

                <label className="inline-flex items-center gap-2 small">
                  <span className="opacity-80">Actual:</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="h-8 w-[90px] rounded-lg border border-input bg-background text-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring"
                    placeholder="kg"
                    value={weight}
                    onChange={(e)=>setWeight(e.target.value)}
                  />
                  <span className="opacity-80">kg</span>
                </label>
              </>
            )}
          </div>

          <div className="small text-muted-foreground">
            {done}/{target} {unit}{showTargetWeightText ? ` of ${targetWeight}kg` : ""}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="small px-2 py-0.5 rounded-full border border-border capitalize">
            {item.status}
          </div>
          {/* Toggle button to show/hide feedback inputs */}
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => setShowFeedback((s) => !s)}
          >
            {showFeedback ? "Hide feedback" : "Add feedback"}
          </Button>
        </div>
      </div>

      {/* Buttons + NEW custom reps */}
      <div className="flex flex-wrap items-center gap-2">
        <Button className="rounded-full px-4" onClick={completeSet}>
          Complete set (+{firstSetSize})
        </Button>
        <Button variant="outline" className="rounded-full px-3" onClick={()=>add(10)}>+10</Button>
        <Button variant="outline" className="rounded-full px-3" onClick={()=>add(5)}>+5</Button>
        <Button variant="outline" className="rounded-full px-3" onClick={()=>add(1)}>+1</Button>

        {/* NEW: custom reps input + Add (styled like +1) */}
        <div className="inline-flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            min={1}
            placeholder="reps"
            value={customReps}
            onChange={(e) => setCustomReps(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }}
            className={[
              "h-9 w-24 rounded-full px-3 text-center",
              "border border-input bg-background",
              "placeholder:text-muted-foreground",
              "focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring",
              "transition-colors hover:bg-muted"
            ].join(" ")}
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
      </div>

      {/* Notes / RPE / Save (toggled) */}
      {showFeedback && (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3 items-start">
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

      <div className="small text-muted-foreground">
        Planned sets: {item.setsPlanned?.join(" / ") || "—"}
      </div>
    </div>
  );
}

// --- helper: is a template active on a date? ---
function isActiveOnDate(tpl, dateStr) {
  const d = dayjs(dateStr);
  const startOk = !tpl.schedule?.startDate || !d.isBefore(dayjs(tpl.schedule.startDate), "day");
  const endOk = !tpl.schedule?.endDate || !d.isAfter(dayjs(tpl.schedule.endDate), "day");
  const type = tpl.schedule?.type || "weekly";
  const dowOk = type === "weekly" ? (tpl.schedule?.daysOfWeek || []).includes(d.day()) : false;
  return startOk && endOk && dowOk;
}

export default function Today() {
  const [items, setItems] = useState([]);
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));

  const [loadingPlan, setLoadingPlan] = useState(true);
  const [planLoadedOnce, setPlanLoadedOnce] = useState(false);

  const [visibleMonth, setVisibleMonth] = useState(dayjs());
  const [statusByDate, setStatusByDate] = useState({});
  const [groupsByDate, setGroupsByDate] = useState({}); // groups for MonthCalendar

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

  async function loadMonthStatus(m = visibleMonth) {
    const from = m.startOf("month").format("YYYY-MM-DD");
    const to = m.endOf("month").format("YYYY-MM-DD");
    const s = await api.statsSummary(from, to);

    const statusMap = {};
    for (const d of s?.days ?? []) {
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
    }
    setStatusByDate(statusMap);

    // Also compute groupsByDate for this visible month (client-side from templates)
    try {
      const tpls = await api.listTemplates();
      const gmap = {};
      for (let d = m.startOf("month"); !d.isAfter(m.endOf("month"), "day"); d = d.add(1, "day")) {
        const dateStr = d.format("YYYY-MM-DD");
        const groups = [];
        for (const t of tpls) {
          if (isActiveOnDate(t, dateStr)) {
            const g = (t.group || "Ungrouped").trim() || "Ungrouped";
            if (!groups.includes(g)) groups.push(g);
          }
        }
        if (groups.length) gmap[dateStr] = groups;
      }
      setGroupsByDate(gmap);
    } catch {
      setGroupsByDate({});
    }
  }

  async function refreshAll(d = date) {
    await Promise.all([loadPlan(d), loadMonthStatus(visibleMonth)]);
  }

  useEffect(() => { loadPlan(date); setVisibleMonth(dayjs(date)); }, [date]);
  useEffect(() => { loadMonthStatus(visibleMonth); }, [visibleMonth]);

  useEffect(() => {
    const handler = () => { (async () => { await Promise.all([loadPlan(date), loadMonthStatus(visibleMonth)]); })(); };
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
  }, [date, visibleMonth]);

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
      <div className="card p-3 md:p-4 flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={prevDay}>←</Button>
        <DatePicker value={date} onChange={setDate} />
        <Button variant="outline" size="icon" onClick={nextDay}>→</Button>
        <Button variant="outline" onClick={today}>Today</Button>
      </div>

      {loadingPlan && !planLoadedOnce ? null : (
        grouped.map(([groupName, rows]) => (
          <div key={groupName} className="space-y-3">
            <div className="px-1 text-sm font-semibold text-muted-foreground">{groupName}</div>
            {rows.map((it) => (
              <TaskCard key={it._id} item={it} onChanged={() => refreshAll(date)} />
            ))}
          </div>
        ))
      )}

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
    </div>
  );
}