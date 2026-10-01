import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, ClipboardList, MessagesSquare } from "lucide-react";
import { toast } from "sonner";
import { listPulseSurveys, createPulseSurvey } from "@/lib/pulse.functions";
import { useOrg } from "@/lib/org";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/pulse/")({
  head: () => ({
    meta: [
      { title: "Pulse surveys — Talentloom" },
      { name: "description", content: "Create surveys and structured interviews and compare every round with the last." },
      { property: "og:title", content: "Pulse surveys — Talentloom" },
      { property: "og:description", content: "Create surveys and structured interviews and compare every round with the last." },
    ],
  }),
  component: PulseList,
});

const STATUS: Record<string, string> = { draft: "Draft", open: "Open", closed: "Closed" };

function PulseList() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ["pulse-list"], queryFn: () => listPulseSurveys() });
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pulse</h1>
          <p className="text-sm text-muted-foreground">Surveys and structured interviews, compared round by round.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> New survey</Button>
      </div>
      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : !data?.length ? (
        <div className="rounded-2xl border-2 border-dashed border-border p-10 text-center">
          <p className="mb-3 font-medium">No surveys yet</p>
          <Button onClick={() => setOpen(true)}>Create your first survey</Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.map((s) => (
            <Link
              key={s.id}
              to="/pulse/$id"
              params={{ id: s.id }}
              className="rounded-2xl border-2 border-border bg-card p-4 shadow-[0_3px_0_var(--brand-mint)] transition hover:-translate-y-0.5"
            >
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                {s.kind === "interview" ? <MessagesSquare className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}
                {s.kind === "interview" ? "Interview" : "Survey"} · {s.visibility === "org" ? "Organisation" : "Just me"}
                <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 font-medium">{STATUS[s.status]}</span>
              </div>
              <p className="font-semibold">{s.title}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {s.roundCount} round{s.roundCount === 1 ? "" : "s"} · {s.latestResponses} answers in latest · updated {formatDate(s.updated_at)}
              </p>
            </Link>
          ))}
        </div>
      )}
      <CreateDialog open={open} onOpenChange={setOpen} onCreated={() => refetch()} />
    </div>
  );
}

function CreateDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const { orgs, orgId } = useOrg();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"survey" | "interview">("survey");
  const [visibility, setVisibility] = useState<"private" | "org">("private");
  const [org, setOrg] = useState<string | null>(null);
  const [mode, setMode] = useState<"link" | "invite" | "both">("both");
  const [busy, setBusy] = useState(false);
  const chosenOrg = org ?? orgId ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const { id } = await createPulseSurvey({
                data: { title, description, kind, visibility, orgId: visibility === "org" ? chosenOrg : null, responseMode: mode },
              });
              onCreated();
              onOpenChange(false);
              navigate({ to: "/pulse/$id", params: { id } });
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not create survey");
            } finally {
              setBusy(false);
            }
          }}
        >
          <DialogHeader><DialogTitle>New survey</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="pt" required>Title</Label>
            <Input id="pt" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pd">Description</Label>
            <Textarea id="pd" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="survey">Survey (people answer themselves)</SelectItem>
                  <SelectItem value="interview">Structured interview (you fill in)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Who owns it</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as typeof visibility)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Just me</SelectItem>
                  <SelectItem value="org" disabled={!orgs.length}>My organisation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {visibility === "org" && (
              <div className="space-y-2">
                <Label>Organisation</Label>
                <Select value={chosenOrg ?? undefined} onValueChange={setOrg}>
                  <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                  <SelectContent>
                    {orgs.map((o) => <SelectItem key={o.org_id} value={o.org_id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {kind === "survey" && (
              <div className="space-y-2">
                <Label>How people answer</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="link">Anyone with the link</SelectItem>
                    <SelectItem value="invite">Invited people only</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !title.trim()}>{busy ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
