export const STAGES = ["applied", "screen", "interview", "offer", "hired", "rejected"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = {
  applied: "Applied",
  screen: "Screen",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};
export const REQ_STATUS_LABEL: Record<string, string> = {
  open: "Open",
  on_hold: "On hold",
  filled: "Filled",
  closed: "Closed",
};
export const SOURCES = ["Referral", "LinkedIn", "Job board", "Agency", "Website", "Other"] as const;
