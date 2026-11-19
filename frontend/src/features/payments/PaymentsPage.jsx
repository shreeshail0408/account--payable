import React, { useMemo, useState } from "react";
import { ChevronRight, CreditCard, Plus, SearchX } from "lucide-react";
import { useAuth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Amount } from "@/components/amount";
import { DataTable, SortHeader, sortNumeric } from "@/components/data-table";
import { InlineAlert } from "@/components/inline-alert";
import { Page, PageHeader } from "@/components/page";
import { SearchInput } from "@/components/search-input";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { useListQuery } from "@/hooks/useListQuery";
import { useRemoteData } from "@/hooks/useRemoteData";
import { formatCurrencyCompact, formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getIntegrationStatus, listAllPayments } from "./api";
import { DemoBadge } from "./DemoBadge";
import { GeneratePaymentDialog } from "./GeneratePaymentDialog";
import { canActOnPayments, isDemoRecord, matchesSearch, methodLabel, stageSummary } from "./model";
import { PaymentDetailSheet } from "./PaymentDetailSheet";

const PAGE_SIZE = 20;

export default function PaymentsPage() {
  const { user } = useAuth();
  const role = user?.role;
  const canAct = canActOnPayments(role);
  const query = useListQuery(["search", "stage"]);
  const { search, stage } = query.values;

  // All payments are loaded once: the pipeline needs totals per status and there is no
  // status filter on /payments/. Fine at AP volumes; `truncated` warns past 1,000 records.
  const payments = useRemoteData(listAllPayments, "payments", { fallback: "Payments couldn't be loaded." });
  const integrations = useRemoteData(getIntegrationStatus, "integrations", {
    fallback: "Couldn't check whether a bank integration is configured.",
  });
  const bankConfigured = Boolean(integrations.data?.bank?.configured);

  const [generateOpen, setGenerateOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const all = payments.data?.rows || [];
  const stages = useMemo(() => stageSummary(all), [all]);
  const activeStage = stages.find((item) => item.key === stage);
  const visible = useMemo(
    () => all.filter((payment) => matchesSearch(payment, search) && (!activeStage || activeStage.statuses.includes(payment.status))),
    [all, search, activeStage],
  );
  const detail = all.find((payment) => payment.id === detailId) || null;
  const columns = usePaymentColumns(setDetailId);

  return (
    <Page>
      <PageHeader
        title="Payments"
        description="Payment requests for approved invoices, their status and advice"
        actions={canAct && (
          <Button onClick={() => setGenerateOpen(true)}>
            <Plus />
            Generate payment request
          </Button>
        )}
      />

      <BankNotice integrations={integrations} bankConfigured={bankConfigured} />
      {payments.data?.truncated && (
        <InlineAlert tone="warning">
          Only the latest {formatNumber(all.length)} payments are shown. Search by reference to find older ones.
        </InlineAlert>
      )}

      <Pipeline
        stages={stages}
        loading={!payments.data && !payments.error}
        active={stage}
        onSelect={(key) => query.update({ stage: key === stage ? "" : key })}
      />

      <div className="flex flex-wrap items-end gap-4">
        <SearchInput
          id="payment-search"
          value={search}
          onChange={(value) => query.update({ search: value })}
          placeholder="Reference, invoice, vendor or bank reference"
          className="max-w-md"
        />
        {query.active && (
          <Button variant="ghost" size="sm" onClick={query.clear}>
            Clear filters
          </Button>
        )}
      </div>

      <Card className="overflow-hidden p-0">
        <PaymentListBody
          payments={payments}
          rows={visible}
          total={all.length}
          columns={columns}
          filtered={query.active}
          canAct={canAct}
          onClear={query.clear}
          onGenerate={() => setGenerateOpen(true)}
          onOpen={(payment) => setDetailId(payment.id)}
        />
      </Card>

      {canAct && (
        <GeneratePaymentDialog
          open={generateOpen}
          onOpenChange={setGenerateOpen}
          existingInvoiceIds={new Set(all.map((payment) => payment.invoice))}
          onCreated={(payment) => {
            payments.reload();
            setDetailId(payment.id);
          }}
        />
      )}

      <PaymentDetailSheet
        payment={detail}
        canAct={canAct}
        bankConfigured={bankConfigured}
        onClose={() => setDetailId(null)}
        onChanged={payments.reload}
      />
    </Page>
  );
}

function BankNotice({ integrations, bankConfigured }) {
  if (integrations.error) {
    return (
      <InlineAlert tone="danger" onRetry={integrations.reload}>
        {integrations.error} Bank submission is hidden until it can be confirmed.
      </InlineAlert>
    );
  }
  if (!integrations.data || bankConfigured) {
    return null;
  }
  return (
    <InlineAlert tone="warning" title="Demo mode – no real money transfer">
      No bank integration is configured. Recording a payment as paid only updates PayFlow; it doesn't
      send or settle any funds.
    </InlineAlert>
  );
}

/** Requested → Processing → Paid, with Failed as the exception branch. Each stage filters the list. */
function Pipeline({ stages, loading, active, onSelect }) {
  return (
    <section aria-label="Payment status pipeline" className="grid grid-cols-2 gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr_1fr]">
      {stages.map((stage, index) => (
        <React.Fragment key={stage.key}>
          {(index === 1 || index === 2) && (
            <ChevronRight className="hidden size-5 self-center text-muted-foreground lg:block" aria-hidden="true" />
          )}
          <StageCard stage={stage} loading={loading} active={active === stage.key} onSelect={() => onSelect(stage.key)} />
        </React.Fragment>
      ))}
    </section>
  );
}

const STAGE_TONES = {
  neutral: "text-muted-foreground",
  info: "text-info",
  success: "text-success",
  danger: "text-danger",
};

function StageCard({ stage, loading, active, onSelect }) {
  const Icon = stage.icon;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-4 text-left shadow-card outline-none transition-colors",
        "hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring/35",
        active ? "border-primary bg-primary-subtle" : "border-border",
        stage.key === "failed" && "lg:ml-4",
      )}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        <Icon className={cn("size-4", STAGE_TONES[stage.tone])} aria-hidden="true" />
        {stage.label}
        {stage.key === "requested" && <span className="text-xs font-normal text-muted-foreground">incl. scheduled</span>}
      </span>
      {loading ? (
        <Skeleton className="h-7 w-16" />
      ) : (
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-2xl font-semibold tabular-nums">{formatNumber(stage.count)}</span>
          <span className="text-sm text-muted-foreground tabular-nums">{formatCurrencyCompact(stage.amount)}</span>
        </span>
      )}
      <span className="sr-only">{active ? "Filter on. Select to show all payments." : "Select to show only these payments."}</span>
    </button>
  );
}

