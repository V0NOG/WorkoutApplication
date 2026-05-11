import React from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { formatSeconds } from "./WorkoutBlockTimer.jsx";

export default function WorkoutSessionSummary({
  status,
  durationSec,
  blocksCompleted,
  totalBlocks,
  caloriesEstimated,
  calorieNote,
  effort,
  onEffortChange,
  onSave,
  onClose,
  saving,
  saved,
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xl font-bold">{status === "completed" ? "Workout complete" : "Session ended"}</div>
        <div className="small">Review and save this guided workout.</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border p-3 bg-background">
          <div className="small">Duration</div>
          <div className="font-semibold">{formatSeconds(durationSec)}</div>
        </div>
        <div className="rounded-xl border border-border p-3 bg-background">
          <div className="small">Blocks</div>
          <div className="font-semibold">{blocksCompleted}/{totalBlocks}</div>
        </div>
        <div className="rounded-xl border border-border p-3 bg-background">
          <div className="small">Calories</div>
          <div className="font-semibold">{caloriesEstimated == null ? "Pending" : `${caloriesEstimated} kcal`}</div>
        </div>
        <div className="rounded-xl border border-border p-3 bg-background">
          <div className="small">Effort</div>
          <Input
            type="number"
            min="1"
            max="10"
            value={effort}
            onChange={(e) => onEffortChange(e.target.value)}
            placeholder="1-10"
            className="h-8 text-center"
          />
        </div>
      </div>

      {calorieNote ? <div className="small text-muted-foreground">{calorieNote}</div> : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Close</Button>
        <Button onClick={onSave} disabled={saving || saved}>
          {saved ? "Saved" : saving ? "Saving..." : "Save session"}
        </Button>
      </div>
    </div>
  );
}
