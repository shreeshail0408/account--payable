import React from "react";
import { NavLink, useMatch } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { visibleGroups } from "./nav";

/*
 * Navigation list shared by the desktop sidebar and the mobile Sheet.
 * `collapsed` shows icons only (labels move into tooltips).
 */
export function Sidebar({ role, collapsed = false, badges = {}, onToggleCollapsed, onNavigate }) {
  const groups = visibleGroups(role);

  return (
    <div className="flex h-full flex-col">
      <Brand collapsed={collapsed} />

      <nav aria-label="Main" className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2">
        {groups.map((group, index) => (
          <div key={group.label || "main"} className={cn(index > 0 && "mt-4")}>
            {group.label && !collapsed && (
              <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
            )}
            {group.label && collapsed && (
              <div className="mx-2 mb-2 h-px bg-border" aria-hidden="true" />
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.path}>
                  <SidebarLink
                    item={item}
                    collapsed={collapsed}
                    badge={item.badge ? badges[item.badge] : 0}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {onToggleCollapsed && (
        <div className="border-t border-border p-3">
          <CollapseToggle collapsed={collapsed} onToggle={onToggleCollapsed} />
        </div>
      )}
    </div>
  );
}

function Brand({ collapsed }) {
  return (
    <div className={cn("flex h-14 shrink-0 items-center gap-2.5 px-5", collapsed && "justify-center px-0")}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
        AP
      </span>
      {!collapsed && (
        <span className="text-[15px] font-semibold tracking-tight">PayFlow</span>
      )}
    </div>
  );
}

function SidebarLink({ item, collapsed, badge, onNavigate }) {
  const Icon = item.icon;
  const badgeLabel = badge > 99 ? "99+" : String(badge);
  // Plain string className: Radix Slot (TooltipTrigger asChild) can't merge NavLink's function form.
  const isActive = Boolean(useMatch({ path: item.path, end: item.path === "/" }));

  const link = (
    <NavLink
      to={item.path}
      end={item.path === "/"}
      onClick={onNavigate}
      aria-label={collapsed ? `${item.label}${badge ? `, ${badge} pending` : ""}` : undefined}
      className={cn(
        "relative flex h-9 items-center gap-3 rounded-md px-2.5 text-sm transition-colors",
        "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35",
        collapsed && "justify-center px-0",
        isActive
          ? "bg-primary-subtle font-medium text-primary-subtle-foreground"
          : "text-subtle-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {badge > 0 && !collapsed && (
        <span className="ml-auto rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-primary-foreground tabular-nums">
          {badgeLabel}
        </span>
      )}
      {badge > 0 && collapsed && (
        <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground tabular-nums">
          {badgeLabel}
        </span>
      )}
    </NavLink>
  );

  if (!collapsed) {
    return link;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        {item.label}
        {badge > 0 && ` · ${badge} pending`}
      </TooltipContent>
    </Tooltip>
  );
}

function CollapseToggle({ collapsed, onToggle }) {
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          onClick={onToggle}
          aria-label={label}
          aria-expanded={!collapsed}
          className={cn("text-muted-foreground", collapsed ? "mx-auto flex" : "w-full justify-start")}
        >
          <Icon />
          {!collapsed && "Collapse"}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {label}
        <kbd className="ml-2 font-mono opacity-70">[</kbd>
      </TooltipContent>
    </Tooltip>
  );
}
