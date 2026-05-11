import React, { useState } from "react";
import { Button } from "../ui/button";
import WorkoutTile from "./WorkoutTile.jsx";
import { normalizeSessionBlocks } from "../../lib/sessionBlocks.js";

function tileFor(type) {
  return {
    type,
    name:
      type === "rest" ? "Rest" :
      type === "warmup" ? "Warm up" :
      type === "cooldown" ? "Cool down" :
      "Exercise",
    durationSec: type === "exercise" ? 60 : type === "rest" ? 45 : 180,
    targetReps: type === "exercise" ? 10 : null,
    plannedWeight: null,
  };
}

export default function WorkoutFlowBuilder({ flow, onChange, onPreview, selectedIndex = 0 }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [open, setOpen] = useState(false);

  function reorder(from, to) {
    if (from == null || to == null || from === to) return;
    const next = flow.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(normalizeSessionBlocks(next));
  }

  function update(index, patch) {
    onChange(normalizeSessionBlocks(flow.map((tile, i) => i === index ? { ...tile, ...patch } : tile)));
  }

  function add(type) {
    onChange(normalizeSessionBlocks([...flow, tileFor(type)]));
  }

  return (
    <div className="card p-4 md:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold">Edit workout flow</div>
          <div className="small">{flow.length} tiles. Drag to reorder, expand tiles to edit details.</div>
        </div>
        <Button variant="outline" onClick={() => setOpen((v) => !v)}>{open ? "Hide builder" : "Open builder"}</Button>
      </div>

      {open && (
      <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => add("exercise")}>Add exercise</Button>
        <Button variant="outline" onClick={() => add("rest")}>Add rest</Button>
        <Button variant="outline" onClick={() => add("warmup")}>Add warmup</Button>
        <Button variant="outline" onClick={() => add("cooldown")}>Add cooldown</Button>
        <Button variant="outline" onClick={() => onChange(normalizeSessionBlocks([...flow, { ...tileFor("rest"), name: "Round rest", durationSec: 90 }]))}>Add round rest</Button>
      </div>
      <div className="grid gap-2">
        {flow.map((tile, index) => (
          <WorkoutTile
            key={`${tile.order}-${index}`}
            tile={tile}
            index={index}
            onChange={update}
            onRemove={(i) => onChange(normalizeSessionBlocks(flow.filter((_, idx) => idx !== i)))}
            onDuplicate={(i) => onChange(normalizeSessionBlocks([...flow.slice(0, i + 1), { ...flow[i] }, ...flow.slice(i + 1)]))}
            onPreview={onPreview}
            selected={selectedIndex === index}
            onDragStart={(e, i) => {
              setDragIndex(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDrop={(e, i) => {
              e.preventDefault();
              reorder(dragIndex, i);
              setDragIndex(null);
            }}
          />
        ))}
        {!flow.length && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center small">
            No flow yet. Generate a circuit, generate sequential, or add tiles manually.
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}
