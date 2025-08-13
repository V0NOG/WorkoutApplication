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
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="overflow-visible text-foreground"
    >
      {/* track */}
      <circle
        cx={size/2}
        cy={size/2}
        r={r}
        stroke="var(--border)"
        strokeWidth={stroke}
        fill="none"
      />
      {/* progress */}
      <defs>
        <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--primary)" }} />
          <stop offset="100%" style={{ stopColor: "color-mix(in oklab, var(--primary) 70%, white 30%)" }} />
        </linearGradient>
      </defs>
      <circle
        cx={size/2}
        cy={size/2}
        r={r}
        stroke="url(#ring-grad)"
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={dash}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
      />

      {/* % label */}
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fill="currentColor"
        className="text-sm font-semibold select-none opacity-90"
      >
        {Math.round(clamped*100)}%
      </text>
      {label ? (
        <text
          x="50%"
          y={size - 6}
          textAnchor="middle"
          fill="currentColor"
          className="text-[10px] select-none opacity-60"
        >
          {label}
        </text>
      ) : null}
    </svg>
  );
}