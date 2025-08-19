import React from "react";

/**
 * Props:
 *  - days: [{ date: 'YYYY-MM-DD', scheduled: bool, met: bool, groups?: string[] }]
 *  - onClick(dateStr)
 */

// Deterministic hue from a string (match MonthCalendar)
function hueFromString(s = "") {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
function GroupPill({ name }) {
  const hue = hueFromString(name);
  const dot = `hsl(${hue} 80% 50%)`;
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border bg-background/70 px-1.5 py-0.5 text-[10px] leading-4">
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />
      <span className="truncate">{name}</span>
    </div>
  );
}

export default function CalendarHeatmap({ days = [], onClick }) {
  if (!days.length) return null;

  // show last 35 days (5 rows x 7)
  const last35 = days.slice(-35);

  return (
    <div className="rounded-xl border border-border bg-card p-2 sm:p-3 overflow-x-auto no-scrollbar">
      {/* Use a fluid 7-col template; cells keep aspect to avoid overflow */}
      <div
        className="
          grid gap-1
          [grid-template-columns:repeat(7,minmax(2.5rem,1fr))]
          sm:[grid-template-columns:repeat(7,minmax(3rem,1fr))]
          md:[grid-template-columns:repeat(7,minmax(3.75rem,1fr))]
        "
      >
        {last35.map((d) => {
          const dateObj = new Date(d.date);
          const dayNum = isNaN(dateObj) ? "" : dateObj.getDate();
          let bg = "bg-secondary"; // default/unscheduled -> theme aware
          if (d.scheduled) bg = d.met ? "bg-emerald-500/20" : "bg-rose-500/20";
          const groups = Array.isArray(d.groups) ? d.groups : [];

          return (
            <button
              key={d.date}
              title={`${d.date}${d.scheduled ? (d.met ? " ✓" : " ✕") : ""}`}
              onClick={() => onClick?.(d.date)}
              className={[
                "rounded-xl border border-border",
                "hover:outline hover:outline-2 hover:outline-[var(--ring)]",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
                "p-1 sm:p-1.5 text-left",
                // Maintain shape responsively instead of fixed w/h:
                "aspect-[4/3] min-h-[60px] sm:min-h-[72px] md:min-h-[80px]",
                bg,
              ].join(" ")}
            >
              <div className="text-[10px] text-muted-foreground">{dayNum}</div>
              {groups.length > 0 && (
                <div className="mt-1 flex flex-col gap-1 overflow-hidden">
                  {groups.slice(0, 2).map((g, i) => (
                    <GroupPill key={`${d.date}-${g}-${i}`} name={g} />
                  ))}
                  {groups.length > 2 && (
                    <div className="text-[10px] text-muted-foreground">+{groups.length - 2} more…</div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}