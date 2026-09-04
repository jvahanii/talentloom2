import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { clerkSignOut } from "@/lib/clerk";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, MoreHorizontal, FileText, Upload, Download, Settings as SettingsIcon, Book } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await clerkSignOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6">
        <div className="glass mx-auto flex max-w-6xl items-center justify-between rounded-2xl px-4 py-2.5">
          <Link to="/workspace" className="flex items-center gap-2 min-w-0">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground font-bold shadow-lg">T</div>
            <div className="min-w-0">
              <div className="font-display text-sm font-bold tracking-tight text-foreground truncate">Talentloom</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">organisation</div>
            </div>
          </Link>

          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary"
                  aria-label="More"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuItem asChild><Link to="/requisitions"><FileText className="mr-2 h-4 w-4" />Positions</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/import"><Upload className="mr-2 h-4 w-4" />Import CSV</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/export"><Download className="mr-2 h-4 w-4" />Export CSV</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/settings"><SettingsIcon className="mr-2 h-4 w-4" />Settings</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link to="/docs"><Book className="mr-2 h-4 w-4" />Docs</Link></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              onClick={signOut}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary"
            >
              <LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 flex flex-col min-h-0">{children}</main>
    </div>
  );
}
