import { useCallback, useState } from "react";

/** useState that persists to localStorage; falls back to memory if storage is unavailable. */
export function useLocalStorageState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? initialValue : JSON.parse(stored);
    } catch {
      return initialValue;
    }
  });

  const update = useCallback((next) => {
    setValue((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      try {
        window.localStorage.setItem(key, JSON.stringify(resolved));
      } catch {
        // Private mode or storage disabled: keep the in-memory value only.
      }
      return resolved;
    });
  }, [key]);

  return [value, update];
}
