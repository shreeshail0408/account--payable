import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, Building2, CreditCard, FileText } from "lucide-react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states";
import { Tooltip as HoverTip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency, formatCurrencyCompact, formatNumber, formatPercent } from "@/lib/format";
import { NAV_ITEMS, canAccess } from "@/layout/nav";
import { invoicesLink } from "./model";

const AXIS_TICK = { fill: "var(--color-muted-foreground)", fontSize: 12 };
const ROW_LINK = "rounded-md outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/35";

function plural(count, word) {
  return `${formatNumber(count)} ${word}${count === 1 ? "" : "s"}`;
}

/** Recharts tooltip body: value first (strong), then the label; a short line key carries the color. */
function ChartTooltip({ active, payload, describe }) {
  if (!active || !payload?.length) {
    return null;
  }
  const row = payload[0].payload;
  const { title, value, detail, color } = describe(row);
  return (
    <div data-ui="" className="min-w-36 rounded-md border border-border bg-popover px-3 py-2 text-popover-foreground shadow-popover">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="flex items-center gap-2 text-sm font-semibold tabular-nums">
        <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ backgroundColor: color }} />
        {value}
      </p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

/* ----------------------------------------------------------------------------- Aging */

export function AgingCard({ rows }) {
  const navigate = useNavigate();
  const overdue = rows.filter((row) => row.overdue).reduce((total, row) => total + row.amount, 0);
  const hasData = rows.some((row) => row.count > 0);

  const openBucket = (state) => {
    const row = state?.activePayload?.[0]?.payload;
    if (row) {
      navigate(row.to);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoice aging</CardTitle>
        <CardDescription>Unpaid invoices by days past due. Select a bar to see them.</CardDescription>
        {overdue > 0 && (
          <CardAction className="text-right">
            <p className="text-xs text-muted-foreground">Overdue</p>
            <p className="text-sm font-semibold">{formatCurrencyCompact(overdue)}</p>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-4">
        {hasData ? (
          <div className="h-56" role="img" aria-label="Outstanding amount by aging bucket; values are listed below the chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rows}
                margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
                onClick={openBucket}
                style={{ cursor: "pointer" }}
              >
                <CartesianGrid vertical={false} stroke="var(--color-border)" />
                <XAxis
                  dataKey="short"
                  interval={0}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-border-strong)" }}
                  tick={AXIS_TICK}
                />
                <YAxis
                  width={56}
                  tickLine={false}
                  axisLine={false}
                  tick={AXIS_TICK}
                  tickFormatter={(value) => formatCurrencyCompact(value)}
                />
                <Tooltip
                  cursor={{ fill: "var(--color-muted)" }}
                  content={(
                    <ChartTooltip
                      describe={(row) => ({
                        title: row.label,
                        value: formatCurrency(row.amount),
                        detail: plural(row.count, "invoice"),
                        color: row.color,
                      })}
                    />
                  )}
                />
                <Bar dataKey="amount" maxBarSize={24} radius={[4, 4, 0, 0]}>
                  {rows.map((row) => (
                    <Cell key={row.bucket} fill={row.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="Nothing outstanding"
            description="Unpaid invoices with a due date will be grouped here by how overdue they are."
            className="py-8"
          />
        )}

        {/* Scale legend + table view: every bucket's figures, and a keyboard path to the filtered list. */}
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {rows.map((row) => (
            <li key={row.bucket} className={row.bucket === "Not yet due" ? "col-span-2 sm:col-span-1" : undefined}>
              <Link
                to={row.to}
                className={`${ROW_LINK} flex flex-col gap-0.5 border border-border px-3 py-2`}
                aria-label={`${row.label}: ${formatCurrency(row.amount)}, ${plural(row.count, "invoice")}`}
              >
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span aria-hidden="true" className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: row.color }} />
                  <span className="truncate">{row.legend}</span>
                </span>
                <span className="text-sm font-semibold tabular-nums">{formatCurrencyCompact(row.amount)}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{plural(row.count, "invoice")}</span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------- Invoice status */

export function InvoiceStatusCard({ stages }) {
  const { total, rows } = stages;
  const visible = rows.filter((row) => row.count > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoice status</CardTitle>
        <CardDescription>
          {total ? `${plural(total, "invoice")} by lifecycle stage` : "Where invoices are in the workflow"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-4">
        {total === 0 ? (
          <EmptyState
            icon={FileText}
            title="No invoices yet"
            description="Captured invoices will show up here as they move through matching, approval and payment."
            className="py-8"
          />
        ) : (
          <>
            {/* Thin segmented bar: the list below carries names and figures, so the bar has no text. */}
            <div className="flex h-2 w-full gap-[2px]" aria-hidden="true">
              {visible.map((row) => (
                <HoverTip key={row.key}>
                  <TooltipTrigger asChild>
                    <span
                      className="h-full min-w-1 first:rounded-l-full last:rounded-r-full"
                      style={{ flexGrow: row.count, flexBasis: 0, backgroundColor: row.color }}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    {row.label}: {formatNumber(row.count)} ({formatPercent(row.share, { fractionDigits: 0 })})
                  </TooltipContent>
                </HoverTip>
              ))}
            </div>

            <ul className="flex flex-col">
              {rows.map((row) => (
                <li key={row.key}>
                  <Link to={row.to} className={`${ROW_LINK} flex items-center gap-3 px-2 py-2`}>
                    <span aria-hidden="true" className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: row.color }} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm">{row.label}</span>
                      {row.breakdown.length > 1 && (
                        <span className="truncate text-xs text-muted-foreground">
                          {row.breakdown.map((part) => `${part.label} ${formatNumber(part.count)}`).join(" · ")}
                        </span>
                      )}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{formatNumber(row.count)}</span>
                    <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                      {formatPercent(row.share, { fractionDigits: 0 })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ----------------------------------------------------------------------- Payments */

export function PaymentsCard({ rows, role }) {
  const hasData = rows.some((row) => row.count > 0);
  const totalCount = rows.reduce((total, row) => total + row.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment tracking</CardTitle>
        <CardDescription>
          {hasData ? `Amount by payment state · ${plural(totalCount, "payment record")}` : "Amount by payment state"}
        </CardDescription>
        {canAccess(NAV_ITEMS.payments, role) && (
          <CardAction>
            <Button variant="ghost" size="sm" asChild>
              <Link to={NAV_ITEMS.payments.path}>
                Payments
                <ArrowRight />
              </Link>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="pt-4">
        {hasData ? (
          <div className="h-56" role="img" aria-label={rows.map((row) => `${row.label}: ${formatCurrency(row.amount)}, ${plural(row.count, "payment")}`).join("; ")}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 64, bottom: 0, left: 0 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={84}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-border-strong)" }}
                  tick={AXIS_TICK}
                />
                <Tooltip
                  cursor={{ fill: "var(--color-muted)" }}
                  content={(
                    <ChartTooltip
                      describe={(row) => ({
                        title: row.label,
                        value: formatCurrency(row.amount),
                        detail: plural(row.count, "payment"),
                        color: "var(--color-chart-1)",
                      })}
                    />
                  )}
                />
                <Bar dataKey="amount" fill="var(--color-chart-1)" maxBarSize={20} radius={[0, 4, 4, 0]}>
                  <LabelList
                    dataKey="amount"
                    position="right"
                    formatter={(value) => formatCurrencyCompact(value)}
                    style={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            icon={CreditCard}
            title="No payments recorded"
            description="Payments appear here once approved invoices are sent for payment."
            className="py-8"
          />
        )}
      </CardContent>
    </Card>
  );
}

/* --------------------------------------------------------------------- Top vendors */

export function TopVendorsCard({ rows, role }) {
  const vendorsAllowed = canAccess(NAV_ITEMS.vendors, role);
  const linkFor = (name) => (
    vendorsAllowed
      ? `${NAV_ITEMS.vendors.path}?search=${encodeURIComponent(name)}`
      : invoicesLink({ search: name })
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top vendors</CardTitle>
        <CardDescription>Ranked by total invoiced amount</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {rows.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No vendor spend yet"
            description="Vendors are ranked here once invoices are captured against them."
            className="py-8"
          />
        ) : (
          <ol className="flex flex-col gap-1">
            {rows.map((row, index) => (
              <li key={`${row.name}-${index}`}>
                <Link to={linkFor(row.name)} className={`${ROW_LINK} flex flex-col gap-1.5 px-2 py-2`}>
                  <span className="flex items-baseline gap-3">
                    <span className="w-4 shrink-0 text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.name}</span>
                    <span className="text-sm font-semibold tabular-nums">{formatCurrencyCompact(row.total)}</span>
                  </span>
                  <span className="flex items-center gap-3 pl-7">
                    <span className="h-1.5 flex-1 rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-chart-1"
                        style={{ width: `${Math.max(row.share, 2)}%` }}
                      />
                    </span>
                    <span className="w-20 text-right text-xs text-muted-foreground tabular-nums">
                      {plural(row.count, "invoice")}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
