import React, { useMemo, useState } from "react";
import { Plus, SearchX, ShoppingCart } from "lucide-react";
import { useAuth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Amount } from "@/components/amount";
import { DataTable } from "@/components/data-table";
import { Page, PageHeader } from "@/components/page";
import { QuantityProgress } from "@/components/progress";
import { SearchInput } from "@/components/search-input";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { useListQuery } from "@/hooks/useListQuery";
import { useRemoteData } from "@/hooks/useRemoteData";
import { useUrlIntent } from "@/hooks/useUrlIntent";
import { formatDate } from "@/lib/format";
import { rowsOf } from "@/lib/pagination";
import { listPurchaseOrders } from "./api";
import { canManagePurchaseOrders, poProgress } from "./model";
import { PoDetailSheet } from "./PoDetailSheet";
import { PoFormSheet } from "./PoFormSheet";

const PAGE_SIZE = 20;

export default function PurchaseOrdersPage() {
  const { user } = useAuth();
  const role = user?.role;
  const canManage = canManagePurchaseOrders(role);
  const query = useListQuery(["search"]);
  const search = query.values.search;
  const list = useRemoteData(
    () => listPurchaseOrders({ search: search || undefined, page: query.page }),
    JSON.stringify([search, query.page]),
    { fallback: "Purchase orders couldn't be loaded." },
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState(null);

  useUrlIntent({
    onNew: () => {
      if (canManage) {
        setCreateOpen(true);
      }
    },
  });

  const columns = usePoColumns(setDetail);
  const rows = rowsOf(list.data);

  return (
    <Page>
      <PageHeader
        title="Purchase orders"
        description="Ordered quantities and prices that invoices are matched against"
        actions={canManage && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            Create PO
          </Button>
        )}
      />

      {/* Block wrapper: SearchInput's flex-1/basis sizing is meant for toolbar rows, not this column. */}
      <div className="max-w-md">
        <SearchInput
          id="po-search"
          value={search}
          onChange={(value) => query.update({ search: value })}
          placeholder="PO number or vendor"
        />
      </div>

      <Card className="overflow-hidden p-0">
        <PoListBody
          list={list}
          rows={rows}
          columns={columns}
          search={search}
          page={query.page}
          canManage={canManage}
          onPageChange={(page) => query.update({ page })}
          onClearSearch={() => query.update({ search: "" })}
          onCreate={() => setCreateOpen(true)}
          onOpen={setDetail}
        />
      </Card>

      {canManage && (
        <PoFormSheet
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(po) => {
            list.reload();
            setDetail(po);
          }}
        />
      )}

      <PoDetailSheet po={detail} role={role} onClose={() => setDetail(null)} />
    </Page>
  );
}

function PoListBody({ list, rows, columns, search, page, canManage, onPageChange, onClearSearch, onCreate, onOpen }) {
  if (list.error && !list.data) {
    return <ErrorState title="Couldn't load purchase orders" description={list.error} onRetry={list.reload} />;
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
    if (search) {
      return (
        <EmptyState
          icon={SearchX}
          title={`No purchase orders match “${search}”`}
          description="Search looks at the PO number and vendor name."
          action={<Button variant="outline" size="sm" onClick={onClearSearch}>Clear search</Button>}
        />
      );
    }
    return (
      <EmptyState
        icon={ShoppingCart}
        title="No purchase orders yet"
        description={canManage
          ? "Create a PO with its lines so invoices can be 2-way or 3-way matched."
          : "Purchase orders appear here once AP creates them."}
        action={canManage && (
          <Button size="sm" onClick={onCreate}>
            <Plus />
            Create PO
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
      label="Purchase order pages"
      busy={list.loading}
      onRowClick={onOpen}
      renderMobileItem={(po) => <MobilePoItem po={po} onOpen={onOpen} />}
    />
  );
}

function ReceivedCell({ po }) {
  if (!po.lines?.length) {
    return <span className="text-xs text-muted-foreground">No lines</span>;
  }
  const { ordered, received } = poProgress(po);
  return <QuantityProgress received={received} ordered={ordered} label={`Received quantity for ${po.number}`} />;
}

function usePoColumns(onOpen) {
  return useMemo(() => [
    {
      id: "number",
      header: "PO number",
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
      id: "vendor",
      header: "Vendor",
      cell: ({ row }) => <span className="block max-w-56 truncate">{row.original.vendor_name}</span>,
    },
    {
      id: "order_date",
      header: "Ordered",
      cell: ({ row }) => formatDate(row.original.order_date),
    },
    {
      id: "expected_date",
      header: "Expected",
      cell: ({ row }) => formatDate(row.original.expected_date),
    },
    {
      id: "total_amount",
      header: "Amount",
      meta: { numeric: true },
      cell: ({ row }) => <Amount value={row.original.total_amount} />,
    },
    {
      id: "received",
      header: "Received",
      meta: { className: "w-40" },
      cell: ({ row }) => <ReceivedCell po={row.original} />,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge kind="purchaseOrder" status={row.original.status} />,
    },
  ], [onOpen]);
}

function MobilePoItem({ po, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(po)}
      className="flex w-full flex-col gap-2 px-4 py-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-medium">{po.number}</span>
        <Amount value={po.total_amount} className="text-sm font-medium" />
      </span>
      <span className="truncate text-sm text-muted-foreground">{po.vendor_name}</span>
      <span className="flex items-center gap-3">
        <StatusBadge kind="purchaseOrder" status={po.status} />
        <span className="flex-1">
          <ReceivedCell po={po} />
        </span>
      </span>
    </button>
  );
}
