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
 * UAT-8 #137 and UAT-11 #81 / #89 / #95 root cause (expanded 2026-04-22).
 *
 * NOTE: Patterns are tried repeatedly in a loop in cleanMerchant(), so a chain
 * like "APOS PURCHASE TIM HORTONS" strips both "APOS " then "PURCHASE " on
 * successive iterations and lands on "TIM HORTONS". Add new patterns here,
 * not in the loop, to keep cleanMerchant idempotent.
 */
const POS_PREFIX_PATTERNS: RegExp[] = [
  // Canadian POS family — "APOS", "OPOS", "FPOS", "Pos", plus common
  // a*pos / a-pos / a_pos typographic variants from some bank feeds.
  /^[aofnt]?[\s*_.\-]?pos\s+/i,
  // POS-with-hyphen form: "POS-DEBIT", "POS - PURCHASE"
  /^pos\s*[-–—]\s*(?:debit|purchase)?\s*/i,
  /^pos\s+(?:debit|purchase|withdrawal)\s+/i,
  // Generic point-of-sale / purchase / pre-auth prefixes.
  /^point of sale\s+/i,
  /^purchase\s*[-–—:]?\s*/i,
  /^debit\s+(?:purchase|memo|card)\s+/i,
  /^credit\s+memo\s+/i,
  /^pre[-\s]?auth(?:orization|orisation)?\s+/i,
  /^idp\s+purchase\s*[-–—:]?\s*/i, // "IDP PURCHASE -"
  /^chq[#\s-]*\d*\s*/i, // "CHQ# 1234 " cheque-image tail
  // Interac / e-transfer / bank-memo noise carried through from Canadian feeds.
  /^interac\s+(?:e[-\s]?transfer|purchase|debit)\s+/i,
  /^e[-\s]?transfer\s+/i,
  /^mb[-\s]?transfer\s+/i,
  /^mb[-\s]?credit\s+/i,
  /^mb[-\s]?(?:deposit|debit)\s+/i,
  /^misc(?:ellaneous)?\s+(?:payment|debit|credit)\s+/i,
  /^miscellaneous\s+payment\s*[-–—]?\s*/i,
  // "CUSTOMER TRANSFER" / "CUSTOMER AUTO DEP" style bank memos.
  /^customer\s+(?:transfer|auto\s+(?:dep|deposit|dbt)|withdrawal)\s+/i,
  // Legacy catch-alls retained for compatibility.
  /^debit\s+purchase\s+/i,
];

/** Trailing noise — transaction reference numbers appended to the name. */
const TRAILING_NOISE_PATTERNS: RegExp[] = [
  /\s+#\d{4,}\s*$/,
  /\s+\*+\d{2,}\s*$/,
  /\s+\d{10,}\s*$/, // bare 10+ digit reference tail
  /\s+-\s*\d{4,}\s*$/, // trailing "- 123456" reference
  /\s+ref[:\s#]*\w+\s*$/i, // "REF: ABCD1234"
  /\s+auth\s*#?\s*\w+\s*$/i, // "AUTH 12345"
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
 *  rolls up differently than primary. UAT-11 #88 / #96: Plaid sometimes
 *  emits a detailed that's much more specific than the primary (e.g.
 *  GENERAL_MERCHANDISE primary / GENERAL_MERCHANDISE_ELECTRONICS detailed
 *  on a grocery receipt). The detailed codes we DON'T want collapsing into
 *  "Shopping" live here, plus several RENT_AND_UTILITIES sub-codes that the
 *  primary map already handles but are listed for clarity. */
const PFC_DETAILED_OVERRIDES: Array<{ prefix: string; cat: CanonicalCategory }> = [
  { prefix: "FOOD_AND_DRINK_GROCERIES", cat: "Groceries" },
  { prefix: "FOOD_AND_DRINK_RESTAURANT", cat: "Restaurant & Bars" },
  { prefix: "FOOD_AND_DRINK_COFFEE", cat: "Restaurant & Bars" },
  { prefix: "FOOD_AND_DRINK_FAST_FOOD", cat: "Restaurant & Bars" },
  { prefix: "TRANSPORTATION_GAS", cat: "Gas" },
  { prefix: "TRANSPORTATION_PUBLIC_TRANSIT", cat: "Auto & Transport" },
  { prefix: "TRANSPORTATION_PARKING", cat: "Auto & Transport" },
  { prefix: "TRANSPORTATION_TAXIS_AND_RIDE_SHARES", cat: "Auto & Transport" },
  { prefix: "GENERAL_SERVICES_INSURANCE", cat: "Insurance" },
  { prefix: "GENERAL_SERVICES_EDUCATION", cat: "Education" },
  { prefix: "GENERAL_SERVICES_AUTOMOTIVE", cat: "Auto & Transport" },
  { prefix: "GENERAL_MERCHANDISE_PET_SUPPLIES", cat: "Pets" },
  { prefix: "GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES", cat: "Gifts & Donations" },
  { prefix: "GENERAL_MERCHANDISE_OFFICE_SUPPLIES", cat: "Business Services" },
  { prefix: "HOME_IMPROVEMENT_FURNITURE", cat: "Home" },
  { prefix: "HOME_IMPROVEMENT_HARDWARE", cat: "Home" },
  { prefix: "RENT_AND_UTILITIES_TELEPHONE", cat: "Bills & Utilities" },
  { prefix: "RENT_AND_UTILITIES_INTERNET_AND_CABLE", cat: "Bills & Utilities" },
  { prefix: "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY", cat: "Bills & Utilities" },
  { prefix: "RENT_AND_UTILITIES_WATER", cat: "Bills & Utilities" },
];

/**
 * Merchant-keyword → canonical overrides. Runs AFTER detailed-PFC (which is
 * high-signal) but BEFORE primary-PFC, so a known mis-file like Telus (Plaid
 * sometimes classifies it under a generic utilities primary, sometimes under
 * GENERAL_MERCHANDISE_ELECTRONICS) lands on the right canonical. Keep this
 * list focused on merchants users have flagged in UAT — it's NOT a substitute
 * for a user-owned merchant-rules table. UAT-11 #88.
 */
const MERCHANT_OVERRIDES: Array<{ pattern: RegExp; cat: CanonicalCategory }> = [
  // Telcos / ISPs — consistently mis-filed by Plaid's Canadian feed.
  { pattern: /\btelus\b/i, cat: "Bills & Utilities" },
  { pattern: /\b(bell|rogers)\b/i, cat: "Bills & Utilities" },
  { pattern: /\bshaw\b/i, cat: "Bills & Utilities" },
  { pattern: /\bfido\b/i, cat: "Bills & Utilities" },
  { pattern: /\bkoodo\b/i, cat: "Bills & Utilities" },
  // Auto services that default to "Other".
  { pattern: /\bcaa\b/i, cat: "Auto & Transport" },
  { pattern: /\baaa\b/i, cat: "Auto & Transport" },
  // Canadian grocery chains routinely tagged GENERAL_MERCHANDISE.
  { pattern: /\b(loblaws?|sobeys|metro|freshco|no ?frills|superstore|real canadian superstore|pc express|save[- ]on[- ]foods)\b/i, cat: "Groceries" },
  { pattern: /\bcostco\b/i, cat: "Groceries" },
  // Common misc.
  { pattern: /\bcra\b|canada revenue/i, cat: "Taxes" },
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
 *   2. Merchant-keyword override   → confidence 0.95 (beats primary, not detailed)
 *   3. Plaid PFC primary map       → confidence 1.0
 *   4. MX topLevelCategory         → confidence 0.9
 *   5. MX category leaf match      → confidence 0.8
 *   6. Legacy keyword scan         → confidence 0.5
 *   7. "Uncategorized"             → confidence 0.0
 *
 * `signals.merchant` (optional) enables the merchant-keyword pass — callers
 * that have already cleaned the merchant name should pass it through so
 * known mis-files (Telus, CAA, Loblaws) land on the right canonical.
 */
export function remapToCanonicalCategory(
  raw: string | null | undefined,
  signals: Record<string, string | null | undefined> = {}
): { category: string; confidence: number } {
  const pfcDetailed = (signals.pfcDetailed || "").toUpperCase();
  const pfcPrimary = (signals.pfcPrimary || "").toUpperCase();
  const mxTop = signals.mxTopLevel || "";
  const mxLeaf = signals.mxCategory || "";
  const merchant = signals.merchant || "";

  if (pfcDetailed) {
    for (const { prefix, cat } of PFC_DETAILED_OVERRIDES) {
      if (pfcDetailed.startsWith(prefix)) {
        return { category: cat, confidence: 1.0 };
      }
    }
  }

  // Merchant-keyword override — fires only when we have a clean merchant
  // name. Outranks PFC primary because UAT proved Plaid's primaries are
  // often wrong on Canadian merchants (Telus as GENERAL_MERCHANDISE, etc.).
  if (merchant) {
    for (const { pattern, cat } of MERCHANT_OVERRIDES) {
      if (pattern.test(merchant)) {
        return { category: cat, confidence: 0.95 };
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

  const text = `${raw ?? ""} ${mxLeaf} ${merchant}`.trim();
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
