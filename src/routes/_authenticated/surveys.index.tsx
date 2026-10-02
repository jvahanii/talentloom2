import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, ClipboardList, MessagesSquare, Inbox } from "lucide-react";
import { toast } from "sonner";
import { listPulseSurveys, createPulseSurvey, listPulseAwaiting } from "@/lib/pulse.functions";
import { useOrg } from "@/lib/org";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/surveys/")({
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
  const { data: awaiting } = useQuery({ queryKey: ["pulse-awaiting"], queryFn: () => listPulseAwaiting() });
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
      {!!awaiting?.length && (
        <div className="space-y-3 rounded-2xl border-2 border-border bg-card p-4 shadow-[0_3px_0_var(--brand-butter)]">
          <div className="flex items-center gap-2 font-semibold">
            <Inbox className="h-4 w-4" /> Waiting for your answer
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {awaiting.map((a) => (
              <Link
                key={a.token}
                to="/p/$token"
                params={{ token: a.token }}
                className="rounded-2xl border-2 border-border bg-secondary/40 p-3 transition hover:-translate-y-0.5"
              >
                <p className="font-semibold">{a.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Round {a.roundNumber}
                  {a.closesOn ? ` · closes ${formatDate(a.closesOn)}` : ""} · tap to answer
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
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
              to="/surveys/$id"
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
  const [shareWithOrg, setShareWithOrg] = useState(false);
  const [busy, setBusy] = useState(false);
  const chosenOrg = org ?? orgId ?? null;
  // Sharing with the whole org always needs org-visibility and a response mode
  // that accepts personal invite links; derive the effective values instead of
  // mutating the raw selections, so turning the switch off restores them.
  const effectiveVisibility = shareWithOrg ? "org" : visibility;
  const effectiveMode = shareWithOrg && mode === "link" ? "both" : mode;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const { id, invited } = await createPulseSurvey({
                data: {
                  title,
                  description,
                  kind,
                  visibility: effectiveVisibility,
                  orgId: effectiveVisibility === "org" ? chosenOrg : null,
                  responseMode: effectiveMode,
                  inviteOrg: shareWithOrg,
                },
              });
              if (shareWithOrg && invited) {
                toast.success(`Invite link sent to ${invited} ${invited === 1 ? "person" : "people"} in your organisation`);
              }
              onCreated();
              onOpenChange(false);
              navigate({ to: "/surveys/$id", params: { id } });
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
              <Select
                value={effectiveVisibility}
                disabled={shareWithOrg}
                onValueChange={(v) => setVisibility(v as typeof visibility)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Just me</SelectItem>
                  <SelectItem value="org" disabled={!orgs.length}>My organisation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {effectiveVisibility === "org" && (
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
                <Select
                  value={effectiveMode}
                  disabled={shareWithOrg && mode === "link"}
                  onValueChange={(v) => setMode(v as typeof mode)}
                >
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
          <div className="flex items-center justify-end gap-3 rounded-xl border-2 border-border bg-secondary/30 p-3">
            <div className="mr-auto">
              <Label htmlFor="pulse-share-org">Share with my organisation</Label>
              <p className="text-xs text-muted-foreground">
                {orgs.length
                  ? "Sends an invite link to everyone in your organisation as soon as you create it."
                  : "Join or create an organisation to share surveys with its members."}
              </p>
            </div>
            <Switch
              id="pulse-share-org"
              checked={shareWithOrg}
              disabled={!orgs.length}
              onCheckedChange={setShareWithOrg}
            />
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
