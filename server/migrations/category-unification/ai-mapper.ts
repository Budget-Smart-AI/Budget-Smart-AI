/**
 * AI fallback mapper for the ARCHITECTURE.md §6.2 canonical-categories rollout.
 *
 * Given a legacy category string that `DETERMINISTIC_MAP` / `PLAID_CATEGORY_MAP`
 * could not resolve, ask Bedrock Haiku 3.5 to choose one of the 57 canonical
 * slugs. Returns `{ canonicalId, confidence, reasoning }` or throws if the
 * model hallucinates a slug that isn't in the canonical set.
 *
 * Design notes:
 *   - Model: `auto_categorization` feature key → HAIKU_45 (see bedrock.ts).
 *     Haiku 3.5 is ~$0.0008/1k input and ~$0.004/1k output — well under
 *     $0.0001 per row for the ~500-char prompts we send.
 *   - Rate limit: 10 calls/sec (`RATE_LIMIT_PER_SECOND`). Bedrock's default
 *     Haiku 3.5 account quota is 50 RPS; we stay well below that so a
 *     concurrent AI endpoint (receipt scanner, coach) doesn't starve.
 *   - Output gate: the model's answer is validated against `CANONICAL_SLUGS`
 *     below. If the LLM returns `housing_insurance` (not in the set) we treat
 *     it as a parse failure, NOT a valid mapping, and the backfill writes
 *     `uncategorized` + `needs_review = TRUE`.
 *   - Confidence: the model self-reports 0-1. The backfill script flags any
 *     row < 0.80 for the review queue (§6.2.5 spec).
 *   - Retry: 2 retries on transient Bedrock errors. Beyond that the caller
 *     logs the failure and moves on — one missing row does NOT halt the
 *     backfill.
 */

import { bedrockChat } from "../../lib/bedrock";

// ─── Canonical slug registry ─────────────────────────────────────────────────
// Must match `scripts/seed-canonical-categories.ts`. Kept in sync by the
// seed-script invariant (73 rows = 16 parents + 57 canonicals). If a slug
// gets added in the seed, add it here too — the AI mapper rejects anything
// not in this list, so new slugs are invisible to the AI until listed.

export const CANONICAL_SLUGS: readonly string[] = [
  // Housing (4)
  "housing_mortgage", "housing_rent", "housing_hoa", "housing_maintenance",
  // Utilities (6)
  "utilities_electricity", "utilities_gas_heating", "utilities_water",
  "utilities_internet", "utilities_phone_mobile", "utilities_cable_tv",
  // Transportation (6)
  "transport_auto_payment", "transport_fuel", "transport_public_transit",
  "transport_rideshare", "transport_tolls_parking", "transport_auto_maintenance",
  // Insurance (4)
  "insurance_auto", "insurance_home", "insurance_health", "insurance_life",
  // Food (3)
  "food_groceries", "food_restaurants", "food_coffee",
  // Health & Wellness (3)
  "health_medical", "health_pharmacy", "health_personal_care",
  // Financial (5)
  "finance_credit_card_payment", "finance_debt_payment", "finance_bank_fees",
  "finance_interest_charges", "finance_investments",
  // Taxes (4)
  "taxes_income", "taxes_property", "taxes_sales", "taxes_professional",
  // Lifestyle (5)
  "lifestyle_shopping", "lifestyle_entertainment", "lifestyle_subscriptions",
  "lifestyle_pets", "lifestyle_gifts",
  // Charity & Donations (1)
  "charity_donations",
  // Family (3)
  "family_childcare", "family_education", "family_kids_activities",
  // Business & Professional (3)
  "business_services", "business_office_supplies", "business_professional_fees",
  // Travel (1)
  "travel",
  // Income (5)
  "income_salary", "income_freelance", "income_investment", "income_rental", "income_other",
  // Transfers & Reversals (3)
  "transfer_internal", "transfer_atm", "transfer_refund",
  // Meta (1)
  "uncategorized",
] as const;

const CANONICAL_SET = new Set<string>(CANONICAL_SLUGS);

// ─── Prompt ──────────────────────────────────────────────────────────────────
// English-only. If we ever localize, the canonical slugs stay English — only
// the `displayName` column gets translated.

const SYSTEM_PROMPT = `You are a financial transaction classifier for Budget Smart AI.

Given a transaction (legacy category string, merchant name, amount, and row kind), return the single best canonical category slug from this set:

housing_mortgage, housing_rent, housing_hoa, housing_maintenance,
utilities_electricity, utilities_gas_heating, utilities_water, utilities_internet, utilities_phone_mobile, utilities_cable_tv,
transport_auto_payment, transport_fuel, transport_public_transit, transport_rideshare, transport_tolls_parking, transport_auto_maintenance,
insurance_auto, insurance_home, insurance_health, insurance_life,
food_groceries, food_restaurants, food_coffee,
health_medical, health_pharmacy, health_personal_care,
finance_credit_card_payment, finance_debt_payment, finance_bank_fees, finance_interest_charges, finance_investments,
taxes_income, taxes_property, taxes_sales, taxes_professional,
lifestyle_shopping, lifestyle_entertainment, lifestyle_subscriptions, lifestyle_pets, lifestyle_gifts,
charity_donations,
family_childcare, family_education, family_kids_activities,
business_services, business_office_supplies, business_professional_fees,
travel,
income_salary, income_freelance, income_investment, income_rental, income_other,
transfer_internal, transfer_atm, transfer_refund,
uncategorized

Rules:
- "expense" rows must map to a non-income slug. "bill" rows must map to a recurring/obligation slug. "income" rows must map to an income_* or transfer_refund slug.
- "Insurance" without a merchant hint → insurance_auto (most common in this dataset).
- Phone-carrier merchants (Telus, Rogers, Bell, Verizon, AT&T, T-Mobile) → utilities_phone_mobile EVEN IF the legacy category says "Electrical".
- Interest credits between own accounts (e.g. "Banking Package Interest", "Interest Payment") → transfer_internal, NOT income.
- Tax refunds → transfer_refund.
- Credit card payments → finance_credit_card_payment.
- ATM deposits/withdrawals → transfer_atm.
- When truly ambiguous, pick "uncategorized" with confidence 0.30 and explain why.

Respond with ONLY valid JSON, no prose, no markdown fence:
{"canonicalId":"<slug>","confidence":<0.0-1.0>,"reasoning":"<≤120 chars>"}`;

