import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Input
 * Uses a neutral surface in light (secondary) and a subtle tinted surface in dark.
 * No hardcoded hex — everything comes from your CSS variables.
 */
function Input({ className, type, ...props }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // surface + text
        "bg-secondary text-foreground dark:bg-input/30",
        // borders / focus / invalid
        "border border-input focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        // shape / size
        "flex h-9 w-full min-w-0 rounded-md px-3 py-1 text-base md:text-sm",
        // behaviour
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground",
        "shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Input };