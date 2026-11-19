import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * List-page query in the URL (?search=…&page=…&<filters>) so views are shareable, the back
 * button works and command-palette deep links (?search=) land filtered. Changing anything
 * but `page` resets to page 1.
 */
export function useListQuery(keys = ["search"]) {
  const [params, setParams] = useSearchParams();
  const keysKey = keys.join(",");

  const values = useMemo(() => {
    const result = {};
    keysKey.split(",").forEach((key) => {
      result[key] = params.get(key) || "";
    });
    return result;
  }, [params, keysKey]);

  const page = Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1);

  const update = useCallback((changes) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(changes).forEach(([key, value]) => {
        if (value === "" || value === null || value === undefined || (key === "page" && Number(value) <= 1)) {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      });
      if (!("page" in changes)) {
        next.delete("page");
      }
      return next;
    }, { replace: true });
  }, [setParams]);

  const clear = useCallback(() => {
    update(Object.fromEntries(keysKey.split(",").map((key) => [key, ""])));
  }, [update, keysKey]);

  const active = Object.values(values).some(Boolean);
  return { values, page, update, clear, active };
}
