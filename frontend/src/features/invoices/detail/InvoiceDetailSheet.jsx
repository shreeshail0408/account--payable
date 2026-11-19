import React, { useCallback, useEffect, useState } from "react";
import { CircleAlert, FileSearch, Lock, RefreshCw, Send, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { Amount } from "@/components/amount";
import { StatusBadge } from "@/components/status-badge";
import { LoadingState, ErrorState } from "@/components/states";
import { apiErrorMessage } from "@/lib/api-errors";
import { daysFromToday, formatCurrency, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getInvoice, getInvoiceActivity } from "../api";
import { isOverdue } from "../model";
import { ApprovalStepper } from "./ApprovalStepper";
import { AuditTimeline } from "./AuditTimeline";
import { ExceptionCallouts } from "./ExceptionCallouts";
import { LineMatchTable } from "./LineMatchTable";

const MATCH_LABELS = { NONE: "No matching", "2WAY": "2-way", "3WAY": "3-way" };

/** Fetches the invoice itself (fresh) and its activity; each can fail on its own. */
export function useInvoiceDetail(invoiceId, version) {
  const [state, setState] = useState({ invoice: null, invoiceError: "", activity: null, activityError: "" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!invoiceId) {
      return undefined;
    }
    let cancelled = false;
    setState((current) => ({ ...current, invoiceError: "", activity: null, activityError: "" }));
    getInvoice(invoiceId)
      .then((invoice) => !cancelled && setState((current) => ({ ...current, invoice })))
      .catch((error) => !cancelled && setState((current) => ({
        ...current,
        invoiceError: apiErrorMessage(error, { fallback: "The invoice couldn't be loaded." }),
      })));
    getInvoiceActivity(invoiceId)
      .then((activity) => !cancelled && setState((current) => ({ ...current, activity })))
      .catch((error) => !cancelled && setState((current) => ({
        ...current,
        activityError: apiErrorMessage(error, { fallback: "Matching, approvals and history couldn't be loaded." }),
      })));
    return () => {
      cancelled = true;
    };
  }, [invoiceId, version, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, retry };
}

/**
 * Invoice record drawer: summary, exceptions, per-line PO / GRN / invoice comparison, approval
 * progress, payment and audit history. `actions` supplies the role-gated buttons.
 */
export function InvoiceDetailSheet({ summary, version, onClose, actions }) {
  const open = Boolean(summary);
  const detail = useInvoiceDetail(summary?.id, version);
  const invoice = detail.invoice && detail.invoice.id === summary?.id ? detail.invoice : summary;
  const items = invoice ? actions.forInvoice(invoice) : [];

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="sm:max-w-2xl">
        {invoice && (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle>{invoice.invoice_number || "Invoice without a number"}</SheetTitle>
                <StatusBadge kind="invoice" status={invoice.status} />
              </div>
              <SheetDescription>{invoice.vendor_name}</SheetDescription>
            </SheetHeader>
            <SheetBody className="flex flex-col gap-8">
              {detail.invoiceError && (
                <p role="alert" className="flex items-center gap-2 rounded-md border border-danger-border bg-danger-subtle px-3 py-2 text-sm text-danger-subtle-foreground">
                  <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
                  {detail.invoiceError} Showing the list values.
                </p>
              )}
              <InvoiceSummary invoice={invoice} />

              {invoice.exceptions?.length > 0 && (
                <Section title="Validation exceptions" count={invoice.exceptions.length}>
                  <ExceptionCallouts exceptions={invoice.exceptions} />
                </Section>
              )}

              <ActivitySections detail={detail} invoice={invoice} />
            </SheetBody>
            {items.length > 0 && (
              <SheetFooter>
                {items.map((item) => (
                  <Button
                    key={item.key}
                    variant={item.primary ? "default" : "outline"}
                    onClick={item.run}
                  >
                    {actionIcon(item.key)}
                    {item.label}
                  </Button>
                ))}
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function actionIcon(key) {
  if (key === "review") {
    return <FileSearch />;
  }
  if (key === "submit") {
    return <Send />;
  }
  if (key === "erp") {
    return <RefreshCw />;
  }
  return null;
}

function Section({ title, count, children, aside }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {count !== undefined && (
          <Badge variant="neutral" className="tabular-nums">
            {count}
          </Badge>
        )}
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

function Restricted({ text }) {
  return (
    <p className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
      <Lock className="size-4 shrink-0" aria-hidden="true" />
      {text}
    </p>
  );
}

/** Amounts, dates, matching and OCR facts; reused by the approval preview. */
export function InvoiceSummary({ invoice }) {
  const overdue = isOverdue(invoice, daysFromToday);
  const rows = [
    ["Invoice date", formatDate(invoice.invoice_date)],
    [
      "Due date",
      <span key="due" className={cn(overdue && "font-medium text-danger")}>
        {invoice.due_date ? formatDate(invoice.due_date) : "Missing"}
        {overdue && " · overdue"}
      </span>,
    ],
    ["Matching", `${MATCH_LABELS[invoice.match_type] || invoice.match_type}${invoice.purchase_order ? "" : " · no PO"}`],
    ["Source", invoice.capture_source],
    ["GSTIN", invoice.extracted_gstin || "—"],
    [
      "OCR",
      invoice.ocr_text
        ? `${formatNumber(invoice.ocr_accuracy, { fractionDigits: 1 })}% word confidence`
        : "No OCR text",
    ],
  ];

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-3 gap-4 rounded-lg border border-border p-4">
        <Money label="Subtotal" value={invoice.subtotal} />
        <Money label="Tax" value={invoice.tax_amount} />
        <Money label="Total" value={invoice.total_amount} strong />
      </dl>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="truncate text-sm">{value}</dd>
          </div>
        ))}
      </dl>
      {invoice.extraction_reviewed_at ? (
        <p className="flex items-center gap-2 text-sm text-success">
          <UserCheck className="size-4" aria-hidden="true" />
          Extraction reviewed {formatDateTime(invoice.extraction_reviewed_at)}
        </p>
      ) : (
        invoice.ocr_text && (
          <p className="flex items-center gap-2 text-sm text-warning-subtle-foreground">
            <FileSearch className="size-4" aria-hidden="true" />
            OCR extraction hasn't been reviewed yet; it must be before approval.
          </p>
        )
      )}
    </div>
  );
}

function Money({ label, value, strong }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("truncate", strong ? "text-base font-semibold" : "text-sm")}>
        <Amount value={value} />
      </dd>
    </div>
  );
}

function ActivitySections({ detail, invoice }) {
  if (detail.activityError) {
    return <ErrorState title="Couldn't load the activity" description={detail.activityError} onRetry={detail.retry} />;
  }
  if (!detail.activity || detail.activity.invoice !== invoice.id) {
    return <LoadingState rows={6} className="p-0" />;
  }
  const activity = detail.activity;
  const restricted = new Set(activity.restricted || []);

  return (
    <>
      <Section
        title="Matching by line"
        aside={activity.purchase_order_number && (
          <span className="text-xs text-muted-foreground">PO {activity.purchase_order_number}</span>
        )}
      >
        {activity.lines.length ? (
          <LineMatchTable lines={activity.lines} matchType={activity.match_type} />
        ) : (
          <p className="text-sm text-muted-foreground">This invoice has no line items.</p>
        )}
      </Section>

      <Section title="Approval progress">
        {restricted.has("approvals") ? (
          <Restricted text="Your role can't view approval steps." />
        ) : activity.approvals.length ? (
          <>
            <ApprovalStepper steps={activity.approvals} />
            {restricted.has("other_approvals") && (
              <p className="text-xs text-muted-foreground">Only your own steps are shown.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Not submitted for approval yet.</p>
        )}
      </Section>

      <Section title="Payment">
        {restricted.has("payment") ? (
          <Restricted text="Your role can't view payment details." />
        ) : (
          <PaymentSummary payment={activity.payment} />
        )}
      </Section>

      <Section title="History" count={activity.audit ? activity.audit.length : undefined}>
        {restricted.has("audit") ? (
          <Restricted text="The audit history is visible to admins and auditors." />
        ) : activity.audit.length ? (
          <AuditTimeline events={activity.audit} />
        ) : (
          <p className="text-sm text-muted-foreground">No audit events recorded yet.</p>
        )}
      </Section>
    </>
  );
}

function PaymentSummary({ payment }) {
  if (!payment) {
    return <p className="text-sm text-muted-foreground">No payment has been generated for this invoice.</p>;
  }
  const events = payment.status_events || [];
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{payment.reference}</span>
        <StatusBadge kind="payment" status={payment.status} />
        <span className="ml-auto text-sm font-medium tabular-nums">{formatCurrency(payment.amount)}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {payment.payment_method}
        {payment.bank_reference && ` · Bank reference ${payment.bank_reference}`}
      </p>
      {events.length > 0 && (
        <ol className="flex flex-col gap-1 border-t border-border pt-3">
          {events.map((event) => (
            <li key={event.id} className="flex flex-wrap items-center gap-2 text-xs">
              <StatusBadge kind="payment" status={event.new_status} />
              <span className="text-muted-foreground">{formatDateTime(event.changed_at)}</span>
              {event.changed_by_name && <span className="text-muted-foreground">by {event.changed_by_name}</span>}
              {event.note && <span className="w-full text-muted-foreground">{event.note}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
