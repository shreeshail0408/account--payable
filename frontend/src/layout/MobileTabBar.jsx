import React from "react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { MOBILE_TABS, canAccess } from "./nav";

/** Bottom tab bar on small screens (the sidebar becomes a Sheet there). */
export function MobileTabBar({ role, badges = {} }) {
  const tabs = MOBILE_TABS.filter((item) => canAccess(item, role));
  if (tabs.length < 2) {
    return null;
  }
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((item) => {
          const badge = item.badge ? badges[item.badge] : 0;
          return (
            <li key={item.path}>
              <NavLink
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) => cn(
                  "relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium outline-none",
                  "focus-visible:bg-accent",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span className="relative">
                  <item.icon className="size-5" aria-hidden="true" />
                  {badge > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground tabular-nums">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                {item.label}
                {badge > 0 && <span className="sr-only">, {badge} pending</span>}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
