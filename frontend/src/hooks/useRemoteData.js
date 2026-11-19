import { useCallback, useEffect, useRef, useState } from "react";
import { apiErrorMessage } from "@/lib/api-errors";

/**
 * Run `loader()` whenever `key` changes and keep {data, loading, error}. Stale responses are
 * dropped; `data` keeps the last good value during a reload so tables don't flash empty.
 * Pass `enabled: false` to skip loading (e.g. the role can't read the endpoint).
 */
export function useRemoteData(loader, key, { enabled = true, fallback = "This data couldn't be loaded.", forbidden } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, error: "", status: null });
  const requestId = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setState((current) => ({ ...current, loading: true, error: "", status: null }));
    try {
      const data = await loaderRef.current();
      if (id === requestId.current) {
        setState({ data, loading: false, error: "", status: null });
      }
    } catch (error) {
      if (id === requestId.current) {
        setState((current) => ({
          data: current.data,
          loading: false,
          error: apiErrorMessage(error, { fallback, forbidden }),
          status: error?.response?.status ?? null,
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fallback, forbidden]);

  useEffect(() => {
    if (!enabled) {
      requestId.current += 1;
      setState({ data: null, loading: false, error: "", status: null });
      return;
    }
    load();
  }, [load, enabled]);

  return { ...state, reload: load };
}
