import { useCallback, useEffect, useState } from "react";

/**
 * A tab choice that's remembered in this browser, so a page opens on the tab
 * you last used. `fallback` is used the first time, and whenever the saved tab
 * isn't one of `tabs`; the third value says whether a choice was saved, for
 * pages whose default depends on their data. Storage can be unavailable
 * (private windows, blocked site data); then the choice simply isn't remembered.
 */
export function useRememberedTab<T extends string>(
  key: string,
  tabs: readonly T[],
  fallback: T,
): [T, (next: string) => void, boolean] {
  const storageKey = `talentloom:tab:${key}`;
  const [tab, setTab] = useState<T>(fallback);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const value = window.localStorage.getItem(storageKey);
      if (value && (tabs as readonly string[]).includes(value)) {
        setTab(value as T);
        setSaved(true);
      }
    } catch {
      /* keep the fallback */
    }
    // `tabs` is a fixed list per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const choose = useCallback(
    (next: string) => {
      if (!(tabs as readonly string[]).includes(next)) return;
      setTab(next as T);
      setSaved(true);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        /* not remembered */
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storageKey],
  );

  return [tab, choose, saved];
}
