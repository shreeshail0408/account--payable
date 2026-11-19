import React, { useEffect, useState } from "react";
import { CalendarRange, Check, RotateCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";
import {
  INVOICE_STATUSES,
  LINKED_FILTER_KEYS,
  linkedFilterLabel,
  parseStatuses,
  statusLabel,
} from "./model";

const ALL_VENDORS = "all";

/** Search, status chips, vendor and invoice-date range; every value is written to the URL. */
export function InvoiceToolbar({ filters, onChange, onClear, vendors }) {
  const activeCount = Object.keys(filters).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <SearchField value={filters.search || ""} onChange={(search) => onChange({ search })} />
        {vendors.visible && (
          <VendorFilter
            value={filters.vendor || ""}
            vendors={vendors}
            onChange={(vendor) => onChange({ vendor })}
          />
        )}
        <DateRange
          from={filters.date_from || ""}
          to={filters.date_to || ""}
          onChange={onChange}
        />
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X />
            Clear filters
          </Button>
        )}
      </div>

      <StatusChips
        selected={parseStatuses(filters.status)}
        onChange={(statuses) => onChange({ status: statuses.join(",") })}
      />

      <LinkedFilterChips filters={filters} onRemove={(key) => onChange({ [key]: "" })} />
    </div>
  );
}

function SearchField({ value, onChange }) {
  const [text, setText] = useState(value);
  const debounced = useDebouncedValue(text, 300);

  // Follow the URL when it changes elsewhere (command palette ?search=, Clear filters).
  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => {
    if (debounced !== value) {
      onChange(debounced.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <div className="flex min-w-0 flex-1 basis-64 flex-col gap-2">
      <Label htmlFor="invoice-search">Search</Label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="invoice-search"
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Invoice number, vendor or status"
          className="pl-9"
        />
      </div>
    </div>
  );
}

function VendorFilter({ value, vendors, onChange }) {
  const selectedMissing = value && !vendors.loading && !vendors.rows.some((vendor) => String(vendor.id) === value);

  return (
    <div className="flex w-full min-w-0 flex-col gap-2 sm:w-56">
      <Label htmlFor="invoice-vendor-filter">Vendor</Label>
      <Select
        value={value || ALL_VENDORS}
        onValueChange={(next) => onChange(next === ALL_VENDORS ? "" : next)}
        disabled={vendors.loading || Boolean(vendors.error)}
      >
        <SelectTrigger id="invoice-vendor-filter">
          <SelectValue placeholder={vendors.loading ? "Loading vendors…" : "All vendors"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VENDORS}>All vendors</SelectItem>
          {selectedMissing && <SelectItem value={value}>Vendor #{value}</SelectItem>}
          {vendors.rows.map((vendor) => (
            <SelectItem key={vendor.id} value={String(vendor.id)}>
              {vendor.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {vendors.error && (
        <p role="alert" className="flex items-center gap-2 text-xs text-danger">
          {vendors.error}
          <button
            type="button"
            onClick={vendors.reload}
            className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
          >
            <RotateCw className="size-3" aria-hidden="true" />
            Retry
          </button>
        </p>
      )}
    </div>
  );
}

function DateRange({ from, to, onChange }) {
  const invalid = from && to && to < from;
  return (
    <div role="group" aria-labelledby="invoice-date-range" className="flex min-w-0 flex-col gap-2">
      <span id="invoice-date-range" className="flex items-center gap-1.5 text-sm font-medium leading-none">
        <CalendarRange className="size-4 text-muted-foreground" aria-hidden="true" />
        Invoice date
      </span>
      <div className="flex items-center gap-2">
        <Input
          type="date"
          aria-label="Invoice date from"
          value={from}
          max={to || undefined}
          onChange={(event) => onChange({ date_from: event.target.value })}
          className="w-[9.5rem]"
          aria-invalid={invalid || undefined}
        />
        <span className="text-sm text-muted-foreground" aria-hidden="true">
          to
        </span>
        <Input
          type="date"
          aria-label="Invoice date to"
          value={to}
          min={from || undefined}
          onChange={(event) => onChange({ date_to: event.target.value })}
          className="w-[9.5rem]"
          aria-invalid={invalid || undefined}
        />
      </div>
    </div>
  );
}

const CHIP = [
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium",
  "outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/35",
];

function StatusChips({ selected, onChange }) {
  const toggle = (status) => {
    onChange(selected.includes(status) ? selected.filter((item) => item !== status) : [...selected, status]);
  };

  return (
    <div role="group" aria-label="Filter by status" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      <button
        type="button"
        aria-pressed={selected.length === 0}
        onClick={() => onChange([])}
        className={cn(
          CHIP,
          selected.length === 0
            ? "border-primary-border bg-primary-subtle text-primary-subtle-foreground"
            : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        All statuses
      </button>
      {INVOICE_STATUSES.map((status) => {
        const active = selected.includes(status);
        return (
          <button
            key={status}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(status)}
            className={cn(
              CHIP,
              active
                ? "border-primary-border bg-primary-subtle text-primary-subtle-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {active && <Check className="size-3.5" aria-hidden="true" />}
            {statusLabel(status)}
          </button>
        );
      })}
    </div>
  );
}

function LinkedFilterChips({ filters, onRemove }) {
  const entries = LINKED_FILTER_KEYS.filter((key) => filters[key]);
  if (!entries.length) {
    return null;
  }
  return (
    <div role="group" aria-label="Linked filters" className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Also filtered by</span>
      {entries.map((key) => {
        const label = linkedFilterLabel(key, filters[key]);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onRemove(key)}
            aria-label={`Remove filter: ${label}`}
            className={cn(CHIP, "h-7 border-info-border bg-info-subtle text-info-subtle-foreground hover:bg-info-subtle/70")}
          >
            {label}
            <X className="size-3.5" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
