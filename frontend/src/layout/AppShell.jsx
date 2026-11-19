import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/auth";
import { useLocalStorageState } from "@/hooks/useLocalStorageState";
import { cn } from "@/lib/utils";
import { MobileTabBar } from "./MobileTabBar";
import { PageFallback } from "./PageFallback";
import { RouteErrorBoundary } from "./RouteErrorBoundary";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { findRoute } from "./nav";
import { useNotifications, usePendingApprovals } from "./useShellData";

/*
 * The palette (cmdk + record search) is downloaded on first use, not with the shell.
 * A plain dynamic import instead of React.lazy: a failed download can be retried on the
 * next attempt (React.lazy caches the rejection) and never reaches an error boundary.
 */
let palettePromise = null;
function loadCommandPalette() {
  if (!palettePromise) {
    palettePromise = import("./CommandPalette")
      .then((module) => module.CommandPalette)
      .catch((error) => {
        palettePromise = null;
        throw error;
      });
  }
  return palettePromise;
}

/** Open/close state for the lazily loaded palette. */
function useCommandPalette() {
  const [Palette, setPalette] = useState(null);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  openRef.current = open;

  const show = useCallback(async () => {
    try {
      const component = await loadCommandPalette();
      setPalette(() => component);
      setOpen(true);
    } catch {
      toast.error("Search couldn't be loaded. Check your connection and try again.");
    }
  }, []);

  const toggle = useCallback(() => {
    if (openRef.current) {
      setOpen(false);
    } else {
      show();
    }
  }, [show]);

  return { Palette, open, setOpen, show, toggle };
}

function isTypingTarget(target) {
  return target instanceof HTMLElement
    && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

/** Authenticated layout: sidebar, topbar, page outlet, mobile tab bar, command palette. */
export function AppShell() {
  const { user } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useLocalStorageState("ap-sidebar-collapsed", false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const palette = useCommandPalette();
  const { toggle: togglePalette } = palette;

  const { group, item } = findRoute(location.pathname);
  const pendingApprovals = usePendingApprovals(user, location.pathname);
  const notifications = useNotifications(Boolean(user));
  const badges = { pendingApprovals: pendingApprovals.count };

  useEffect(() => {
    document.title = item ? `${item.label} · PayFlow AP` : "PayFlow AP";
  }, [item]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        togglePalette();
        return;
      }
      if (event.key === "[" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget(event.target)) {
        setCollapsed((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setCollapsed, togglePalette]);

  return (
    <div data-ui="" className="min-h-dvh bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden border-r border-border bg-card transition-[width] duration-200 md:block",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <Sidebar
          role={user?.role}
          collapsed={collapsed}
          badges={badges}
          onToggleCollapsed={() => setCollapsed((value) => !value)}
        />
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-72 max-w-[85vw] p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Pages available to your role</SheetDescription>
          <Sidebar
            role={user?.role}
            badges={badges}
            onNavigate={() => setMobileNavOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className={cn("transition-[padding] duration-200", collapsed ? "md:pl-16" : "md:pl-60")}>
        <Topbar
          group={group}
          title={item?.label || "PayFlow AP"}
          role={user?.role}
          notifications={notifications}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onOpenSearch={palette.show}
        />
        <main id="main-content" data-shell-main="" tabIndex={-1} className="pb-[calc(4rem+env(safe-area-inset-bottom))] outline-none md:pb-0">
          <RouteErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageFallback />}>
              <Outlet />
            </Suspense>
          </RouteErrorBoundary>
        </main>
      </div>

      <MobileTabBar role={user?.role} badges={badges} />
      {palette.Palette && (
        <palette.Palette open={palette.open} onOpenChange={palette.setOpen} role={user?.role} />
      )}
    </div>
  );
}
