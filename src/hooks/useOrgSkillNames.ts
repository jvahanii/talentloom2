import { useQuery } from "@tanstack/react-query";
import { useOrg } from "@/lib/org";
import { fetchOrgSkills } from "@/lib/orgSkills";
import { fetchMemberSkills } from "@/lib/skillLevels";
import type { KnownSkill } from "@/lib/skills";

export const orgSkillNamesKey = (orgId: string | null) => ["org-skill-names", orgId];

/**
 * Every skill in the current organisation with how many have it: the skills
 * its people have there, plus its own list (where nobody may have one yet).
 */
export function useOrgSkillNames(): KnownSkill[] {
  const { orgId } = useOrg();
  const q = useQuery({
    queryKey: orgSkillNamesKey(orgId),
    enabled: !!orgId,
    staleTime: 30_000,
    queryFn: async (): Promise<KnownSkill[]> => {
      const byKey = new Map<string, KnownSkill>();
      for (const list of (await fetchMemberSkills(orgId!)).values()) {
        for (const { name } of list) {
          const key = name.toLowerCase();
          const known = byKey.get(key);
          if (known) known.count += 1;
          else byKey.set(key, { name, count: 1 });
        }
      }
      for (const s of await fetchOrgSkills(orgId!)) {
        const key = s.name.toLowerCase();
        if (!byKey.has(key)) byKey.set(key, { name: s.name, count: 0 });
      }
      return [...byKey.values()];
    },
  });
  return q.data ?? [];
}
