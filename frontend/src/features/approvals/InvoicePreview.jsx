import React from "react";
import { Section } from "@/components/page";
import { ErrorState, LoadingState } from "@/components/states";
import { InlineAlert } from "@/components/inline-alert";
import { ApprovalStepper } from "@/features/invoices/detail/ApprovalStepper";
import { ExceptionCallouts } from "@/features/invoices/detail/ExceptionCallouts";
import { InvoiceSummary, useInvoiceDetail } from "@/features/invoices/detail/InvoiceDetailSheet";
import { LineMatchTable } from "@/features/invoices/detail/LineMatchTable";

/** What an approver needs to decide: amounts, exceptions, per-line matching, approval steps. */
export function InvoicePreview({ invoiceId, version }) {
  const detail = useInvoiceDetail(invoiceId, version);
  const invoice = detail.invoice?.id === invoiceId ? detail.invoice : null;

  if (detail.invoiceError && !invoice) {
    return <ErrorState title="Couldn't load the invoice" description={detail.invoiceError} onRetry={detail.retry} />;
  }
  if (!invoice) {
    return <LoadingState rows={6} className="p-0" />;
  }
  const activity = detail.activity?.invoice === invoiceId ? detail.activity : null;

  return (
    <div className="flex flex-col gap-8">
      <InvoiceSummary invoice={invoice} />

      {invoice.exceptions?.length > 0 && (
        <Section title={`Validation exceptions (${invoice.exceptions.length})`}>
          <ExceptionCallouts exceptions={invoice.exceptions} />
        </Section>
      )}

      {detail.activityError && (
        <InlineAlert tone="danger" onRetry={detail.retry}>
          {detail.activityError}
        </InlineAlert>
      )}
      {!activity && !detail.activityError && <LoadingState rows={3} className="p-0" />}
      {activity && (
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
          {activity.approvals && activity.approvals.length > 0 && (
            <Section
              title="Approval steps"
              description={(activity.restricted || []).includes("other_approvals") ? "Only your own steps are shown." : null}
            >
              <ApprovalStepper steps={activity.approvals} />
            </Section>
          )}
        </>
      )}
    </div>
  );
}
