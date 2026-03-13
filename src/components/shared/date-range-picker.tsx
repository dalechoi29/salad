"use client";

import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

interface DateRangePickerProps {
  value: { from: Date | undefined; to: Date | undefined };
  onChange: (range: { from: Date | undefined; to: Date | undefined }) => void;
  placeholder?: string;
}

function formatKoreanDate(date: Date | undefined) {
  if (!date) return "";
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = "날짜 선택",
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);

  const displayText =
    value.from && value.to
      ? `${formatKoreanDate(value.from)} ~ ${formatKoreanDate(value.to)}`
      : value.from
        ? formatKoreanDate(value.from)
        : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !value.from && "text-muted-foreground"
            )}
          />
        }
      >
        <CalendarIcon className="mr-2 h-4 w-4" />
        <span className="truncate">{displayText}</span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={value as DateRange}
          onSelect={(range) => {
            onChange({
              from: range?.from,
              to: range?.to,
            });
            if (
              range?.from &&
              range?.to &&
              range.from.getTime() !== range.to.getTime()
            ) {
              setOpen(false);
            }
          }}
          numberOfMonths={1}
        />
      </PopoverContent>
    </Popover>
  );
}
