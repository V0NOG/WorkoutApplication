import React from "react";

export default function WorkoutProgressBar({ current = 0, total = 1 }) {
  const pct = Math.min(100, Math.max(0, Math.round(((current + 1) / Math.max(1, total)) * 100)));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between small">
        <span>Block {Math.min(current + 1, total)} of {total}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-secondary border border-border overflow-hidden">
        <div className="h-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
