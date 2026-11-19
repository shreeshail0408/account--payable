import React, { useRef } from "react";
import { cn } from "@/lib/utils";

const STEPS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Single choice from a few options, styled like TabsList but with radiogroup semantics
 * (use Tabs only when the choice swaps a panel). Arrow keys move and select; one tab stop.
 * options: [{ value, label, icon? }]
 */
export function SegmentedControl({ value, onValueChange, options, label, className }) {
  const groupRef = useRef(null);

  const onKeyDown = (event) => {
    const step = STEPS[event.key];
    if (!step) {
      return;
    }
    event.preventDefault();
    const index = options.findIndex((option) => option.value === value);
    const next = options[(index + step + options.length) % options.length];
    onValueChange(next.value);
    groupRef.current?.querySelector(`[data-value="${next.value}"]`)?.focus();
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("inline-flex h-9 w-fit items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-value={option.value}
            tabIndex={active ? 0 : -1}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3",
              "text-sm font-medium outline-none transition-[color,background-color,box-shadow]",
              "hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/35",
              active && "bg-card text-foreground shadow-card",
            )}
          >
            {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
