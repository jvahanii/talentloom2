import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/app-client";
import { hasClerkSession } from "@/lib/clerk";
import {
  clearPendingRating,
  keepPendingRating,
  readPendingRating,
  type PendingRating,
} from "@/lib/pendingRating";
import {
  listMyPositionRatings,
  setPositionDiscarded,
  setPositionRating,
  type PositionRating,
} from "@/lib/candidate-ratings.functions";

const KEY = ["my-position-ratings"];

/** Private per-candidate ratings / discards for open positions. */
export function usePositionRatings() {
  const [signedIn, setSignedIn] = useState(false);
  // A rating picked while signed out, shown until it can be saved.
  const [pending, setPending] = useState<PendingRating | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    setPending(readPendingRating());
  }, []);

  useEffect(() => {
    let active = true;
    hasClerkSession().then((ok) => {
      if (active) setSignedIn(ok);
    });
    return () => {
      active = false;
    };
  }, []);

  const listFn = useServerFn(listMyPositionRatings);
  const rateFn = useServerFn(setPositionRating);
  const discardFn = useServerFn(setPositionDiscarded);

  const { data } = useQuery({
    queryKey: KEY,
    queryFn: () => listFn(),
    enabled: signedIn,
  });

  const map = new Map<string, PositionRating>((data ?? []).map((r) => [r.requisition_id, r]));

  const patchCache = (positionId: string, patch: Partial<PositionRating>) => {
    queryClient.setQueryData<PositionRating[]>(KEY, (prev) => {
      const rows = prev ? [...prev] : [];
      const i = rows.findIndex((r) => r.requisition_id === positionId);
      if (i >= 0) rows[i] = { ...rows[i]!, ...patch };
      else rows.push({ requisition_id: positionId, rating: null, discarded: false, ...patch });
      return rows;
    });
  };

  const rate = useMutation({
    mutationFn: (v: { positionId: string; rating: number | null }) => rateFn({ data: v }),
    onMutate: (v) => {
      const before = queryClient.getQueryData<PositionRating[]>(KEY);
      patchCache(v.positionId, { rating: v.rating });
      return { before };
    },
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData(KEY, ctx?.before);
      toast.error("Could not save your rating");
    },
  });

  const discard = useMutation({
    mutationFn: (v: { positionId: string; discarded: boolean }) => discardFn({ data: v }),
    onMutate: (v) => {
      const before = queryClient.getQueryData<PositionRating[]>(KEY);
      patchCache(v.positionId, { discarded: v.discarded });
      return { before };
    },
    onSuccess: (_d, v) => toast.success(v.discarded ? "Position discarded" : "Position restored"),
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData(KEY, ctx?.before);
      toast.error("Could not update this position");
    },
  });

  // Back from signing in: save the rating chosen before, once.
  const savedPending = useRef(false);
  useEffect(() => {
    if (!signedIn || savedPending.current) return;
    const p = readPendingRating();
    if (!p) return;
    savedPending.current = true;
    clearPendingRating();
    setPending(null);
    rate.mutate(
      { positionId: p.positionId, rating: p.rating },
      { onSuccess: () => toast.success("Your rating is saved") },
    );
  }, [signedIn, rate]);

  /** Signed out: keep the rating and offer to sign in to save it. */
  const rateSignedOut = (positionId: string, rating: number | null) => {
    const p = { positionId, rating };
    keepPendingRating(p);
    setPending(p);
    const returnTo = window.location.pathname + window.location.search;
    toast("Sign in to save your rating", {
      description: "We'll keep it and save it to your account once you're signed in.",
      action: {
        label: "Sign in",
        onClick: () => navigate({ to: "/candidate/auth", search: { redirect: returnTo } }),
      },
    });
  };

  return {
    signedIn,
    ratingOf: (id: string) =>
      !signedIn && pending?.positionId === id ? pending.rating : (map.get(id)?.rating ?? null),
    isDiscarded: (id: string) => map.get(id)?.discarded ?? false,
    setRating: (positionId: string, rating: number | null) =>
      signedIn ? rate.mutate({ positionId, rating }) : rateSignedOut(positionId, rating),
    setDiscarded: (positionId: string, discarded: boolean) =>
      discard.mutate({ positionId, discarded }),
  };
}
