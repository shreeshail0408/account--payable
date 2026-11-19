import React, { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PackageCheck, Plus } from "lucide-react";
import { useAuth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { InlineAlert } from "@/components/inline-alert";
import { Page, PageHeader } from "@/components/page";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { useListQuery } from "@/hooks/useListQuery";
import { useReferenceList } from "@/hooks/useReferenceList";
import { useRemoteData } from "@/hooks/useRemoteData";
import { useUrlIntent } from "@/hooks/useUrlIntent";
import { formatDate, formatNumber } from "@/lib/format";
import { rowsOf } from "@/lib/pagination";
import { listGoodsReceipts } from "./api";
import { GrnDetailSheet } from "./GrnDetailSheet";
import { GrnFormSheet } from "./GrnFormSheet";
import { canRecordReceipts } from "./model";

const PAGE_SIZE = 20;

export default function GoodsReceiptsPage() {
  const { user } = useAuth();
  const role = user?.role;
  const canRecord = canRecordReceipts(role);
  const query = useListQuery([]);
  const [params, setParams] = useSearchParams();
  const list = useRemoteData(
    () => listGoodsReceipts({ page: query.page }),
    String(query.page),
    { fallback: "Goods receipts couldn't be loaded." },
  );
  const orders = useReferenceList("/purchase-orders/", true, "Purchase orders");
  const [form, setForm] = useState({ open: false, po: "" });
  const [detail, setDetail] = useState(null);

  // ?new=1&po=<id> comes from the PO drawer's "Record goods receipt".
  useUrlIntent({
    onNew: () => {
      if (!canRecord) {
        return;
      }
      setForm({ open: true, po: params.get("po") || "" });
      setParams((current) => {
        const next = new URLSearchParams(current);
        next.delete("po");
        return next;
      }, { replace: true });
    },
  });

  const ordersById = useMemo(() => new Map(orders.rows.map((po) => [po.id, po])), [orders.rows]);
  const columns = useGrnColumns(ordersById, setDetail);
  const rows = rowsOf(list.data);
  const openForm = () => setForm({ open: true, po: "" });

  return (
    <Page>
      <PageHeader
        title="Goods receipts"
        description="Delivered quantities per PO line, used for 3-way matching"
        actions={canRecord && (
          <Button onClick={openForm}>
            <Plus />
            Record receipt
          </Button>
        )}
      />

      {orders.error && (
        <InlineAlert tone="danger" onRetry={orders.reload}>
          {orders.error} PO numbers and line names can't be shown until they load.
        </InlineAlert>
      )}

      <Card className="overflow-hidden p-0">
        <GrnListBody
          list={list}
          rows={rows}
          columns={columns}
          page={query.page}
          canRecord={canRecord}
          onPageChange={(page) => query.update({ page })}
          onCreate={openForm}
          onOpen={setDetail}
          ordersById={ordersById}
        />
      </Card>

      {canRecord && (
        <GrnFormSheet
          open={form.open}
          initialPo={form.po}
          orders={orders}
          userId={user?.id}
          onOpenChange={(open) => setForm((current) => ({ ...current, open }))}
          onCreated={(grn) => {
            list.reload();
            orders.reload();
            setDetail(grn);
          }}
        />
      )}

      <GrnDetailSheet
        grn={detail}
        po={detail ? ordersById.get(detail.purchase_order) : null}
        ordersLoading={orders.loading}
        onClose={() => setDetail(null)}
      />
    </Page>
  );
}

function GrnListBody({ list, rows, columns, page, canRecord, onPageChange, onCreate, onOpen, ordersById }) {
  if (list.error && !list.data) {
    return <ErrorState title="Couldn't load goods receipts" description={list.error} onRetry={list.reload} />;
  }
  if (!list.data) {
    return <LoadingState rows={8} />;
  }
  if (list.error) {
    return (
      <ErrorState
        title="Couldn't load this page"
        description={list.error}
        onRetry={list.status === 404 ? () => onPageChange(1) : list.reload}
      />
    );
  }
  if (!rows.length) {
    return (
      <EmptyState
        icon={PackageCheck}
        title="No goods received yet"
        description={canRecord
          ? "Record what arrived against an open PO so invoices can be 3-way matched."
          : "Receipts appear here once AP records deliveries."}
        action={canRecord && (
          <Button size="sm" onClick={onCreate}>
            <Plus />
            Record receipt
          </Button>
        )}
      />
    );
  }
  return (
    <DataTable
      columns={columns}
      data={rows}
      pagination={{ page, pageSize: PAGE_SIZE, count: list.data.count ?? rows.length, onPageChange }}
      label="Goods receipt pages"
      busy={list.loading}
      onRowClick={onOpen}
      renderMobileItem={(grn) => <MobileGrnItem grn={grn} po={ordersById.get(grn.purchase_order)} onOpen={onOpen} />}
    />
  );
}

function totalQuantity(grn) {
  return (grn.lines || []).reduce((sum, line) => sum + Number(line.quantity || 0), 0);
}

function useGrnColumns(ordersById, onOpen) {
  return useMemo(() => [
    {
      id: "number",
      header: "GRN",
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onOpen(row.original)}
          className="rounded-sm text-left font-medium outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/35"
        >
          {row.original.number}
        </button>
      ),
    },
    {
      id: "po",
      header: "Purchase order",
      cell: ({ row }) => {
        const po = ordersById.get(row.original.purchase_order);
        return (
          <span className="flex flex-col">
            <span>{po?.number || `PO #${row.original.purchase_order}`}</span>
            {po && <span className="max-w-56 truncate text-xs text-muted-foreground">{po.vendor_name}</span>}
          </span>
        );
      },
    },
    {
      id: "received_date",
      header: "Received",
      cell: ({ row }) => formatDate(row.original.received_date),
    },
    {
      id: "lines",
      header: "Lines",
      meta: { numeric: true },
      cell: ({ row }) => formatNumber(row.original.lines?.length || 0),
    },
    {
      id: "quantity",
      header: "Quantity",
      meta: { numeric: true },
      cell: ({ row }) => formatNumber(totalQuantity(row.original)),
    },
    {
      id: "notes",
      header: "Notes",
      cell: ({ row }) => (
        <span className="block max-w-64 truncate text-muted-foreground">{row.original.notes || "—"}</span>
      ),
    },
  ], [ordersById, onOpen]);
}

function MobileGrnItem({ grn, po, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(grn)}
      className="flex w-full flex-col gap-1 px-4 py-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{grn.number}</span>
        <span className="text-xs text-muted-foreground">{formatDate(grn.received_date)}</span>
      </span>
      <span className="truncate text-sm text-muted-foreground">
        {po ? `${po.number} · ${po.vendor_name}` : `PO #${grn.purchase_order}`}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatNumber(grn.lines?.length || 0)} line(s) · {formatNumber(totalQuantity(grn))} units
      </span>
    </button>
  );
}
