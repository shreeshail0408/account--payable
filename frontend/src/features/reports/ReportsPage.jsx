import React, { useMemo, useState } from "react";
import { CalendarRange, Download, FileSearch, RotateCw, X } from "lucide-react";
import { useAuth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { Page, PageHeader } from "@/components/page";
import { SearchInput } from "@/components/search-input";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { useListQuery } from "@/hooks/useListQuery";
import { useReferenceList } from "@/hooks/useReferenceList";
import { useRemoteData } from "@/hooks/useRemoteData";
import { apiErrorMessage } from "@/lib/api-errors";
import { formatCurrency, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { INVOICE_STATUSES, downloadText, statusLabel } from "@/features/invoices/model";
import { fetchReportCsv } from "./api";
import { IntegrationsCard } from "./IntegrationsCard";
import {
  FILTER_KEYS,
  columnKind,
  displayCell,
  normalizeTimestamp,
  parseCsv,
  reportFilename,
  reportParams,
  reportsFor,
} from "./model";

const PREVIEW_ROWS = 50;
const ALL = "all";

export default function ReportsPage() {
  const { user } = useAuth();
  const role = user?.role;
  const available = reportsFor(role);
  const query = useListQuery(["report", ...FILTER_KEYS]);
  const report = available.find((item) => item.kind === query.values.report) || available[0];
  const vendors = useReferenceList("/vendors/", report.filters.includes("vendor"), "Vendors");

  const params = reportParams(report, query.values);
  const paramsKey = JSON.stringify(params);
  const preview = useRemoteData(() => fetchReportCsv(params), paramsKey, {
    fallback: "This report couldn't be generated.",
  });

  const filtersActive = FILTER_KEYS.some((key) => query.values[key]);
  const clearFilters = () => query.update(Object.fromEntries(FILTER_KEYS.map((key) => [key, ""])));

  return (
    <Page>
      <PageHeader title="Reports" description="Preview operational and audit reports, then export them as CSV" />

      <div role="radiogroup" aria-label="Report" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {available.map((item) => (
          <ReportCard
            key={item.kind}
            report={item}
            selected={item.kind === report.kind}
            onSelect={() => query.update({ report: item.kind === available[0].kind ? "" : item.kind })}
          />
        ))}
      </div>

      <Card className="overflow-hidden p-0">
        <CardHeader className="pb-6">
          <CardTitle>{report.title}</CardTitle>
          <CardDescription>{report.description}</CardDescription>
          <CardAction>
            <ExportButton report={report} preview={preview} params={params} />
          </CardAction>
        </CardHeader>
        <div className="border-t border-border px-6 py-4">
          <ReportFilters
            report={report}
            values={query.values}
            vendors={vendors}
            onChange={query.update}
            onClear={filtersActive ? clearFilters : null}
          />
        </div>
        <div className="border-t border-border">
          <Preview preview={preview} filtersActive={filtersActive} onClear={clearFilters} />
        </div>
      </Card>

      <IntegrationsCard role={role} />
    </Page>
  );
}

function ReportCard({ report, selected, onSelect }) {
  const Icon = report.icon;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4 text-left shadow-card outline-none transition-colors",
        "hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring/35",
        selected ? "border-primary bg-primary-subtle" : "border-border",
      )}
    >
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-md border",
          selected ? "border-primary-border bg-card text-primary" : "border-border bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-sm font-semibold">{report.title}</span>
        <span className="text-xs text-muted-foreground">{report.description}</span>
      </span>
    </button>
  );
}

