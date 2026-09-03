import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a date/timestamp as YYYY-MM-DD (UTC-agnostic for date-only strings). */
export function formatDate(value: string | Date): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date(value).toISOString().slice(0, 10);
}

/** Format a timestamp as YYYY-MM-DD HH:mm. */
export function formatDateTime(value: string | Date): string {
  return new Date(value).toISOString().slice(0, 16).replace("T", " ");
}
