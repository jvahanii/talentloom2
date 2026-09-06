import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { LayoutGroup } from "framer-motion";
import { Viewport, type ChatTurn } from "@/components/workspace/Viewport";
import { AgentPrompt } from "@/components/workspace/AgentPrompt";
import { askAgent } from "@/lib/workspace/agent.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useOrg } from "@/lib/org";

export const Route = createFileRoute("/_authenticated/workspace")({
  head: () => ({ meta: [{ title: "Ask — Talentloom" }] }),
  component: Workspace,
});

function makeId() {
  return "t_" + Math.random().toString(36).slice(2, 10);
}

function Workspace() {
  const { orgId, can } = useOrg();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const ask = useServerFn(askAgent);

  const handleSubmit = useCallback(
    async (raw: string) => {
      const utterance = raw.trim();
      if (!utterance || busy || !orgId) return;

      const turnId = makeId();
      setTurns((prev) => [
        ...prev,
        { id: turnId, utterance, reply: "", pending: true, createdAt: Date.now() },
      ]);
      setBusy(true);

      // Build history from prior turns (exclude the one we just added)
      const history = turns.flatMap((t) => [
        { role: "user" as const, content: t.utterance },
        ...(t.reply ? [{ role: "assistant" as const, content: t.reply }] : []),
      ]);

      try {
        const out = await ask({ data: { utterance, history, org_id: orgId } });
        setTurns((prev) =>
          prev.map((t) => (t.id === turnId ? { ...t, reply: out.reply, pending: false } : t)),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong";
        toast.error(msg);
        setTurns((prev) =>
          prev.map((t) => (t.id === turnId ? { ...t, reply: msg, pending: false } : t)),
        );
      } finally {
        setBusy(false);
      }
    },
    [ask, busy, turns, orgId],
  );

  if (!can("use_ai")) {
    return (
      <div className="glass mx-auto mt-10 max-w-md rounded-2xl p-6 text-center">
        <h1 className="font-display text-lg font-semibold">Not available for your title</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your organisation title doesn't allow you to use the AI copilot. Ask an administrator to
          update it.
        </p>
      </div>
    );
  }

  return (
    <LayoutGroup>
      <Viewport turns={turns} />
      <AgentPrompt onSubmit={handleSubmit} busy={busy} />
    </LayoutGroup>
  );
}
