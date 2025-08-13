import React from "react";

/** days: [{ date: 'YYYY-MM-DD', scheduled: bool, met: bool }] */
export default function CalendarHeatmap({ days = [], onClick }) {
  if (!days.length) return null;
  // show last 35 days (5 rows x 7)
  const last35 = days.slice(-35);
  return (
    <div className="grid grid-cols-7 gap-1 p-3 rounded-xl border border-border bg-card">
      {last35.map((d) => {
        let bg = "bg-muted"; // default/unscheduled -> theme aware
        if (d.scheduled) bg = d.met ? "bg-emerald-500/80" : "bg-rose-500/80";
        return (
          <button
            key={d.date}
            title={`${d.date}${d.scheduled ? d.met ? " ✓" : " ✕" : ""}`}
            onClick={() => onClick?.(d.date)}
            className={`h-5 w-5 rounded-md ${bg} hover:outline hover:outline-2 hover:outline-[var(--ring)]`}
          />
        );
      })}
    </div>
  );
}