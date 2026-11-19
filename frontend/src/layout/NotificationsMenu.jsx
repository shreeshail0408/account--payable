import React from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, canAccess } from "./nav";

const VISIBLE_ITEMS = 8;

/** Where a notification should take the user, limited to pages their role can open. */
function destinationFor(item, role) {
  if (item.entity_type === "Vendor" && canAccess(NAV_ITEMS.vendors, role)) {
    return NAV_ITEMS.vendors.path;
  }
  if (/approval/i.test(item.title) && canAccess(NAV_ITEMS.approvals, role)) {
    return NAV_ITEMS.approvals.path;
  }
  return NAV_ITEMS.invoices.path;
}

export function NotificationsMenu({ role, notifications }) {
  const navigate = useNavigate();
  const { unreadCount, items, status, error, loadList, markRead, markAllRead } = notifications;

  const onOpenChange = (open) => {
    if (open) {
      loadList();
    }
  };

  const openItem = async (item) => {
    const ok = await markRead(item);
    if (!ok) {
      toast.error("Couldn't mark the notification as read.");
    }
    navigate(destinationFor(item, role));
  };

  const onMarkAll = async (event) => {
    event.preventDefault();
    const ok = await markAllRead();
    if (!ok) {
      toast.error("Couldn't mark notifications as read. Try again.");
    }
  };

  const countLabel = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-subtle-foreground"
          aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        >
          <Bell />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-danger-solid px-1 text-[10px] font-semibold leading-4 text-danger-foreground tabular-nums">
              {countLabel}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-baseline gap-2">
            <p className="text-sm font-semibold">Notifications</p>
            {unreadCount > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums">{unreadCount} unread</span>
            )}
          </div>
          <DropdownMenuItem
            className="h-7 px-2 text-xs font-medium"
            disabled={unreadCount === 0}
            onSelect={onMarkAll}
          >
            <CheckCheck />
            Mark all read
          </DropdownMenuItem>
        </div>

        <div className="max-h-[min(26rem,60dvh)] overflow-y-auto p-1">
          <NotificationList
            status={status}
            error={error}
            items={items}
            onRetry={loadList}
            onOpen={openItem}
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationList({ status, error, items, onRetry, onOpen }) {
  if (status === "loading" && items.length === 0) {
    return (
      <div className="flex flex-col gap-3 p-3" role="status" aria-label="Loading notifications">
        {[0, 1, 2].map((key) => (
          <div key={key} className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-6 text-center" role="alert">
        <p className="text-sm text-danger">{error}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-muted-foreground">
        <BellOff className="size-5" aria-hidden="true" />
        <p className="text-sm">You're all caught up.</p>
      </div>
    );
  }

  return items.slice(0, VISIBLE_ITEMS).map((item) => (
    <DropdownMenuItem
      key={item.id}
      onSelect={() => onOpen(item)}
      className="items-start gap-3 px-3 py-2.5"
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          item.read_at ? "bg-transparent" : "bg-primary",
        )}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("truncate text-sm", !item.read_at && "font-medium")}>
          {item.title}
        </span>
        <span className="line-clamp-2 text-xs text-muted-foreground">{item.message}</span>
        <time
          className="text-[11px] text-muted-foreground"
          dateTime={item.created_at}
          title={formatDateTime(item.created_at)}
        >
          {formatRelativeTime(item.created_at)}
        </time>
      </span>
      {!item.read_at && <span className="sr-only">Unread</span>}
    </DropdownMenuItem>
  ));
}
