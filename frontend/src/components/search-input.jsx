import React, { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";

/**
 * Debounced search box. `value` is the committed value (usually the URL's ?search=);
 * typing calls `onChange` 300ms after the user stops. Follows `value` when it changes
 * elsewhere (command palette deep links, "Clear filters").
 */
export function SearchInput({ id, label = "Search", value, onChange, placeholder, className, hideLabel = false }) {
  const [text, setText] = useState(value);
  const debounced = useDebouncedValue(text, 300);

  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => {
    if (debounced.trim() !== value) {
      onChange(debounced.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <div className={cn("flex min-w-0 flex-1 basis-64 flex-col gap-2", className)}>
      <Label htmlFor={id} className={cn(hideLabel && "sr-only")}>
        {label}
      </Label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id={id}
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={placeholder}
          className="pl-9"
        />
      </div>
    </div>
  );
}
