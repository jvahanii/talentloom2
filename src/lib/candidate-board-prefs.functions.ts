import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/app-auth-middleware";

// candidate_board_prefs was created directly on the backend project, so the
// generated types don't know it yet — cast the client locally.
export interface BoardPrefs {
  q: string | null;
  org_id: string | null;
  sort: string | null;
  view: string | null;
}

const TABLE = "candidate_board_prefs";

export const getMyBoardPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          maybeSingle: () => Promise<{ data: BoardPrefs | null; error: unknown }>;
        };
      };
    };
    const { data } = await db.from(TABLE).select("q, org_id, sort, view").maybeSingle();
    return (data ?? null) as BoardPrefs | null;
  });

export const saveMyBoardPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        q: z.string().max(100).nullable(),
        orgId: z.string().uuid().nullable(),
        sort: z.string().max(40).nullable(),
        view: z.string().max(40).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as {
      from: (t: string) => {
        upsert: (
          row: Record<string, unknown>,
          opts: { onConflict: string },
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
    const { error } = await db.from(TABLE).upsert(
      {
        user_id: context.userId,
        q: data.q,
        org_id: data.orgId,
        sort: data.sort,
        view: data.view,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
