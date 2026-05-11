import React from "react";

function fmt(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function WorkoutBlockTimer({ block, remainingSec, running }) {
  const tone =
    block?.type === "rest" ? "text-blue-500" :
    block?.type === "warmup" || block?.type === "cooldown" ? "text-emerald-500" :
    "text-foreground";

  const hasWeight = block?.plannedWeight != null && block.plannedWeight !== "";

  return (
    <div className="text-center space-y-3">
      <div className={[
        "mx-auto inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide",
        running ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground",
      ].join(" ")}>
        {running ? "Live" : "Paused"}
      </div>
      <div className={`text-7xl md:text-8xl font-extrabold leading-none tabular-nums ${tone}`}>{fmt(remainingSec)}</div>
      {block?.targetReps ? <div className="font-medium">{block.targetReps} reps{hasWeight ? ` • ${block.plannedWeight} kg` : ""}</div> : null}
    </div>
  );
}

export { fmt as formatSeconds };
