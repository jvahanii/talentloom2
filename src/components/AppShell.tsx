import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { KanbanSquare, Users, Briefcase, Settings, BarChart3, Download, Upload, LogOut, Building2, Plus } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { OrgProvider, useOrg } from "@/lib/org";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NAV = [
  { to: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { to: "/candidates", label: "Candidates", icon: Users },
  { to: "/requisitions", label: "Positions", icon: Briefcase },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/import", label: "Import", icon: Upload },
  { to: "/export", label: "Export", icon: Download },
  { to: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = pathname === item.to || pathname.startsWith(item.to + "/");
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
              active
                ? "bg-primary/15 font-medium text-primary"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function NavUser({ user, fullName }: { user: User | null; fullName?: string | null }) {
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <div className="mt-auto flex items-center gap-2 border-t border-border px-2 pt-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{fullName || user.user_metadata?.full_name || user.email || "Account"}</p>
        <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
      </div>
      <button
        onClick={async () => {
          await supabase.auth.signOut();
          navigate({ to: "/auth" });
        }}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
        title="Sign out"
        aria-label="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

function OrgSwitcher() {
  const { orgs, orgId, setOrgId, refresh } = useOrg();
  const [creating, setCreating] = useState(false);

  if (creating) return null;

  const handleChange = async (value: string) => {
    if (value === "__new__") {
      const name = window.prompt("Name your new workspace");
      if (!name?.trim()) return;
      setCreating(true);
      try {
        const { data: newId, error } = await supabase.rpc("create_organization", { _name: name.trim() });
        if (error) throw error;
        refresh();
        setOrgId(newId as string);
        toast.success(`Workspace "${name.trim()}" created`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to create workspace");
      } finally {
        setCreating(false);
      }
      return;
    }
    setOrgId(value);
  };

  if (!orgId) return null;

  return (
    <Select value={orgId} onValueChange={handleChange}>
      <SelectTrigger className="h-8 w-auto max-w-44 gap-1.5 border-border/70 bg-secondary/60 text-xs font-medium">
        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <SelectValue placeholder="Workspace" />
      </SelectTrigger>
      <SelectContent>
        {orgs.map((o) => (
          <SelectItem key={o.org_id} value={o.org_id}>
            {o.name}
          </SelectItem>
        ))}
        <SelectItem value="__new__">
          <span className="inline-flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New workspace
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

function ShellInner({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-border bg-card p-4 md:flex">
        <Link to="/pipeline" className="mb-6 flex items-center gap-2 px-2">
          <KanbanSquare className="h-5 w-5 text-primary" />
          <span className="text-lg font-bold tracking-tight">Talently</span>
        </Link>
        <NavLinks />
        <NavUser user={user} fullName={profile?.full_name} />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-56 flex-col border-r border-border bg-card p-4">
            <Link to="/pipeline" className="mb-6 flex items-center gap-2 px-2" onClick={() => setMobileOpen(false)}>
              <KanbanSquare className="h-5 w-5 text-primary" />
              <span className="text-lg font-bold tracking-tight">Talently</span>
            </Link>
            <NavLinks onNavigate={() => setMobileOpen(false)} />
            <NavUser user={user} fullName={profile?.full_name} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col md:ml-56">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-border/70 bg-background/90 px-3 backdrop-blur md:px-4">
          <button
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <KanbanSquare className="h-5 w-5 text-primary" />
          </button>
          <div className="ml-auto flex items-center gap-2">
            <OrgSwitcher />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <OrgProvider>
      <ShellInner>{children}</ShellInner>
    </OrgProvider>
  );
}
