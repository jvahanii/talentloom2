import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/app-client";
import {
  getMyBoardPrefs,
  saveMyBoardPrefs,
  type BoardPrefs,
} from "@/lib/candidate-board-prefs.functions";

const KEY = ["my-board-prefs"];

export interface BoardSelection {
  q: string;
  org: string;
  sort: string;
  view: string;
}

/** Persisted per-candidate filter/sort selections for the open positions board. */
export function useBoardPrefs() {
  const [signedIn, setSignedIn] = useState(false);
  const queryClient = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    hasClerkSession().then((ok) => {
      if (active) setSignedIn(ok);
    });
    return () => {
      active = false;
    };
  }, []);

  const getFn = useServerFn(getMyBoardPrefs);
  const saveFn = useServerFn(saveMyBoardPrefs);

  const { data, isFetched } = useQuery({
    queryKey: KEY,
    queryFn: () => getFn(),
    enabled: signedIn,
    staleTime: Infinity,
  });

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const save = useCallback(
    (sel: BoardSelection) => {
      if (!signedIn) return;
      const payload = {
        q: sel.q ? sel.q.slice(0, 100) : null,
        orgId: sel.org || null,
        sort: sel.sort || null,
        view: sel.view || null,
      };
      const next: BoardPrefs = {
        q: payload.q,
        org_id: payload.orgId,
        sort: payload.sort,
        view: payload.view,
      };
      queryClient.setQueryData(KEY, next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        // Best-effort: a failed preference save should never interrupt browsing.
        void saveFn({ data: payload }).catch(() => {});
      }, 600);
    },
    [signedIn, saveFn, queryClient],
  );

  return {
    signedIn,
    prefs: (data ?? null) as BoardPrefs | null,
    ready: !signedIn || isFetched,
    save,
  };
}
