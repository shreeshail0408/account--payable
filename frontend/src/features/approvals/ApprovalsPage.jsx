import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlarmClock, ClipboardCheck, Inbox, TimerReset } from "lucide-react";
import { useAuth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { Amount } from "@/components/amount";
import { DataTable } from "@/components/data-table";
import { InlineAlert } from "@/components/inline-alert";
import { Page, PageHeader } from "@/components/page";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { useListQuery } from "@/hooks/useListQuery";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useRemoteData } from "@/hooks/useRemoteData";
import { apiErrorMessage } from "@/lib/api-errors";
import { formatNumber, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { escalateOverdue, listAllApprovals, listReminders } from "./api";
import { DecisionForm } from "./DecisionForm";
import { InvoicePreview } from "./InvoicePreview";
import { MobileApprovalList } from "./MobileApproval";
import {
  QUEUE_FORBIDDEN,
  VIEWS,
  canDecideRole,
  canManageRules,
  isActionable,
  isOverdue,
  isWaiting,
  sortQueue,
  viewsFor,
} from "./model";
import { RulesCard } from "./RulesCard";
import { useDecision } from "./useDecision";

const PAGE_SIZE = 20;

/*
 * Layouts: ≥1024px queue table + preview pane; 768–1023px table + preview sheet;
 * <768px one card per invoice with large Approve / Reject buttons (MobileApproval.jsx).
 */
export default function ApprovalsPage() {
  const { user } = useAuth();
  const role = user?.role;
  const isMobile = !useMediaQuery("(min-width: 768px)");
  const isWide = useMediaQuery("(min-width: 1024px)");

  const queue = useRemoteData(listAllApprovals, "approvals", {
    fallback: "The approval queue couldn't be loaded.",
    forbidden: QUEUE_FORBIDDEN,
  });
  const reminders = useRemoteData(listReminders, "reminders", { fallback: "Approval reminders couldn't be loaded." });

  const views = viewsFor(role);
  const query = useListQuery(["view"]);
  const view = views.includes(query.values.view) ? query.values.view : views[0];

  const [selectedId, setSelectedId] = useState(null);
  const [version, setVersion] = useState(0);

  const all = useMemo(() => sortQueue(queue.data?.rows || []), [queue.data]);
  const rows = useMemo(() => all.filter((approval) => VIEWS[view].test(approval, user)), [all, view, user]);
  const counts = useMemo(
    () => Object.fromEntries(views.map((key) => [key, all.filter((approval) => VIEWS[key].test(approval, user)).length])),
    [all, views, user],
  );

  const refresh = useCallback(() => {
    queue.reload();
    reminders.reload();
    setVersion((value) => value + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.reload, reminders.reload]);

  const decision = useDecision({
    onSettled: useCallback((approval, ok) => {
      if (ok) {
        // Move on to the next item in the current view.
        const index = rows.findIndex((row) => row.id === approval.id);
        const next = rows[index + 1] || rows[index - 1];
        setSelectedId(next && next.id !== approval.id ? next.id : null);
      }
      refresh();
    }, [rows, refresh]),
  });

  // Wide screens always show something in the preview pane.
  useEffect(() => {
    if (isWide && rows.length && !rows.some((row) => row.id === selectedId)) {
      setSelectedId(rows[0].id);
    }
  }, [isWide, rows, selectedId]);

  const selected = all.find((approval) => approval.id === selectedId) || null;

  return (
    <Page>
      <PageHeader
        title="Approvals"
        description={canDecideRole(role)
          ? "Review invoices routed to you and approve or reject them"
          : "Approval queue across all invoices (read-only)"}
        actions={canManageRules(role) && <EscalateButton onDone={refresh} />}
      />

      <ReminderBanner reminders={reminders} />

      <QueueTabs
        views={views}
        view={view}
        counts={counts}
        loading={!queue.data}
        onChange={(next) => query.update({ view: next === views[0] ? "" : next })}
      >
        <QueueBody
          queue={queue}
          rows={rows}
          view={view}
          role={role}
          user={user}
          isMobile={isMobile}
          isWide={isWide}
          selected={selected}
          onSelect={(approval) => setSelectedId(approval.id)}
          decision={decision}
          version={version}
          onShowAll={() => query.update({ view: "all" })}
        />
      </QueueTabs>

      {!isWide && !isMobile && (
        <PreviewSheet
          approval={selected}
          user={user}
          decision={decision}
          version={version}
          onClose={() => setSelectedId(null)}
        />
      )}

      {canManageRules(role) && <RulesCard />}
    </Page>
  );
}

function EscalateButton({ onDone }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const result = await escalateOverdue();
      toast.success(
        `${formatNumber(result.escalated ?? 0)} escalated, ${formatNumber(result.reminders ?? 0)} reminder${result.reminders === 1 ? "" : "s"} sent.`,
      );
      onDone();
    } catch (error) {
      toast.error(apiErrorMessage(error, { fallback: "Overdue approvals couldn't be processed." }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="outline" onClick={run} loading={busy}>
      {!busy && <TimerReset />}
      Process overdue
    </Button>
  );
}

function ReminderBanner({ reminders }) {
  if (reminders.error) {
    return (
      <InlineAlert tone="danger" onRetry={reminders.reload}>
        {reminders.error}
      </InlineAlert>
    );
  }
  const count = reminders.data?.length || 0;
  if (!count) {
    return null;
  }
  return (
    <InlineAlert tone="warning" title={`${count} approval${count === 1 ? " is" : "s are"} due within 24 hours or overdue`}>
      Overdue steps are escalated automatically; decide them first.
    </InlineAlert>
  );
}

/** View tabs; the queue below is the tab panel, so aria-controls always resolves. */
function QueueTabs({ views, view, counts, loading, onChange, children }) {
  return (
    <Tabs value={view} onValueChange={onChange} className="flex flex-col gap-6">
      <TabsList aria-label="Approval views">
        {views.map((key) => (
          <TabsTrigger key={key} value={key}>
            {VIEWS[key].label}
            {!loading && (
              <Badge variant={key === "todo" && counts[key] ? "primary" : "neutral"} className="px-1.5 py-0 tabular-nums">
                {formatNumber(counts[key])}
              </Badge>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={view} className="mt-0" tabIndex={-1}>
        {children}
      </TabsContent>
    </Tabs>
  );
}

function QueueBody({ queue, rows, view, role, user, isMobile, isWide, selected, onSelect, decision, version, onShowAll }) {
  if (queue.error && !queue.data) {
    return (
      <Card className="p-0">
        <ErrorState title="Couldn't load the approval queue" description={queue.error} onRetry={queue.reload} />
      </Card>
    );
  }
  if (!queue.data) {
    return (
      <Card className="p-0">
        <LoadingState rows={6} />
      </Card>
    );
  }
  if (!rows.length) {
    return (
      <Card className="p-0">
        <QueueEmpty view={view} role={role} onShowAll={onShowAll} />
      </Card>
    );
  }
  if (isMobile) {
    return <MobileApprovalList rows={rows} user={user} decision={decision} version={version} />;
  }
  const table = (
    <Card className="min-w-0 overflow-hidden p-0">
      <QueueTable rows={rows} role={role} user={user} activeId={selected?.id} onSelect={onSelect} busy={queue.loading} />
    </Card>
  );
  if (!isWide) {
    return table;
  }
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_26rem] xl:grid-cols-[minmax(0,1fr)_30rem]">
      {table}
      <PreviewPane approval={selected} user={user} decision={decision} version={version} />
    </div>
  );
}

function QueueEmpty({ view, role, onShowAll }) {
  if (view === "todo") {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="You're all caught up"
        description="No invoices are waiting for your decision. New ones appear here and in your notifications."
        action={<Button variant="outline" size="sm" onClick={onShowAll}>See all approvals</Button>}
      />
    );
  }
  return (
    <EmptyState
      icon={Inbox}
      title={view === "open" ? "No open approvals" : "No approvals yet"}
      description={role === "APPROVER"
        ? "Steps assigned to you appear once AP submits an invoice for approval."
        : "Approval steps are created when AP submits an invoice and an approval rule covers its amount."}
      action={view !== "all" && <Button variant="outline" size="sm" onClick={onShowAll}>See all approvals</Button>}
    />
  );
}

function DueCell({ approval }) {
  if (isWaiting(approval)) {
    return <span className="text-xs text-muted-foreground">After earlier step</span>;
  }
  if (!approval.due_at || !["PENDING", "ESCALATED"].includes(approval.status)) {
    return <span className="text-muted-foreground">—</span>;
  }
  const overdue = isOverdue(approval);
  return (
    <span className={cn("inline-flex items-center gap-1", overdue && "font-medium text-danger")}>
      {overdue && <AlarmClock className="size-3.5" aria-hidden="true" />}
      {formatRelativeTime(approval.due_at)}
    </span>
  );
}

function QueueTable({ rows, role, user, activeId, onSelect, busy }) {
  const columns = useMemo(() => {
    const list = [
      {
        id: "invoice",
        header: "Invoice",
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => onSelect(row.original)}
            className="flex max-w-56 flex-col items-start gap-0.5 rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
          >
            <span className="font-medium hover:underline">{row.original.invoice_number || "Invoice"}</span>
            <span className="max-w-full truncate text-xs text-muted-foreground">{row.original.vendor_name}</span>
          </button>
        ),
      },
      {
        id: "amount",
        header: "Amount",
        meta: { numeric: true },
        cell: ({ row }) => <Amount value={row.original.invoice_total_amount} />,
      },
      {
        id: "sequence",
        header: "Step",
        meta: { numeric: true },
        cell: ({ row }) => row.original.sequence,
      },
    ];
    if (role !== "APPROVER") {
      list.push({ id: "approver", header: "Approver", cell: ({ row }) => row.original.approver_name });
    }
    list.push(
      { id: "due", header: "Due", cell: ({ row }) => <DueCell approval={row.original} /> },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <StatusBadge kind="approval" status={row.original.status} />
            {isActionable(row.original, user) && <span className="size-2 rounded-full bg-primary" title="Needs your decision" />}
          </span>
        ),
      },
    );
    return list;
  }, [role, user, onSelect]);

  return (
    <DataTable
      columns={columns}
      data={rows}
      pageSize={PAGE_SIZE}
      label="Approval pages"
      onRowClick={onSelect}
      activeRowId={activeId ? String(activeId) : undefined}
      busy={busy}
    />
  );
}

function DecisionArea({ approval, user, decision }) {
  if (isActionable(approval, user)) {
    return <DecisionForm approval={approval} decision={decision} />;
  }
  let text = "Read-only: your role can't decide approvals.";
  if (approval.decided_at) {
    text = `Decided by ${approval.approver_name}${approval.comments ? `: “${approval.comments}”` : "."}`;
  } else if (isWaiting(approval)) {
    text = "Waiting for an earlier approval step to be decided.";
  } else if (approval.invoice_status && approval.invoice_status !== "PENDING_APPROVAL") {
    text = "The invoice is no longer awaiting approval.";
  } else if (canDecideRole(user?.role)) {
    text = `Assigned to ${approval.approver_name}.`;
  }
  return <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{text}</p>;
}

function PreviewPane({ approval, user, decision, version }) {
  if (!approval) {
    return null;
  }
  return (
    <Card className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-hidden p-0">
      <CardHeader className="border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{approval.invoice_number || "Invoice"}</CardTitle>
          <StatusBadge kind="approval" status={approval.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {approval.vendor_name} · step {approval.sequence}
        </p>
      </CardHeader>
      <CardContent
        tabIndex={0}
        role="region"
        aria-label={`Invoice ${approval.invoice_number || ""} details`}
        className="max-h-[calc(100dvh-22rem)] overflow-y-auto outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/35"
      >
        <InvoicePreview invoiceId={approval.invoice} version={version} />
      </CardContent>
      <div className="border-t border-border px-6 py-4">
        <DecisionArea approval={approval} user={user} decision={decision} />
      </div>
    </Card>
  );
}

function PreviewSheet({ approval, user, decision, version, onClose }) {
  return (
    <Sheet open={Boolean(approval)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-xl">
        {approval && (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle>{approval.invoice_number || "Invoice"}</SheetTitle>
                <StatusBadge kind="approval" status={approval.status} />
              </div>
              <SheetDescription>
                {approval.vendor_name} · step {approval.sequence}
              </SheetDescription>
            </SheetHeader>
            <SheetBody>
              <InvoicePreview invoiceId={approval.invoice} version={version} />
            </SheetBody>
            <SheetFooter className="block">
              <DecisionArea approval={approval} user={user} decision={decision} />
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
