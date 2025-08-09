import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import { api } from "./api";
import { Button } from "./components/ui/button";
import DatePicker from "./DatePicker.jsx";
import ProgressRing from "./components/ProgressRing.jsx";
import MonthCalendar from "./components/MonthCalendar.jsx";

function TaskCardSkeleton() {
  return (
    <div className="card p-5 md:p-6 space-y-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 rounded-full bg-white/10" />
        <div className="mr-auto space-y-2 w-1/2">
          <div className="h-4 w-2/3 bg-white/10 rounded" />
          <div className="h-3 w-1/3 bg-white/10 rounded" />
        </div>
        <div className="h-5 w-20 bg-white/10 rounded" />
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="h-9 w-36 bg-white/10 rounded-full" />
        <div className="h-9 w-14 bg-white/10 rounded-full" />
        <div className="h-9 w-14 bg-white/10 rounded-full" />
        <div className="h-9 w-14 bg-white/10 rounded-full" />
        <div className="h-9 w-16 bg-white/10 rounded-full" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-3">
        <div className="h-24 bg-white/10 rounded-xl" />
        <div className="h-11 bg-white/10 rounded-xl" />
        <div className="h-11 bg-white/10 rounded-xl" />
      </div>
    </div>
  );
}

function TaskCard({ item, reload }) {
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(item.notes || "");
  const [rpe, setRpe] = useState(item.rpe ?? "");
  const target = item.target || 0;
  const done = item.repsDone || 0;
  const pct = Math.min(1, done / Math.max(1, target));

  async function add(n){ await api.addReps(item._id, n); reload(); }
  async function completeSet(){
    const size = item.setsPlanned?.[item.setsDone?.length ?? 0] || (item.templateId?.defaultSetSize || 10);
    await api.completeSet(item._id, size); reload();
  }
  async function undo(){ await api.undoLast(item._id); reload(); }
  async function saveMeta(){
    try{ setSaving(true);
      await api.setMeta(item._id, { notes, rpe: rpe === "" ? null : Number(rpe) });
    } finally { setSaving(false); }
  }

  return (
    <div className="card p-5 md:p-6 space-y-4">
      {/* top row */}
      <div className="flex items-center gap-3">
        <ProgressRing size={56} stroke={8} value={pct} />
        <div className="mr-auto">
          <div className="font-semibold">{item?.templateId?.name || "Task"}</div>
          <div className="small text-muted-foreground">{done}/{target} reps</div>
        </div>
        <div className="small px-2 py-0.5 rounded-full border border-border">{item.status}</div>
      </div>

      {/* action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button className="rounded-full px-4" onClick={completeSet}>
          Complete set (+{item.setsPlanned?.[0] || 10})
        </Button>
        <Button variant="outline" className="rounded-full px-3" onClick={()=>add(10)}>+10</Button>
        <Button variant="outline" className="rounded-full px-3" onClick={()=>add(5)}>+5</Button>
        <Button variant="outline" className="rounded-full px-3" onClick={()=>add(1)}>+1</Button>
        <Button variant="outline" className="rounded-full px-3" onClick={undo}>Undo</Button>
      </div>

      {/* notes & rpe BELOW (spaced + uniform) */}
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
        <Button onClick={saveMeta} disabled={saving}>
          {saving ? "Saving…" : "Save notes/RPE"}
        </Button>
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

  // loading flags to control first render order
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [planLoadedOnce, setPlanLoadedOnce] = useState(false);

  // Calendar state
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
        // no target set but some reps logged → treat as partial progress
        status = "partial";
        }

        map[d.date] = status;
    }
    setStatusByDate(map);
  }

  useEffect(() => {
    loadPlan(date);
    setVisibleMonth(dayjs(date));
  }, [date]);

  useEffect(() => {
    loadMonthStatus(visibleMonth);
  }, [visibleMonth]);

  function prevDay() { setDate(dayjs(date).subtract(1, "day").format("YYYY-MM-DD")); }
  function nextDay() { setDate(dayjs(date).add(1, "day").format("YYYY-MM-DD")); }
  function today()   { setDate(dayjs().format("YYYY-MM-DD")); }

  return (
    <div className="stack">
      {/* date bar */}
      <div className="card p-3 md:p-4 flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={prevDay}>←</Button>
        <DatePicker value={date} onChange={setDate} />
        <Button variant="outline" size="icon" onClick={nextDay}>→</Button>
        <Button variant="outline" onClick={today}>Today</Button>
      </div>

      {/* tasks (skeleton first to reserve space, then real items) */}
      {loadingPlan && !planLoadedOnce ? (
        <>
          <TaskCardSkeleton />
          <TaskCardSkeleton />
        </>
      ) : (
        items.map((it) => (
          <TaskCard key={it._id} item={it} reload={() => loadPlan(date)} />
        ))
      )}

      {/* calendar renders ONLY after first plan load to prevent the "flash" up top */}
      {planLoadedOnce && (
        <MonthCalendar
          month={visibleMonth}
          statusByDate={statusByDate}
          onPrev={() => setVisibleMonth(m => m.subtract(1, "month"))}
          onNext={() => {
            const next = visibleMonth.add(1, "month");
            setVisibleMonth(dayjs.min(next, dayjs()));
          }}
          onSelect={(dateStr) => setDate(dateStr)}
        />
      )}
    </div>
  );
}