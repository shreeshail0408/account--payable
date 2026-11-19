import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/services/api";
import { NAV_ITEMS, canAccess } from "./nav";

const POLL_MS = 60_000;

/**
 * Runs `load` now, every POLL_MS while the tab is visible, when the window regains focus,
 * and whenever a value in `deps` changes. Returns a stable `refresh` function.
 */
function usePolling(load, enabled, deps = []) {
  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(() => {
    if (enabled) {
      loadRef.current();
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }, POLL_MS);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, refresh, ...deps]);

  return refresh;
}

/** Count of approvals the current user can act on now (GET /approvals/pending-count/). */
export function usePendingApprovals(user, pathname) {
  const [count, setCount] = useState(0);
  const enabled = canAccess(NAV_ITEMS.approvals, user?.role);

  const refresh = usePolling(async () => {
    try {
      const { data } = await api.get("/approvals/pending-count/");
      setCount(Number(data.count) || 0);
    } catch {
      // The badge is a hint; keep the last known value rather than showing an error.
    }
  }, enabled, [pathname]);

  return { count: enabled ? count : 0, refresh };
}

/**
 * Notifications for the topbar: unread count is polled; the list loads when the menu opens.
 */
export function useNotifications(enabled) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState("");

  const refreshCount = usePolling(async () => {
    try {
      const { data } = await api.get("/notifications/unread-count/");
      setUnreadCount(Number(data.count) || 0);
    } catch {
      // Keep the last known count.
    }
  }, enabled);

  const loadList = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const { data } = await api.get("/notifications/");
      setItems(data.results || data);
      setStatus("ready");
      refreshCount();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Unable to load notifications.");
      setStatus("error");
    }
  }, [refreshCount]);

  const markRead = useCallback(async (item) => {
    if (item.read_at) {
      return true;
    }
    try {
      await api.post(`/notifications/${item.id}/mark_read/`);
      const readAt = new Date().toISOString();
      setItems((current) => current.map((entry) => (
        entry.id === item.id ? { ...entry, read_at: readAt } : entry
      )));
      setUnreadCount((current) => Math.max(0, current - 1));
      return true;
    } catch {
      return false;
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const readAt = new Date().toISOString();
    const previousItems = items;
    const previousCount = unreadCount;
    setItems((current) => current.map((entry) => ({ ...entry, read_at: entry.read_at || readAt })));
    setUnreadCount(0);
    try {
      await api.post("/notifications/mark-all-read/");
      return true;
    } catch {
      setItems(previousItems);
      setUnreadCount(previousCount);
      return false;
    }
  }, [items, unreadCount]);

  return { unreadCount, items, status, error, loadList, markRead, markAllRead };
}
