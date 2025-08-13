import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Textarea
 * Light: soft neutral chip; Dark: subtle tinted panel.
 */
function Textarea({ className, ...props }) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // surface + text
        "bg-secondary text-foreground dark:bg-input/30",
        // borders / focus / invalid
        "border border-input focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        // shape / size
        "field-sizing-content min-h-16 w-full rounded-md px-3 py-2 text-base md:text-sm",
        // behaviour
        "placeholder:text-muted-foreground shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };