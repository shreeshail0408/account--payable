import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarClock, CircleCheck, ClipboardCheck, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { daysFromToday, formatCurrency, formatDate, formatNumber, formatRelativeTime } from "@/lib/format";
import { NAV_ITEMS } from "@/layout/nav";
import { invoicesLink } from "./model";

const ROW_LINK = "flex flex-col gap-1 rounded-md px-2 py-2 outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/35";

function invoiceSearchLink(item) {
  return invoicesLink({ search: item.invoice_number || item.vendor_name || "" });
}

function dueLabel(dateValue) {
  const days = daysFromToday(dateValue);
  if (days === 0) {
    return "Due today";
  }
  if (days === 1) {
    return "Due tomorrow";
  }
  return `Due ${formatDate(dateValue)}`;
}

/*
 * One section per kind of work. The API only sends the sections the user's role can act on
 * (or audit), so the panel tailors itself: approvers see approvals, clerks see exceptions,
 * accountants see payments due; admins see all three.
 */
const SECTIONS = [
  {
    key: "my_approvals",
    title: "Approvals waiting on you",
    icon: ClipboardCheck,
    empty: "No approvals are waiting on you.",
    viewAll: () => NAV_ITEMS.approvals.path,
    itemLink: () => NAV_ITEMS.approvals.path,
    meta: (item) => (
      item.overdue ? (
        <Badge variant="danger">Overdue</Badge>
      ) : (
        <span>Due {formatRelativeTime(item.due_at)}</span>
      )
    ),
  },
  {
    key: "exceptions",
    title: "Invoices with exceptions",
    icon: TriangleAlert,
    empty: "No invoices are blocked by exceptions.",
    viewAll: () => invoicesLink({ status: "EXCEPTION" }),
    itemLink: invoiceSearchLink,
    detail: (item) => item.exception,
  },
  {
    key: "payments_due",
    title: "Payments due this week",
    icon: CalendarClock,
    empty: "No approved invoices fall due in the next 7 days.",
    viewAll: (section) => invoicesLink({ status: "APPROVED", due_before: section.due_before }),
    itemLink: invoiceSearchLink,
    summary: (section) => (
      section.count ? `${formatCurrency(section.amount, { fractionDigits: 0 })} across ${formatNumber(section.count)}` : null
    ),
    meta: (item) => (
      <>
        {item.overdue ? (
          <Badge variant="danger">Overdue · {formatDate(item.due_date)}</Badge>
        ) : (
          <span>{dueLabel(item.due_date)}</span>
        )}
        {item.payment_status ? (
          <StatusBadge kind="payment" status={item.payment_status} />
        ) : (
          <span>No payment yet</span>
        )}
      </>
    ),
  },
];

export function AttentionCard({ attention = {} }) {
  const sections = SECTIONS.filter((section) => attention[section.key]);
  const openItems = sections.reduce((total, section) => total + (attention[section.key].count || 0), 0);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Needs your attention</CardTitle>
        <CardDescription>
          {openItems ? `${formatNumber(openItems)} open item${openItems === 1 ? "" : "s"} for your role` : "Work that is waiting for your role"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 pt-4">
        {sections.length === 0 && (
          <AllClear text="Nothing in your queue right now." />
        )}
        {sections.map((section) => (
          <AttentionSection key={section.key} config={section} data={attention[section.key]} />
        ))}
      </CardContent>
    </Card>
  );
}

function AllClear({ text }) {
  return (
    <p className="flex items-center gap-2 rounded-md bg-success-subtle px-3 py-2 text-sm text-success-subtle-foreground">
      <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
      {text}
    </p>
  );
}

function AttentionSection({ config, data }) {
  const Icon = config.icon;
  const headingId = `attention-${config.key}`;
  const summary = config.summary?.(data);
  const more = data.count - data.items.length;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <h3 id={headingId} className="min-w-0 flex-1 text-sm font-medium">
          {config.title}
        </h3>
        <Badge variant={data.count ? "primary" : "neutral"} className="tabular-nums">
          {formatNumber(data.count)}
        </Badge>
      </div>
      {summary && <p className="text-xs text-muted-foreground">{summary}</p>}

      {data.count === 0 ? (
        <AllClear text={config.empty} />
      ) : (
        <ul className="-mx-2 flex flex-col">
          {data.items.map((item) => (
            <li key={item.approval_id || item.invoice_id}>
              <AttentionItem config={config} item={item} />
            </li>
          ))}
        </ul>
      )}

      {data.count > 0 && (
        <Link
          to={config.viewAll(data)}
          className="inline-flex items-center gap-1 self-start rounded-sm text-xs font-medium text-link outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/35"
        >
          {more > 0 ? `View all ${formatNumber(data.count)}` : "View in list"}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}

function AttentionItem({ config, item }) {
  const detail = config.detail?.(item);
  return (
    <Link to={config.itemLink(item)} className={ROW_LINK}>
      <span className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {item.invoice_number || "Invoice needing review"}
        </span>
        <span className="text-sm tabular-nums">{formatCurrency(item.total_amount)}</span>
      </span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{item.vendor_name}</span>
        {config.meta && (
          <>
            <span aria-hidden="true">·</span>
            {config.meta(item)}
          </>
        )}
      </span>
      {detail && <span className="line-clamp-2 text-xs text-danger-subtle-foreground">{detail}</span>}
    </Link>
  );
}
