import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type OrgRole = "owner" | "admin" | "member" | "viewer";

export interface OrgMembership {
  org_id: string;
  role: OrgRole;
  name: string;
}

const STORAGE_KEY = "talently:current-org";

type MemberRow = {
  org_id: string;
  role: OrgRole;
  organizations: { name: string } | null;
};

async function fetchMemberships(): Promise<OrgMembership[]> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return [];
  const { data, error } = await supabase
    .from("organization_members")
    .select("org_id, role, organizations(name)")
    .eq("user_id", u.user.id);
  if (error) throw error;
  return ((data ?? []) as unknown as MemberRow[]).map((m) => ({
    org_id: m.org_id,
    role: m.role,
    name: m.organizations?.name ?? "Workspace",
  }));
}

/** Returns the user's first org id, creating a personal org when none exists. */
export async function ensureOrg(userId: string, name?: string): Promise<string> {
  const { data: m } = await supabase
    .from("organization_members")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (m?.org_id) return m.org_id;
  const { data, error } = await supabase.rpc("create_organization", {
    _name: name?.trim() || "My workspace",
  });
  if (error) throw error;
  return data as string;
}

interface OrgContextValue {
  orgs: OrgMembership[];
  orgId: string | null;
  role: OrgRole | null;
  loading: boolean;
  setOrgId: (id: string) => void;
  refresh: () => void;
}

const OrgContext = createContext<OrgContextValue>({
  orgs: [],
  orgId: null,
  role: null,
  loading: true,
  setOrgId: () => {},
  refresh: () => {},
});

export function OrgProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["org-memberships"], queryFn: fetchMemberships });
  const [selected, setSelected] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const orgs = q.data ?? [];
  const current = orgs.find((o) => o.org_id === selected) ?? orgs[0] ?? null;

  const setOrgId = (id: string) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
    setSelected(id);
    qc.invalidateQueries();
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["org-memberships"] });
  };

  return (
    <OrgContext.Provider
      value={{
        orgs,
        orgId: current?.org_id ?? null,
        role: current?.role ?? null,
        loading: q.isLoading,
        setOrgId,
        refresh,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
