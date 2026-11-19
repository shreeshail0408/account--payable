import React from "react";
import { Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationsMenu } from "./NotificationsMenu";
import { UserMenu } from "./UserMenu";

const IS_MAC = typeof navigator !== "undefined"
  && /mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform || "");
export const SHORTCUT_LABEL = IS_MAC ? "⌘K" : "Ctrl K";

export function Topbar({ group, title, role, notifications, onOpenMobileNav, onOpenSearch }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur sm:gap-4 sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
      >
        <Menu />
      </Button>

      <Breadcrumb group={group} title={title} />

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <button
          type="button"
          onClick={onOpenSearch}
          aria-keyshortcuts={IS_MAC ? "Meta+K" : "Control+K"}
          className="hidden h-9 w-64 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm text-muted-foreground shadow-card transition-colors outline-none hover:border-border-strong hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/35 lg:flex"
        >
          <Search className="size-4" aria-hidden="true" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded border border-border bg-muted px-1.5 font-mono text-[11px]">{SHORTCUT_LABEL}</kbd>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="text-subtle-foreground lg:hidden"
          onClick={onOpenSearch}
          aria-label="Search"
        >
          <Search />
        </Button>

        <NotificationsMenu role={role} notifications={notifications} />
        <div className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
        <UserMenu />
      </div>
    </header>
  );
}

function Breadcrumb({ group, title }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {group && (
          <>
            <li className="hidden text-muted-foreground sm:block">{group}</li>
            <li className="hidden text-muted-foreground/60 sm:block" aria-hidden="true">/</li>
          </>
        )}
        <li className="min-w-0">
          <span className="block truncate font-semibold tracking-tight" aria-current="page">
            {title}
          </span>
        </li>
      </ol>
    </nav>
  );
}
