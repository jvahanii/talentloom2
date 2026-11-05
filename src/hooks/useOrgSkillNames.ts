import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/app-client";
import { useOrg } from "@/lib/org";
import { fetchOrgSkills } from "@/lib/orgSkills";
import type { KnownSkill } from "@/lib/skills";

export const orgSkillNamesKey = (orgId: string | null) => ["org-skill-names", orgId];

/**
 * Every skill in the current organisation with how many have it: the skills
 * people have, plus the organisation's own list (where nobody may have one yet).
 */
export function useOrgSkillNames(): KnownSkill[] {
  const { orgId } = useOrg();
  const q = useQuery({
    queryKey: orgSkillNamesKey(orgId),
    enabled: !!orgId,
    staleTime: 30_000,
    queryFn: async (): Promise<KnownSkill[]> => {
      const byKey = new Map<string, KnownSkill>();
      const { data: rows, error } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("org_id", orgId!);
      if (error) throw error;
      const ids = (rows ?? []).map((r) => r.user_id);
      if (ids.length) {
        // `skills` lives in the external database; Lovable regenerates types.ts without it.
        const { data: profiles, error: pError } = await supabase
          .from("profiles")
          .select("skills" as never)
          .in("id", ids);
        if (pError) throw pError;
        for (const p of (profiles ?? []) as unknown as { skills: string[] | null }[]) {
          for (const name of p.skills ?? []) {
            const key = name.toLowerCase();
            const known = byKey.get(key);
            if (known) known.count += 1;
            else byKey.set(key, { name, count: 1 });
          }
        }
      }
      for (const s of await fetchOrgSkills(orgId!)) {
        if (!byKey.has(s.name.toLowerCase()))
          byKey.set(s.name.toLowerCase(), { name: s.name, count: 0 });
      }
      return [...byKey.values()];
    },
  });
  return q.data ?? [];
}
