import React, { useState } from "react";
import { CircleCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Amount } from "@/components/amount";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable, SortHeader, sortNumeric } from "@/components/data-table";
import { Field, fieldProps } from "@/components/field";
import { InlineAlert } from "@/components/inline-alert";
import { DescriptionList, PageHeader } from "@/components/page";
import { Progress, QuantityProgress } from "@/components/progress";
import { SearchInput } from "@/components/search-input";
import { StatusBadge } from "@/components/status-badge";
import { Timeline } from "@/components/timeline";

const SAMPLE_ROWS = [
  { id: 1, number: "PO-1042", vendor: "Acme Office Supplies", amount: "48250.00", status: "OPEN" },
  { id: 2, number: "PO-1043", vendor: "Northwind Logistics", amount: "1290.50", status: "CLOSED" },
  { id: 3, number: "PO-1044", vendor: "Globex Components", amount: "312000.00", status: "CANCELLED" },
];

const SAMPLE_COLUMNS = [
  {
    id: "number",
    accessorKey: "number",
    header: ({ column }) => <SortHeader column={column}>PO</SortHeader>,
  },
  { id: "vendor", accessorKey: "vendor", header: "Vendor" },
  {
    id: "amount",
    accessorKey: "amount",
    sortingFn: sortNumeric,
    meta: { numeric: true },
    header: ({ column }) => <SortHeader column={column} numeric>Amount</SortHeader>,
    cell: ({ row }) => <Amount value={row.original.amount} />,
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge kind="purchaseOrder" status={row.original.status} />,
  },
];

/** Shared page building blocks in src/components (DataTable, Progress, ConfirmDialog, …). */
export function PatternsSection({ Section, Specimen }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [search, setSearch] = useState("");

  return (
    <Section
      id="patterns"
      title="Page patterns"
      description="Shared building blocks for list pages, detail sheets and forms (src/components)."
    >
      <Specimen title="PageHeader" className="block">
        <PageHeader
          title="Purchase orders"
          description="Ordered quantities and prices that invoices are matched against"
          actions={<Button>Create PO</Button>}
        />
      </Specimen>

      <Specimen title="DataTable (client sorting + mobile cards) and SearchInput" className="block">
        <div className="flex flex-col gap-4">
          <SearchInput id="styleguide-search" value={search} onChange={setSearch} placeholder="Debounced, synced to ?search=" className="max-w-sm" />
          <Card className="overflow-hidden p-0">
            <DataTable
              columns={SAMPLE_COLUMNS}
              data={SAMPLE_ROWS.filter((row) => row.vendor.toLowerCase().includes(search.toLowerCase()))}
              pageSize={20}
              renderMobileItem={(row) => (
                <div className="flex items-baseline justify-between gap-3 px-4 py-3">
                  <span className="font-medium">{row.number}</span>
                  <Amount value={row.amount} />
                </div>
              )}
            />
          </Card>
        </div>
      </Specimen>

      <Specimen title="Progress — received vs ordered (light segment = this receipt; red = over)" className="grid gap-4 sm:grid-cols-3">
        <QuantityProgress received={4} ordered={10} label="Example partly received" />
        <QuantityProgress received={10} ordered={10} label="Example fully received" />
        <div className="flex flex-col gap-1">
          <Progress value={6} extra={6} max={10} label="Example over-received" />
          <span className="text-xs text-muted-foreground">6 + 6 of 10</span>
        </div>
      </Specimen>

      <Specimen title="InlineAlert" className="grid gap-3">
        <InlineAlert tone="warning" title="Demo mode – no real money transfer">
          No bank integration is configured.
        </InlineAlert>
        <InlineAlert tone="info">External GST verification isn't configured.</InlineAlert>
        <InlineAlert tone="danger" onRetry={() => {}}>Vendors couldn't be loaded.</InlineAlert>
      </Specimen>

      <div className="grid gap-8 lg:grid-cols-2">
        <Specimen title="Field (label, hint, error)" className="grid gap-4">
          <Field id="styleguide-gstin" label="GSTIN" hint="15 characters, optional">
            <Input {...fieldProps("styleguide-gstin", null, true)} className="font-mono" defaultValue="29ABCDE1234F1Z5" />
          </Field>
          <Field id="styleguide-ifsc" label="IFSC" required error="Use the 11-character IFSC format.">
            <Input {...fieldProps("styleguide-ifsc", "error")} defaultValue="HDFC12" />
          </Field>
        </Specimen>
        <Specimen title="Timeline" className="block">
          <Timeline
            items={[
              { key: "a", title: "Submitted for onboarding", time: "2026-11-18T09:30:00Z", actor: "clerk", tone: "info", icon: Send },
              { key: "b", title: "Approved and activated", time: "2026-11-19T04:10:00Z", actor: "admin", tone: "success", icon: CircleCheck },
            ]}
          />
        </Specimen>
      </div>

      <Specimen title="DescriptionList" className="block">
        <DescriptionList
          columns={3}
          items={[
            { label: "Ordered", value: "18 Nov 2026" },
            { label: "Expected", value: "02 Dec 2026" },
            { label: "PO total", value: <Amount value="48250" /> },
          ]}
        />
      </Specimen>

      <Specimen title="ConfirmDialog with a required comment">
        <Button variant="outline" onClick={() => setConfirmOpen(true)}>
          Reject vendor…
        </Button>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Reject Acme Office Supplies?"
          description="The vendor is blocked and the submitter sees your reason."
          confirmLabel="Reject vendor"
          destructive
          comment={{ label: "Reason for rejection", required: true, minLength: 2 }}
          onConfirm={() => new Promise((resolve) => setTimeout(resolve, 600))}
        />
      </Specimen>
    </Section>
  );
}
