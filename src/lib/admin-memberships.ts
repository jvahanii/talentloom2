import { z } from "zod";

export const addMembershipsSchema = z.object({
  userId: z.string().uuid(),
  orgIds: z.array(z.string().uuid()).min(1).max(100),
});

export function assertSuperuser(allowed: unknown) {
  if (allowed !== true) throw new Error("Only a superuser can do this");
}

export function planMemberships(
  userId: string,
  orgIds: string[],
  existing: { org_id: string }[],
  titles: { id: string; org_id: string }[],
) {
  const joined = new Set(existing.map((m) => m.org_id));
  return [...new Set(orgIds)].filter((id) => !joined.has(id)).map((orgId) => {
    const title = titles.find((t) => t.org_id === orgId);
    if (!title) throw new Error("A selected organisation does not exist or has no Member title");
    return { org_id: orgId, user_id: userId, role: "member" as const, title_id: title.id };
  });
}