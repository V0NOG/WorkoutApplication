import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { api } from "./api";
import DatePicker from "./DatePicker.jsx";
import { Button } from "./components/ui/button";
import WorkoutPlayer from "./components/workout-player/WorkoutPlayer.jsx";
import WorkoutFlowBuilder from "./components/workout-player/WorkoutFlowBuilder.jsx";
import PlayerSettingsPanel from "./components/workout-player/PlayerSettingsPanel.jsx";
import WorkoutAnimation from "./components/workout-player/WorkoutAnimation.jsx";
import {
  buildDailyWorkoutBlocks,
  defaultDailyPlayerSettings,
  normalizeSessionBlocks,
} from "./lib/sessionBlocks.js";

function fmt(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

function estimateCalories(flow, weightKg) {
  if (!weightKg) return null;
  const kcal = flow.reduce((sum, block) => {
    const hours = (Number(block.durationSec) || 0) / 3600;
    let met = 5.5;
    const text = `${block.type} ${block.name || ""} ${block.workoutName || ""}`.toLowerCase();
    if (block.type === "rest") met = 1.2;
    else if (block.type === "warmup" || block.type === "cooldown") met = 2.5;
    else if (/run|jump|burpee|cardio/.test(text)) met = 8;
    else if (block.workoutKind === "gym") met = 6;
    else met = 7;
    return sum + met * weightKg * hours;
  }, 0);
  return Math.round(kcal);
}

export default function Player() {
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flow, setFlow] = useState([]);
  const [suggestedFlow, setSuggestedFlow] = useState([]);
  const [active, setActive] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [weightKg, setWeightKg] = useState(null);
  const [settings, setSettings] = useState(() => {
    try {
      return { ...defaultDailyPlayerSettings, ...JSON.parse(localStorage.getItem("playerPageSettings") || "{}") };
    } catch {
      return { ...defaultDailyPlayerSettings };
    }
  });

  async function loadDay(d = date) {
    setLoading(true);
    try {
      const [plan, metrics] = await Promise.all([
        api.getPlan(d),
        api.getMetrics(d).catch(() => null),
      ]);
      const list = Array.isArray(plan) ? plan : [];
      setItems(list);
      setWeightKg(metrics?.weightKg || null);
      const next = buildDailyWorkoutBlocks(list, settings);
      setSuggestedFlow(next);
      setFlow(next);
      setPreviewIndex(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDay(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  function updateSettings(next) {
    setSettings(next);
    localStorage.setItem("playerPageSettings", JSON.stringify(next));
  }

  function generate(mode) {
    const nextSettings = { ...settings, workoutMode: mode };
    updateSettings(nextSettings);
    const next = buildDailyWorkoutBlocks(items, nextSettings);
    setSuggestedFlow(next);
    setFlow(next);
  }

  const totalSec = useMemo(() => flow.reduce((s, b) => s + (Number(b.durationSec) || 0), 0), [flow]);
  const calories = useMemo(() => estimateCalories(flow, weightKg), [flow, weightKg]);
  const exerciseCount = useMemo(() => items.length, [items]);
  const totalSets = useMemo(() => flow.filter((b) => b.type === "exercise").length, [flow]);
  const totalRounds = useMemo(() => Math.max(1, ...flow.map((b) => Number(b.totalRounds || b.round || 1)).filter(Number.isFinite)), [flow]);
  const previewTile = flow[Math.min(previewIndex, Math.max(0, flow.length - 1))] || flow[0] || { type: "exercise", name: "Workout" };

  if (active) {
    return (
      <div className="stack">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xl font-bold">Player</div>
            <div className="small">{date} • custom flow</div>
          </div>
          <Button variant="outline" onClick={() => setActive(false)}>Back to builder</Button>
        </div>
        <WorkoutPlayer
          embedded
          items={items}
          blocks={flow}
          sessionSettings={settings}
          onClose={() => setActive(false)}
          onSaved={async () => {
            setActive(false);
            await loadDay(date);
          }}
        />
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="card overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-0">
          <div className="p-5 md:p-7 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="small uppercase tracking-wide">Workout Player</div>
                <div className="text-2xl md:text-3xl font-extrabold mt-1">{dayjs(date).format("dddd, MMM D")}</div>
              </div>
              <div className="w-full sm:w-56">
                <DatePicker value={date} onChange={setDate} />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-border/70 bg-background p-3">
                <div className="small">Exercises</div>
                <div className="text-2xl font-bold">{exerciseCount}</div>
              </div>
              <div className="rounded-xl border border-border/70 bg-background p-3">
                <div className="small">Time</div>
                <div className="text-2xl font-bold">{fmt(totalSec)}</div>
              </div>
              <div className="rounded-xl border border-border/70 bg-background p-3">
                <div className="small">Calories</div>
                <div className="text-2xl font-bold">{calories == null ? "—" : calories}</div>
              </div>
              <div className="rounded-xl border border-border/70 bg-background p-3">
                <div className="small">Sets / rounds</div>
                <div className="text-2xl font-bold">{totalSets}/{totalRounds}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setActive(true)} disabled={!flow.length || !items.length} className="h-12 px-6">
                Start Workout
              </Button>
              <Button variant="outline" onClick={() => generate("circuit")}>Quick circuit</Button>
              <Button variant="outline" onClick={() => generate("sequential")}>Sequential</Button>
              <span className="inline-flex h-10 items-center rounded-full border border-border/70 bg-background px-3 text-xs font-medium text-muted-foreground">
                Voice {settings.voiceGuidanceEnabled ? "on" : "off"}
              </span>
            </div>
          </div>

          <div className="border-t lg:border-t-0 lg:border-l border-border/70 p-5 md:p-7 bg-muted/20">
            <div className="small mb-2">Preview</div>
            <WorkoutAnimation block={previewTile} />
            <div className="mt-3">
              <div className="font-semibold truncate">{previewTile.workoutName || previewTile.name}</div>
              <div className="small">
                {previewTile.type}
                {previewTile.targetReps ? ` • ${previewTile.targetReps} reps` : ""}
                {previewTile.plannedWeight != null ? ` • ${previewTile.plannedWeight} kg` : ""}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-3">
        <div className="stack">
          <div className="card p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <div className="font-semibold">Scheduled Workouts</div>
                <div className="small">{loading ? "Loading..." : `${items.length} workout${items.length === 1 ? "" : "s"} for ${date}`}</div>
              </div>
            </div>
            {!items.length && !loading ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center small">
                No scheduled workouts for this date. Add templates or choose another day.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {items.map((item) => (
                  <div key={item._id} className="rounded-xl border border-border bg-background p-3">
                    <div className="font-medium">{item.templateId?.name || "Workout"}</div>
                    <div className="small">
                      {(item.group || item.templateId?.group || "Ungrouped")} • {item.target || 0} target • {item.repsDone || 0} done
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <WorkoutFlowBuilder
            flow={flow}
            onChange={(next) => setFlow(normalizeSessionBlocks(next))}
            onPreview={setPreviewIndex}
            selectedIndex={previewIndex}
          />
        </div>

        <div className="stack">
          <PlayerSettingsPanel
            settings={settings}
            onChange={updateSettings}
            onGenerateCircuit={() => generate("circuit")}
            onGenerateSequential={() => generate("sequential")}
            onClear={() => setFlow([])}
            onReset={() => setFlow(suggestedFlow)}
          />
          {calories == null && (
            <div className="card p-4 small">
              Add body weight in Today metrics to preview estimated calories.
            </div>
          )}
          <Button onClick={() => setActive(true)} disabled={!flow.length || !items.length} className="h-12 sticky bottom-[calc(env(safe-area-inset-bottom)+72px)] sm:bottom-4">
            Start Workout
          </Button>
        </div>
      </div>
    </div>
  );
}
