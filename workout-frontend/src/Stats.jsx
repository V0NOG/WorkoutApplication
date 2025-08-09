import React, { useEffect, useState } from "react";
import { api } from "./api";
import dayjs from "dayjs";
import { Button } from "./components/ui/button";

function Bar({ label, value, max }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between small text-muted-foreground">
        <span>{label}</span><span>{value}</span>
      </div>
      <div className="h-2 rounded-full bg-[#0b1324] border border-border overflow-hidden">
        <div className="h-full bg-gradient-to-r from-blue-500 to-blue-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const step = 28;

export default function Stats() {
  const [range, setRange] = useState(() => ({
    from: dayjs().subtract(step-1, "day").format("YYYY-MM-DD"),
    to: dayjs().format("YYYY-MM-DD"),
  }));
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      setData(await api.statsSummary(range.from, range.to));
    })();
  }, [range]);

  const canNext = dayjs(range.to).isBefore(dayjs(), "day");
  function prev() {
    setRange(r => ({
      from: dayjs(r.from).subtract(step, "day").format("YYYY-MM-DD"),
      to:   dayjs(r.to).subtract(step, "day").format("YYYY-MM-DD"),
    }));
  }
  function next() {
    if (!canNext) return;
    const nextTo = dayjs(range.to).add(step, "day");
    const clampedTo = dayjs.min(nextTo, dayjs());
    const clampedFrom = clampedTo.subtract(step-1, "day");
    setRange({ from: clampedFrom.format("YYYY-MM-DD"), to: clampedTo.format("YYYY-MM-DD") });
  }
  function goToday() {
    setRange({
      from: dayjs().subtract(step-1, "day").format("YYYY-MM-DD"),
      to: dayjs().format("YYYY-MM-DD"),
    });
  }

  return (
    <div className="stack">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="small text-muted-foreground">Compliance</div>
          <div className="text-3xl font-bold">{data.compliancePct}%</div>
        </div>
        <div className="card p-5">
          <div className="small text-muted-foreground">Current streak</div>
          <div className="text-3xl font-bold">{data.currentStreak} days</div>
        </div>
        <div className="card p-5">
          <div className="small text-muted-foreground">Longest streak</div>
          <div className="text-3xl font-bold">{data.longestStreak} days</div>
        </div>
      </div>

      {/* Totals */}
      <div className="card p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Bar label="Total done" value={data.totals.done} max={Math.max(data.totals.done, data.totals.target)} />
          <Bar label="Total target" value={data.totals.target} max={Math.max(data.totals.done, data.totals.target)} />
        </div>
      </div>

      {/* Weekly breakdown */}
      <div className="card p-5 space-y-4">
        <div className="font-semibold">Weekly totals</div>
        <div className="grid gap-3">
          {data.weeks.map((w, i) => {
            const max = Math.max(w.done, w.target, 1);
            return (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between small text-muted-foreground">
                  <span>{w.from} → {w.to}</span>
                  <span>{w.done}/{w.target}</span>
                </div>
                <div className="h-2 rounded-full bg-[#0b1324] border border-border overflow-hidden">
                  <div className="h-full bg-blue-500" style={{ width: `${(w.done/max)*100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={prev}>Prev 4 weeks</Button>
        <Button variant="outline" onClick={goToday}>Today</Button>
        <Button onClick={next} disabled={!canNext}>Next 4 weeks</Button>
      </div>
    </div>
  );
}