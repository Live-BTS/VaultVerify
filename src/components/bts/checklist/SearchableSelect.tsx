"use client";

// ── SearchableSelect — type-to-filter dropdown for the checklist cascade ──
// Owner ask (2026-10-19): "just add a search button so they can search
// directly." The recruiter picks Profession → Discipline → Specialty; after
// the workbook import the discipline and specialty lists hold 130+ and 150+
// entries, so plain <select>s become unusable. This wraps shadcn's
// Popover + Command (cmdk): click to open, type to filter, Enter/click to
// pick, Esc to close. Keyboard-navigable and touch friendly.

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Option } from "@/lib/bts/catalog";

interface SearchableSelectProps {
  id: string;
  value: string;
  options: Option[];
  onChange: (key: string) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  // Native select fallback height matches the old selectCls sizing.
  className?: string;
}

export function SearchableSelect({
  id,
  value,
  options,
  onChange,
  placeholder = "Select…",
  emptyText = "No matches",
  disabled,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.key === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          role="combobox"
          aria-expanded={open}
          className={cn(
            "mt-1.5 flex w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 transition focus:outline-none focus:ring-2 focus:ring-teal-600/30 disabled:cursor-not-allowed disabled:opacity-50",
            !selected && "text-slate-500",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            <span className="truncate">{selected ? selected.label : placeholder}</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        // Match the trigger width; list scrolls after ~15 rows (cmdk handles filtering).
        className="w-(--radix-popover-trigger-width) min-w-[10rem] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            <CommandInput
              // autoFocus opens the keyboard on mobile — the whole point of the
              // "search directly" ask. cmdk scopes the query to this instance.
              autoFocus
              placeholder="Type to search…"
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>
          <CommandList className="max-h-64">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.key}
                  value={`${o.label} ${o.key}`}
                  onSelect={() => {
                    onChange(o.key);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check className={cn("mr-2 h-3.5 w-3.5", value === o.key ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
