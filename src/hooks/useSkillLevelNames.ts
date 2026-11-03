import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/app-client";
import { useOrg } from "@/lib/org";
import { DEFAULT_SKILL_LEVEL_NAMES, skillLevelNames } from "@/lib/skills";

export const skillLevelNamesKey = (orgId: string | null) => ["org-skill-level-names", orgId];

/** The current organisation's names for skill levels 1–4 (the defaults without an organisation). */
export function useSkillLevelNames(): string[] {
  const { orgId } = useOrg();
  const q = useQuery({
    queryKey: skillLevelNamesKey(orgId),
    enabled: !!orgId,
    queryFn: async () => {
      // The column lives in the external database; Lovable regenerates types.ts without it.
      const { data, error } = await supabase
        .from("organizations")
        .select("skill_level_names" as never)
        .eq("id", orgId!)
        .maybeSingle();
      if (error) throw error;
      return skillLevelNames((data as { skill_level_names?: unknown } | null)?.skill_level_names);
    },
  });
  return q.data ?? DEFAULT_SKILL_LEVEL_NAMES;
}
