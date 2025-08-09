import React from "react";

/**
 * ProgressRing
 * size: pixels, stroke: thickness
 * value: 0..1
 */
export default function ProgressRing({ size=64, stroke=8, value=0, label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, value));
  const dash = c * (1 - clamped);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
      <circle cx={size/2} cy={size/2} r={r} stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} fill="none" />
      <circle
        cx={size/2} cy={size/2} r={r}
        stroke="url(#grad)"
        strokeWidth={stroke} fill="none"
        strokeDasharray={c} strokeDashoffset={dash}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
      />
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#93c5fd" />
        </linearGradient>
      </defs>
      <text
        x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        className="fill-white/90 text-sm font-semibold select-none"
      >
        {Math.round(clamped*100)}%
      </text>
      {label ? (
        <text x="50%" y={size - 6} textAnchor="middle" className="fill-white/60 text-[10px] select-none">
          {label}
        </text>
      ) : null}
    </svg>
  );
}