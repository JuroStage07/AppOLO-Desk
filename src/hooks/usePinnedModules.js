import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "appolo_pinned_modules";

/**
 * Hook to manage pinned quick-access modules.
 * Each pin is { label, path }.
 * Persisted in localStorage.
 */
export default function usePinnedModules() {
  const [pinned, setPinned] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pinned));
    } catch {
      // silent
    }
  }, [pinned]);

  const isPinned = useCallback(
    (path) => pinned.some((p) => p.path === path),
    [pinned]
  );

  const togglePin = useCallback(
    (label, path) => {
      setPinned((prev) => {
        const exists = prev.some((p) => p.path === path);
        if (exists) {
          return prev.filter((p) => p.path !== path);
        }
        return [...prev, { label, path }];
      });
    },
    []
  );

  const removePin = useCallback(
    (path) => {
      setPinned((prev) => prev.filter((p) => p.path !== path));
    },
    []
  );

  return { pinned, isPinned, togglePin, removePin };
}
