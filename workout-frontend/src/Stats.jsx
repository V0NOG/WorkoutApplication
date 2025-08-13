import React, { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import dayjs from "dayjs";
import { Button } from "./components/ui/button";

function Bar({ label, value, max }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between small text-muted-foreground">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--secondary)] border border-border overflow-hidden">
        <div className="h-full bg-gradient-to-r from-blue-500 to-blue-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const step = 28;

const EMPTY = {
  compliancePct: 0,
  currentStreak: 0,
  longestStreak: 0,
  totals: { done: 0, target: 0 },
  weeks: [],
};

export default function Stats() {
  const [range, setRange] = useState(() => ({
    from: dayjs().subtract(step - 1, "day").format("YYYY-MM-DD"),
    to: dayjs().format("YYYY-MM-DD"),
  }));
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [templates, setTemplates] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await api.statsSummary(range.from, range.to);
        if (!alive) return;
        setData(res ?? EMPTY);
      } catch (e) {
        if (!alive) return;
        setErr(e);
        setData(EMPTY);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [range]);

  // Load templates once for gym/cali overview cards
  useEffect(() => {
    (async () => {
      try { setTemplates(await api.listTemplates()); } catch {}
    })();
  }, []);

  const canNext = dayjs(range.to).isBefore(dayjs(), "day");

  function prev() {
    setRange((r) => ({
      from: dayjs(r.from).subtract(step, "day").format("YYYY-MM-DD"),
      to: dayjs(r.to).subtract(step, "day").format("YYYY-MM-DD"),
    }));
  }
  function next() {
    if (!canNext) return;
    const nextTo = dayjs(range.to).add(step, "day");
    const clampedTo = dayjs.min(nextTo, dayjs());
    const clampedFrom = clampedTo.subtract(step - 1, "day");
    setRange({ from: clampedFrom.format("YYYY-MM-DD"), to: clampedTo.format("YYYY-MM-DD") });
  }
  function goToday() {
    setRange({
      from: dayjs().subtract(step - 1, "day").format("YYYY-MM-DD"),
      to: dayjs().format("YYYY-MM-DD"),
    });
  }

  if (err) {
    return (
      <div className="stack">
        <div className="card p-5 text-red-500">Failed to load stats.</div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={prev}>Prev 4 weeks</Button>
          <Button variant="outline" onClick={goToday}>Today</Button>
          <Button onClick={next} disabled={!canNext}>Next 4 weeks</Button>
        </div>
      </div>
    );
  }

  const maxTotals = Math.max(data?.totals?.done ?? 0, data?.totals?.target ?? 0, 1);

  // Split templates into gym/calisthenics and group calisthenics by group
  const gymTemplates = useMemo(() => templates.filter(t => t.kind === "gym"), [templates]);
  const caliTemplates = useMemo(() => templates.filter(t => t.kind !== "gym"), [templates]);
  const caliByGroup = useMemo(() => {
    const m = {};
    for (const t of caliTemplates) {
      const g = (t.group || "Ungrouped").trim() || "Ungrouped";
      (m[g] ||= []).push(t);
    }
    return m;
  }, [caliTemplates]);

  return (
    <div className="stack">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="small text-muted-foreground">Compliance</div>
          <div className="text-3xl font-bold">{loading ? "…" : `${data?.compliancePct ?? 0}%`}</div>
        </div>
        <div className="card p-5">
          <div className="small text-muted-foreground">Current streak</div>
          <div className="text-3xl font-bold">{loading ? "…" : `${data?.currentStreak ?? 0} days`}</div>
        </div>
        <div className="card p-5">
          <div className="small text-muted-foreground">Longest streak</div>
          <div className="text-3xl font-bold">{loading ? "…" : `${data?.longestStreak ?? 0} days`}</div>
        </div>
      </div>

      {/* Totals */}
      <div className="card p-5">
        {loading ? (
          <div className="opacity-60">Loading…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Bar label="Total done" value={data?.totals?.done ?? 0} max={maxTotals} />
            <Bar label="Total target" value={data?.totals?.target ?? 0} max={maxTotals} />
          </div>
        )}
      </div>

      {/* Weekly breakdown */}
      <div className="card p-5 space-y-4">
        <div className="font-semibold">Weekly totals</div>
        {loading ? (
          <div className="opacity-60">Loading…</div>
        ) : (
          <div className="grid gap-3">
            {(data?.weeks ?? []).map((w, i) => {
              const done = w?.done ?? 0;
              const target = w?.target ?? 0;
              const max = Math.max(done, target, 1);
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between small text-muted-foreground">
                    <span>{w?.from} → {w?.to}</span>
                    <span>{done}/{target}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--secondary)] border border-border overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${(done / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
            {(data?.weeks ?? []).length === 0 && (
              <div className="small text-muted-foreground">No data in this range.</div>
            )}
          </div>
        )}
      </div>

      {/* ---- New: Gym overview ---- */}
      {gymTemplates.length > 0 && (
        <div className="card p-6">
          <div className="text-lg font-semibold mb-3">Gym Overview</div>
          <div className="space-y-3">
            {gymTemplates.map(t => (
              <div key={t._id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 bg-background">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{t.name}</div>
                  <div className="small text-muted-foreground">
                    {t.dailyTarget} sets • {t.defaultSetSize} reps
                    {t.weight != null ? ` • ${t.weight} kg` : ""}
                    {" • Prog: "}{t.progression?.mode || "volume"}
                  </div>
                </div>
                <div className="small text-muted-foreground whitespace-nowrap pl-3">
                  Days: {t.schedule?.daysOfWeek?.length ?? 0}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- New: Calisthenics by group ---- */}
      {caliTemplates.length > 0 && (
        <div className="card p-6">
          <div className="text-lg font-semibold mb-3">Calisthenics Overview</div>
          <div className="space-y-4">
            {Object.entries(caliByGroup).map(([groupName, items]) => (
              <div key={groupName}>
                <div className="inline-flex items-center rounded-lg bg-muted/60 px-3 py-1.5 text-sm font-semibold mb-2">
                  {groupName}
                </div>
                <div className="space-y-2">
                  {items.map(t => (
                    <div key={t._id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 bg-background">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{t.name}</div>
                        <div className="small text-muted-foreground">
                          {t.dailyTarget}/{t.unit} • set {t.defaultSetSize}
                          {" • Prog: "}{t.progression?.mode || "volume"}
                        </div>
                      </div>
                      <div className="small text-muted-foreground whitespace-nowrap pl-3">
                        Days: {t.schedule?.daysOfWeek?.length ?? 0}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={prev}>Prev 4 weeks</Button>
        <Button variant="outline" onClick={goToday}>Today</Button>
        <Button onClick={next} disabled={!canNext}>Next 4 weeks</Button>
      </div>
    </div>
  );
}