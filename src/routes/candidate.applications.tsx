import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/app-client";
import { toast } from "sonner";
import { MarketingShell } from "@/components/MarketingShell";
import {
  claimMyApplications,
  myApplications,
  myDocuments,
  uploadCandidateDocument,
  renameCandidateDocument,
  deleteCandidateDocument,
  stageLabel,
  type CandidateDocument,
} from "@/lib/candidate-portal.functions";
import { ACCEPTED_FILE_TYPES, validateCandidateFile, candidateFileUrl } from "@/lib/candidate-files";
import { formatDate } from "@/lib/utils";
import { FileText, Upload, Trash2, Pencil, Download, Briefcase } from "lucide-react";

export const Route = createFileRoute("/candidate/applications")({
  head: () => ({
    meta: [
      { title: "My applications — TalentLoom" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CandidatePortalPage,
});

async function toBase64(file: File) {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { name: file.name, type: file.type || "", data: btoa(binary) };
}

function CandidatePortalPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sessionChecked, setSessionChecked] = useState(false);

  const claimFn = useServerFn(claimMyApplications);
  const appsFn = useServerFn(myApplications);
  const docsFn = useServerFn(myDocuments);

  useEffect(() => {
    hasClerkSession().then((ok) => {
      if (!ok) {
        navigate({ to: "/candidate/auth", replace: true });
      } else {
        setSessionChecked(true);
        claimFn({}).then((r) => {
          if (r.claimed > 0) queryClient.invalidateQueries({ queryKey: ["my-applications"] });
        }).catch(() => {});
      }
    });
  }, [navigate, claimFn, queryClient]);

  const apps = useQuery({
    queryKey: ["my-applications"],
    queryFn: () => appsFn(),
    enabled: sessionChecked,
  });
  const docs = useQuery({
    queryKey: ["my-documents"],
    queryFn: () => docsFn(),
    enabled: sessionChecked,
  });

  if (!sessionChecked) {
    return (
      <MarketingShell>
        <div className="mx-auto max-w-3xl px-4 py-16 text-sm text-muted-foreground">Loading…</div>
      </MarketingShell>
    );
  }

  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">My applications</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              See what’s happening with every application and keep your best documents ready to go.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/apply" className="btn-teal rounded-xl px-4 py-2 text-sm font-medium">
              Find my next role
            </Link>
            <button
              onClick={async () => {
                await queryClient.cancelQueries();
                queryClient.clear();
                await clerkSignOut();
                navigate({ to: "/candidate/auth", replace: true });
              }}
              className="rounded-xl glass px-4 py-2 text-sm font-medium hover:bg-white/80"
            >
              Sign out
            </button>
          </div>
        </div>

        <section className="mt-8">
          {apps.isLoading && <div className="glass h-32 animate-pulse rounded-2xl" />}
          {apps.data && apps.data.length === 0 && (
            <div className="glass rounded-2xl p-10 text-center">
              <Briefcase className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                No applications yet. <Link to="/apply" className="text-teal-700 hover:underline">Explore open roles</Link> and make your next move.
              </p>
            </div>
          )}
          <div className="space-y-3">
            {apps.data?.map((a) => (
              <article key={a.id} className="glass rounded-2xl p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-semibold">{a.positionTitle}</h2>
                    <p className="text-sm text-muted-foreground">
                      {a.orgName} · applied {formatDate(a.created_at)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[a.cvName && `CV: ${a.cvName}`, a.coverLetterName && `Cover letter: ${a.coverLetterName}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium">
                    {stageLabel(a.stage)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <DocumentsSection docs={docs.data ?? []} loading={docs.isLoading} />
      </div>
    </MarketingShell>
  );
}

function DocumentsSection({ docs, loading }: { docs: CandidateDocument[]; loading: boolean }) {
  const queryClient = useQueryClient();
  const uploadFn = useServerFn(uploadCandidateDocument);
  const renameFn = useServerFn(renameCandidateDocument);
  const deleteFn = useServerFn(deleteCandidateDocument);

  const [kind, setKind] = useState<"cv" | "cover_letter">("cv");
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const autoLabelRef = useRef("");

  const pickFile = (picked: File | null) => {
    setFile(picked);
    if (!picked) return;
    const auto = picked.name.replace(/\.[^.]+$/, "").slice(0, 120);
    setLabel((current) => (current.trim() === "" || current === autoLabelRef.current ? auto : current));
    autoLabelRef.current = auto;
  };

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error("Choose a file first.");
      return;
    }
    const err = validateCandidateFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      const encoded = await toBase64(file);
      await uploadFn({
        data: {
          kind,
          label: label.trim() || file.name.replace(/\.[^.]+$/, ""),
          ...encoded,
        },
      });
      toast.success("Document saved");
      setFile(null);
      setLabel("");
      queryClient.invalidateQueries({ queryKey: ["my-documents"] });
    } catch (err2) {
      toast.error(err2 instanceof Error ? err2.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const open = async (path: string) => {
    try {
      window.open(await candidateFileUrl(path), "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Could not open the file");
    }
  };

  const inputCls = "w-full rounded-xl border border-input bg-white/70 px-3 py-2 text-sm";

  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-bold">My documents</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Keep different CVs and cover letters ready, then choose the right one without hunting through old files.
      </p>

      <form onSubmit={upload} className="glass mt-4 grid gap-3 rounded-2xl p-5 sm:grid-cols-4">
        <select value={kind} onChange={(e) => setKind(e.target.value as "cv" | "cover_letter")} className={inputCls}>
          <option value="cv">CV</option>
          <option value="cover_letter">Cover letter</option>
        </select>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={120}
          placeholder="Label, e.g. CV — Product roles"
          className={inputCls}
        />
        <label className="glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-white/80">
          <Upload className="h-4 w-4 shrink-0" />
          <span className="truncate">{file ? file.name : "Choose file"}</span>
          <input
            type="file"
            accept={ACCEPTED_FILE_TYPES}
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button disabled={busy} className="btn-teal rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60">
          {busy ? "Saving…" : "Save for later"}
        </button>
      </form>

      {loading && <div className="glass mt-4 h-24 animate-pulse rounded-2xl" />}
      {!loading && docs.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">No saved documents yet.</p>
      )}
      <div className="mt-4 space-y-2">
        {docs.map((d) => (
          <div key={d.id} className="glass flex items-center gap-3 rounded-xl px-4 py-3">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            {renaming === d.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === "Enter") {
                    await renameFn({ data: { id: d.id, label: renameValue.trim() || d.label } });
                    setRenaming(null);
                    queryClient.invalidateQueries({ queryKey: ["my-documents"] });
                  }
                  if (e.key === "Escape") setRenaming(null);
                }}
                className="flex-1 rounded-lg border border-input bg-white/70 px-2 py-1 text-sm"
              />
            ) : (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{d.label}</p>
                <p className="text-xs text-muted-foreground">
                  {d.kind === "cv" ? "CV" : "Cover letter"} · {d.path.split("/").pop()}
                </p>
              </div>
            )}
            <button
              title="Download"
              onClick={() => open(d.path)}
              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              title="Rename"
              onClick={() => {
                setRenaming(d.id);
                setRenameValue(d.label);
              }}
              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              title="Delete"
              onClick={async () => {
                if (!window.confirm(`Delete "${d.label}"?`)) return;
                await deleteFn({ data: { id: d.id } });
                queryClient.invalidateQueries({ queryKey: ["my-documents"] });
              }}
              className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
