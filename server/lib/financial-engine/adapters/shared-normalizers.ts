/**
 * Shared normalizers — merchant cleaning, category remapping, status mapping.
 *
 * These functions are provider-AGNOSTIC: they take a raw string and produce a
 * canonical one. Each adapter invokes them inside its `normalizeMerchant`,
 * `remapCategory`, and `normalizeItemStatus` methods, layering provider-
 * specific pre-processing on top.
 *
 * The goal of centralising them here is to end the UAT-8 class of bugs where
 * different code paths each re-invented their own merchant/category cleanup
 * and disagreed on the result. Now there's ONE definition; adapters extend it.
 */

import type { ProviderItemStatus } from "../normalized-types";

// ─── Merchant cleaning ────────────────────────────────────────────────────

/**
 * POS/PIN-debit prefixes observed in the wild from Plaid's raw merchant
 * strings on Canadian/European accounts. These never belong in the displayed
 * merchant name — they're carried through from the bank feed verbatim.
 * UAT-8 #137 root cause.
 */
const POS_PREFIX_PATTERNS: RegExp[] = [
  /^a?pos\s+/i, // "Apos", "Pos"
  /^opos\s+/i, // "Opos"
  /^fpos\s+/i, // "Fpos"
  /^idp\s+purchase\s*-?\s*/i, // "IDP PURCHASE -"
  /^point of sale\s+/i,
  /^purchase\s*-?\s*/i,
  /^debit\s+purchase\s+/i,
  /^pre-auth\s+/i,
  /^pos debit\s+/i,
];

/** Trailing noise — transaction reference numbers appended to the name. */
const TRAILING_NOISE_PATTERNS: RegExp[] = [
  /\s+#\d{4,}\s*$/,
  /\s+\*+\d{2,}\s*$/,
  /\s+\d{10,}\s*$/, // bare 10+ digit reference tail
];

/**
 * Canonical brand overrides — raw merchant patterns → clean brand name.
 * Keep this set small; the goal isn't a full merchant database, just to
 * collapse the most common forms that confuse categorization downstream.
 */
const BRAND_OVERRIDES: Array<{ pattern: RegExp; brand: string }> = [
  { pattern: /amzn mktp|amazon\.\w{2,3}\/?(?:bill|mkplc)?|amazon\s+marketplace/i, brand: "Amazon" },
  { pattern: /primevideo|prime video|amazon prime/i, brand: "Amazon Prime" },
  { pattern: /netflix/i, brand: "Netflix" },
  { pattern: /spotify/i, brand: "Spotify" },
  { pattern: /apple\.com\/bill|apple itunes|iTunes/i, brand: "Apple" },
  { pattern: /google\s*\*|google \w+ play|google cloud/i, brand: "Google" },
  { pattern: /uber\s*(?:eats|trip|canada)?/i, brand: "Uber" },
  { pattern: /bell canada|bell mobility|bell mts/i, brand: "Bell" },
  { pattern: /rogers wireless|rogers communications|rogers cable/i, brand: "Rogers" },
  { pattern: /telus mobility|telus communications/i, brand: "Telus" },
];

/**
 * Clean a raw merchant string. Idempotent — running it twice gives the same
 * result as once.
 */
export function cleanMerchant(raw: string | null | undefined): string {
  if (!raw) return "Unknown";
  let s = String(raw).trim();

  // Repeatedly strip leading POS/PIN prefixes (some feeds stack them).
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of POS_PREFIX_PATTERNS) {
      if (p.test(s)) {
        s = s.replace(p, "").trim();
        changed = true;
      }
    }
  }

  // Strip trailing reference-number noise.
  for (const p of TRAILING_NOISE_PATTERNS) {
    s = s.replace(p, "").trim();
  }

  // Collapse duplicate internal whitespace.
  s = s.replace(/\s{2,}/g, " ");

  // Brand overrides.
  for (const { pattern, brand } of BRAND_OVERRIDES) {
    if (pattern.test(s)) return brand;
  }

  // Title-case common all-caps vendor strings for readability, but only if
  // the string is a single word or 2-3 short tokens (avoid mangling real
  // mixed-case merchant names).
  if (/^[A-Z0-9&\s.'-]{2,}$/.test(s) && s.length <= 32) {
    s = s
      .toLowerCase()
      .split(/\s+/)
      .map((w) => (w.length > 1 ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase()))
      .join(" ");
  }

  return s || "Unknown";
}

