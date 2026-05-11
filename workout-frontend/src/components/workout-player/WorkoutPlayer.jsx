import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import WorkoutBlockTimer, { formatSeconds } from "./WorkoutBlockTimer.jsx";
import WorkoutProgressBar from "./WorkoutProgressBar.jsx";
import WorkoutSessionSummary from "./WorkoutSessionSummary.jsx";
import WorkoutAnimation from "./WorkoutAnimation.jsx";
import useWorkoutVoiceGuide from "./useWorkoutVoiceGuide.js";
import {
  buildDailyWorkoutBlocks,
  defaultDailyPlayerSettings,
  fallbackBlocksFromDaily,
  normalizeSessionBlocks,
} from "../../lib/sessionBlocks.js";

function isTimerBlock(block) {
  return block?.type === "rest" || block?.type === "warmup" || block?.type === "cooldown";
}

function initialResults(blocks) {
  return blocks.map((block, order) => ({
    type: block.type,
    name: block.name,
    workoutName: block.workoutName || block.name,
    dailyInstanceId: block.dailyInstanceId || null,
    templateId: block.templateId || null,
    round: block.round ?? null,
    setNumber: block.setNumber ?? null,
    totalSets: block.totalSets ?? null,
    plannedDurationSec: Number(block.durationSec) || 0,
    actualDurationSec: 0,
    targetReps: block.targetReps ?? null,
    completedReps: block.type === "exercise" ? (block.targetReps ?? "") : null,
    plannedWeight: block.plannedWeight ?? null,
    completedWeight: block.plannedWeight ?? "",
    skipped: false,
    order,
  }));
}

