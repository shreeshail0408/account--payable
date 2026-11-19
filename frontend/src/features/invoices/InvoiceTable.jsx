import React, { useMemo } from "react";
import { CircleAlert, MoreHorizontal, ScanSearch, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Amount } from "@/components/amount";
import { DataTable, RowCheckbox, SortHeader } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { daysFromToday, formatDate, formatNumber } from "@/lib/format";
import { isOverdue } from "./model";

function DueDate({ invoice }) {
  if (!invoice.due_date) {
    return <span className="text-muted-foreground">Missing</span>;
  }
  if (!isOverdue(invoice, daysFromToday)) {
    return <span>{formatDate(invoice.due_date)}</span>;
  }
  const days = -daysFromToday(invoice.due_date);
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-danger">
      <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
      {formatDate(invoice.due_date)}
      <span className="sr-only">, overdue by {days} day{days === 1 ? "" : "s"}</span>
    </span>
  );
}

function OcrCell({ invoice }) {
  const hasOcr = Boolean(invoice.ocr_text) || Number(invoice.ocr_accuracy) > 0;
  return (
    <span className="flex flex-col items-end gap-1">
      <span className="tabular-nums">
        {hasOcr ? `${formatNumber(invoice.ocr_accuracy || 0, { fractionDigits: 1 })}%` : "—"}
      </span>
      {invoice.extraction_reviewed_at ? (
        <span className="inline-flex items-center gap-1 text-xs text-success">
          <UserCheck className="size-3" aria-hidden="true" />
          Reviewed
        </span>
      ) : (
        hasOcr && <span className="text-xs text-warning-subtle-foreground">Not reviewed</span>
      )}
    </span>
  );
}

function RowActions({ invoice, actions }) {
  const items = actions.forInvoice(invoice);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${invoice.invoice_number || "invoice"}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => actions.open(invoice)}>View details</DropdownMenuItem>
        {items.length > 0 && <DropdownMenuSeparator />}
        {items.map((item) => (
          <DropdownMenuItem key={item.key} onSelect={item.run}>
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function useColumns(actions) {
  return useMemo(() => [
    {
      id: "select",
      enableSorting: false,
      meta: { className: "w-10" },
      header: ({ table }) => (
        <RowCheckbox
          label="Select all invoices on this page"
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
        />
      ),
      cell: ({ row }) => (
        <RowCheckbox
          label={`Select ${row.original.invoice_number || "invoice"}`}
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
        />
      ),
    },
    {
      id: "invoice_number",
      // Sorting needs an accessor; the API does the actual ordering (manualSorting).
      accessorKey: "invoice_number",
      header: ({ column }) => <SortHeader column={column}>Invoice</SortHeader>,
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => actions.open(row.original)}
          className="flex flex-col items-start gap-0.5 rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
        >
          <span className="font-medium text-foreground hover:underline">
            {row.original.invoice_number || "Needs invoice number"}
          </span>
          <span className="text-xs text-muted-foreground">{row.original.capture_source}</span>
        </button>
      ),
    },
    {
      id: "vendor_name",
      accessorKey: "vendor_name",
      header: ({ column }) => <SortHeader column={column}>Vendor</SortHeader>,
      cell: ({ row }) => <span className="block max-w-56 truncate">{row.original.vendor_name}</span>,
    },
    {
      id: "invoice_date",
      accessorKey: "invoice_date",
      header: ({ column }) => <SortHeader column={column}>Invoice date</SortHeader>,
      cell: ({ row }) => formatDate(row.original.invoice_date),
    },
    {
      id: "due_date",
      accessorKey: "due_date",
      header: ({ column }) => <SortHeader column={column}>Due date</SortHeader>,
      cell: ({ row }) => <DueDate invoice={row.original} />,
    },
    {
      id: "total_amount",
      accessorKey: "total_amount",
      meta: { numeric: true },
      header: ({ column }) => <SortHeader column={column} numeric>Amount</SortHeader>,
      cell: ({ row }) => <Amount value={row.original.total_amount} />,
    },
    {
      id: "ocr_accuracy",
      accessorKey: "ocr_accuracy",
      meta: { numeric: true },
      header: ({ column }) => <SortHeader column={column} numeric>OCR</SortHeader>,
      cell: ({ row }) => <OcrCell invoice={row.original} />,
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => <SortHeader column={column}>Status</SortHeader>,
      cell: ({ row }) => <StatusBadge kind="invoice" status={row.original.status} />,
    },
    {
      id: "actions",
      enableSorting: false,
      meta: { className: "w-12" },
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => <RowActions invoice={row.original} actions={actions} />,
    },
  ], [actions]);
}

/**
 * Server-driven DataTable: sorting and pagination are API params (?ordering, ?page), so the
 * table runs in manual mode and only renders the current page. Selection is per page.
 */
export function InvoiceTable({
  rows,
  count,
  page,
  pageSize,
  sorting,
  onSortingChange,
  onPageChange,
  rowSelection,
  onRowSelectionChange,
  actions,
  busy,
}) {
  const columns = useColumns(actions);
  return (
    <DataTable
      columns={columns}
      data={rows}
      manualSorting
      sorting={sorting}
      onSortingChange={onSortingChange}
      rowSelection={rowSelection}
      onRowSelectionChange={onRowSelectionChange}
      pagination={{ page, pageSize, count, onPageChange }}
      label="Invoice pages"
      busy={busy}
      renderMobileItem={(invoice, row) => (
        <MobileInvoiceItem invoice={invoice} row={row} actions={actions} />
      )}
    />
  );
}

/** Below md the same rows render as cards: no horizontal scrolling at 375px. */
function MobileInvoiceItem({ invoice, row, actions }) {
  return (
    <div className="flex gap-3 px-4 py-4">
      <div className="pt-0.5">
        <RowCheckbox
          label={`Select ${invoice.invoice_number || "invoice"}`}
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
        />
      </div>
      <button
        type="button"
        onClick={() => actions.open(invoice)}
        className="flex min-w-0 flex-1 flex-col gap-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate font-medium">
            {invoice.invoice_number || "Needs invoice number"}
          </span>
          <Amount value={invoice.total_amount} className="text-sm font-medium" />
        </span>
        <span className="truncate text-sm text-muted-foreground">{invoice.vendor_name}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
          <StatusBadge kind="invoice" status={invoice.status} />
          <span className="text-muted-foreground">
            Due <DueDate invoice={invoice} />
          </span>
          {!invoice.extraction_reviewed_at && invoice.ocr_text && (
            <Badge variant="warning">
              <ScanSearch />
              Not reviewed
            </Badge>
          )}
        </span>
      </button>
      <RowActions invoice={invoice} actions={actions} />
    </div>
  );
}