// ─── Category remap ───────────────────────────────────────────────────────

/**
 * Monarch-aligned canonical category names. The engine, UI, and budgets all
 * agree on these strings — never a raw PFC/MX enum. See project_monarch_alignment
 * for the locked-in list.
 */
export const CANONICAL_CATEGORIES = [
  "Auto & Transport",
  "Bills & Utilities",
  "Business Services",
  "Education",
  "Entertainment",
  "Fees & Charges",
  "Food & Dining",
  "Gas",
  "Gifts & Donations",
  "Groceries",
  "Healthcare",
  "Home",
  "Income",
  "Insurance",
  "Investments",
  "Kids",
  "Personal Care",
  "Pets",
  "Restaurant & Bars",
  "Shopping",
  "Subscriptions",
  "Taxes",
  "Transfer",
  "Travel",
  "Uncategorized",
] as const;
export type CanonicalCategory = (typeof CANONICAL_CATEGORIES)[number];

/** Plaid PFC primary → canonical. High-confidence mapping. */
const PFC_PRIMARY_MAP: Record<string, CanonicalCategory> = {
  INCOME: "Income",
  TRANSFER_IN: "Transfer",
  TRANSFER_OUT: "Transfer",
  LOAN_PAYMENTS: "Transfer",
  BANK_FEES: "Fees & Charges",
  ENTERTAINMENT: "Entertainment",
  FOOD_AND_DRINK: "Restaurant & Bars",
  GENERAL_MERCHANDISE: "Shopping",
  HOME_IMPROVEMENT: "Home",
  MEDICAL: "Healthcare",
  PERSONAL_CARE: "Personal Care",
  GENERAL_SERVICES: "Business Services",
  GOVERNMENT_AND_NON_PROFIT: "Gifts & Donations",
  TRANSPORTATION: "Auto & Transport",
  TRAVEL: "Travel",
  RENT_AND_UTILITIES: "Bills & Utilities",
};

/** Plaid PFC detailed → canonical overrides for the cases where detailed
 *  rolls up differently than primary. */
const PFC_DETAILED_OVERRIDES: Array<{ prefix: string; cat: CanonicalCategory }> = [
  { prefix: "FOOD_AND_DRINK_GROCERIES", cat: "Groceries" },
  { prefix: "TRANSPORTATION_GAS", cat: "Gas" },
  { prefix: "GENERAL_SERVICES_INSURANCE", cat: "Insurance" },
  { prefix: "GENERAL_SERVICES_EDUCATION", cat: "Education" },
  { prefix: "GENERAL_MERCHANDISE_PET_SUPPLIES", cat: "Pets" },
  { prefix: "GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES", cat: "Gifts & Donations" },
  { prefix: "HOME_IMPROVEMENT_FURNITURE", cat: "Home" },
];

/** MX topLevelCategory → canonical. */
const MX_TOP_LEVEL_MAP: Record<string, CanonicalCategory> = {
  "Food & Dining": "Restaurant & Bars",
  Groceries: "Groceries",
  "Auto & Transport": "Auto & Transport",
  Gas: "Gas",
  Entertainment: "Entertainment",
  Shopping: "Shopping",
  "Bills & Utilities": "Bills & Utilities",
  Healthcare: "Healthcare",
  "Personal Care": "Personal Care",
  Home: "Home",
  Travel: "Travel",
  Education: "Education",
  Kids: "Kids",
  Pets: "Pets",
  "Business Services": "Business Services",
  "Gifts & Donations": "Gifts & Donations",
  Insurance: "Insurance",
  Taxes: "Taxes",
  "Fees & Charges": "Fees & Charges",
  Investments: "Investments",
  Income: "Income",
  Transfer: "Transfer",
};