// ─── Rate limiter ────────────────────────────────────────────────────────────
// Simple token-bucket replacement: record timestamps of the last N calls and
// sleep just long enough to stay under RATE_LIMIT_PER_SECOND. Shared across
// concurrent callers in the same Node process.

const RATE_LIMIT_PER_SECOND = 10;
const recentCallTimestamps: number[] = [];

async function waitForRateSlot(): Promise<void> {
  const now = Date.now();
  // Drop timestamps older than 1000ms from the head.
  while (recentCallTimestamps.length > 0 && now - recentCallTimestamps[0] > 1000) {
    recentCallTimestamps.shift();
  }
  if (recentCallTimestamps.length >= RATE_LIMIT_PER_SECOND) {
    const oldest = recentCallTimestamps[0];
    const waitMs = 1000 - (now - oldest) + 5; // +5ms cushion
    await new Promise((r) => setTimeout(r, waitMs));
    return waitForRateSlot(); // re-check after sleeping
  }
  recentCallTimestamps.push(Date.now());
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface AiMapperInput {
  legacyCategory: string | null;
  merchantName?: string | null;
  amount?: number | null;
  rowKind: "expense" | "bill" | "income" | "plaid" | "mx" | "manual";
}

export interface AiMapperResult {
  canonicalId: string;
  confidence: number;    // 0.0 - 1.0
  reasoning: string;     // ≤120 chars
}

/**
 * Ask Bedrock Haiku to map a single transaction to a canonical slug.
 *
 * Throws only on (a) network failure after 2 retries or (b) malformed output
 * that doesn't contain a valid canonical slug. Callers in the backfill
 * script catch and downgrade to `{ canonicalId: "uncategorized", confidence: 0, reasoning: "ai-failed:<err>" }`.
 */
export async function classifyWithAi(input: AiMapperInput): Promise<AiMapperResult> {
  const userPrompt = buildUserPrompt(input);

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    await waitForRateSlot();
    try {
      const raw = await bedrockChat({
        feature: "auto_categorization",
        messages: [{ role: "user", content: userPrompt }],
        system: SYSTEM_PROMPT,
        maxTokens: 150,
        temperature: 0.0, // deterministic
      });

      return parseAndValidate(raw, input);
    } catch (err) {
      lastError = err;
      // Exponential backoff: 250ms, 1000ms.
      await new Promise((r) => setTimeout(r, 250 * Math.pow(4, attempt)));
    }
  }

  throw new Error(
    `AI mapper failed after 3 attempts for legacy="${input.legacyCategory}" merchant="${input.merchantName ?? ""}": ${String(lastError)}`,
  );
}

// ─── Internals ───────────────────────────────────────────────────────────────

function buildUserPrompt(input: AiMapperInput): string {
  const parts: string[] = [];
  parts.push(`rowKind: ${input.rowKind}`);
  parts.push(`legacyCategory: ${JSON.stringify(input.legacyCategory ?? "")}`);
  if (input.merchantName) parts.push(`merchantName: ${JSON.stringify(input.merchantName)}`);
  if (input.amount !== null && input.amount !== undefined) {
    parts.push(`amount: ${input.amount}`);
  }
  parts.push(`\nReturn JSON only.`);
  return parts.join("\n");
}

function parseAndValidate(raw: string, input: AiMapperInput): AiMapperResult {
  // The model is asked for bare JSON, but defensive extraction handles:
  //   - stray whitespace
  //   - accidental ```json fences
  //   - a leading/trailing sentence
  const jsonText = extractJsonBlock(raw);
  if (!jsonText) {
    throw new Error(`AI mapper: no JSON in response. raw=${truncate(raw, 200)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`AI mapper: invalid JSON. raw=${truncate(raw, 200)}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`AI mapper: non-object JSON. raw=${truncate(raw, 200)}`);
  }

  const obj = parsed as Record<string, unknown>;
  const canonicalId = typeof obj.canonicalId === "string" ? obj.canonicalId.trim() : "";
  const confidence = typeof obj.confidence === "number" ? obj.confidence : Number(obj.confidence);
  const reasoning = typeof obj.reasoning === "string" ? obj.reasoning : "";

  if (!CANONICAL_SET.has(canonicalId)) {
    throw new Error(
      `AI mapper: returned unknown slug "${canonicalId}" for legacy="${input.legacyCategory}". Hallucination guard tripped.`,
    );
  }

  const safeConfidence = Number.isFinite(confidence)
    ? Math.max(0, Math.min(1, confidence))
    : 0;

  return {
    canonicalId,
    confidence: safeConfidence,
    reasoning: truncate(reasoning || "(no reasoning)", 120),
  };
}

function extractJsonBlock(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return trimmed;
  // Handle ```json ... ``` fence.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  // Fallback: first { ... last }.
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return null;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
