import { useCallback, useEffect, useState } from "react";
import { apiErrorMessage } from "@/lib/api-errors";
import { fetchAllPages } from "@/lib/pagination";

/**
 * A dropdown source (every page of a list endpoint). Loading and error are exposed so a select
 * never looks empty by mistake. `visible` mirrors `enabled` (the role may not read the source).
 */
export function useReferenceList(path, enabled, label, params) {
  const [state, setState] = useState({ rows: [], loading: enabled, error: "", truncated: false });
  const [attempt, setAttempt] = useState(0);
  const paramsKey = JSON.stringify(params || {});

  useEffect(() => {
    if (!enabled) {
      setState({ rows: [], loading: false, error: "", truncated: false });
      return undefined;
    }
    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: "" }));
    fetchAllPages(path, JSON.parse(paramsKey))
      .then(({ rows, truncated }) => {
        if (!cancelled) {
          setState({ rows, loading: false, error: "", truncated });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            rows: [],
            loading: false,
            error: apiErrorMessage(error, { fallback: `${label} couldn't be loaded.` }),
            truncated: false,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, enabled, label, paramsKey, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, reload, visible: enabled };
}
