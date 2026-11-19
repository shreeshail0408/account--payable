import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiErrorMessage } from "@/lib/api-errors";
import { listInvoices } from "./api";
import { FILTER_KEYS } from "./model";

export const PAGE_SIZE = 20; // REST_FRAMEWORK PAGE_SIZE in settings.py

/**
 * The invoice list's whole query lives in the URL (?search, ?status=A,B, ?vendor, ?date_from,
 * ?date_to, the dashboard's linked filters, ?ordering, ?page) so views are shareable and the
 * back button works. Changing any filter resets to page 1.
 */
export function useInvoiceQuery() {
  const [params, setParams] = useSearchParams();

  const query = useMemo(() => {
    const filters = {};
    FILTER_KEYS.forEach((key) => {
      const value = params.get(key);
      if (value) {
        filters[key] = value;
      }
    });
    const page = Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1);
    return { filters, ordering: params.get("ordering") || "", page };
  }, [params]);

  const update = useCallback((changes, { keepPage = false } = {}) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(changes).forEach(([key, value]) => {
        if (value === "" || value === null || value === undefined) {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      });
      if (!keepPage && !("page" in changes)) {
        next.delete("page");
      }
      return next;
    }, { replace: true });
  }, [setParams]);

  const clearFilters = useCallback(() => {
    update(Object.fromEntries(FILTER_KEYS.map((key) => [key, ""])));
  }, [update]);

  /** API params for the current view (CSV export reuses these without `page`). */
  const apiParams = useMemo(() => ({
    ...query.filters,
    ...(query.ordering ? { ordering: query.ordering } : {}),
  }), [query]);

  return { ...query, apiParams, update, clearFilters };
}

/** GET /invoices/ for the current query; stale responses are dropped. */
export function useInvoiceList(apiParams, page) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  const requestId = useRef(0);
  const key = JSON.stringify([apiParams, page]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const data = await listInvoices({ ...apiParams, page });
      if (id === requestId.current) {
        setState({ data, loading: false, error: "" });
      }
    } catch (error) {
      if (id === requestId.current) {
        const pageGone = error.response?.status === 404 && page > 1;
        setState((current) => ({
          data: current.data,
          loading: false,
          error: pageGone
            ? "That page no longer exists. Go back to the first page."
            : apiErrorMessage(error, { fallback: "Invoices couldn't be loaded." }),
          pageGone,
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = state.data ? state.data.results || state.data : [];
  const count = state.data?.count ?? rows.length;
  return { ...state, rows, count, reload: load };
}
