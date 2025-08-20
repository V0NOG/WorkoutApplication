import React from "react";
import dayjs from "dayjs";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function hueFromString(s = "") {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

function GroupPill({ name }) {
  const hue = hueFromString(name);
  const dot = `hsl(${hue} 80% 50%)`;
  return (
    <div
      className="flex items-center gap-2 rounded-md border border-border bg-background/70 px-2 py-0.5 text-[11px] leading-5 sm:text-xs"
      title={name}
    >
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: dot }} />
      <span className="truncate">{name}</span>
    </div>
  );
}

export default function MonthCalendar({
  month,
  statusByDate = {},
  groupsByDate = {},
  selectedDate,
  onPrev,
  onNext,
  onSelect,
}) {
  const startOfMonth = month.startOf("month");
  const endOfMonth = month.endOf("month");
  const daysInMonth = endOfMonth.date();
  const firstWeekday = startOfMonth.day();
  const totalCells = 42;

  // Build 42-day grid
  const cells = [];
  const prevMonth = startOfMonth.subtract(1, "month");
  const prevMonthDays = prevMonth.daysInMonth();
  for (let i = 0; i < firstWeekday; i++) {
    const d = prevMonthDays - firstWeekday + 1 + i;
    cells.push({ date: prevMonth.date(d), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: startOfMonth.date(d), inMonth: true });
  }
  const trailing = totalCells - cells.length;
  for (let i = 1; i <= trailing; i++) {
    cells.push({ date: endOfMonth.add(i, "day"), inMonth: false });
  }

  const todayStr = dayjs().format("YYYY-MM-DD");

  function colorFor(dateStr, inMonth) {
    const status = statusByDate[dateStr] || "none";
    if (!inMonth) return "bg-transparent text-muted-foreground/50 border-transparent";
    if (status === "done") return "bg-emerald-600/30 border-emerald-600/50";
    if (status === "partial") return "bg-amber-500/30 border-amber-500/50";
    if (status === "missed") return "bg-rose-600/30 border-rose-600/50";
    return "bg-secondary border-border";
  }

  return (
    <div className="card p-3 sm:p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <div className="text-sm sm:text-base md:text-xl font-semibold">
          {startOfMonth.format("MMMM YYYY")}
        </div>
        <div className="flex gap-1 sm:gap-2">
          <button
            type="button"
            onClick={onPrev}
            className="px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted outline-none min-w-[40px] sm:min-w-[44px]"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={onNext}
            className="px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted outline-none min-w-[40px] sm:min-w-[44px]"
          >
            ›
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 md:gap-2 mb-1.5 sm:mb-2 small text-muted-foreground">
        {DOW.map((d) => (
          <div key={d} className="text-center text-[11px] sm:text-xs">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 md:gap-2 overflow-hidden">
        {cells.map(({ date, inMonth }, idx) => {
          const dateStr = date.format("YYYY-MM-DD");
          const isToday = dateStr === todayStr;
          const isSelected = selectedDate === dateStr;

          // IMPORTANT: don’t gate by inMonth so weekends/edges always get groups
          const groups = Array.isArray(groupsByDate[dateStr]) ? groupsByDate[dateStr] : [];

          const title = groups.length ? `${dateStr}: ${groups.join(", ")}` : dateStr;

          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelect?.(dateStr)}
              className={[
                "relative w-full rounded-xl border transition-colors outline-none focus:outline-none",
                // Mobile: square; sm+: taller cells
                "aspect-square sm:aspect-[5/4]",
                // Min-heights for sm+ so pills don’t clip
                "sm:min-h-[84px] md:min-h-[96px]",
                colorFor(dateStr, inMonth),
                inMonth ? "hover:bg-muted" : "",
              ].join(" ")}
              title={title}
              aria-label={title}
            >
              {isSelected && (
                <div className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-[var(--ring)]" />
              )}
              {!isSelected && isToday && (
                <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-[var(--ring)]/70" />
              )}

              <div className="flex h-full w-full flex-col p-1.5 sm:p-2">
                {/* date number */}
                <div className="text-left">
                  <span className={inMonth ? "text-xs sm:text-sm md:text-base" : "text-xs opacity-60"}>
                    {date.date()}
                  </span>
                </div>

                {/* Groups */}
                <div className="mt-0.5 sm:mt-1 flex-1 overflow-hidden">
                  {/* Mobile: tiny color dots */}
                  <div className="sm:hidden flex items-center gap-1 overflow-hidden">
                    {groups.slice(0, 3).map((g, i) => {
                      const hue = hueFromString(g);
                      return (
                        <span
                          key={`${dateStr}-dot-${i}`}
                          className="inline-block h-1.5 w-1.5 rounded"
                          style={{ backgroundColor: `hsl(${hue} 80% 50%)` }}
                        />
                      );
                    })}
                    {groups.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">+{groups.length - 3}</span>
                    )}
                    {groups.length === 0 && (
                      <span className="text-[10px] text-muted-foreground/70">—</span>
                    )}
                  </div>

                  {/* Tablet/Desktop: full pill list */}
                  <div className="hidden sm:flex flex-col gap-1 max-h-full overflow-y-auto pr-0.5">
                    {groups.length > 0 ? (
                      groups.map((g, i) => <GroupPill key={`${dateStr}-${i}`} name={g} />)
                    ) : (
                      <span className="small text-muted-foreground/70">—</span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-4 small text-muted-foreground">
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
          <span className="h-3 w-3 rounded bg-secondary inline-block border border-border" />
          No data
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded ring-1 ring-[var(--ring)] inline-block" />
          Today
        </span>
      </div>
    </div>
  );
}