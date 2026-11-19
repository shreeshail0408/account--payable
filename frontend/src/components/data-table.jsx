import React, { useEffect, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/*
 * Shared DataTable on @tanstack/react-table.
 *
 * - Server mode: pass `pagination={{ page, pageSize, count, onPageChange }}` and
 *   `manualSorting` with controlled `sorting`/`onSortingChange` (the API orders and pages).
 * - Client mode: pass `pageSize` (and optionally nothing else); sorting and paging run locally.
 * - `renderMobileItem(original, row)` renders a card list below md instead of the table, so
 *   lists never scroll sideways at 375px.
 * - Column `meta.numeric` right-aligns the column with tabular digits; `meta.className`
 *   adds classes to its header and cells.
 * - `onRowClick` makes the whole row a mouse target; keep a real button in the primary cell
 *   for keyboard users. `activeRowId` highlights the row shown in a preview pane.
 */
export function DataTable({
  columns,
  data,
  getRowId = (row) => String(row.id),
  sorting: controlledSorting,
  onSortingChange,
  manualSorting = false,
  rowSelection,
  onRowSelectionChange,
  pagination,
  pageSize,
  label = "Table pages",
  onRowClick,
  activeRowId,
  renderMobileItem,
  busy = false,
  className,
}) {
  const [localSorting, setLocalSorting] = useState([]);
  const sorting = controlledSorting ?? localSorting;
  const selectable = Boolean(onRowSelectionChange);

  const table = useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: manualSorting ? undefined : getSortedRowModel(),
    manualSorting,
    enableMultiSort: false,
    sortDescFirst: false,
    state: {
      sorting,
      ...(selectable ? { rowSelection } : {}),
    },
    onSortingChange: onSortingChange || setLocalSorting,
    onRowSelectionChange,
    enableRowSelection: selectable,
  });

  const allRows = table.getRowModel().rows;
  const client = useClientPages(allRows.length, pagination ? null : pageSize);
  const rows = client ? allRows.slice(client.start, client.end) : allRows;

  const handleRowClick = (event, row) => {
    if (!onRowClick || event.target.closest("button, a, input, select, textarea, [role='menuitem']")) {
      return;
    }
    onRowClick(row.original);
  };

  return (
    <div aria-busy={busy} className={cn("transition-opacity", busy && "opacity-60", className)}>
      <div className={cn(renderMobileItem && "hidden md:block")}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    numeric={header.column.columnDef.meta?.numeric}
                    className={header.column.columnDef.meta?.className}
                    aria-sort={ariaSort(header.column.getIsSorted())}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() || row.id === activeRowId ? "selected" : undefined}
                onClick={onRowClick ? (event) => handleRowClick(event, row) : undefined}
                className={cn(onRowClick && "cursor-pointer")}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    numeric={cell.column.columnDef.meta?.numeric}
                    className={cell.column.columnDef.meta?.className}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {renderMobileItem && (
        <ul className="flex flex-col divide-y divide-border md:hidden">
          {rows.map((row) => (
            <li
              key={row.id}
              data-state={row.id === activeRowId ? "selected" : undefined}
              className="data-[state=selected]:bg-primary-subtle"
            >
              {renderMobileItem(row.original, row)}
            </li>
          ))}
        </ul>
      )}

      {pagination && (
        <Pagination
          label={label}
          page={pagination.page}
          pageSize={pagination.pageSize}
          count={pagination.count}
          onPageChange={pagination.onPageChange}
        />
      )}
      {client && client.pageCount > 1 && (
        <Pagination
          label={label}
          page={client.page}
          pageSize={pageSize}
          count={allRows.length}
          onPageChange={client.setPage}
        />
      )}
    </div>
  );
}

/** Local paging for client mode; the page is clamped when filtering shrinks the list. */
function useClientPages(total, pageSize) {
  const [page, setPage] = useState(1);
  const pageCount = pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1;

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  if (!pageSize) {
    return null;
  }
  const current = Math.min(page, pageCount);
  return {
    page: current,
    pageCount,
    setPage,
    start: (current - 1) * pageSize,
    end: current * pageSize,
  };
}

function ariaSort(sorted) {
  if (sorted === "asc") {
    return "ascending";
  }
  if (sorted === "desc") {
    return "descending";
  }
  return undefined;
}

/** Sort decimal strings from the API ("1180.00") as numbers; blanks sort last. */
export function sortNumeric(rowA, rowB, columnId) {
  const a = Number.parseFloat(rowA.getValue(columnId));
  const b = Number.parseFloat(rowB.getValue(columnId));
  const aMissing = Number.isNaN(a);
  const bMissing = Number.isNaN(b);
  if (aMissing || bMissing) {
    return Number(aMissing) - Number(bMissing);
  }
  return a - b;
}

/** Clickable column header that toggles sorting; numeric headers put the icon on the left. */
export function SortHeader({ column, children, numeric = false }) {
  const sorted = column.getIsSorted();
  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className={cn(
        "-mx-2 inline-flex h-8 items-center gap-1 rounded-md px-2 font-medium outline-none",
        "hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/35",
        numeric && "flex-row-reverse",
        sorted && "text-foreground",
      )}
    >
      {children}
      <Icon className={cn("size-3.5", !sorted && "opacity-50")} aria-hidden="true" />
    </button>
  );
}

/** Native checkbox styled with the primary token; `indeterminate` is a DOM property. */
export function RowCheckbox({ checked, indeterminate = false, onChange, label }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={(element) => {
        if (element) {
          element.indeterminate = indeterminate && !checked;
        }
      }}
      onChange={onChange}
      onClick={(event) => event.stopPropagation()}
      className="size-4 cursor-pointer rounded-sm accent-primary"
    />
  );
}

export function Pagination({ label, page, pageSize, count, onPageChange }) {
  const pageCount = Math.max(1, Math.ceil(count / pageSize));
  const first = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(count, page * pageSize);
  const whole = { fractionDigits: 0 };
  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center justify-between gap-4 border-t border-border px-4 py-4"
    >
      <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
        {formatNumber(first, whole)}–{formatNumber(last, whole)} of {formatNumber(count, whole)}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft />
          Previous
        </Button>
        <span className="px-2 text-sm tabular-nums">
          Page {page} of {pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
        >
          Next
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
