/**
 * Partnero server-side attribution module.
 *
 * Partnero's frontend universal.js (po('customer', 'signup' | 'conversion'))
 * tags a customer to the affiliate cookie at sign-up and at the moment a
 * subscription becomes active. That covers attribution for the *first*
 * payment.
 *
 * For lifetime recurring commissions, Partnero needs to know about every
 * subsequent renewal too. The native Partnero ↔ Stripe integration in the
 * Partnero portal handles this if the right Stripe events are mapped. This
 * module is a defensive backstop that fires the same payment event from our
 * server whenever Stripe notifies us of a successful invoice.
 *
 * Idempotency: Partnero deduplicates by `transaction_key`, which we set to
 * the Stripe invoice ID. So if the native Partnero ↔ Stripe integration
 * already fired for the same invoice, our call is a no-op on Partnero's side.
 *
 * Safety: every call is wrapped in a try/catch and logged but never thrown,
 * so a Partnero outage cannot cause a Stripe webhook to fail (which would
 * make Stripe retry and eventually disable the endpoint).
 *
 * Env vars (all optional — module no-ops if missing):
 *   PARTNERO_API_KEY      Bearer token for Partnero REST API
 *   PARTNERO_PROGRAM_ID   Public program slug (defaults to CJUSEXBQ)
 *   PARTNERO_API_BASE     Override base URL (defaults to https://app.partnero.com)
 *   PARTNERO_ENABLED      Set to 'true' to enable server-side calls (default: off)
 */

const PARTNERO_API_BASE =
  process.env.PARTNERO_API_BASE || "https://app.partnero.com";
const PARTNERO_PROGRAM_ID = process.env.PARTNERO_PROGRAM_ID || "CJUSEXBQ";

function isEnabled(): boolean {
  return (
    process.env.PARTNERO_ENABLED === "true" &&
    typeof process.env.PARTNERO_API_KEY === "string" &&
    process.env.PARTNERO_API_KEY.length > 0
  );
}

interface PartneroCustomerPayload {
  /** Stable customer key — we use the user's email so it matches the
   *  frontend `po('customer','signup', { email })` call. */
  key: string;
  email?: string;
  name?: string | null;
}

interface PartneroPaymentPayload {
  customer: PartneroCustomerPayload;
  /** Amount in CENTS (Stripe-native). Partnero accepts integer cents. */
  amount: number;
  currency: string;
  /** Stripe invoice ID — used for idempotency. */
  transaction_key: string;
}

/**
 * Notify Partnero of a successful payment. Use this from the Stripe
 * `invoice.payment_succeeded` webhook so the affiliate gets credited for
 * every renewal, not just the initial conversion.
 *
 * Returns silently on any failure — never throws.
 */
export async function trackPartneroPayment(
  payload: PartneroPaymentPayload,
): Promise<void> {
  if (!isEnabled()) {
    return;
  }

  const url = `${PARTNERO_API_BASE}/api/v1/programs/${PARTNERO_PROGRAM_ID}/transactions`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PARTNERO_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        customer: payload.customer,
        amount: payload.amount,
        currency: payload.currency,
        transaction_key: payload.transaction_key,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // 409 = duplicate transaction_key (idempotent — already attributed by
      // the native Stripe integration). Treat as success, not an error.
      if (res.status === 409) {
        console.log(
          `[Partnero] payment already attributed (txn=${payload.transaction_key}) — skipping`,
        );
        return;
      }
      console.warn(
        `[Partnero] payment tracking failed: HTTP ${res.status} body=${body.slice(0, 300)}`,
      );
      return;
    }

    console.log(
      `[Partnero] ✓ payment attributed (customer=${payload.customer.key} amount=${payload.amount}${payload.currency} txn=${payload.transaction_key})`,
    );
  } catch (err: any) {
    console.warn("[Partnero] payment tracking error:", err?.message || err);
  }
}

/**
 * Notify Partnero of a refund or subscription cancellation so commission can
 * be reversed. Same dedup key pattern as trackPartneroPayment.
 */
export async function trackPartneroRefund(payload: {
  customer: PartneroCustomerPayload;
  amount: number;
  currency: string;
  transaction_key: string;
}): Promise<void> {
  if (!isEnabled()) {
    return;
  }

  const url = `${PARTNERO_API_BASE}/api/v1/programs/${PARTNERO_PROGRAM_ID}/transactions/refund`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PARTNERO_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        customer: payload.customer,
        amount: payload.amount,
        currency: payload.currency,
        transaction_key: payload.transaction_key,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(
        `[Partnero] refund tracking failed: HTTP ${res.status} body=${body.slice(0, 300)}`,
      );
      return;
    }

    console.log(
      `[Partnero] ✓ refund attributed (customer=${payload.customer.key} txn=${payload.transaction_key})`,
    );
  } catch (err: any) {
    console.warn("[Partnero] refund tracking error:", err?.message || err);
  }
}

/**
 * Returns true if Partnero server-side tracking is configured and active.
 * Call from health checks or admin tooling so operators know the wiring is
 * live without making a real API call.
 */
export function partneroEnabled(): boolean {
  return isEnabled();
}
