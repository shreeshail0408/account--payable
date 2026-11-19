import React from "react";
import { CircleCheck, CircleMinus, CircleX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const RESULT = {
  matched: { label: "Matched", variant: "success", icon: CircleCheck },
  mismatch: { label: "Mismatch", variant: "danger", icon: CircleX },
  unlinked: { label: "No PO line", variant: "danger", icon: CircleMinus },
  not_required: { label: "Not matched", variant: "neutral", icon: CircleMinus },
};

function Value({ ok, children }) {
  return (
    <span className={cn("tabular-nums", ok === false && "font-medium text-danger")}>
      {children}
      {ok === false && <span className="sr-only"> (doesn't match)</span>}
    </span>
  );
}

function receivedText(line) {
  if (!line.po_line) {
    return "—";
  }
  return formatNumber(line.po_line.received_quantity);
}

/** PO vs GRN vs invoice for every invoice line, from GET /invoices/{id}/activity/. */
export function LineMatchTable({ lines, matchType }) {
  const threeWay = matchType === "3WAY";
  return (
    <>
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Item</TableHead>
              <TableHead numeric>PO</TableHead>
              <TableHead numeric>GRN received</TableHead>
              <TableHead numeric>Invoice</TableHead>
              <TableHead>Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.line_id}>
                <TableCell className="max-w-48 whitespace-normal">
                  <span className="font-medium">{line.description}</span>
                  {line.po_line && line.checks.description === "fail" && (
                    <span className="block text-xs text-danger">PO: {line.po_line.description}</span>
                  )}
                </TableCell>
                <TableCell numeric>
                  {line.po_line ? (
                    <span className="flex flex-col">
                      <span>{formatNumber(line.po_line.quantity)} ordered</span>
                      <span className="text-xs text-muted-foreground">@ {formatCurrency(line.po_line.unit_price)}</span>
                    </span>
                  ) : "—"}
                </TableCell>
                <TableCell numeric>
                  <span className="flex flex-col">
                    <Value ok={threeWay && line.po_line ? line.checks.quantity === "ok" : undefined}>
                      {receivedText(line)}
                    </Value>
                    {line.receipts.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {line.receipts.map((receipt) => receipt.grn_number).join(", ")}
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell numeric>
                  <span className="flex flex-col">
                    <Value ok={line.po_line ? line.checks.quantity === "ok" : undefined}>
                      {formatNumber(line.quantity)}
                    </Value>
                    <Value ok={line.po_line ? line.checks.unit_price === "ok" : undefined}>
                      <span className="text-xs">@ {formatCurrency(line.unit_price)}</span>
                    </Value>
                    <Value ok={line.po_line ? line.checks.amount === "ok" : undefined}>
                      <span className="text-xs">= {formatCurrency(line.amount)}</span>
                    </Value>
                  </span>
                </TableCell>
                <TableCell>
                  <ResultBadge status={line.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-3 sm:hidden">
        {lines.map((line) => (
          <li key={line.line_id} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 text-sm font-medium">{line.description}</span>
              <ResultBadge status={line.status} />
            </div>
            <dl className="grid grid-cols-3 gap-2 text-xs">
              <Cell label="PO">
                {line.po_line ? `${formatNumber(line.po_line.quantity)} @ ${formatCurrency(line.po_line.unit_price)}` : "—"}
              </Cell>
              <Cell label="GRN">{receivedText(line)}</Cell>
              <Cell label="Invoice">
                <Value ok={line.po_line ? line.status === "matched" : undefined}>
                  {formatNumber(line.quantity)} @ {formatCurrency(line.unit_price)}
                </Value>
              </Cell>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

function Cell({ label, children }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}

function ResultBadge({ status }) {
  const meta = RESULT[status] || RESULT.not_required;
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant}>
      <Icon />
      {meta.label}
    </Badge>
  );
}
