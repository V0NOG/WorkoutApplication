import React, { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

const TYPE_OPTIONS = ["exercise", "rest", "warmup", "cooldown"];

export default function WorkoutTile({
  tile,
  index,
  onChange,
  onRemove,
  onDuplicate,
  onDragStart,
  onDrop,
  onPreview,
  selected = false,
}) {
  const [editing, setEditing] = useState(false);
  const isExercise = tile.type === "exercise";
  const isRoundRest = tile.type === "rest" && /round/i.test(tile.name || "");
  const badge =
    tile.type === "exercise" ? "Lift" :
    tile.type === "rest" ? (isRoundRest ? "Round rest" : "Rest") :
    tile.type === "warmup" ? "Warmup" : "Cooldown";
  const icon =
    tile.type === "exercise" ? "◆" :
    tile.type === "rest" ? "○" :
    tile.type === "warmup" ? "↗" : "↘";

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => onDrop(e, index)}
      onMouseEnter={() => onPreview?.(index)}
      onClick={() => onPreview?.(index)}
      className={[
        "rounded-xl border p-3 bg-background transition shadow-sm",
        selected ? "ring-2 ring-ring/50" : "",
        isExercise ? "border-blue-500/35" : "border-border/80",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="cursor-grab h-9 w-9 rounded-lg border border-border bg-muted grid place-items-center text-sm font-semibold" title="Drag to reorder">
          ⋮⋮
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium truncate">{tile.name || tile.type}</span>
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px]">{icon} {badge}</span>
          </div>
          <div className="small mt-0.5">
            {tile.durationSec || 0}s
            {tile.targetReps ? ` • ${tile.targetReps} reps` : ""}
            {tile.plannedWeight != null ? ` • ${tile.plannedWeight} kg` : ""}
            {tile.round ? ` • R${tile.round}` : ""}
            {tile.setNumber ? ` • set ${tile.setNumber}/${tile.totalSets || "?"}` : ""}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setEditing((v) => !v); }}>
          {editing ? "Done" : "Edit"}
        </Button>
      </div>

      {editing && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-border/70">
        <label className="space-y-1">
          <div className="small">Type</div>
          <select
            className="h-10 w-full rounded-xl border border-input bg-background px-2 text-sm"
            value={tile.type}
            onChange={(e) => onChange(index, { type: e.target.value })}
          >
            {TYPE_OPTIONS.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <div className="small">Name</div>
          <Input value={tile.name || ""} onChange={(e) => onChange(index, { name: e.target.value, workoutName: e.target.value })} />
        </label>
        <label className="space-y-1">
          <div className="small">Seconds</div>
          <Input type="number" value={tile.durationSec || ""} onChange={(e) => onChange(index, { durationSec: Number(e.target.value) || 0 })} />
        </label>
        <label className="space-y-1">
          <div className="small">Reps</div>
          <Input type="number" value={tile.targetReps ?? ""} onChange={(e) => onChange(index, { targetReps: e.target.value === "" ? null : Number(e.target.value) })} />
        </label>
        <label className="space-y-1">
          <div className="small">Weight</div>
          <Input type="number" value={tile.plannedWeight ?? ""} onChange={(e) => onChange(index, { plannedWeight: e.target.value === "" ? null : Number(e.target.value) })} />
        </label>
        <label className="space-y-1">
          <div className="small">Round</div>
          <Input type="number" value={tile.round ?? ""} onChange={(e) => onChange(index, { round: e.target.value === "" ? null : Number(e.target.value) })} />
        </label>
        <label className="space-y-1">
          <div className="small">Set #</div>
          <Input type="number" value={tile.setNumber ?? ""} onChange={(e) => onChange(index, { setNumber: e.target.value === "" ? null : Number(e.target.value) })} />
        </label>
        <label className="space-y-1">
          <div className="small">Total sets</div>
          <Input type="number" value={tile.totalSets ?? ""} onChange={(e) => onChange(index, { totalSets: e.target.value === "" ? null : Number(e.target.value) })} />
        </label>
        <div className="col-span-2 md:col-span-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onDuplicate(index)}>Duplicate</Button>
          <Button variant="outline" size="sm" onClick={() => onRemove(index)}>Remove</Button>
        </div>
      </div>
      )}
    </div>
  );
}