function ExportButton({ report, preview, params }) {
  const [busy, setBusy] = useState(false);
  const exportCsv = async () => {
    setBusy(true);
    try {
      // A finished preview already holds the full CSV for the current filters.
      const text = preview.data !== null && !preview.loading && !preview.error
        ? preview.data
        : await fetchReportCsv(params);
      downloadText(text, reportFilename(report.kind));
      toast.success(`${report.title} exported.`);
    } catch (error) {
      toast.error(apiErrorMessage(error, { fallback: "The export failed." }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button onClick={exportCsv} loading={busy}>
      {!busy && <Download />}
      Export CSV
    </Button>
  );
}

function ReportFilters({ report, values, vendors, onChange, onClear }) {
  const has = (name) => report.filters.includes(name);
  const invalidRange = values.date_from && values.date_to && values.date_to < values.date_from;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-4">
        {has("search") && (
          <SearchInput
            id="report-search"
            value={values.search}
            onChange={(search) => onChange({ search })}
            placeholder="Invoice number or vendor"
          />
        )}
        {has("vendor") && (
          <div className="flex w-full min-w-0 flex-col gap-2 sm:w-56">
            <Label htmlFor="report-vendor">Vendor</Label>
            <Select
              value={values.vendor || ALL}
              onValueChange={(vendor) => onChange({ vendor: vendor === ALL ? "" : vendor })}
              disabled={vendors.loading || Boolean(vendors.error)}
            >
              <SelectTrigger id="report-vendor">
                <SelectValue placeholder={vendors.loading ? "Loading vendors…" : "All vendors"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All vendors</SelectItem>
                {vendors.rows.map((vendor) => (
                  <SelectItem key={vendor.id} value={String(vendor.id)}>
                    {vendor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {has("status") && (
          <div className="flex w-full min-w-0 flex-col gap-2 sm:w-48">
            <Label htmlFor="report-status">Invoice status</Label>
            <Select value={values.status || ALL} onValueChange={(status) => onChange({ status: status === ALL ? "" : status })}>
              <SelectTrigger id="report-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {INVOICE_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {statusLabel(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div role="group" aria-labelledby="report-dates" className="flex min-w-0 flex-col gap-2">
          <span id="report-dates" className="flex items-center gap-1.5 text-sm font-medium leading-none">
            <CalendarRange className="size-4 text-muted-foreground" aria-hidden="true" />
            {report.kind === "audit" ? "Event date" : "Invoice date"}
          </span>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label="From"
              value={values.date_from}
              max={values.date_to || undefined}
              aria-invalid={invalidRange || undefined}
              onChange={(event) => onChange({ date_from: event.target.value })}
              className="w-[9.5rem]"
            />
            <span className="text-sm text-muted-foreground" aria-hidden="true">
              to
            </span>
            <Input
              type="date"
              aria-label="To"
              value={values.date_to}
              min={values.date_from || undefined}
              aria-invalid={invalidRange || undefined}
              onChange={(event) => onChange({ date_to: event.target.value })}
              className="w-[9.5rem]"
            />
          </div>
        </div>
        {onClear && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X />
            Clear filters
          </Button>
        )}
      </div>
      {vendors.error && (
        <p role="alert" className="flex items-center gap-2 text-xs text-danger">
          {vendors.error}
          <button
            type="button"
            onClick={vendors.reload}
            className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
          >
            <RotateCw className="size-3" aria-hidden="true" />
            Retry
          </button>
        </p>
      )}
      {report.kind === "audit" && (
        <p className="text-xs text-muted-foreground">The audit log is filtered by date only.</p>
      )}
    </div>
  );
}

function Preview({ preview, filtersActive, onClear }) {
  const parsed = useMemo(() => (preview.data === null ? null : parseCsv(preview.data)), [preview.data]);

  if (preview.error && preview.data === null) {
    return <ErrorState title="Couldn't generate the preview" description={preview.error} onRetry={preview.reload} />;
  }
  if (parsed === null) {
    return <LoadingState rows={6} />;
  }
  if (preview.error) {
    return <ErrorState title="Couldn't update the preview" description={preview.error} onRetry={preview.reload} />;
  }
  const [header = [], ...rows] = parsed;
  if (!rows.length) {
    return (
      <EmptyState
        icon={FileSearch}
        title={filtersActive ? "No rows match these filters" : "This report is empty"}
        description={filtersActive
          ? "Widen the date range or clear a filter. Export still downloads the column headers."
          : "Rows appear as invoices and activity are recorded."}
        action={filtersActive && <Button variant="outline" size="sm" onClick={onClear}>Clear filters</Button>}
      />
    );
  }
  const kinds = header.map(columnKind);
  const shown = rows.slice(0, PREVIEW_ROWS);
  return (
    <div aria-busy={preview.loading} className={cn("transition-opacity", preview.loading && "opacity-60")}>
      <p className="px-6 pt-4 text-sm text-muted-foreground" aria-live="polite">
        {rows.length > shown.length
          ? `Previewing the first ${formatNumber(shown.length)} of ${formatNumber(rows.length)} rows. Export downloads all of them.`
          : `${formatNumber(rows.length)} row${rows.length === 1 ? "" : "s"}.`}
      </p>
      <Table containerClassName="mt-2">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {header.map((title, index) => (
              <TableHead key={title} numeric={kinds[index] === "money" || kinds[index] === "number"}>
                {title}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((row, rowIndex) => (
            // CSV rows have no id; position is stable for a given response.
            // eslint-disable-next-line react/no-array-index-key
            <TableRow key={rowIndex}>
              {header.map((title, index) => (
                <TableCell key={title} numeric={kinds[index] === "money" || kinds[index] === "number"}>
                  <CellValue kind={kinds[index]} value={displayCell(row[index] ?? "")} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CellValue({ kind, value }) {
  if (value === "") {
    return <span className="text-muted-foreground">—</span>;
  }
  if (kind === "money") {
    return formatCurrency(value);
  }
  if (kind === "date") {
    return formatDate(value);
  }
  if (kind === "datetime") {
    return formatDateTime(normalizeTimestamp(value));
  }
  if (kind === "number") {
    return formatNumber(value, { fractionDigits: 0 });
  }
  if (kind === "status") {
    return <StatusBadge kind="invoice" status={value} />;
  }
  return <span className="block max-w-80 truncate" title={value}>{value}</span>;
}
