"use client";

import { CalendarIcon, Check, Users } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/lib/types";

import { toDateInput } from "./task-constants";
import { initialsOf } from "./task-utils";

// Shared by the create dialog and the detail panel. The panel edits in place
// rather than reopening a modal, so both surfaces need the same controls.

export function AssigneePicker({
  users,
  value,
  onChange,
  trigger,
}: {
  users: UserProfile[];
  value: string[];
  onChange: (next: string[]) => void;
  /** Lets the panel swap the button for its avatar row. */
  trigger?: React.ReactNode;
}) {
  const toggle = (uid: string) =>
    onChange(
      value.includes(uid) ? value.filter((id) => id !== uid) : [...value, uid],
    );

  return (
    <Popover>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline">
            <Users />
            {value.length === 0 ? "Assign" : `${value.length} assigned`}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        {users.map((user) => (
          <button
            key={user.uid}
            type="button"
            onClick={() => toggle(user.uid)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <Avatar className="size-5">
              <AvatarFallback className="text-[9px]">
                {initialsOf(user.fullName)}
              </AvatarFallback>
            </Avatar>
            <span className="flex-1 truncate">{user.fullName}</span>
            {value.includes(user.uid) && <Check className="size-4" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function DuePicker({
  date,
  time,
  onChange,
  trigger,
}: {
  date: string;
  time: string;
  onChange: (date: string, time: string) => void;
  trigger?: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="outline"
            className={cn(!date && "text-muted-foreground")}
          >
            <CalendarIcon />
            {date ? `${date}${time ? ` · ${time}` : ""}` : "No due date"}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date ? new Date(`${date}T00:00`) : undefined}
          onSelect={(next) => onChange(next ? toDateInput(next) : "", time)}
        />
        {/* A time is optional and meaningless without a date, hence the disable. */}
        <div className="flex items-center gap-2 border-t p-3">
          <Input
            type="time"
            value={time}
            disabled={!date}
            onChange={(event) => onChange(date, event.target.value)}
            aria-label="Due time"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange("", "")}
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
