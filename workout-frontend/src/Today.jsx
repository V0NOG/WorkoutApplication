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
import ThemeToggle from "./components/ThemeToggle.jsx";

function TaskCard({ item, onChanged }) {
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(item.notes || "");
  const [rpe, setRpe] = useState(item.rpe ?? "");
  const unit = item?.templateId?.unit || "reps";
  const target = Number(item.target || 0);
  const done = Number(item.repsDone || 0);
  const pct = Math.min(1, done / Math.max(1, target));

  async function add(n) { await api.addReps(item._id, n); await onChanged(); }
  async function completeSet() {
    const nextIndex = (item.setsDone?.length ?? 0);
    const size = item.setsPlanned?.[nextIndex] ?? item.templateId?.defaultSetSize ?? 10;
    await api.completeSet(item._id, size); await onChanged();
  }
  async function undo() { await api.undoLast(item._id); await onChanged(); }
  async function saveMeta() {
    try { setSaving(true);
      await api.setMeta(item._id, { notes, rpe: rpe === "" ? null : Number(rpe) });
      await onChanged();
    } finally { setSaving(false); }
  }

  const firstSetSize = item.setsPlanned?.[0] ?? item.templateId?.defaultSetSize ?? 10;

  return (
    <div className="card p-5 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <ProgressRing size={56} stroke={8} value={pct} />
        <div className="mr-auto">
          <div className="font-semibold">{item?.templateId?.name || "Task"}</div>
          <div className="small text-muted-foreground">
            {done}/{target} {unit}
          </div>
        </div>
        <div className="small px-2 py-0.5 rounded-full border border-border capitalize">
          {item.status}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button className="rounded-full px-4" onClick={completeSet}>Complete set (+{firstSetSize})</Button>
        <Button variant="outline" className="rounded-full px-3" onClick={()=>add(10)}>+10</Button>
        <Button variant="outline" className="rounded-full px-3" onClick={()=>add(5)}>+5</Button>
        <Button variant="outline" className="rounded-full px-3" onClick={()=>add(1)}>+1</Button>
        <Button variant="outline" className="rounded-full px-3" onClick={undo}>Undo</Button>
      </div>

      {/* Controls row */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3 items-start">
        {/* Notes */}
        <Textarea
          className="h-[88px]"               // ← reference height
          placeholder="How did it feel?"
          value={notes}
          onChange={(e)=>setNotes(e.target.value)}
        />

        {/* RPE + Save stacked to match the textarea height */}
        <div className="flex flex-col gap-2 md:h-[88px]">
          <Input
            type="number"
            min="1"
            max="10"
            placeholder="RPE"
            value={rpe}
            onChange={(e)=>setRpe(e.target.value)}
            className="text-center h-full md:h-0 flex-1"   // split the column height
          />

          <Button
            onClick={saveMeta}
            disabled={saving}
            className="h-full md:h-0 flex-1"               // split the column height
          >
            {saving ? "Saving…" : "Save notes/RPE"}
          </Button>
        </div>
      </div>


      <div className="small text-muted-foreground">
        Planned sets: {item.setsPlanned?.join(" / ") || "—"}
      </div>
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

    const map = {};
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
      map[d.date] = status;
    }
    setStatusByDate(map);
  }

  async function refreshAll(d = date) {
    await Promise.all([loadPlan(d), loadMonthStatus(visibleMonth)]);
  }

  useEffect(() => {
    loadPlan(date);
    setVisibleMonth(dayjs(date));
  }, [date]);

  useEffect(() => {
    loadMonthStatus(visibleMonth);
  }, [visibleMonth]);

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

  // Group items by group label
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
      {/* Date bar */}
      <div className="card p-3 md:p-4 flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={prevDay}>←</Button>
        <DatePicker value={date} onChange={setDate} />
        <Button variant="outline" size="icon" onClick={nextDay}>→</Button>
        <Button variant="outline" onClick={today}>Today</Button>
      </div>

      {/* Tasks grouped by group */}
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

      {/* Calendar */}
      {planLoadedOnce && (
        <MonthCalendar
          month={visibleMonth}
          statusByDate={statusByDate}
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