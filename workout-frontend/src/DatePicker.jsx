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
        <Button variant="outline" className="justify-start w-[220px]">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {isNaN(date) ? "Pick a date" : format(date, "yyyy-MM-dd")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={isNaN(date) ? undefined : date}
          onSelect={(d)=> d && onChange(format(d, "yyyy-MM-dd"))}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}