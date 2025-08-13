import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover";
import { Calendar } from "./components/ui/calendar";
import { Button } from "./components/ui/button";

export default function DatePicker({ value, onChange }) {
  const date = new Date(value);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={[
            "justify-start w-[220px]",
            // theme-aware surface & text
            "bg-background text-foreground border-border",
            // hover/focus/open states
            "hover:bg-muted",
            "focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
            "data-[state=open]:ring-2 data-[state=open]:ring-[var(--ring)]",
          ].join(" ")}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {isNaN(date) ? "Pick a date" : format(date, "yyyy-MM-dd")}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className={[
          "w-auto p-0 rounded-xl",
          // dropdown surface w/ tokens
          "bg-popover text-popover-foreground border border-border shadow-md",
        ].join(" ")}
      >
        <Calendar
          mode="single"
          selected={isNaN(date) ? undefined : date}
          onSelect={(d) => d && onChange(format(d, "yyyy-MM-dd"))}
          initialFocus
          className="bg-transparent"
        />
      </PopoverContent>
    </Popover>
  );
}
