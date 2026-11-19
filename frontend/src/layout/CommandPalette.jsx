import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Building2, ClipboardCheck, LoaderCircle, Plus, ReceiptText, ShoppingCart, Upload } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { StatusBadge } from "@/components/status-badge";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatCurrency } from "@/lib/format";
import api from "@/services/api";
import { NAV_ITEMS, canAccess, visibleGroups } from "./nav";

const MIN_QUERY = 2;
const RESULTS_PER_GROUP = 5;

/*
 * Record searches use each list endpoint's existing `?search=` param, only for the
 * resources the user's role can read. Selecting a result opens the list page filtered
 * to it (pages read `?search=` from the URL).
 */
const SEARCHES = [
  {
    key: "invoices",
    heading: "Invoices",
    endpoint: "/invoices/",
    navItem: NAV_ITEMS.invoices,
    icon: ReceiptText,
    toItem: (row) => ({
      id: row.id,
      title: row.invoice_number || "Invoice needing review",
      subtitle: [row.vendor_name, formatCurrency(row.total_amount)].filter(Boolean).join(" · "),
      status: row.status,
      kind: "invoice",
      search: row.invoice_number || row.vendor_name || "",
    }),
  },
  {
    key: "vendors",
    heading: "Vendors",
    endpoint: "/vendors/",
    navItem: NAV_ITEMS.vendors,
    icon: Building2,
    toItem: (row) => ({
      id: row.id,
      title: row.name,
      subtitle: [row.code, row.gstin].filter(Boolean).join(" · "),
      status: row.status,
      kind: "vendor",
      search: row.code || row.name,
    }),
  },
  {
    key: "purchaseOrders",
    heading: "Purchase orders",
    endpoint: "/purchase-orders/",
    navItem: NAV_ITEMS.purchaseOrders,
    icon: ShoppingCart,
    toItem: (row) => ({
      id: row.id,
      title: row.number,
      subtitle: [row.vendor_name, formatCurrency(row.total_amount)].filter(Boolean).join(" · "),
      status: row.status,
      kind: "purchaseOrder",
      search: row.number,
    }),
  },
];

const QUICK_ACTIONS = [
  {
    label: "Upload invoice",
    icon: Upload,
    to: "/invoices?new=1",
    roles: ["ADMIN", "AP_CLERK"],
    keywords: "new capture scan ocr",
  },
  {
    label: "New vendor",
    icon: Plus,
    to: "/vendors?new=1",
    roles: ["ADMIN", "AP_CLERK"],
    keywords: "add supplier onboarding",
  },
  {
    label: "Go to approvals",
    icon: ClipboardCheck,
    to: "/approvals",
    roles: NAV_ITEMS.approvals.roles,
    keywords: "review approve reject pending",
  },
];

function matches(query, ...texts) {
  const needle = query.trim().toLowerCase();
  return !needle || texts.some((text) => String(text || "").toLowerCase().includes(needle));
}

/** Server-side search across the role's readable resources; cancels stale requests. */
function useRecordSearch(query, role, open) {
  const debounced = useDebouncedValue(query.trim(), 250);
  const [state, setState] = useState({ query: "", loading: false, groups: [], errors: [] });
  const searches = useMemo(() => SEARCHES.filter((search) => canAccess(search.navItem, role)), [role]);

  useEffect(() => {
    if (!open || debounced.length < MIN_QUERY || searches.length === 0) {
      setState({ query: debounced, loading: false, groups: [], errors: [] });
      return undefined;
    }
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true }));
    Promise.allSettled(searches.map((search) => (
      api.get(search.endpoint, { params: { search: debounced }, signal: controller.signal })
    ))).then((results) => {
      if (controller.signal.aborted) {
        return;
      }
      const groups = [];
      const errors = [];
      results.forEach((result, index) => {
        const search = searches[index];
        if (result.status === "fulfilled") {
          const rows = result.value.data.results || result.value.data;
          groups.push({ ...search, items: rows.slice(0, RESULTS_PER_GROUP).map(search.toItem) });
        } else {
          errors.push(search.heading);
        }
      });
      setState({ query: debounced, loading: false, groups, errors });
    });
    return () => controller.abort();
  }, [debounced, open, searches]);

  const pending = query.trim() !== debounced || state.loading;
  return { ...state, pending, searchable: searches.length > 0 };
}

export function CommandPalette({ open, onOpenChange, role }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const search = useRecordSearch(query, role, open);

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  const go = (to) => {
    onOpenChange(false);
    navigate(to);
  };

  const actions = QUICK_ACTIONS.filter((action) => (
    action.roles.includes(role) && matches(query, action.label, action.keywords)
  ));
  const pages = visibleGroups(role)
    .flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })))
    .filter((item) => matches(query, item.label, item.group));
  const recordCount = search.groups.reduce((total, group) => total + group.items.length, 0);
  const showRecords = query.trim().length >= MIN_QUERY && search.searchable;
  const nothingFound = !search.pending && recordCount === 0 && actions.length === 0 && pages.length === 0;

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search and quick actions"
      description="Search invoices, vendors and purchase orders, or run a quick action"
      commandProps={{ shouldFilter: false, loop: true }}
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search invoices, vendors, POs…"
        aria-describedby="command-palette-hint"
      />
      <CommandList>
        {nothingFound && (
          <CommandEmpty>
            {showRecords ? `No results for "${query.trim()}".` : "No matching pages or actions."}
          </CommandEmpty>
        )}

        {showRecords && (
          <RecordResults search={search} onSelect={go} />
        )}

        {actions.length > 0 && (
          <CommandGroup heading="Quick actions">
            {actions.map((action) => (
              <CommandItem key={action.label} value={`action:${action.label}`} onSelect={() => go(action.to)}>
                <action.icon />
                {action.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {pages.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Go to">
              {pages.map((page) => (
                <CommandItem key={page.path} value={`page:${page.path}`} onSelect={() => go(page.path)}>
                  <page.icon />
                  {page.label}
                  {page.group && (
                    <span className="ml-auto text-xs text-muted-foreground">{page.group}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
      <p id="command-palette-hint" className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        {search.searchable
          ? `Type at least ${MIN_QUERY} characters to search records. ↑↓ to move, Enter to open, Esc to close.`
          : "↑↓ to move, Enter to open, Esc to close."}
      </p>
    </CommandDialog>
  );
}

function RecordResults({ search, onSelect }) {
  if (search.pending && search.groups.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground" role="status">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        Searching…
      </div>
    );
  }

  return (
    <>
      {search.errors.length > 0 && (
        <p className="px-4 py-2 text-xs text-danger" role="alert">
          Couldn't search {search.errors.join(", ").toLowerCase()}. Check your connection and try again.
        </p>
      )}
      {search.groups.filter((group) => group.items.length > 0).map((group) => (
        <CommandGroup key={group.key} heading={group.heading}>
          {group.items.map((item) => (
            <CommandItem
              key={item.id}
              value={`${group.key}:${item.id}`}
              onSelect={() => onSelect(`${group.navItem.path}?search=${encodeURIComponent(item.search)}`)}
              className="py-2"
            >
              <group.icon />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{item.title}</span>
                {item.subtitle && (
                  <span className="truncate text-xs text-muted-foreground tabular-nums">{item.subtitle}</span>
                )}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-2">
                {item.status && <StatusBadge kind={item.kind} status={item.status} showIcon={false} />}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      ))}
      {search.pending && search.groups.length > 0 && (
        <p className="px-4 py-1 text-[11px] text-muted-foreground" role="status">Updating…</p>
      )}
    </>
  );
}
