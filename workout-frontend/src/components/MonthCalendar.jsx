import React from "react";
import dayjs from "dayjs";

const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

/**
 * props:
 * - month: dayjs() anywhere inside the month to render
 * - statusByDate: { "YYYY-MM-DD": "done" | "missed" | "none" }
 * - onPrev(): go to previous month
 * - onNext(): go to next month
 * - onSelect(dateStr): click handler for a day (YYYY-MM-DD)
 */
export default function MonthCalendar({ month, statusByDate = {}, onPrev, onNext, onSelect }) {
  const startOfMonth = month.startOf("month");
  const endOfMonth = month.endOf("month");
  const daysInMonth = endOfMonth.date();
  const firstWeekday = startOfMonth.day(); // 0=Sun..6=Sat
  const totalCells = 42; // 6 rows x 7 cols

  const cells = [];
  const prevMonth = startOfMonth.subtract(1, "month");
  const prevMonthDays = prevMonth.daysInMonth();
  for (let i = 0; i < firstWeekday; i++) {
    const d = prevMonthDays - firstWeekday + 1 + i;
    const date = prevMonth.date(d);
    cells.push({ date, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = startOfMonth.date(d);
    cells.push({ date, inMonth: true });
  }
  const trailing = totalCells - cells.length;
  for (let i = 1; i <= trailing; i++) {
    const date = endOfMonth.add(i, "day");
    cells.push({ date, inMonth: false });
  }

  const todayStr = dayjs().format("YYYY-MM-DD");

  function colorFor(dateStr, inMonth) {
    const status = statusByDate[dateStr] || "none";
    if (!inMonth) return "bg-transparent text-muted-foreground/50 border-transparent";
    if (status === "done")     return "bg-emerald-600/30 border-emerald-600/50";
    if (status === "partial")  return "bg-amber-500/30 border-amber-500/50";
    if (status === "missed")   return "bg-rose-600/30 border-rose-600/50";
    return "bg-[#0b1324] border-border";
  }

  return (
    <div className="card p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-lg md:text-xl font-semibold">
          {startOfMonth.format("MMMM YYYY")}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onPrev}
            className="px-3 py-1 rounded-lg border border-border hover:bg-white/5 outline-none focus:outline-none"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={onNext}
            className="px-3 py-1 rounded-lg border border-border hover:bg-white/5 outline-none focus:outline-none"
          >
            ›
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-2 mb-2 small text-muted-foreground">
        {DOW.map(d => (
          <div key={d} className="text-center">{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-2">
        {cells.map(({ date, inMonth }, idx) => {
          const dateStr = date.format("YYYY-MM-DD");
          const isToday = dateStr === todayStr;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelect?.(dateStr)}
              className={[
                "h-16 md:h-20 lg:h-24 w-full",
                "rounded-xl border",
                "outline-none focus:outline-none focus:ring-0 active:ring-0 focus-visible:ring-0",
                colorFor(dateStr, inMonth),
                isToday ? "ring-1 ring-blue-500/70" : "",
                inMonth ? "hover:bg-white/5" : ""
              ].join(" ")}
              title={dateStr}
            >
              <div className="flex h-full w-full items-start justify-start p-2">
                <span className={inMonth ? "text-sm md:text-base" : "text-sm opacity-60"}>
                  {date.date()}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4 small text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-emerald-600/70 inline-block" />
          Done
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-amber-500/80 inline-block" />
          In progress
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-rose-600/70 inline-block" />
          Missed
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-[#0b1324] border border-border inline-block" />
          No data
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded ring-1 ring-blue-500 inline-block" />
          Today
        </span>
      </div>
    </div>
  );
}