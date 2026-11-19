import React from "react";
import { Link } from "react-router-dom";
import { PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Amount } from "@/components/amount";
import { DescriptionList, Section } from "@/components/page";
import { QuantityProgress } from "@/components/progress";
import { ErrorState, LoadingState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { useRemoteData } from "@/hooks/useRemoteData";
import { formatDate, formatNumber } from "@/lib/format";
import { fromPaise, lineAmountPaise } from "@/lib/money";
import { fetchAllPages } from "@/lib/pagination";
import { canRecordReceipts, poProgress, remainingQuantity } from "./model";

/** PO record drawer: header facts, per-line received vs ordered, and the receipts against it. */
export function PoDetailSheet({ po, role, onClose }) {
  const open = Boolean(po);
  const lines = po?.lines || [];
  const linesTotal = lines.reduce((sum, line) => sum + lineAmountPaise(line), 0);
  const receivable = po?.status === "OPEN" && lines.some((line) => remainingQuantity(line) > 0);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="sm:max-w-2xl">
        {po && (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle>{po.number}</SheetTitle>
                <StatusBadge kind="purchaseOrder" status={po.status} />
              </div>
              <SheetDescription>{po.vendor_name}</SheetDescription>
            </SheetHeader>
            <SheetBody className="flex flex-col gap-8">
              <DescriptionList
                columns={3}
                items={[
                  { label: "Ordered", value: formatDate(po.order_date) },
                  { label: "Expected", value: formatDate(po.expected_date) },
                  { label: "PO total", value: <Amount value={po.total_amount} className="font-medium" /> },
                ]}
              />

              <Section
                title="Lines"
                description="Received quantities come from goods receipts."
                aside={lines.length > 0 && <OverallProgress po={po} />}
              >
                {lines.length ? (
                  <PoLinesTable lines={lines} linesTotal={linesTotal} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    This PO has no lines, so invoices are matched on the total only and goods can't be received.
                  </p>
                )}
              </Section>

              <ReceiptsSection po={po} />
            </SheetBody>
            {canRecordReceipts(role) && receivable && (
              <SheetFooter>
                <Button asChild>
                  <Link to={`/goods-receipts?new=1&po=${po.id}`}>
                    <PackageCheck />
                    Record goods receipt
                  </Link>
                </Button>
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function OverallProgress({ po }) {
  const { ordered, received } = poProgress(po);
  return (
    <QuantityProgress
      received={received}
      ordered={ordered}
      label={`Total received for ${po.number}`}
      className="w-40"
    />
  );
}

function PoLinesTable({ lines, linesTotal }) {
  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Description</TableHead>
            <TableHead numeric>Unit price</TableHead>
            <TableHead numeric>Amount</TableHead>
            <TableHead className="w-44">Received / ordered</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell className="max-w-56 whitespace-normal">{line.description}</TableCell>
              <TableCell numeric>
                <Amount value={line.unit_price} />
              </TableCell>
              <TableCell numeric>
                <Amount value={line.amount} />
              </TableCell>
              <TableCell>
                <QuantityProgress
                  received={line.received_quantity}
                  ordered={line.quantity}
                  label={`Received quantity for ${line.description}`}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={2}>Lines total</TableCell>
            <TableCell numeric>
              <Amount value={fromPaise(linesTotal)} />
            </TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

/** GRNs have no ?purchase_order filter, so all receipts are fetched and filtered here. */
function ReceiptsSection({ po }) {
  const receipts = useRemoteData(
    () => fetchAllPages("/grns/").then(({ rows }) => rows.filter((grn) => grn.purchase_order === po.id)),
    String(po.id),
    { fallback: "Goods receipts for this PO couldn't be loaded." },
  );
  const linesById = new Map((po.lines || []).map((line) => [line.id, line]));

  let body;
  if (receipts.error && !receipts.data) {
    body = <ErrorState title="Couldn't load receipts" description={receipts.error} onRetry={receipts.reload} className="py-6" />;
  } else if (!receipts.data) {
    body = <LoadingState rows={2} className="p-0" />;
  } else if (!receipts.data.length) {
    body = <p className="text-sm text-muted-foreground">No goods received against this PO yet.</p>;
  } else {
    body = (
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {receipts.data.map((grn) => (
          <li key={grn.id} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{grn.number}</span>
              <span className="text-xs text-muted-foreground">{formatDate(grn.received_date)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {(grn.lines || [])
                .map((line) => `${linesById.get(line.po_line)?.description || `Line #${line.po_line}`} × ${formatNumber(line.quantity)}`)
                .join(" · ")}
            </p>
          </li>
        ))}
      </ul>
    );
  }
  return <Section title="Goods receipts">{body}</Section>;
}
