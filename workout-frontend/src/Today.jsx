import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import { api } from "./api";
import { Button } from "./components/ui/button";
import DatePicker from "./DatePicker.jsx";
import ProgressRing from "./components/ProgressRing.jsx";
import CalendarHeatmap from "./components/CalendarHeatmap.jsx";

export default function Today() {
  const [items, setItems] = useState([]);
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [daysSummary, setDaysSummary] = useState([]); // for heatmap

  async function loadPlan(d = date) {
    const plan = await api.getPlan(d);
    setItems(plan);
  }
  async function loadSummaryAround(d = date) {
    // pull ~6 weeks window for heatmap
    const from = dayjs(d).subtract(41, "day").format("YYYY-MM-DD");
    const to = dayjs(d).format("YYYY-MM-DD");
    const s = await api.statsSummary(from, to);
    setDaysSummary(s.days);
  }

  useEffect(() => { loadPlan(date); loadSummaryAround(date); }, [date]);

  function prevDay() { setDate(dayjs(date).subtract(1, "day").format("YYYY-MM-DD")); }
  function nextDay() { setDate(dayjs(date).add(1, "day").format("YYYY-MM-DD")); }
  function today()   { setDate(dayjs().format("YYYY-MM-DD")); }

  return (
    <div className="stack">
      {/* date bar */}
      <div className="card p-3 md:p-4 flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={prevDay}>←</Button>
        <div className="flex-1 min-w-[230px]">
          <DatePicker value={date} onChange={setDate} />
        </div>
        <Button variant="outline" size="icon" onClick={nextDay}>→</Button>
        <Button className="ml-auto" variant="outline" onClick={today}>Today</Button>
      </div>

      {/* heatmap */}
      <CalendarHeatmap days={daysSummary} onClick={setDate} />

      {/* tasks */}
      {items.map((it) => (
        <TaskCard key={it._id} item={it} reload={() => loadPlan(date)} />
      ))}
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