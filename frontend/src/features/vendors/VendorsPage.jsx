import React, { useMemo, useState } from "react";
import { Building2, MoreHorizontal, Plus, SearchX } from "lucide-react";
import { useAuth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable } from "@/components/data-table";
import { Page, PageHeader } from "@/components/page";
import { SearchInput } from "@/components/search-input";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { useListQuery } from "@/hooks/useListQuery";
import { useRemoteData } from "@/hooks/useRemoteData";
import { useUrlIntent } from "@/hooks/useUrlIntent";
import { rowsOf } from "@/lib/pagination";
import { listVendors } from "./api";
import { GstinFormatBadge } from "./GstinFormatBadge";
import { canCreateVendor, canDecideOnboarding } from "./model";
import { VendorDetailSheet } from "./VendorDetailSheet";
import { VendorFormDialog } from "./VendorFormDialog";

const PAGE_SIZE = 20;

export default function VendorsPage() {
  const { user } = useAuth();
  const role = user?.role;
  const query = useListQuery(["search"]);
  const search = query.values.search;
  const list = useRemoteData(
    () => listVendors({ search: search || undefined, page: query.page }),
    JSON.stringify([search, query.page]),
    { fallback: "Vendors couldn't be loaded." },
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState(null);

  useUrlIntent({
    onNew: () => {
      if (canCreateVendor(role)) {
        setCreateOpen(true);
      }
    },
  });

  const columns = useVendorColumns(role, setDetail);
  const rows = rowsOf(list.data);

  return (
    <Page>
      <PageHeader
        title="Vendors"
        description="Vendor master data, onboarding reviews and payment details"
        actions={canCreateVendor(role) && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            Add vendor
          </Button>
        )}
      />

      <div className="flex flex-wrap items-end gap-4">
        <SearchInput
          id="vendor-search"
          value={search}
          onChange={(value) => query.update({ search: value })}
          placeholder="Code, name, GSTIN or email"
          className="max-w-md"
        />
      </div>

      <Card className="overflow-hidden p-0">
        <VendorListBody
          list={list}
          rows={rows}
          columns={columns}
          search={search}
          page={query.page}
          role={role}
          onPageChange={(page) => query.update({ page })}
          onClearSearch={() => query.update({ search: "" })}
          onCreate={() => setCreateOpen(true)}
          onOpen={setDetail}
        />
      </Card>

      {canCreateVendor(role) && (
        <VendorFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(vendor) => {
            list.reload();
            setDetail(vendor);
          }}
        />
      )}

      <VendorDetailSheet
        summary={detail}
        role={role}
        onClose={() => setDetail(null)}
        onChanged={list.reload}
      />
    </Page>
  );
}

function VendorListBody({ list, rows, columns, search, page, role, onPageChange, onClearSearch, onCreate, onOpen }) {
  if (list.error && !list.data) {
    return <ErrorState title="Couldn't load vendors" description={list.error} onRetry={list.reload} />;
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
          title={`No vendors match “${search}”`}
          description="Search looks at the vendor code, name, GSTIN and email."
          action={<Button variant="outline" size="sm" onClick={onClearSearch}>Clear search</Button>}
        />
      );
    }
    return (
      <EmptyState
        icon={Building2}
        title="No vendors yet"
        description={canCreateVendor(role)
          ? "Add your first vendor. An administrator reviews each one before invoices can be processed."
          : "Vendors appear here once an AP clerk or administrator adds them."}
        action={canCreateVendor(role) && (
          <Button size="sm" onClick={onCreate}>
            <Plus />
            Add vendor
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
      label="Vendor pages"
      busy={list.loading}
      onRowClick={onOpen}
      renderMobileItem={(vendor) => <MobileVendorItem vendor={vendor} onOpen={onOpen} />}
    />
  );
}

function useVendorColumns(role, onOpen) {
  return useMemo(() => [
    {
      id: "name",
      header: "Vendor",
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onOpen(row.original)}
          className="flex max-w-64 flex-col items-start gap-0.5 rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
        >
          <span className="max-w-full truncate font-medium hover:underline">{row.original.name}</span>
          <span className="text-xs text-muted-foreground">{row.original.code}</span>
        </button>
      ),
    },
    {
      id: "email",
      header: "Email",
      cell: ({ row }) => <span className="block max-w-56 truncate text-muted-foreground">{row.original.email}</span>,
    },
    {
      id: "gstin",
      header: "GSTIN",
      cell: ({ row }) => <GstinCell vendor={row.original} />,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge kind="vendor" status={row.original.status} />,
    },
    {
      id: "onboarding",
      header: "Onboarding",
      cell: ({ row }) => (
        row.original.onboarding_status
          ? <StatusBadge kind="onboarding" status={row.original.onboarding_status} />
          : <span className="text-xs text-muted-foreground">Not tracked</span>
      ),
    },
    {
      id: "bank",
      header: "Bank account",
      cell: ({ row }) => (
        row.original.bank_account
          ? <span className="font-mono text-xs">{row.original.bank_account}</span>
          : <span className="text-xs text-muted-foreground">Not added</span>
      ),
    },
    {
      id: "actions",
      meta: { className: "w-12" },
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => <VendorRowActions vendor={row.original} role={role} onOpen={onOpen} />,
    },
  ], [role, onOpen]);
}

function GstinCell({ vendor }) {
  if (!vendor.gstin) {
    return <span className="text-xs text-muted-foreground">Not provided</span>;
  }
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="font-mono text-xs">{vendor.gstin}</span>
      <GstinFormatBadge gstin={vendor.gstin} compact />
    </span>
  );
}

function VendorRowActions({ vendor, role, onOpen }) {
  const pendingDecision = canDecideOnboarding(role) && vendor.onboarding_status === "SUBMITTED";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${vendor.name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onOpen(vendor)}>View details</DropdownMenuItem>
        {pendingDecision && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onOpen({ ...vendor, initialTab: "onboarding" })}>
              Review onboarding
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileVendorItem({ vendor, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(vendor)}
      className="flex w-full flex-col gap-2 px-4 py-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-medium">{vendor.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{vendor.code}</span>
      </span>
      <span className="truncate text-sm text-muted-foreground">{vendor.email}</span>
      <span className="flex flex-wrap items-center gap-2">
        <StatusBadge kind="vendor" status={vendor.status} />
        {vendor.onboarding_status && <StatusBadge kind="onboarding" status={vendor.onboarding_status} />}
      </span>
    </button>
  );
}
