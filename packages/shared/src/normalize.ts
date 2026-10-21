/**
 * Normalisation used for duplicate detection.
 *
 * These functions turn the many ways people write the same contact detail into
 * one comparable value. They never invent data: if a value can't be normalised
 * confidently, they return null and that detail simply isn't used for matching.
 *
 * Known limitations (also in docs/PHASE-2.md):
 * - Domains are compared by full host name (minus "www."), not by registrable
 *   domain, so "shop.abc.com" and "abc.com" are different.
 * - Link-in-bio, social and map hosts are ignored as identifiers because many
 *   unrelated businesses share them.
 * - Indian phone numbers only: landlines need their STD code to be recognised.
 * - Business names are compared exactly after normalisation; there is no fuzzy matching.
 */

/** Hosts shared by unrelated businesses; never used as a duplicate identifier. */
export const SHARED_WEB_HOSTS = [
  "instagram.com",
  "facebook.com",
  "fb.com",
  "m.facebook.com",
  "linktr.ee",
  "linkin.bio",
  "beacons.ai",
  "bio.link",
  "wa.me",
  "api.whatsapp.com",
  "whatsapp.com",
  "google.com",
  "maps.google.com",
  "goo.gl",
  "maps.app.goo.gl",
  "g.page",
  "sites.google.com",
  "business.site",
  "youtube.com",
  "youtu.be",
  "bit.ly",
  "justdial.com",
  "indiamart.com",
  "zomato.com",
  "swiggy.com",
];

/** Lower-case key for configuration labels ("Cafés & Restaurants" → "cafes and restaurants"). */
export function labelKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const NAME_NOISE = new Set(["the", "pvt", "private", "ltd", "limited", "llp", "co", "company", "inc", "opc"]);

/** Comparable business-name key: case, accents, punctuation and legal suffixes removed. */
export function businessNameKey(name: string): string {
  return labelKey(name)
    .split(" ")
    .filter((w) => w && !NAME_NOISE.has(w))
    .join(" ");
}

/** Host name for a website, without scheme, "www.", port or path. Null if not a usable URL. */
export function normalizeWebsiteHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  if (!host.includes(".") || !/^[a-z0-9.-]+$/.test(host)) return null;
  return host;
}

/** The host if it can identify one business; null for shared hosts like instagram.com or linktr.ee. */
export function websiteIdentifier(raw: string | null | undefined): string | null {
  const host = normalizeWebsiteHost(raw);
  if (!host) return null;
  const shared = SHARED_WEB_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  return shared ? null : host;
}

/**
 * Indian phone number in +91XXXXXXXXXX form. Accepts spaces, dashes, brackets,
 * a leading 0 or +91/0091. Mobile numbers (10 digits starting 6–9) and landlines
 * written with their STD code (10 digits total) are accepted. Other countries'
 * numbers written with "+" are kept as +<digits>.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/[a-z]/i.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+") && !trimmed.startsWith("+91")) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.startsWith("0091")) digits = digits.slice(4);
  else if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length !== 10 || digits.startsWith("0") || digits.startsWith("1")) return null;
  return `+91${digits}`;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

/** Instagram username from "@handle", "handle" or an instagram.com profile URL. */
export function normalizeInstagramHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = raw.trim();
  if (!v) return null;
  const urlMatch = v.match(/^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/([^/?#\s]+)/i);
  if (urlMatch) v = urlMatch[1]!;
  else if (/[/:]/.test(v)) return null;
  v = v.replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(v) || /^\.|\.$|\.\./.test(v)) return null;
  if (["p", "reel", "reels", "explore", "stories", "accounts"].includes(v)) return null;
  return v;
}

export const IDENTIFIER_TYPES = ["WEBSITE_DOMAIN", "PHONE", "EMAIL", "INSTAGRAM"] as const;
export type IdentifierType = (typeof IDENTIFIER_TYPES)[number];

export const IDENTIFIER_LABELS: Record<IdentifierType, string> = {
  WEBSITE_DOMAIN: "Website",
  PHONE: "Phone",
  EMAIL: "Email",
  INSTAGRAM: "Instagram",
};

export interface LeadIdentifierValue {
  type: IdentifierType;
  value: string;
}

/** All usable identifiers for a lead's contact details. */
export function leadIdentifiers(input: {
  website?: string | null;
  publicPhone?: string | null;
  publicEmail?: string | null;
  instagramHandle?: string | null;
}): LeadIdentifierValue[] {
  const out: LeadIdentifierValue[] = [];
  const domain = websiteIdentifier(input.website);
  if (domain) out.push({ type: "WEBSITE_DOMAIN", value: domain });
  const phone = normalizePhone(input.publicPhone);
  if (phone) out.push({ type: "PHONE", value: phone });
  const email = normalizeEmail(input.publicEmail);
  if (email) out.push({ type: "EMAIL", value: email });
  const ig = normalizeInstagramHandle(input.instagramHandle);
  if (ig) out.push({ type: "INSTAGRAM", value: ig });
  return out;
}
