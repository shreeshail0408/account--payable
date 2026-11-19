import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";
import api from "@/services/api";
import { useAuth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { apiErrorMessage } from "@/lib/api-errors";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AttentionCard } from "./dashboard/AttentionCard";
import { AgingCard, InvoiceStatusCard, PaymentsCard, TopVendorsCard } from "./dashboard/ChartCards";
import { KpiCards } from "./dashboard/KpiCards";
import { agingRows, paymentRows, stageRows, vendorRows } from "./dashboard/model";

/** Loads /dashboard/. A refresh keeps the current data on screen (dimmed) instead of flashing skeletons. */
function useDashboardData() {
  const [state, setState] = useState({ data: null, error: "", refreshing: false, updatedAt: null });
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, error: "", refreshing: Boolean(current.data) }));
    try {
      const { data } = await api.get("/dashboard/");
      if (mounted.current) {
        setState({ data, error: "", refreshing: false, updatedAt: new Date() });
      }
    } catch (error) {
      if (mounted.current) {
        setState((current) => ({
          ...current,
          refreshing: false,
          error: apiErrorMessage(error, { fallback: "The dashboard couldn't be loaded." }),
        }));
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  return { ...state, reload: load };
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data, error, refreshing, updatedAt, reload } = useDashboardData();

  return (
    <div data-ui="" className="flex flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Accounts payable overview
            {updatedAt && ` · updated ${formatDateTime(updatedAt)}`}
          </p>
        </div>
        {data && (
          <Button variant="outline" size="sm" onClick={reload} loading={refreshing}>
            {!refreshing && <RefreshCw />}
            Refresh
          </Button>
        )}
      </header>

      <DashboardBody
        data={data}
        error={error}
        refreshing={refreshing}
        role={user?.role}
        onRetry={reload}
      />
    </div>
  );
}

function DashboardBody({ data, error, refreshing, role, onRetry }) {
  const view = useMemo(() => (data ? {
    aging: agingRows(data.aging),
    stages: stageRows(data.invoice_status),
    payments: paymentRows(data.payment_status),
    vendors: vendorRows(data.vendor_analytics),
  } : null), [data]);

  if (!data && error) {
    return (
      <Card>
        <ErrorState
          title="Couldn't load the dashboard"
          description={error}
          onRetry={onRetry}
        />
      </Card>
    );
  }
  if (!data) {
    return <DashboardSkeleton />;
  }

  return (
    <>
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-md border border-danger-border bg-danger-subtle px-4 py-3 text-sm text-danger-subtle-foreground"
        >
          <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">Refresh failed: {error} Showing the last loaded figures.</span>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}

      <div
        aria-busy={refreshing}
        className={cn("flex flex-col gap-6 transition-opacity", refreshing && "pointer-events-none opacity-60")}
      >
        <KpiCards data={data} role={role} />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
            <AgingCard rows={view.aging} />
            <InvoiceStatusCard stages={view.stages} />
          </div>
          <div className="min-w-0">
            <AttentionCard attention={data.attention} />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <PaymentsCard rows={view.payments} role={role} />
          <TopVendorsCard rows={view.vendors} role={role} />
        </div>
      </div>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading dashboard">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((key) => (
          <div
            key={key}
            className={cn(
              "flex flex-col gap-3 rounded-lg border border-border bg-card p-4",
              key === 0 && "col-span-2 sm:col-span-4 xl:col-span-1",
            )}
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="size-8 rounded-md" />
            </div>
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <SkeletonCard height="h-72" />
          <SkeletonCard height="h-52" />
        </div>
        <SkeletonCard height="h-[34rem]" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonCard height="h-56" />
        <SkeletonCard height="h-56" />
      </div>
    </div>
  );
}

function SkeletonCard({ height }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
      </CardHeader>
      <CardContent className="pt-4">
        <Skeleton className={cn("w-full", height)} />
      </CardContent>
    </Card>
  );
}
