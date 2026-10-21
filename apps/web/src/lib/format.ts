const dateTime = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

const rtf = new Intl.RelativeTimeFormat("en-IN", { numeric: "auto" });

export function formatRelative(iso: string, now: number = Date.now()): string {
  const diffSec = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 7 * 86_400) return rtf.format(Math.round(diffSec / 86_400), "day");
  return formatDateTime(iso);
}

/** Lead number as shown to people, e.g. LD-000012. */
export function leadNumber(displayId: number): string {
  return `LD-${String(displayId).padStart(6, "0")}`;
}

const STATUS_WORDS: Record<string, string> = {
  PENDING: "Candidate",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  NOT_CONTACTED: "Not contacted",
  CONTACTED: "Contacted",
  VERIFIED: "Verified",
  UNVERIFIED: "Not verified",
  DO_NOT_CONTACT: "Do not contact",
  CONTACTABLE: "Contactable",
  DELETED: "Deleted",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

/** Human wording for status codes stored in audit rows (unknown codes pass through). */
export function statusWord(code: string): string {
  return STATUS_WORDS[code] ?? code;
}
