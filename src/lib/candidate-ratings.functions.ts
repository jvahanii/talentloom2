import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/app-auth-middleware";

// candidate_position_ratings was created directly on the backend project, so the
// generated types don't know it yet — cast the client locally.
export interface PositionRating {
  requisition_id: string;
  rating: number | null;
  discarded: boolean;
}

const TABLE = "candidate_position_ratings";

export const listMyPositionRatings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => Promise<{ data: PositionRating[] | null; error: unknown }>;
      };
    };
    const { data } = await db.from(TABLE).select("requisition_id, rating, discarded");
    return (data ?? []) as PositionRating[];
  });

const upsert = async (
  supabase: unknown,
  userId: string,
  requisitionId: string,
  patch: { rating?: number | null; discarded?: boolean },
) => {
  const db = supabase as unknown as {
    from: (t: string) => {
      upsert: (
        row: Record<string, unknown>,
        opts: { onConflict: string },
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
  const { error } = await db
    .from(TABLE)
    .upsert(
      { user_id: userId, requisition_id: requisitionId, ...patch },
      { onConflict: "user_id,requisition_id" },
    );
  if (error) throw new Error(error.message);
  return { ok: true };
};

export const setPositionRating = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ positionId: z.string().uuid(), rating: z.number().int().min(1).max(5).nullable() })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    upsert(context.supabase, context.userId, data.positionId, { rating: data.rating }),
  );

export const setPositionDiscarded = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ positionId: z.string().uuid(), discarded: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) =>
    upsert(context.supabase, context.userId, data.positionId, { discarded: data.discarded }),
  );
