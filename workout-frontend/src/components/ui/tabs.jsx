"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cn } from "@/lib/utils"

function Tabs({ className, ...props }) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

/** Segmented control styled like your inputs/date-picker */
function TabsList({ className, ...props }) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        // input-like surface
        "inline-flex h-10 items-center gap-1 rounded-xl border border-input",
        "bg-[var(--card)] shadow-xs backdrop-blur px-1",
        className
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        // base button
        "inline-flex h-8 items-center justify-center gap-1.5 px-3",
        "rounded-lg text-sm font-medium transition-colors",
        // inactive
        "text-muted-foreground hover:text-foreground hover:bg-muted/60",
        // active = subtle chip on same surface
        "data-[state=active]:bg-secondary data-[state=active]:text-foreground",
        "data-[state=active]:shadow-xs",
        // focus
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        // disabled
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent }