import { useQuery } from "@tanstack/react-query";
import { useOrg } from "@/lib/org";
import { fetchSkillSpace } from "@/lib/skillLevels";
import { DEFAULT_SKILL_LEVEL_NAMES, skillLevelNames } from "@/lib/skills";

export const skillLevelNamesKey = (orgId: string | null) => ["org-skill-level-names", orgId];

/**
 * The current organisation's skill level names, lowest first (the defaults
 * without an organisation). Connected organisations share one set.
 */
export function useSkillLevelNames(): string[] {
  const { orgId } = useOrg();
  const q = useQuery({
    queryKey: skillLevelNamesKey(orgId),
    enabled: !!orgId,
    queryFn: async () => skillLevelNames((await fetchSkillSpace(orgId!, true)).levelNames),
  });
  return q.data ?? DEFAULT_SKILL_LEVEL_NAMES;
}
