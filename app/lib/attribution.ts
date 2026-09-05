/**
 * Where a registration came from.
 *
 * The page records the UTM tags, ad click ids and referrer it arrived with,
 * keeps the first such visit and the most recent, and sends both with the
 * registration. Without this the database knows that someone registered but
 * not that they came from a particular campaign, and the ad spend can only be
 * judged by clicks instead of by founders who actually got a diagnosis.
 *
 * Everything here is validated server-side and stored as one JSON column:
 * unknown keys are dropped, every value is length-capped, and anything that
 * looks like an email address is refused outright. Personal data has no
 * business in a campaign tag, and refusing it here means a badly built URL
 * cannot smuggle one into the record.
 */

const CLICK_ID_KEYS = ["fbclid", "gclid", "li_fat_id", "msclkid", "ttclid"] as const;
type ClickIdKey = (typeof CLICK_ID_KEYS)[number];

export type Touch = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  clickIds?: Partial<Record<ClickIdKey, string>>;
  /** Referrer origin and path only. The query string is never kept. */
  referrer?: string;
  /** Path on this site the visitor arrived at. */
  landing?: string;
  /** When the touch happened, ISO 8601. */
  at?: string;
};

export type Attribution = {
  v: 1;
  first?: Touch;
  last?: Touch;
};

const UTM_MAX = 100;
const CLICK_ID_MAX = 200;
const URL_MAX = 300;
const AT_MAX = 40;

/** A clean string or nothing: trimmed, capped, no control characters, no email. */
function cleanString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const s = value.trim().slice(0, max);
  if (!s) return undefined;
  if (s.includes("@")) return undefined;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(s)) return undefined;
  return s;
}

function cleanPath(value: unknown, max: number): string | undefined {
  const s = cleanString(value, max);
  if (!s) return undefined;
  // Either a path on this site, or an origin + path elsewhere. Never a query.
  if (s.startsWith("/")) return s.split("?")[0];
  if (/^https?:\/\/[^\s?#]+$/i.test(s)) return s;
  return undefined;
}

function cleanTouch(value: unknown): Touch | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  const touch: Touch = {};

  const source = cleanString(v.source, UTM_MAX);
  const medium = cleanString(v.medium, UTM_MAX);
  const campaign = cleanString(v.campaign, UTM_MAX);
  const content = cleanString(v.content, UTM_MAX);
  const term = cleanString(v.term, UTM_MAX);
  if (source) touch.source = source;
  if (medium) touch.medium = medium;
  if (campaign) touch.campaign = campaign;
  if (content) touch.content = content;
  if (term) touch.term = term;

  if (v.clickIds && typeof v.clickIds === "object") {
    const ids = v.clickIds as Record<string, unknown>;
    const kept: Partial<Record<ClickIdKey, string>> = {};
    for (const key of CLICK_ID_KEYS) {
      const id = cleanString(ids[key], CLICK_ID_MAX);
      if (id) kept[key] = id;
    }
    if (Object.keys(kept).length > 0) touch.clickIds = kept;
  }

  const referrer = cleanPath(v.referrer, URL_MAX);
  const landing = cleanPath(v.landing, URL_MAX);
  if (referrer) touch.referrer = referrer;
  if (landing) touch.landing = landing;

  const at = cleanString(v.at, AT_MAX);
  if (at && !Number.isNaN(Date.parse(at))) touch.at = new Date(at).toISOString();

  // A touch with only a landing path and a timestamp says nothing about where
  // they came from; it is noise, not attribution.
  const informative = touch.source || touch.medium || touch.campaign || touch.content
    || touch.term || touch.clickIds || touch.referrer;
  return informative ? touch : undefined;
}

/**
 * Validates what the page sent. Returns null when there is nothing worth
 * keeping, so a direct visit stores NULL rather than an empty object.
 */
export function parseAttribution(value: unknown): Attribution | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const first = cleanTouch(v.first);
  const last = cleanTouch(v.last);
  if (!first && !last) return null;
  const out: Attribution = { v: 1 };
  if (first) out.first = first;
  if (last) out.last = last;
  return out;
}

function describeTouch(t: Touch | undefined): string {
  if (!t) return "";
  const parts = [t.source, t.medium, t.campaign, t.content].filter(Boolean);
  if (parts.length > 0) return parts.join(" / ");
  if (t.clickIds) return "ad click (" + Object.keys(t.clickIds).join(", ") + ")";
  if (t.referrer) {
    try { return new URL(t.referrer).host; } catch { return t.referrer; }
  }
  return "";
}

/** One line for the team's notification email: "meta / paid_social / launch". */
export function describeAttribution(a: Attribution | null | undefined): string {
  if (!a) return "direct";
  const first = describeTouch(a.first);
  const last = describeTouch(a.last);
  if (!first && !last) return "direct";
  if (!first || !last || first === last) return first || last;
  return `${first} (first) · ${last} (at registration)`;
}

/**
 * The fields worth carrying onto the platform account as user metadata, so
 * the product's own records can be joined back to the campaign. First touch,
 * which is the one that found them. Only set keys are included: an empty
 * value in metadata is a question nobody can answer later.
 */
export function metadataFrom(a: Attribution | null | undefined): Record<string, string> {
  const t = a?.first ?? a?.last;
  if (!t) return {};
  const out: Record<string, string> = {};
  if (t.source) out.utm_source = t.source;
  if (t.medium) out.utm_medium = t.medium;
  if (t.campaign) out.utm_campaign = t.campaign;
  if (t.content) out.utm_content = t.content;
  return out;
}