/** Legacy / manual keyword → canonical. Lowest-confidence fallback. */
const LEGACY_KEYWORD_MAP: Array<{ pattern: RegExp; cat: CanonicalCategory }> = [
  { pattern: /grocer/i, cat: "Groceries" },
  { pattern: /restaurant|cafe|coffee|bar/i, cat: "Restaurant & Bars" },
  { pattern: /\bgas\b|fuel/i, cat: "Gas" },
  { pattern: /uber|lyft|taxi|transit|transport/i, cat: "Auto & Transport" },
  { pattern: /rent|utility|utilities|electric|water|hydro/i, cat: "Bills & Utilities" },
  { pattern: /phone|internet|cable|wireless/i, cat: "Bills & Utilities" },
  { pattern: /insurance/i, cat: "Insurance" },
  { pattern: /netflix|spotify|subscription|prime video|disney/i, cat: "Subscriptions" },
  { pattern: /health|medical|pharmacy|doctor|dentist/i, cat: "Healthcare" },
  { pattern: /home depot|lowes|furniture|renovation/i, cat: "Home" },
  { pattern: /travel|flight|hotel|airbnb/i, cat: "Travel" },
  { pattern: /gift|donation|charity/i, cat: "Gifts & Donations" },
  { pattern: /tax/i, cat: "Taxes" },
  { pattern: /transfer|payment/i, cat: "Transfer" },
  { pattern: /fee|overdraft|charge/i, cat: "Fees & Charges" },
];

/**
 * Remap a raw provider category to a canonical category, with confidence.
 *
 * Priority chain:
 *   1. Plaid PFC detailed override → confidence 1.0
 *   2. Plaid PFC primary map       → confidence 1.0
 *   3. MX topLevelCategory         → confidence 0.9
 *   4. MX category leaf match      → confidence 0.8
 *   5. Legacy keyword scan         → confidence 0.5
 *   6. "Uncategorized"             → confidence 0.0
 */
export function remapToCanonicalCategory(
  raw: string | null | undefined,
  signals: Record<string, string | null | undefined> = {}
): { category: string; confidence: number } {
  const pfcDetailed = (signals.pfcDetailed || "").toUpperCase();
  const pfcPrimary = (signals.pfcPrimary || "").toUpperCase();
  const mxTop = signals.mxTopLevel || "";
  const mxLeaf = signals.mxCategory || "";

  if (pfcDetailed) {
    for (const { prefix, cat } of PFC_DETAILED_OVERRIDES) {
      if (pfcDetailed.startsWith(prefix)) {
        return { category: cat, confidence: 1.0 };
      }
    }
  }

  if (pfcPrimary && PFC_PRIMARY_MAP[pfcPrimary]) {
    return { category: PFC_PRIMARY_MAP[pfcPrimary], confidence: 1.0 };
  }

  if (mxTop && MX_TOP_LEVEL_MAP[mxTop]) {
    return { category: MX_TOP_LEVEL_MAP[mxTop], confidence: 0.9 };
  }

  if (mxLeaf) {
    // Leaf-level MX category: try the top-level map first (many leaves share
    // names), then fall through to keyword match.
    if (MX_TOP_LEVEL_MAP[mxLeaf]) {
      return { category: MX_TOP_LEVEL_MAP[mxLeaf], confidence: 0.8 };
    }
  }

  const text = `${raw ?? ""} ${mxLeaf}`.trim();
  if (text) {
    for (const { pattern, cat } of LEGACY_KEYWORD_MAP) {
      if (pattern.test(text)) {
        return { category: cat, confidence: 0.5 };
      }
    }
  }

  return { category: "Uncategorized", confidence: 0.0 };
}

// ─── Item-status mapping ──────────────────────────────────────────────────

/**
 * Map a raw provider status string to the canonical ProviderItemStatus enum.
 * The UI keys off this enum alone, so every adapter must funnel its vendor-
 * specific strings through this function (or extend it) — never surface a
 * vendor enum directly.
 */
export function mapItemStatus(raw: string | null | undefined): ProviderItemStatus {
  const s = (raw || "").toString().toLowerCase().trim();

  if (!s || s === "ok" || s === "good" || s === "healthy" || s === "active" || s === "connected") {
    return "healthy";
  }

  if (
    s.includes("login") ||
    s.includes("reauth") ||
    s.includes("credentials") ||
    s.includes("user_action") ||
    s.includes("pending_expiration") ||
    s === "expired"
  ) {
    return "reauth_required";
  }

  if (s.includes("disconnect") || s === "removed" || s === "deleted") {
    return "disconnected";
  }

  // Fallback — anything else (rate-limited, provider_error, unknown) is
  // surfaced as a generic error so the UI can prompt the user.
  return "error";
}
