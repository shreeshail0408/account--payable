import React, { useState } from "react";
import { CircleCheck, CircleX, Download, Landmark } from "lucide-react";
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
import { toast } from "@/components/ui/toast";
import { Amount } from "@/components/amount";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { InlineAlert } from "@/components/inline-alert";
import { DescriptionList, Section } from "@/components/page";
import { StatusBadge, getStatusMeta } from "@/components/status-badge";
import { Timeline } from "@/components/timeline";
import { apiErrorMessage } from "@/lib/api-errors";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { downloadText } from "@/features/invoices/model";
import { markFailed, submitToBank } from "./api";
import {
  BANK_SUBMITTABLE,
  STAGES,
  UNPAID_STATUSES,
  adviceDocument,
  adviceFilename,
  isDemoRecord,
  methodLabel,
  stageOf,
} from "./model";
import { DemoBadge } from "./DemoBadge";
import { RecordPaidDialog } from "./RecordPaidDialog";

export function PaymentDetailSheet({ payment, canAct, bankConfigured, onClose, onChanged }) {
  const [dialog, setDialog] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const sendToBank = async () => {
    setSubmitting(true);
    try {
      await submitToBank(payment.id);
      toast.success(`${payment.reference} accepted by the bank provider.`, {
        description: "Settlement isn't confirmed until the bank reports it.",
      });
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, { fallback: "The bank submission failed." }));
    } finally {
      setSubmitting(false);
    }
  };

  const unpaid = payment && UNPAID_STATUSES.includes(payment.status);

  return (
    <Sheet open={Boolean(payment)} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="sm:max-w-xl">
        {payment && (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle>{payment.reference}</SheetTitle>
                <StatusBadge kind="payment" status={payment.status} />
                {isDemoRecord(payment) && <DemoBadge />}
              </div>
              <SheetDescription>
                {payment.invoice_number} · {payment.vendor_name}
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="flex flex-col gap-8">
              <PaymentStepper payment={payment} />

              <DescriptionList
                items={[
                  { label: "Amount", value: <Amount value={payment.amount} className="text-base font-semibold" /> },
                  { label: "Method", value: methodLabel(payment.payment_method) },
                  { label: "Requested", value: formatDateTime(payment.requested_at) },
                  { label: "Processed", value: payment.processed_at ? formatDateTime(payment.processed_at) : "Not yet" },
                  { label: "Bank reference", value: payment.bank_reference || "—" },
                ]}
              />

              <AdviceSection payment={payment} />
              <HistorySection payment={payment} />

              <p className="text-xs text-muted-foreground">
                Payment status records are not proof of bank settlement. Confirm settlement with your
                authorised payment provider.
              </p>
            </SheetBody>
            {canAct && unpaid && (
              <SheetFooter>
                <Button variant="outline" onClick={() => setDialog("failed")}>
                  <CircleX />
                  Mark failed
                </Button>
                {bankConfigured && BANK_SUBMITTABLE.includes(payment.status) && (
                  <Button variant="outline" onClick={sendToBank} loading={submitting}>
                    {!submitting && <Landmark />}
                    Submit to bank
                  </Button>
                )}
                <Button onClick={() => setDialog("paid")}>
                  <CircleCheck />
                  {bankConfigured ? "Record as paid" : "Record demo payment"}
                </Button>
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>

      {payment && (
        <>
          <RecordPaidDialog
            open={dialog === "paid"}
            onOpenChange={(open) => !open && setDialog(null)}
            payment={payment}
            bankConfigured={bankConfigured}
            onDone={onChanged}
          />
          <ConfirmDialog
            open={dialog === "failed"}
            onOpenChange={(open) => !open && setDialog(null)}
            title={`Mark ${payment.reference} as failed?`}
            description="Use this when the bank rejected or returned the payment. The invoice stays approved; follow up with the vendor or bank to resolve it."
            confirmLabel="Mark failed"
            destructive
            comment={{
              label: "What went wrong",
              placeholder: "e.g. Beneficiary account closed (bank return code R03)",
              required: true,
              minLength: 2,
            }}
            errorFallback="The failure couldn't be recorded."
            onConfirm={async (reason) => {
              await markFailed(payment.id, reason);
              toast.success(`${payment.reference} marked as failed.`);
              onChanged();
            }}
          />
        </>
      )}
    </Sheet>
  );
}

/** Requested → Processing → Paid or Failed; steps the payment skipped are drawn as skipped. */
function PaymentStepper({ payment }) {
  const reached = new Set((payment.status_events || []).map((event) => event.new_status));
  reached.add(payment.status);
  const current = stageOf(payment.status).key;
  const outcome = payment.status === "FAILED" ? STAGES[3] : STAGES[2];
  const steps = [STAGES[0], STAGES[1], outcome];
  const order = steps.map((step) => step.key);
  const currentIndex = order.indexOf(current);

  return (
    <ol aria-label="Payment progress" className="flex items-start">
      {steps.map((step, index) => {
        const skipped = step.key === "processing" && index < currentIndex && !reached.has("PROCESSING");
        const done = !skipped && (index < currentIndex || (index === currentIndex && ["paid", "failed"].includes(current)));
        const isCurrent = index === currentIndex;
        const Icon = step.icon;
        return (
          <li key={step.key} className="flex flex-1 flex-col items-center gap-2 text-center">
            <div className="flex w-full items-center">
              <span className={cn("h-px flex-1", index === 0 ? "bg-transparent" : done || isCurrent ? "bg-primary" : "bg-border")} />
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border",
                  step.key === "failed" && isCurrent && "border-danger-border bg-danger-subtle text-danger",
                  step.key !== "failed" && done && "border-success-border bg-success-subtle text-success",
                  step.key !== "failed" && isCurrent && !done && "border-primary-border bg-primary-subtle text-primary-subtle-foreground",
                  !done && !isCurrent && "border-border bg-muted text-muted-foreground",
                  skipped && "border-dashed",
                )}
              >
                <Icon className={cn("size-4", isCurrent && step.key === "processing" && "animate-spin [animation-duration:2.5s]")} aria-hidden="true" />
              </span>
              <span className={cn("h-px flex-1", index === steps.length - 1 ? "bg-transparent" : done ? "bg-primary" : "bg-border")} />
            </div>
            <span className={cn("text-xs", isCurrent ? "font-medium text-foreground" : "text-muted-foreground")}>
              {step.key === "paid" && !isCurrent ? "Paid / Failed" : step.label}
              {skipped && <span className="block text-[11px]">skipped</span>}
              <span className="sr-only">
                {isCurrent ? ", current" : done ? ", done" : ", not reached"}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function AdviceSection({ payment }) {
  const download = () => {
    downloadText(adviceDocument(payment), adviceFilename(payment), "text/plain;charset=utf-8");
  };
  return (
    <Section
      title="Payment advice"
      aside={payment.advice && (
        <Button size="sm" variant="outline" onClick={download}>
          <Download />
          Download advice
        </Button>
      )}
    >
      {payment.advice ? (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/50 p-3 font-mono text-xs">
          {payment.advice}
        </pre>
      ) : (
        <p className="text-sm text-muted-foreground">No advice was generated for this payment.</p>
      )}
      {isDemoRecord(payment) && (
        <InlineAlert tone="warning">
          This payment was recorded in demo mode. No money was transferred to the vendor.
        </InlineAlert>
      )}
    </Section>
  );
}

function HistorySection({ payment }) {
  const events = payment.status_events || [];
  const tone = (status) => ({ PAID: "success", FAILED: "danger", PROCESSING: "info" }[status] || "neutral");
  return (
    <Section title="Status history">
      {events.length ? (
        <Timeline
          items={events.map((event) => ({
            key: event.id,
            title: event.previous_status
              ? `${getStatusMeta(event.previous_status, "payment").label} → ${getStatusMeta(event.new_status, "payment").label}`
              : getStatusMeta(event.new_status, "payment").label,
            time: event.changed_at,
            actor: event.changed_by_name || "System",
            description: event.note,
            tone: tone(event.new_status),
            icon: stageOf(event.new_status).icon,
          }))}
        />
      ) : (
        <p className="text-sm text-muted-foreground">No status changes recorded.</p>
      )}
    </Section>
  );
}
