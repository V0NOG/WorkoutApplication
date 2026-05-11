import React from "react";

export default function PlayerCheckbox({ checked, onChange, label, description }) {
  return (
    <label className="group flex min-h-14 w-full cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-background px-3 py-3 transition hover:bg-muted/50">
      <span className="relative mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-input bg-muted transition group-focus-within:ring-[3px] group-focus-within:ring-ring/40">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={!!checked}
          onChange={(e) => onChange?.(e.target.checked)}
        />
        <span className="absolute left-1 h-4 w-4 rounded-full bg-muted-foreground/70 shadow-sm transition peer-checked:translate-x-4 peer-checked:bg-primary" />
      </span>
      <span className="min-w-0 flex-1 whitespace-normal break-words">
        <span className="block text-sm font-medium leading-snug">{label}</span>
        {description ? <span className="small mt-0.5 block whitespace-normal break-words leading-normal">{description}</span> : null}
      </span>
    </label>
  );
}
