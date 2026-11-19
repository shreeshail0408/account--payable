import React, { useEffect, useState } from "react";
import { AlarmClock, CircleCheck, CircleX, FileText, Hourglass } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Amount } from "@/components/amount";
import { InlineAlert } from "@/components/inline-alert";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatDateTime, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { InvoicePreview } from "./InvoicePreview";
import { REJECT_MIN_LENGTH, isActionable, isOverdue, isWaiting } from "./model";

/*
 * Mobile approvals (<768px): one card per step with full-width 48px Approve / Reject buttons in
 * thumb reach. No swipe gestures; every decision is a tap plus a confirm sheet, and rejecting
 * requires a comment.
 */
export function MobileApprovalList({ rows, user, decision, version }) {
  const [pending, setPending] = useState(null);
  const [viewing, setViewing] = useState(null);

  const openDecision = (approval, action) => {
    decision.reset();
    setPending({ approval, action });
  };

  return (
    <>
      <ul className="flex flex-col gap-4">
        {rows.map((approval) => (
          <li key={approval.id}>
            <ApprovalCard
              approval={approval}
              actionable={isActionable(approval, user)}
              onView={() => setViewing(approval)}
              onDecide={(action) => openDecision(approval, action)}
            />
          </li>
        ))}
      </ul>

      <Sheet open={Boolean(viewing)} onOpenChange={(open) => !open && setViewing(null)}>
        <SheetContent>
          {viewing && (
            <>
              <SheetHeader>
                <SheetTitle>{viewing.invoice_number || "Invoice"}</SheetTitle>
                <SheetDescription>{viewing.vendor_name}</SheetDescription>
              </SheetHeader>
              <SheetBody>
                <InvoicePreview invoiceId={viewing.invoice} version={version} />
              </SheetBody>
              {isActionable(viewing, user) && (
                <SheetFooter className="grid grid-cols-2 gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  <BigButton tone="reject" onClick={() => openDecision(viewing, "reject")} />
                  <BigButton tone="approve" onClick={() => openDecision(viewing, "approve")} />
                </SheetFooter>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      <DecisionSheet
        pending={pending}
        decision={decision}
        onClose={() => setPending(null)}
        onDone={() => {
          setPending(null);
          setViewing(null);
        }}
      />
    </>
  );
}

function ApprovalCard({ approval, actionable, onView, onDecide }) {
  const overdue = isOverdue(approval);
  return (
    <article
      aria-label={`Approval for ${approval.invoice_number || "invoice"}`}
      className={cn(
        "flex flex-col gap-4 rounded-lg border bg-card p-4 shadow-card",
        overdue ? "border-danger-border" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="truncate text-base font-semibold">{approval.invoice_number || "Invoice"}</h2>
          <p className="truncate text-sm text-muted-foreground">{approval.vendor_name || "Vendor"}</p>
        </div>
        <StatusBadge kind="approval" status={approval.status} />
      </div>

      <Amount value={approval.invoice_total_amount} className="text-2xl font-semibold tracking-tight" />

      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <div className="flex gap-1">
          <dt className="text-muted-foreground">Invoice due</dt>
          <dd>{formatDate(approval.invoice_due_date)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-muted-foreground">Step</dt>
          <dd className="tabular-nums">{approval.sequence}</dd>
        </div>
      </dl>
      <StepTiming approval={approval} overdue={overdue} />

      <Button variant="outline" className="h-11 w-full" onClick={onView}>
        <FileText />
        View invoice details
      </Button>

      {actionable ? (
        <div className="grid grid-cols-2 gap-3">
          <BigButton tone="reject" onClick={() => onDecide("reject")} />
          <BigButton tone="approve" onClick={() => onDecide("approve")} />
        </div>
      ) : (
        <NotActionable approval={approval} />
      )}
    </article>
  );
}

function StepTiming({ approval, overdue }) {
  if (isWaiting(approval)) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Hourglass className="size-4" aria-hidden="true" />
        Starts after the earlier step is decided
      </p>
    );
  }
  if (!approval.due_at || !["PENDING", "ESCALATED"].includes(approval.status)) {
    return null;
  }
  return (
    <p className={cn("flex items-center gap-1.5 text-sm", overdue ? "font-medium text-danger" : "text-muted-foreground")}>
      <AlarmClock className="size-4" aria-hidden="true" />
      {overdue ? "Decision overdue since" : "Decide by"} {formatRelativeTime(approval.due_at)}
    </p>
  );
}

function NotActionable({ approval }) {
  let text = "Read-only for your role.";
  if (approval.decided_at) {
    text = `Decided ${formatDateTime(approval.decided_at)} by ${approval.approver_name}.`;
  } else if (isWaiting(approval)) {
    text = "No action yet: an earlier approval step comes first.";
  } else if (approval.invoice_status && approval.invoice_status !== "PENDING_APPROVAL") {
    text = "The invoice is no longer awaiting approval.";
  }
  return <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{text}</p>;
}

function BigButton({ tone, onClick }) {
  if (tone === "approve") {
    return (
      <Button size="lg" className="h-12 w-full text-base" onClick={onClick}>
        <CircleCheck className="size-5" />
        Approve
      </Button>
    );
  }
  return (
    <Button
      size="lg"
      variant="outline"
      className="h-12 w-full border-danger-border text-base text-danger hover:bg-danger-subtle"
      onClick={onClick}
    >
      <CircleX className="size-5" />
      Reject
    </Button>
  );
}

/** Bottom sheet that confirms the tapped decision; reject requires a comment. */
function DecisionSheet({ pending, decision, onClose, onDone }) {
  const [comment, setComment] = useState("");
  const approval = pending?.approval;
  const rejecting = pending?.action === "reject";

  useEffect(() => {
    setComment("");
  }, [pending]);

  const ready = !rejecting || comment.trim().length >= REJECT_MIN_LENGTH;

  const confirm = async (event) => {
    event.preventDefault();
    if (!ready || decision.busy) {
      return;
    }
    const ok = await decision.decide(approval, pending.action, comment);
    if (ok) {
      onDone();
    }
  };

  return (
    <Sheet open={Boolean(pending)} onOpenChange={(open) => !open && !decision.busy && onClose()}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-lg">
        {approval && (
          <form onSubmit={confirm} className="flex min-h-0 flex-1 flex-col">
            <SheetHeader className="border-b-0 pb-0">
              <SheetTitle>
                {rejecting ? "Reject" : "Approve"} {approval.invoice_number || "invoice"}?
              </SheetTitle>
              <SheetDescription>
                {approval.vendor_name} · <Amount value={approval.invoice_total_amount} />
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="flex flex-col gap-3 py-4">
              <label htmlFor="mobile-decision-comment" className="text-sm font-medium">
                {rejecting ? "Reason for rejecting (required)" : "Comment (optional)"}
              </label>
              <Textarea
                id="mobile-decision-comment"
                value={comment}
                autoFocus={rejecting}
                rows={4}
                onChange={(event) => setComment(event.target.value)}
                placeholder={rejecting ? "e.g. Quantity billed is more than we received" : "Add a note for the record"}
                className="text-base"
                aria-describedby="mobile-decision-hint"
              />
              <p id="mobile-decision-hint" className="text-xs text-muted-foreground">
                {rejecting
                  ? "The invoice is rejected for everyone and the submitter sees this reason."
                  : "Approving moves the invoice to the next step, or to payment if this is the last one."}
              </p>
              {decision.error && <InlineAlert tone="danger">{decision.error}</InlineAlert>}
            </SheetBody>
            <SheetFooter className="gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button
                variant="outline"
                size="lg"
                className="h-12 w-full sm:w-auto"
                onClick={onClose}
                disabled={Boolean(decision.busy)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="lg"
                variant={rejecting ? "destructive" : "default"}
                className="h-12 w-full text-base sm:w-auto"
                disabled={!ready}
                loading={Boolean(decision.busy)}
              >
                {rejecting ? "Reject invoice" : "Approve invoice"}
              </Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
