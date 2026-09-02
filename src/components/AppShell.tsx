import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppThemeProvider, useAppTheme } from "@/hooks/useAppTheme";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  KanbanSquare,
  Briefcase,
  BarChart3,
  Upload,
  Download,
  Settings,
  MessageSquare,
  Users,
  LogOut,
} from "lucide-react";

const NAV = [
  { to: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { to: "/candidates", label: "Candidates", icon: Users },
  { to: "/requisitions", label: "Requisitions", icon: Briefcase },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/import", label: "Import", icon: Upload },
  { to: "/export", label: "Export", icon: Download },
  { to: "/workspace", label: "Ask", icon: MessageSquare },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function RightSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <Sidebar side="left" collapsible="icon">
      <SidebarHeader className="border-b border-border">
        <Link to="/pipeline" className={collapsed ? "flex items-center justify-center py-1.5" : "flex items-center gap-2 px-2 py-1.5"}>
          <div className={`grid shrink-0 place-items-center rounded-xl bg-white text-[#1B1B1B] font-bold border border-border ${collapsed ? "h-7 w-7 text-sm" : "h-8 w-8"}`}>
            T
          </div>
          {!collapsed && (
            <span className="font-display text-lg font-bold tracking-tight text-foreground">
              Talently
            </span>
          )}
        </Link>
      </SidebarHeader>


      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={isActive(item.to)} tooltip={item.label}>
                    <Link to={item.to} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} tooltip="Sign out">
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Sign out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function ShellInner({ children }: { children: ReactNode }) {
  const { theme } = useAppTheme();
  return (
    <div className={(theme === "dark" ? "dark " : "") + "min-h-screen"}>
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background text-foreground">
          <RightSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <header className="sticky top-0 z-30 flex h-[61px] items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur">
              <SidebarTrigger className="text-foreground" />
              <span className="font-display text-sm font-semibold tracking-tight text-muted-foreground">
                Talently
              </span>
            </header>
            <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
              {children}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AppThemeProvider>
      <ShellInner>{children}</ShellInner>
    </AppThemeProvider>
  );
}

