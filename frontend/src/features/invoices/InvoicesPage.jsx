import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileStack, Send, Upload, X } from "lucide-react";
import { useAuth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { useReferenceList } from "@/hooks/useReferenceList";
import { useUrlIntent } from "@/hooks/useUrlIntent";
import { apiErrorMessage } from "@/lib/api-errors";
import { formatNumber } from "@/lib/format";
import { fetchAllPages, getIntegrationStatus, submitForApproval, syncToErp } from "./api";
import { InvoiceDetailSheet } from "./detail/InvoiceDetailSheet";
import { InvoiceTable } from "./InvoiceTable";
import { InvoiceToolbar } from "./InvoiceToolbar";
import {
  ERP_SYNC_STATUSES,
  LOCKED_STATUSES,
  SUBMITTABLE_STATUSES,
  canCapture,
  canReadVendors,
  canSyncErp,
  downloadText,
  invoicesToCsv,
  orderingFromSorting,
  sortingFromOrdering,
} from "./model";
import { ReviewWorkspace } from "./review/ReviewWorkspace";
import { UploadDialog } from "./UploadDialog";
import { InlineAlert } from "@/components/inline-alert";
import { Page, PageHeader } from "@/components/page";
import { PAGE_SIZE, useInvoiceList, useInvoiceQuery } from "./useInvoiceList";

function useErpStatus(enabled) {
  const [state, setState] = useState({ configured: false, error: "" });
  useEffect(() => {
    if (!enabled) {
      return;
    }
    getIntegrationStatus()
      .then((data) => setState({ configured: Boolean(data?.erp?.configured), error: "" }))
      .catch((error) => setState({
        configured: false,
        error: apiErrorMessage(error, { fallback: "ERP integration status couldn't be checked; ERP sync is hidden." }),
      }));
  }, [enabled]);
  return state;
}

export default function InvoicesPage() {
  const { user } = useAuth();
  const role = user?.role;
  const capture = canCapture(role);
  const query = useInvoiceQuery();
  const list = useInvoiceList(query.apiParams, query.page);
  const vendors = useReferenceList("/vendors/", canReadVendors(role), "Vendors");
  const purchaseOrders = useReferenceList("/purchase-orders/", capture, "Purchase orders");
  const erp = useErpStatus(canSyncErp(role));

  const [uploadOpen, setUploadOpen] = useState(false);
  const [review, setReview] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailVersion, setDetailVersion] = useState(0);
  const [rowSelection, setRowSelection] = useState({});
  const [busyAction, setBusyAction] = useState("");

  const queryKey = JSON.stringify([query.apiParams, query.page]);
  useEffect(() => {
    setRowSelection({});
  }, [queryKey]);

  useUrlIntent({
    onNew: () => {
      if (capture) {
        setUploadOpen(true);
      }
    },
  });

  const refresh = useCallback(() => {
    list.reload();
    setDetailVersion((value) => value + 1);
  }, [list]);

  const runSubmit = useCallback(async (invoice) => {
    try {
      const result = await submitForApproval(invoice.id);
      toast.success(`${invoice.invoice_number || "Invoice"} sent for approval (${result.approval_count} step${result.approval_count === 1 ? "" : "s"}).`);
    } catch (error) {
      toast.error(apiErrorMessage(error, { fallback: "Couldn't submit the invoice for approval." }));
    }
    refresh();
  }, [refresh]);

  const runErpSync = useCallback(async (invoice) => {
    try {
      await syncToErp(invoice.id);
      toast.success(`${invoice.invoice_number} synced to the configured ERP.`);
    } catch (error) {
      toast.error(apiErrorMessage(error, { fallback: "ERP synchronization failed." }));
    }
    refresh();
  }, [refresh]);

  const actions = useMemo(() => ({
    open: (invoice) => setDetail(invoice),
    forInvoice: (invoice) => {
      const items = [];
      const editable = capture && !LOCKED_STATUSES.includes(invoice.status);
      if (invoice.ocr_text || invoice.capture_source !== "MANUAL" || editable) {
        items.push({
          key: "review",
          label: editable ? "Review extraction" : "View extraction",
          primary: editable && !invoice.extraction_reviewed_at,
          run: () => {
            setDetail(null);
            setReview({ key: `existing-${invoice.id}-${Date.now()}`, mode: "existing", invoice });
          },
        });
      }
      if (capture && SUBMITTABLE_STATUSES.includes(invoice.status)) {
        items.push({
          key: "submit",
          label: "Submit for approval",
          primary: Boolean(invoice.extraction_reviewed_at),
          run: () => runSubmit(invoice),
        });
      }
      if (canSyncErp(role) && erp.configured && ERP_SYNC_STATUSES.includes(invoice.status)) {
        items.push({ key: "erp", label: "Sync to ERP", run: () => runErpSync(invoice) });
      }
      return items;
    },
  }), [capture, role, erp.configured, runSubmit, runErpSync]);

  const selectedRows = list.rows.filter((row) => rowSelection[String(row.id)]);

  const exportCsv = async () => {
    setBusyAction("export");
    try {
      let rows = selectedRows;
      let truncated = false;
      if (!rows.length) {
        ({ rows, truncated } = await fetchAllPages("/invoices/", query.apiParams));
      }
      const stamp = new Date().toISOString().slice(0, 10);
      downloadText(invoicesToCsv(rows), `invoices-${stamp}.csv`);
      toast.success(
        truncated
          ? `Exported the first ${formatNumber(rows.length)} invoices; narrow the filters to export the rest.`
          : `Exported ${formatNumber(rows.length)} invoice${rows.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      toast.error(apiErrorMessage(error, { fallback: "The CSV export failed." }));
    } finally {
      setBusyAction("");
    }
  };

  const submitSelected = async () => {
    const eligible = selectedRows.filter((row) => SUBMITTABLE_STATUSES.includes(row.status));
    setBusyAction("submit");
    let sent = 0;
    const failures = [];
    for (const invoice of eligible) {
      try {
        await submitForApproval(invoice.id);
        sent += 1;
      } catch (error) {
        failures.push(`${invoice.invoice_number || invoice.id}: ${apiErrorMessage(error, { fallback: "failed" })}`);
      }
    }
    setBusyAction("");
    if (sent) {
      toast.success(`${sent} invoice${sent === 1 ? "" : "s"} sent for approval.`);
    }
    if (failures.length) {
      toast.error(`${failures.length} couldn't be submitted. ${failures.slice(0, 3).join(" ")}`);
    }
    setRowSelection({});
    refresh();
  };

  const onReviewCompleted = (saved, outcome) => {
    setReview(null);
    refresh();
    const name = saved.invoice_number || "Invoice";
    if (outcome.submitted) {
      toast.success(`${name} ${outcome.created ? "captured and " : ""}sent for approval.`);
      return;
    }
    if (outcome.submitRequested) {
      toast.warning(`${name} was saved but not submitted: ${outcome.submitError}`);
      setDetail(saved);
      return;
    }
    toast.success(outcome.created ? `${name} captured.` : `${name} corrections saved.`);
  };

  const hasFilters = Object.keys(query.filters).length > 0;
  const submittableSelected = selectedRows.filter((row) => SUBMITTABLE_STATUSES.includes(row.status)).length;

  return (
    <Page>
      <PageHeader
        title="Invoices"
        description="Capture, OCR review, validation and PO matching"
        actions={(
          <>
            <Button
              variant="outline"
              onClick={exportCsv}
              loading={busyAction === "export"}
              disabled={Boolean(busyAction) || list.count === 0}
            >
              {busyAction !== "export" && <Download />}
              {selectedRows.length ? `Export ${selectedRows.length} selected` : "Export CSV"}
            </Button>
            {capture && (
              <Button onClick={() => setUploadOpen(true)}>
                <Upload />
                Capture invoices
              </Button>
            )}
          </>
        )}
      />

      {erp.error && (
        <InlineAlert tone="warning">{erp.error}</InlineAlert>
      )}

      <InvoiceToolbar
        filters={query.filters}
        onChange={(changes) => query.update(changes)}
        onClear={query.clearFilters}
        vendors={vendors}
      />

      {selectedRows.length > 0 && (
        <SelectionBar
          count={selectedRows.length}
          submittable={capture ? submittableSelected : 0}
          busy={busyAction}
          onSubmit={submitSelected}
          onExport={exportCsv}
          onClear={() => setRowSelection({})}
        />
      )}

      <Card className="overflow-hidden p-0">
        <ListBody
          list={list}
          query={query}
          hasFilters={hasFilters}
          capture={capture}
          onCapture={() => setUploadOpen(true)}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          actions={actions}
        />
      </Card>

      {capture && (
        <UploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          vendors={vendors}
          onSingleFile={(file) => {
            setUploadOpen(false);
            setReview({ key: `new-${Date.now()}`, mode: "new", file });
          }}
          onBatchFinished={refresh}
        />
      )}

      <ReviewWorkspace
        target={review}
        role={role}
        vendors={vendors}
        purchaseOrders={purchaseOrders}
        onClose={() => setReview(null)}
        onCompleted={onReviewCompleted}
      />

      <InvoiceDetailSheet
        summary={detail}
        version={detailVersion}
        onClose={() => setDetail(null)}
        actions={actions}
      />
    </Page>
  );
}

function SelectionBar({ count, submittable, busy, onSubmit, onExport, onClear }) {
  return (
    <div
      role="region"
      aria-label="Selected invoices"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-primary-border bg-primary-subtle px-4 py-2"
    >
      <span className="text-sm font-medium text-primary-subtle-foreground">
        {count} selected on this page
      </span>
      <div className="ml-auto flex flex-wrap gap-2">
        {submittable > 0 && (
          <Button size="sm" onClick={onSubmit} loading={busy === "submit"} disabled={Boolean(busy)}>
            {busy !== "submit" && <Send />}
            Submit {submittable} for approval
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onExport} disabled={Boolean(busy)}>
          <Download />
          Export
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear}>
          <X />
          Clear
        </Button>
      </div>
    </div>
  );
}

function ListBody({ list, query, hasFilters, capture, onCapture, rowSelection, onRowSelectionChange, actions }) {
  if (list.error && !list.data) {
    return <ErrorState title="Couldn't load invoices" description={list.error} onRetry={list.reload} />;
  }
  if (!list.data) {
    return <LoadingState rows={8} />;
  }
  if (list.error) {
    return (
      <ErrorState
        title="Couldn't load this page"
        description={list.error}
        onRetry={list.pageGone ? () => query.update({ page: "" }) : list.reload}
      />
    );
  }
  if (!list.rows.length) {
    return hasFilters ? (
      <EmptyState
        icon={FileStack}
        title="No invoices match these filters"
        description="Try removing a filter or widening the date range."
        action={<Button variant="outline" size="sm" onClick={query.clearFilters}>Clear filters</Button>}
      />
    ) : (
      <EmptyState
        icon={FileStack}
        title="No invoices yet"
        description={capture ? "Drop invoice PDFs or images to capture them with OCR." : "Invoices you can access will appear here."}
        action={capture && <Button size="sm" onClick={onCapture}><Upload />Capture invoices</Button>}
      />
    );
  }

  const sorting = sortingFromOrdering(query.ordering);
  return (
    <InvoiceTable
      rows={list.rows}
      count={list.count}
      page={query.page}
      pageSize={PAGE_SIZE}
      sorting={sorting}
      onSortingChange={(updater) => {
        const next = typeof updater === "function" ? updater(sorting) : updater;
        query.update({ ordering: orderingFromSorting(next) });
      }}
      onPageChange={(page) => query.update({ page: page > 1 ? page : "" }, { keepPage: true })}
      rowSelection={rowSelection}
      onRowSelectionChange={onRowSelectionChange}
      actions={actions}
      busy={list.loading}
    />
  );
}
