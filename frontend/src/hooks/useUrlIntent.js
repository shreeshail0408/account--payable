import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

/*
 * Lets the command palette deep-link into list pages:
 *   ?search=INV-1  -> onSearch("INV-1") whenever the param changes
 *   ?new=1         -> onNew() once, then the param is removed from the URL
 */
export function useUrlIntent({ onSearch, onNew }) {
  const [params, setParams] = useSearchParams();
  const search = params.get("search");
  const wantsNew = params.get("new") === "1";

  useEffect(() => {
    if (search !== null && onSearch) {
      onSearch(search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (!wantsNew) {
      return;
    }
    if (onNew) {
      onNew();
    }
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("new");
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsNew]);
}