function PaymentListBody({ payments, rows, total, columns, filtered, canAct, onClear, onGenerate, onOpen }) {
  if (payments.error && !payments.data) {
    return <ErrorState title="Couldn't load payments" description={payments.error} onRetry={payments.reload} />;
  }
  if (!payments.data) {
    return <LoadingState rows={8} />;
  }
  if (!total) {
    return (
      <EmptyState
        icon={CreditCard}
        title="No payment requests yet"
        description={canAct
          ? "Generate a payment request once an invoice is fully approved."
          : "Payment requests appear here when accountants generate them for approved invoices."}
        action={canAct && (
          <Button size="sm" onClick={onGenerate}>
            <Plus />
            Generate payment request
          </Button>
        )}
      />
    );
  }
  if (!rows.length) {
    return (
      <EmptyState
        icon={SearchX}
        title="No payments match these filters"
        description="Try another stage or search term."
        action={filtered && <Button variant="outline" size="sm" onClick={onClear}>Clear filters</Button>}
      />
    );
  }
  return (
    <DataTable
      columns={columns}
      data={rows}
      pageSize={PAGE_SIZE}
      label="Payment pages"
      busy={payments.loading}
      onRowClick={onOpen}
      renderMobileItem={(payment) => <MobilePaymentItem payment={payment} onOpen={onOpen} />}
    />
  );
}

function usePaymentColumns(onOpen) {
  return useMemo(() => [
    {
      id: "reference",
      accessorKey: "reference",
      header: ({ column }) => <SortHeader column={column}>Reference</SortHeader>,
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onOpen(row.original)}
          className="flex flex-col items-start gap-0.5 rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
        >
          <span className="font-medium hover:underline">{row.original.reference}</span>
          {isDemoRecord(row.original) && <DemoBadge />}
        </button>
      ),
    },
    {
      id: "invoice_number",
      accessorKey: "invoice_number",
      header: ({ column }) => <SortHeader column={column}>Invoice</SortHeader>,
      cell: ({ row }) => row.original.invoice_number || "—",
    },
    {
      id: "vendor_name",
      accessorKey: "vendor_name",
      header: ({ column }) => <SortHeader column={column}>Vendor</SortHeader>,
      cell: ({ row }) => <span className="block max-w-56 truncate">{row.original.vendor_name}</span>,
    },
    {
      id: "amount",
      accessorKey: "amount",
      sortingFn: sortNumeric,
      meta: { numeric: true },
      header: ({ column }) => <SortHeader column={column} numeric>Amount</SortHeader>,
      cell: ({ row }) => <Amount value={row.original.amount} />,
    },
    {
      id: "method",
      header: "Method",
      cell: ({ row }) => methodLabel(row.original.payment_method),
    },
    {
      id: "requested_at",
      accessorKey: "requested_at",
      header: ({ column }) => <SortHeader column={column}>Requested</SortHeader>,
      cell: ({ row }) => formatDate(row.original.requested_at),
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => <SortHeader column={column}>Status</SortHeader>,
      cell: ({ row }) => <StatusBadge kind="payment" status={row.original.status} />,
    },
  ], [onOpen]);
}

function MobilePaymentItem({ payment, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(payment)}
      className="flex w-full flex-col gap-2 px-4 py-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-medium">{payment.reference}</span>
        <Amount value={payment.amount} className="text-sm font-medium" />
      </span>
      <span className="truncate text-sm text-muted-foreground">
        {payment.invoice_number} · {payment.vendor_name}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <StatusBadge kind="payment" status={payment.status} />
        {isDemoRecord(payment) && <DemoBadge />}
      </span>
    </button>
  );
}
