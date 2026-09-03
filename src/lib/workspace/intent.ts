import { STAGES, type Stage } from "@/lib/constants";

export type ModuleKind =
  | "candidate"
  | "requisition"
  | "graph"
  | "analytics"
  | "help"
  | "text";

export type ModuleSpec =
  | { kind: "candidate"; query?: string; targetStage?: Stage }
  | { kind: "requisition"; query?: string }
  | { kind: "graph" }
  | { kind: "analytics"; view: "funnel" | "sources" | "time-in-stage" }
  | { kind: "help" }
  | { kind: "text"; body: string };

export type Turn = {
  id: string;
  utterance: string;
  spec: ModuleSpec;
  reply?: string;
  createdAt: number;
};

export const SLASH_COMMANDS = [
  { cmd: "/candidate", hint: "<name> — inspect and move a candidate" },
  { cmd: "/req", hint: "[title] — create or edit a position" },
  { cmd: "/pipeline", hint: "interactive graph of stages" },
  { cmd: "/funnel", hint: "candidate flow chart" },
  { cmd: "/sources", hint: "candidates by source" },
  { cmd: "/time-in-stage", hint: "average days per stage" },
  { cmd: "/help", hint: "list available commands" },
] as const;

function findStage(text: string): Stage | undefined {
  const lower = text.toLowerCase();
  return STAGES.find((s) => lower.includes(s));
}

export function parseSlashCommand(input: string): ModuleSpec | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const [rawCmd, ...rest] = trimmed.split(/\s+/);
  const cmd = rawCmd.toLowerCase();
  const arg = rest.join(" ").trim();
  switch (cmd) {
    case "/candidate":
      return { kind: "candidate", query: arg || undefined };
    case "/req":
    case "/requisition":
      return { kind: "requisition", query: arg || undefined };
    case "/pipeline":
    case "/graph":
      return { kind: "graph" };
    case "/funnel":
      return { kind: "analytics", view: "funnel" };
    case "/sources":
      return { kind: "analytics", view: "sources" };
    case "/time-in-stage":
    case "/time":
      return { kind: "analytics", view: "time-in-stage" };
    case "/help":
    case "/?":
      return { kind: "help" };
    default:
      return null;
  }
}

// Lightweight keyword pre-parse for free-text — catches obvious intents
// without paying for an LLM call.
export function parseFreeText(input: string): ModuleSpec | null {
  const t = input.trim();
  if (!t) return null;
  const lower = t.toLowerCase();

  if (/(^|\b)(funnel|pipeline|kanban|board|graph|stages)(\b|$)/.test(lower)) {
    return { kind: "graph" };
  }
  if (/(funnel|conversion)/.test(lower)) {
    return { kind: "analytics", view: "funnel" };
  }
  if (/(sources?|where.*com(e|ing) from)/.test(lower)) {
    return { kind: "analytics", view: "sources" };
  }
  if (/(time.*stage|how long|days? in)/.test(lower)) {
    return { kind: "analytics", view: "time-in-stage" };
  }
  if (/(new|create|open).*(role|req|requisition|position)/.test(lower)) {
    return { kind: "requisition" };
  }

  // "move <name> to <stage>" / "reject <name>"
  const move = lower.match(/^(?:move|advance|push|send)\s+(.+?)\s+to\s+(\w+)/);
  if (move) {
    const stage = findStage(move[2]);
    return { kind: "candidate", query: move[1], targetStage: stage };
  }
  const reject = lower.match(/^reject(?:ed)?\s+(.+)/);
  if (reject) return { kind: "candidate", query: reject[1], targetStage: "rejected" };
  const hire = lower.match(/^hire\s+(.+)/);
  if (hire) return { kind: "candidate", query: hire[1], targetStage: "hired" };

  const show = lower.match(/^(?:show|find|open|who is|about)\s+(.+)/);
  if (show) return { kind: "candidate", query: show[1] };

  return null;
}