export default function WorkoutPlayer({
  item,
  items,
  blocks: inputBlocks,
  sessionSettings,
  embedded = false,
  onClose,
  onSaved,
}) {
  const isDaily = Array.isArray(items);
  const settings = useMemo(
    () => ({ ...defaultDailyPlayerSettings, ...(sessionSettings || {}) }),
    [sessionSettings]
  );
  const blocks = useMemo(() => {
    if (inputBlocks?.length) return normalizeSessionBlocks(inputBlocks);
    if (isDaily) return buildDailyWorkoutBlocks(items, settings);
    const fromTemplate = normalizeSessionBlocks(item?.templateId?.sessionBlocks || []);
    return fromTemplate.length ? fromTemplate : fallbackBlocksFromDaily(item);
  }, [inputBlocks, isDaily, items, settings, item]);

  const [startedAt, setStartedAt] = useState(null);
  const [endedAt, setEndedAt] = useState(null);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [status, setStatus] = useState("completed");
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState(blocks[0]?.durationSec || 0);
  const [elapsed, setElapsed] = useState(0);
  const [blockStartElapsed, setBlockStartElapsed] = useState(0);
  const [results, setResults] = useState(() => initialResults(blocks));
  const [effort, setEffort] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedSession, setSavedSession] = useState(null);
  const activeStartedAt = useRef(null);

  useEffect(() => {
    setResults(initialResults(blocks));
    setCurrent(0);
    setElapsed(0);
    setRemaining(blocks[0]?.durationSec || 0);
    setBlockStartElapsed(0);
  }, [blocks]);

  useEffect(() => {
    setRemaining(blocks[current]?.durationSec || 0);
    setBlockStartElapsed(elapsed);
    if (startedAt && !finished) setRunning(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  useEffect(() => {
    if (!running || finished || !startedAt) return;
    const id = setInterval(() => {
      setElapsed((s) => s + 1);
      setRemaining((s) => {
        const block = blocks[current];
        if (!isTimerBlock(block)) return Math.max(0, s - 1);
        return Math.max(0, s - 1);
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, finished, current, startedAt, blocks]);

  useEffect(() => {
    if (!running || finished || !startedAt) return;
    if (isTimerBlock(blocks[current]) && remaining === 0) completeTimerBlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, running, finished, current, startedAt]);

  function updateCurrentResult(patch) {
    setResults((rows) => rows.map((row, index) => (index === current ? { ...row, ...patch } : row)));
  }

  function resultWithActual(index = current, forcedActual = null) {
    const block = blocks[index];
    const planned = Number(block?.durationSec || 0);
    const actual = forcedActual == null
      ? Math.max(1, elapsed - blockStartElapsed || planned - remaining)
      : forcedActual;
    return Math.max(0, Math.round(actual));
  }

  function markCurrentResult(forcedActual = null, extra = {}) {
    const actualDurationSec = resultWithActual(current, forcedActual);
    setResults((rows) => rows.map((row, index) => {
      if (index !== current) return row;
      return { ...row, ...extra, actualDurationSec: Math.max(row.actualDurationSec || 0, actualDurationSec) };
    }));
  }

  function start() {
    const now = new Date();
    activeStartedAt.current = now;
    setStartedAt(now);
    setRunning(isTimerBlock(blocks[current]) || blocks[current]?.type === "exercise");
  }

  function advance() {
    if (current >= blocks.length - 1) finish("completed");
    else setCurrent((i) => i + 1);
  }

  function completeTimerBlock() {
    markCurrentResult(Number(blocks[current]?.durationSec || 0));
    advance();
  }

  function completeSet() {
    markCurrentResult();
    advance();
  }

  function skip() {
    markCurrentResult(null, { skipped: true });
    advance();
  }

  function previous() {
    if (current === 0) return;
    setCurrent((i) => Math.max(0, i - 1));
  }

  function extendRest() {
    setRemaining((s) => s + 30);
  }

  function finish(nextStatus = "completed") {
    markCurrentResult(nextStatus === "completed" && isTimerBlock(blocks[current]) ? Number(blocks[current]?.durationSec || 0) : null);
    setStatus(nextStatus);
    setRunning(false);
    setFinished(true);
    setEndedAt(new Date());
  }

  async function save() {
    if (saved || saving) return;
    setSaving(true);
    try {
      const dailyInstanceIds = isDaily
        ? (items || []).map((row) => row?._id).filter(Boolean)
        : item?._id ? [item._id] : [];
      const payload = {
        sessionType: isDaily ? "daily" : "single",
        dailyInstanceId: isDaily ? null : item?._id,
        dailyInstanceIds,
        templateId: isDaily ? null : item?.templateId?._id,
        date: isDaily ? (items?.[0]?.date || new Date().toISOString().slice(0, 10)) : item?.date,
        startedAt: (startedAt || activeStartedAt.current || new Date()).toISOString(),
        endedAt: (endedAt || new Date()).toISOString(),
        durationSec: elapsed,
        perceivedEffort: effort === "" ? null : Number(effort),
        status,
        sessionSettings: settings,
        totalRounds: Math.max(1, ...blocks.map((b) => Number(b.totalRounds || b.round || 1)).filter(Number.isFinite)),
        workoutMode: isDaily ? settings.workoutMode : "sequential",
        blockResults: results,
        updateDailyProgress: status === "completed",
      };
      const session = await api.createSession(payload);
      setSavedSession(session);
      setSaved(true);
      await onSaved?.(session);
    } finally {
      setSaving(false);
    }
  }

  const block = blocks[current] || blocks[0] || {};
  const next = blocks[current + 1];
  const currentResult = results[current] || {};
  const timer = isTimerBlock(block);
  const completedCount = finished
    ? results.filter((r) => r.actualDurationSec > 0 || r.type === "rest").length
    : current;
  const totalRounds = Math.max(1, ...blocks.map((b) => Number(b.totalRounds || b.round || 1)).filter(Number.isFinite));
  const { cancelVoice } = useWorkoutVoiceGuide({
    enabled: !!settings.voiceGuidanceEnabled,
    block,
    blockIndex: current,
    remainingSec: remaining,
    running,
    started: !!startedAt,
    finished,
    status,
  });

  const playerBody = (
    <div className={embedded ? "card w-full p-4 md:p-6 space-y-5" : "card w-full max-w-4xl p-4 md:p-6 space-y-5 max-h-[92vh] overflow-y-auto"}>
          {!finished ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="small uppercase tracking-wide">{timer ? block.type : "Exercise"}</div>
                  <div className="text-2xl md:text-3xl font-extrabold">{block.workoutName || block.name || (isDaily ? "Today's Workout Circuit" : item?.templateId?.name || "Guided workout")}</div>
                  <div className="small">Elapsed {formatSeconds(elapsed)}{isDaily ? ` • ${settings.workoutMode}` : ""}</div>
                </div>
                <Button variant="outline" onClick={() => { cancelVoice(); finish("cancelled"); }}>End session</Button>
              </div>

              <WorkoutProgressBar current={current} total={blocks.length} />

              {isDaily && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="rounded-xl border border-border bg-background p-3">
                    <div className="small">Round</div>
                    <div className="font-semibold">{block.round || 1}/{totalRounds}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3">
                    <div className="small">Exercise</div>
                    <div className="font-semibold truncate">{block.workoutName || block.name}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3">
                    <div className="small">Set</div>
                    <div className="font-semibold">{block.setNumber || "—"}/{block.totalSets || "—"}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3">
                    <div className="small">Next</div>
                    <div className="font-semibold truncate">{next?.workoutName || next?.name || "Finish"}</div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 items-center">
                <div className="scale-[1.02] md:scale-110">
                  <WorkoutAnimation block={block} />
                </div>
                <div className="rounded-2xl border border-border/70 bg-background p-5">
                  <WorkoutBlockTimer block={block} remainingSec={remaining} running={running} />
                </div>
              </div>

              {block.type === "exercise" && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-border bg-background p-3">
                    <div className="small">Target</div>
                    <div className="font-semibold">
                      {block.targetReps ? `${block.targetReps} reps` : "Timed effort"}
                      {block.plannedWeight != null ? ` • ${block.plannedWeight} kg` : ""}
                    </div>
                  </div>
                  <label className="space-y-1">
                    <div className="small">Completed reps</div>
                    <Input
                      type="number"
                      value={currentResult.completedReps ?? ""}
                      onChange={(e) => updateCurrentResult({ completedReps: e.target.value === "" ? null : Number(e.target.value) })}
                    />
                  </label>
                  <label className="space-y-1">
                    <div className="small">Completed weight</div>
                    <Input
                      type="number"
                      value={currentResult.completedWeight ?? ""}
                      onChange={(e) => updateCurrentResult({ completedWeight: e.target.value === "" ? null : Number(e.target.value) })}
                      placeholder={block.plannedWeight != null ? `${block.plannedWeight}` : "kg"}
                    />
                  </label>
                </div>
              )}

              {next ? (
                <div className="rounded-xl border border-border/70 bg-background p-3 small">
                  Next: <span className="font-medium text-foreground">{next.workoutName || next.name}</span> ({next.type}, {formatSeconds(next.durationSec)})
                </div>
              ) : (
                <div className="rounded-xl border border-border/70 bg-background p-3 small">Last block</div>
              )}

              <div className="rounded-2xl border border-border/70 bg-background p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {!startedAt ? (
                  <Button className="col-span-2 sm:col-span-4 h-11" onClick={start}>Start</Button>
                ) : timer ? (
                  running ? <Button className="col-span-2" onClick={() => setRunning(false)}>Pause rest</Button>
                          : <Button className="col-span-2" onClick={() => setRunning(true)}>Resume rest</Button>
                ) : (
                  running ? <Button variant="outline" className="col-span-2" onClick={() => setRunning(false)}>Pause timer</Button>
                          : <Button variant="outline" className="col-span-2" onClick={() => setRunning(true)}>Resume timer</Button>
                )}
                <Button variant="outline" onClick={previous} disabled={current === 0}>Previous</Button>
                {timer ? <Button variant="outline" onClick={skip}>Skip rest</Button> : <Button variant="outline" onClick={skip}>Skip</Button>}
                {timer ? <Button variant="outline" onClick={extendRest}>+30 sec</Button> : <Button className="sm:col-span-2" onClick={completeSet}>Set Complete</Button>}
                {timer ? <Button variant="outline" onClick={() => finish("completed")}>Complete</Button> : null}
              </div>
            </>
          ) : (
            <WorkoutSessionSummary
              status={status}
              durationSec={elapsed}
              blocksCompleted={completedCount}
              totalBlocks={blocks.length}
              caloriesEstimated={savedSession?.caloriesEstimated}
              calorieNote={savedSession?.calorieNote}
              effort={effort}
              onEffortChange={setEffort}
              onSave={save}
              onClose={() => {
                cancelVoice();
                onClose?.();
              }}
              saving={saving}
              saved={saved}
            />
          )}
    </div>
  );

  if (embedded) return playerBody;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="absolute inset-0 grid place-items-center p-3">
        {playerBody}
      </div>
    </div>
  );
}
