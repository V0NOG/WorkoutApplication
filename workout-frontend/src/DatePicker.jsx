import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover";
import { Calendar } from "./components/ui/calendar";
import { Button } from "./components/ui/button";

export default function DatePicker({ value, onChange, placeholder = "Pick a date" }) {
  const date = value ? new Date(value) : null;
  const invalid = !date || isNaN(date.getTime());

  // Match input styling (same as Templates.jsx inputs)
  const inputLike =
    "w-full h-11 rounded-xl border border-input bg-background " +
    "text-foreground px-3 flex items-center gap-2 " +
    "focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring " +
    "transition-all duration-300";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={[
            inputLike,
            // subtle hover to match inputs
            "hover:bg-muted",
            // muted text when no date selected (acts like placeholder)
            invalid ? "text-muted-foreground" : "text-foreground",
          ].join(" ")}
        >
          <CalendarIcon className="h-4 w-4" />
          <span className="truncate">
            {invalid ? placeholder : format(date, "yyyy-MM-dd")}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className={[
          "w-auto p-0 rounded-xl",
          "bg-popover text-popover-foreground border border-border shadow-md",
        ].join(" ")}
      >
        <Calendar
          mode="single"
          selected={invalid ? undefined : date}
          onSelect={(d) => d && onChange(format(d, "yyyy-MM-dd"))}
          initialFocus
          className="bg-transparent"
        />
      </PopoverContent>
    </Popover>
  );
}