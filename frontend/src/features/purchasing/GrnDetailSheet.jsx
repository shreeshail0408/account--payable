import React from "react";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Amount } from "@/components/amount";
import { DescriptionList, Section } from "@/components/page";
import { QuantityProgress } from "@/components/progress";
import { LoadingState } from "@/components/states";
import { formatDate, formatNumber } from "@/lib/format";
import { fromPaise, lineAmountPaise } from "@/lib/money";

/** GRN drawer: the lines in this receipt and where each PO line now stands overall. */
export function GrnDetailSheet({ grn, po, ordersLoading, onClose }) {
  const poLines = new Map((po?.lines || []).map((line) => [line.id, line]));
  return (
    <Sheet open={Boolean(grn)} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="sm:max-w-2xl">
        {grn && (
          <>
            <SheetHeader>
              <SheetTitle>{grn.number}</SheetTitle>
              <SheetDescription>
                {po ? `${po.number} · ${po.vendor_name}` : `PO #${grn.purchase_order}`}
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="flex flex-col gap-8">
              <DescriptionList
                items={[
                  { label: "Received on", value: formatDate(grn.received_date) },
                  { label: "Lines", value: formatNumber(grn.lines?.length || 0) },
                  { label: "Notes", value: grn.notes || "—", wide: true },
                ]}
              />
              <Section title="Received lines" description="Progress shows the PO line's total received to date.">
                {!po && ordersLoading ? (
                  <LoadingState rows={2} className="p-0" />
                ) : (
                  <div className="rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>PO line</TableHead>
                          <TableHead numeric>This receipt</TableHead>
                          <TableHead numeric>Value</TableHead>
                          <TableHead className="w-44">PO line received</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(grn.lines || []).map((line) => {
                          const poLine = poLines.get(line.po_line);
                          return (
                            <TableRow key={line.id}>
                              <TableCell className="max-w-56 whitespace-normal">
                                {poLine?.description || `Line #${line.po_line}`}
                              </TableCell>
                              <TableCell numeric>{formatNumber(line.quantity)}</TableCell>
                              <TableCell numeric>
                                {poLine ? (
                                  <Amount value={fromPaise(lineAmountPaise({ quantity: line.quantity, unit_price: poLine.unit_price }))} />
                                ) : "—"}
                              </TableCell>
                              <TableCell>
                                {poLine ? (
                                  <QuantityProgress
                                    received={poLine.received_quantity}
                                    ordered={poLine.quantity}
                                    label={`Received to date for ${poLine.description}`}
                                  />
                                ) : "—"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Section>
            </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
