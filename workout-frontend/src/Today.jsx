import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import { api } from "./api";
import { Button } from "./components/ui/button";
import DatePicker from "./DatePicker.jsx";
import ProgressRing from "./components/ProgressRing.jsx";
import MonthCalendar from "./components/MonthCalendar.jsx";
import { appBus } from "./bus";

function TaskCard({ item, onChanged }) {
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(item.notes || "");
  const [rpe, setRpe] = useState(item.rpe ?? "");
  const target = item.target || 0;
  const done = item.repsDone || 0;
  const pct = Math.min(1, done / Math.max(1, target));

  async function add(n){ await api.addReps(item._id, n); await onChanged(); }
  async function completeSet(){
    const size = item.setsPlanned?.[item.setsDone?.length ?? 0] || (item.templateId?.defaultSetSize || 10);
    await api.completeSet(item._id, size); await onChanged();
  }
  async function undo(){ await api.undoLast(item._id); await onChanged(); }
  async function saveMeta(){
    try { setSaving(true);
      await api.setMeta(item._id, { notes, rpe: rpe === "" ? null : Number(rpe) });
      await onChanged();
    } finally { setSaving(false); }
  }

  return (
    <div className="card p-5 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <ProgressRing size={56} stroke={8} value={pct} />
        <div className="mr-auto">
          <div className="font-semibold">{item?.templateId?.name || "Task"}</div>
          <div className="small text-muted-foreground">{done}/{target} reps</div>
        </div>
        <div className="small px-2 py-0.5 rounded-full border border-border">{item.status}</div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button className="rounded-full px-4" onClick={completeSet}>Complete set (+{item.setsPlanned?.[0] || 10})</Button>
        <Button variant="outline" className="rounded-full px-3" onClick={()=>add(10)}>+10</Button>
        <Button variant="outline" className="rounded-full px-3" onClick={()=>add(5)}>+5</Button>
        <Button variant="outline" className="rounded-full px-3" onClick={()=>add(1)}>+1</Button>
        <Button variant="outline" className="rounded-full px-3" onClick={undo}>Undo</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-3 items-start">
        <textarea
          className="w-full bg-[#0b1324] border border-border rounded-xl h-[88px] p-3 placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          placeholder="How did it feel?"
          value={notes} onChange={(e)=>setNotes(e.target.value)}
        />
        <input
          type="number" min="1" max="10"
          className="bg-[#0b1324] border border-border rounded-xl p-3 text-center focus-visible:ring-2 focus-visible:ring-primary/50"
          value={rpe} onChange={(e)=>setRpe(e.target.value)}
          placeholder="RPE"
        />
        <Button onClick={saveMeta} disabled={saving}>{saving ? "Saving…" : "Save notes/RPE"}</Button>
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

  // flags to control render order
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [planLoadedOnce, setPlanLoadedOnce] = useState(false);

  // Calendar view + colors
  const [visibleMonth, setVisibleMonth] = useState(dayjs()); // month being displayed
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
    const to   = m.endOf("month").format("YYYY-MM-DD");
    const s = await api.statsSummary(from, to);

    const map = {};
    for (const d of (s?.days ?? [])) {
      const done = Number(d?.done ?? 0);
      const target = Number(d?.target ?? 0);
      let status = "none";
      if (target > 0) {
        if (done >= target) status = "done";
        else if (done > 0)  status = "partial";
        else                status = "missed";
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

  // sync plan + calendar month with selected date
  useEffect(() => {
    loadPlan(date);
    setVisibleMonth(dayjs(date));
  }, [date]);

  useEffect(() => {
    loadMonthStatus(visibleMonth);
  }, [visibleMonth]);

  useEffect(() => {
  const handler = () => {
    // re-pull today’s plan and the month colors
    refreshAll(date);
  };
  appBus.addEventListener("templates:changed", handler);
  return () => appBus.removeEventListener("templates:changed", handler);
}, [date]); // keep selection in sync

  function prevDay() { setDate(dayjs(date).subtract(1, "day").format("YYYY-MM-DD")); }
  function nextDay() { setDate(dayjs(date).add(1, "day").format("YYYY-MM-DD")); }
  function today()   { setDate(dayjs().format("YYYY-MM-DD")); }

  return (
    <div className="stack">
      {/* Date bar */}
      <div className="card p-3 md:p-4 flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={prevDay}>←</Button>
        <DatePicker value={date} onChange={setDate} />
        <Button variant="outline" size="icon" onClick={nextDay}>→</Button>
        <Button variant="outline" onClick={today}>Today</Button>
      </div>

      {/* Tasks first, calendar stays at bottom */}
      {loadingPlan && !planLoadedOnce ? null : (
        items.map((it) => (
          <TaskCard key={it._id} item={it} onChanged={() => refreshAll(date)} />
        ))
      )}

      {/* Calendar at the bottom; selected day highlight persists */}
      {planLoadedOnce && (
        <MonthCalendar
          month={visibleMonth}
          statusByDate={statusByDate}
          selectedDate={date}
          onPrev={() => {
            const prev = visibleMonth.subtract(1, "month");
            setVisibleMonth(prev);
            // keep same day number where possible (don’t auto-skip to today)
            const dayNum = dayjs(date).date();
            const clamped = Math.min(dayNum, prev.daysInMonth());
            setDate(prev.date(clamped).format("YYYY-MM-DD"));
          }}
          onNext={() => {
            // allow navigating into the future (view)
            const next = visibleMonth.add(1, "month");
            setVisibleMonth(next);

            // keep same day number; clamp selection to today if it would be future
            const dayNum = dayjs(date).date();
            const clamped = Math.min(dayNum, next.daysInMonth());
            let newSel = next.date(clamped);
            if (newSel.isAfter(dayjs(), "day")) newSel = dayjs(); // prevent selecting future day
            setDate(newSel.format("YYYY-MM-DD"));
          }}
          onSelect={(dateStr) => setDate(dateStr)}
        />
      )}
    </div>
  );
}