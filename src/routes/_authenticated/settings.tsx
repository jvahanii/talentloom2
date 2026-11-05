import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/app-client";
import { getMyProfileId } from "@/lib/auth";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Linkedin, Briefcase, Globe } from "lucide-react";
import { OrgSettings, DeleteOrgPanel } from "@/components/OrgSettings";
import { SkillsInput } from "@/components/SkillsInput";
import { type Skill } from "@/lib/skills";
import { fetchMemberSkills } from "@/lib/skillLevels";
import { updatePersonSkills } from "@/lib/people.functions";
import { useOrg } from "@/lib/org";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Talentloom" }] }),
  component: Settings,
});

const inputCls =
  "w-full rounded-xl border border-input bg-white/70 dark:bg-white/5 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30";

function Settings() {
  const qc = useQueryClient();
  const { orgId, orgs, title, role } = useOrg();
  const canDeleteOrg = title === "Owner" || role === "owner";
  const orgName = orgs.find((o) => o.org_id === orgId)?.name ?? "";
  // Skills belong to an organisation: the current one, if you're a member of it.
  const levelOrg = orgs.find((o) => o.org_id === orgId && !o.viaSuperuser) ?? null;
  const levelOrgId = levelOrg?.org_id ?? null;

  const [email, setEmail] = useState("");
  const [form, setForm] = useState<{ full_name: string; skills: Skill[] }>({
    full_name: "",
    skills: [],
  });
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    (async () => {
      const uid = await getMyProfileId();
      if (!uid) return;
      const { data: p } = (await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", uid)
        .maybeSingle()) as unknown as {
        data: {
          full_name: string | null;
          email: string | null;
        } | null;
      };
      const skillsOf = levelOrgId ? await fetchMemberSkills(levelOrgId, [uid]) : new Map();
      setEmail(p?.email ?? "");
      if (p)
        setForm({
          full_name: p.full_name ?? "",
          skills: skillsOf.get(uid) ?? [],
        });
    })();
  }, [levelOrgId]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const uid = await getMyProfileId();
      if (!uid) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: form.full_name })
        .eq("id", uid);
      if (error) throw error;
      // Skills and levels are saved for the current organisation only.
      if (levelOrgId) {
        await updatePersonSkills({ data: { orgId: levelOrgId, userId: uid, skills: form.skills } });
      }
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const clearSamples = async () => {
    if (!confirm("Remove all sample candidates and positions?")) return;
    setClearing(true);
    try {
      const { error } = await supabase.rpc("clear_sample_data");
      if (error) throw error;
      toast.success("Sample data cleared");
      qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setClearing(false);
    }
  };

  const patch = (p: Partial<typeof form>) => setForm({ ...form, ...p });

  return (
    <div>
      <h1 className="font-display text-2xl font-bold sm:text-3xl">Settings</h1>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="glass rounded-2xl p-5 lg:col-span-2">
          <h3 className="font-display font-semibold">Profile</h3>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Email</span>
              <input value={email} disabled className={inputCls + " opacity-70"} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Full name
              </span>
              <input
                value={form.full_name}
                onChange={(e) => patch({ full_name: e.target.value })}
                className={inputCls}
              />
            </label>
            <div className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Skills{levelOrg ? ` in ${levelOrg.name}` : ""}
              </span>
              {levelOrg ? (
                <>
                  <SkillsInput value={form.skills} onChange={(skills) => patch({ skills })} />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Each organisation keeps its own skills and levels. To set them for another
                    organisation, switch to it from the menu at the top right.
                  </span>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Skills are set within an organisation. Join or create one to add yours.
                </p>
              )}
            </div>
          </div>
          <button
            onClick={saveProfile}
            disabled={saving}
            className="btn-teal mt-4 rounded-xl px-5 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save profile"}
          </button>
        </div>

        <OrgSettings />

        <div className="glass rounded-2xl p-5">
          <h3 className="font-display font-semibold">Sample data</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Remove the seeded example candidates and positions. Your own data is untouched.
          </p>
          <button
            onClick={clearSamples}
            disabled={clearing}
            className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 disabled:opacity-60"
          >
            {clearing ? "Clearing…" : "Clear sample data"}
          </button>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold">Connect your tools</h3>
            <span className="rounded-full bg-[rgb(103_232_249_/_0.2)] border border-[rgb(103_232_249_/_0.35)] px-2 py-0.5 text-xs font-medium text-[#a5f3fc]">
              Coming soon
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Live integrations aren't part of this template. Import candidates via CSV in the
            meantime.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { icon: Linkedin, name: "LinkedIn", desc: "Sync applicants automatically" },
              { icon: Briefcase, name: "Indeed", desc: "Import from your job posts" },
              { icon: Globe, name: "Greenhouse / Lever", desc: "Bring your ATS candidate flow in" },
            ].map((c) => (
              <div key={c.name} className="glass-strong rounded-xl p-4 opacity-70">
                <c.icon className="h-5 w-5 text-teal-700" />
                <div className="mt-2 font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {canDeleteOrg && orgId && <DeleteOrgPanel orgId={orgId} orgName={orgName} />}
    </div>
  );
}
