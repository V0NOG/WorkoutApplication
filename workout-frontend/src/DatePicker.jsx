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
            // solid background, readable text
            "bg-[#0b1324] text-zinc-100 border border-border",
            // hover/focus/open states stay solid (no transparency)
            "hover:bg-[#0b1324] hover:border-blue-400/50",
            "focus-visible:ring-0 focus-visible:border-blue-400/60",
            "data-[state=open]:bg-[#0b1324] data-[state=open]:border-blue-400/60",
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
          // make the dropdown itself solid
          "bg-[#0b1324] text-zinc-100 border border-border shadow-lg",
        ].join(" ")}
      >
        <Calendar
          mode="single"
          selected={isNaN(date) ? undefined : date}
          onSelect={(d) => d && onChange(format(d, "yyyy-MM-dd"))}
          initialFocus
          // ensure the calendar surface isn’t transparent
          className="bg-[#0b1324] text-zinc-100 rounded-xl"
        />
      </PopoverContent>
    </Popover>
  );
}