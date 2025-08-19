import React from "react";

/**
 * ProgressRing
 * size: pixels, stroke: thickness
 * value: 0..1
 */
export default function ProgressRing({ size = 64, stroke = 8, value = 0, label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, value));
  const dash = c * (1 - clamped);

  // Responsive label sizes based on ring size
  const pctFont = Math.max(10, Math.round(size * 0.22));      // ~22% of size
  const labelFont = Math.max(9, Math.round(size * 0.14));     // ~14% of size

  const id = React.useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="overflow-visible text-foreground"
      role="img"
      aria-labelledby={`${id}-title`}
    >
      <title id={`${id}-title`}>{Math.round(clamped * 100)}%{label ? ` – ${label}` : ""}</title>

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
        <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--primary)" }} />
          <stop offset="100%" style={{ stopColor: "color-mix(in oklab, var(--primary) 70%, white 30%)" }} />
        </linearGradient>
      </defs>
      <circle
        cx={size/2}
        cy={size/2}
        r={r}
        stroke={`url(#${id}-grad)`}
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
        style={{ fontSize: pctFont, fontWeight: 600 }}
        className="select-none opacity-90"
      >
        {Math.round(clamped*100)}%
      </text>

      {label ? (
        <text
          x="50%"
          y={size - Math.max(6, stroke / 2)}
          textAnchor="middle"
          fill="currentColor"
          style={{ fontSize: labelFont }}
          className="select-none opacity-60"
        >
          {label}
        </text>
      ) : null}
    </svg>
  );
}