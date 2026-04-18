/**
 * Partnero Customer Referral module.
 *
 * This is SEPARATE from server/partnero.ts, which handles the Affiliate
 * program (program id 3WUVSPIW — public partners, commission-only).
 *
 * The Customer Referral program (program id 12078, slug resolved at boot)
 * is the in-app user-to-user referral program:
 *   • Referee: 30% off annual plan, year 1 only (Stripe coupon duration=once)
 *   • Referrer: $30 cash via PayPal after 30-day hold period
 *   • Only annual plan qualifies
 *
 * Partnero owns the hard parts:
 *   - Dynamic Stripe coupon creation per referral (via native Stripe integration)
 *   - PayPal payout processing (via native PayPal integration)
 *   - Hold/review period gating
 *   - Fraud detection (self-referral, disposable email, card-chargeback reversal)
 *
 * We are a THIN PROXY: on signup we enroll the new user as a "customer"
 * (i.e. a potential referrer) in the program, and we surface their
 * personal referral link + dashboard stats back to the app.
 *
 * Env vars (all optional — module no-ops if missing):
 *   PARTNERO_API_KEY                 Bearer token (shared with affiliate module)
 *   PARTNERO_REFERRAL_PROGRAM_ID     Customer-referral program id (default: 12078)
 *   PARTNERO_API_BASE                Override base URL (default: https://app.partnero.com)
 *   PARTNERO_REFERRAL_ENABLED        Set to 'true' to enable (default: off)
 */

const PARTNERO_API_BASE =
  process.env.PARTNERO_API_BASE || "https://app.partnero.com";
const PARTNERO_REFERRAL_PROGRAM_ID =
  process.env.PARTNERO_REFERRAL_PROGRAM_ID || "12078";

function isEnabled(): boolean {
  return (
    process.env.PARTNERO_REFERRAL_ENABLED === "true" &&
    typeof process.env.PARTNERO_API_KEY === "string" &&
    process.env.PARTNERO_API_KEY.length > 0
  );
}

export function partneroReferralEnabled(): boolean {
  return isEnabled();
}

/**
 * Payload shape for Partnero's customer enrollment endpoint.
 * `key` must be stable across the customer's lifetime — we use email
 * so it matches the frontend `po('customer','signup',{email})` call.
 */
export interface PartneroCustomerEnrollInput {
  key: string;
  email: string;
  name?: string | null;
  /** Optional code of the referrer (if this signup came from a referral link). */
  referrer_code?: string;
}

export interface PartneroCustomerEnrollResult {
  ok: boolean;
  /** Partnero's internal partner id for this customer — store on user row. */
  partnerId?: string;
  /** The referral code Partnero assigned to this customer (for their link). */
  referralCode?: string;
  /** Personal referral URL (what we show in the modal). */
  referralUrl?: string;
  /** Raw Partnero response for debugging. */
  raw?: unknown;
  error?: string;
}

/**
 * Enroll a new Budget Smart user as a "customer" in the referral program.
 * Call this from the signup flow AFTER the user row is created and before
 * redirecting to the dashboard — so the gold-heart modal has something to show.
 *
 * Safe to call if the user already exists in Partnero (409 is treated as
 * success and we re-fetch their partner record).
 */
export async function enrollCustomerInReferralProgram(
  input: PartneroCustomerEnrollInput,
): Promise<PartneroCustomerEnrollResult> {
  if (!isEnabled()) {
    return { ok: false, error: "partnero_referral_disabled" };
  }

  const url = `${PARTNERO_API_BASE}/api/v1/programs/${PARTNERO_REFERRAL_PROGRAM_ID}/partners`;

  try {
    const body: Record<string, unknown> = {
      key: input.key,
      email: input.email,
    };
    if (input.name) body.name = input.name;
    if (input.referrer_code) body.referrer_code = input.referrer_code;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PARTNERO_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    // 409 = already enrolled. Fetch the existing partner record.
    if (res.status === 409) {
      return await getReferralCustomer(input.key);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        `[PartneroReferral] enroll failed: HTTP ${res.status} body=${text.slice(0, 300)}`,
      );
      return { ok: false, error: `enroll_http_${res.status}` };
    }

    const json = (await res.json().catch(() => null)) as any;
    return {
      ok: true,
      partnerId: json?.data?.id ?? json?.data?.key,
      referralCode: json?.data?.referral?.code ?? json?.data?.code,
      referralUrl: json?.data?.referral?.url ?? json?.data?.referral_url,
      raw: json,
    };
  } catch (err: any) {
    console.warn(
      "[PartneroReferral] enroll error:",
      err?.message || err,
    );
    return { ok: false, error: String(err?.message || err) };
  }
}

/**
 * Fetch a customer's referral record from Partnero — their personal link,
 * stats, and pending payout balance. Drives the /api/referrals/me endpoint.
 */
export async function getReferralCustomer(
  customerKey: string,
): Promise<PartneroCustomerEnrollResult> {
  if (!isEnabled()) {
    return { ok: false, error: "partnero_referral_disabled" };
  }

  const url = `${PARTNERO_API_BASE}/api/v1/programs/${PARTNERO_REFERRAL_PROGRAM_ID}/partners/${encodeURIComponent(
    customerKey,
  )}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.PARTNERO_API_KEY}`,
        Accept: "application/json",
      },
    });

    if (res.status === 404) {
      return { ok: false, error: "not_enrolled" };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        `[PartneroReferral] get failed: HTTP ${res.status} body=${text.slice(0, 300)}`,
      );
      return { ok: false, error: `get_http_${res.status}` };
    }

    const json = (await res.json().catch(() => null)) as any;
    return {
      ok: true,
      partnerId: json?.data?.id ?? json?.data?.key,
      referralCode: json?.data?.referral?.code ?? json?.data?.code,
      referralUrl: json?.data?.referral?.url ?? json?.data?.referral_url,
      raw: json,
    };
  } catch (err: any) {
    console.warn(
      "[PartneroReferral] get error:",
      err?.message || err,
    );
    return { ok: false, error: String(err?.message || err) };
  }
}

/**
 * Fetch the list of referrals a customer has made — used to render the
 * "Your Referrals" list inside the /referrals page.
 * Returns whatever Partnero's /partners/{key}/referrals endpoint returns.
 */
export async function listReferralsForCustomer(
  customerKey: string,
): Promise<{ ok: boolean; referrals?: unknown[]; error?: string }> {
  if (!isEnabled()) {
    return { ok: false, error: "partnero_referral_disabled" };
  }

  const url = `${PARTNERO_API_BASE}/api/v1/programs/${PARTNERO_REFERRAL_PROGRAM_ID}/partners/${encodeURIComponent(
    customerKey,
  )}/referrals`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.PARTNERO_API_KEY}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        `[PartneroReferral] list failed: HTTP ${res.status} body=${text.slice(0, 300)}`,
      );
      return { ok: false, error: `list_http_${res.status}` };
    }

    const json = (await res.json().catch(() => null)) as any;
    return { ok: true, referrals: json?.data ?? [] };
  } catch (err: any) {
    console.warn(
      "[PartneroReferral] list error:",
      err?.message || err,
    );
    return { ok: false, error: String(err?.message || err) };
  }
}
