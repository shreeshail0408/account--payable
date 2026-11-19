import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FileStack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Amount } from "@/components/amount";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { useRemoteData } from "@/hooks/useRemoteData";
import { formatDate, formatNumber } from "@/lib/format";
import { listVendorInvoices } from "../api";

/** The vendor's most recent invoices (first page) with a link to the full, filtered list. */
export function InvoicesTab({ vendor, role }) {
  const invoices = useRemoteData(() => listVendorInvoices(vendor.id), String(vendor.id), {
    fallback: "This vendor's invoices couldn't be loaded.",
  });

  if (invoices.error && !invoices.data) {
    return <ErrorState title="Couldn't load invoices" description={invoices.error} onRetry={invoices.reload} />;
  }
  if (!invoices.data) {
    return <LoadingState rows={4} className="p-0" />;
  }

  const rows = invoices.data.results || invoices.data;
  const count = invoices.data.count ?? rows.length;
  const accountantNote = role === "ACCOUNTANT" && (
    <p className="text-xs text-muted-foreground">Accountants see approved and paid invoices only.</p>
  );

  if (!rows.length) {
    return (
      <div className="flex flex-col gap-2">
        <EmptyState
          icon={FileStack}
          title="No invoices from this vendor yet"
          description="Captured invoices for this vendor will be listed here."
          className="py-8"
        />
        {accountantNote}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {count > rows.length
            ? `Latest ${rows.length} of ${formatNumber(count, { fractionDigits: 0 })} invoices`
            : `${formatNumber(count, { fractionDigits: 0 })} invoice${count === 1 ? "" : "s"}`}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to={`/invoices?vendor=${vendor.id}`}>
            Open in Invoices
            <ArrowRight />
          </Link>
        </Button>
      </div>
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Invoice</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Due</TableHead>
              <TableHead numeric>Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell className="font-medium">{invoice.invoice_number || "No number"}</TableCell>
                <TableCell>{formatDate(invoice.invoice_date)}</TableCell>
                <TableCell>{formatDate(invoice.due_date)}</TableCell>
                <TableCell numeric>
                  <Amount value={invoice.total_amount} />
                </TableCell>
                <TableCell>
                  <StatusBadge kind="invoice" status={invoice.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {accountantNote}
    </div>
  );
}
