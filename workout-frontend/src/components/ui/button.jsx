// src/components/ui/button.jsx
import * as React from "react";
import { cn } from "@/lib/utils";

const variants = {
  default: "bg-blue-500 text-white hover:bg-blue-500/90 shadow",
  outline: "border border-border bg-transparent hover:bg-white/5",
  ghost:   "hover:bg-white/5",
};

const sizes = {
  sm: "h-8 px-3 text-xs",
  default: "h-9 px-4 text-sm",
  lg: "h-10 px-5 text-base",
  icon: "h-9 w-9 p-0",
};

const base =
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl font-medium transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50 disabled:pointer-events-none";

export function buttonVariants({ variant = "default", size = "default", className = "" } = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

export const Button = React.forwardRef(
  ({ className = "", variant = "default", size = "default", ...props }, ref) => (
    <button ref={ref} className={buttonVariants({ variant, size, className })} {...props} />
  )
);
Button.displayName = "Button";