import { QueryClient, QueryFunction } from "@tanstack/react-query";

// ─── 402 Feature-gate event bus ──────────────────────────────────────────────
//
// A lightweight publish/subscribe channel that lets the API fetch helpers
// notify the FeatureUsageContext about 402 responses without creating a
// circular import (queryClient ← context ← component ← queryClient).
//
// Usage:
//   subscribe402(handler)  in FeatureUsageContext (or wherever)
//   publish402(payload)    called automatically by apiRequest / getQueryFn

export interface GatePayload {
  feature: string;
  remaining: number;
  resetDate: Date | null;
}

type GateHandler = (payload: GatePayload) => void;
const _402subscribers: GateHandler[] = [];

export function subscribe402(handler: GateHandler): () => void {
  _402subscribers.push(handler);
  return () => {
    const idx = _402subscribers.indexOf(handler);
    if (idx !== -1) _402subscribers.splice(idx, 1);
  };
}

function publish402(payload: GatePayload) {
  for (const h of _402subscribers) h(payload);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Minimum length for a message to be considered a "custom" error message
 * rather than a generic status text. Messages shorter than this are likely
 * to be generic HTTP status text like "Not Found" or "Bad Request".
 */
const MIN_CUSTOM_MESSAGE_LENGTH = 10;

/**
 * Extracts the error message string from a raw response body (JSON or plain text).
 */
function extractRawMessage(text: string): string {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.error === "string") return parsed.error;
    if (parsed && typeof parsed.message === "string") return parsed.message;
  } catch {
    // not JSON — use as-is
  }
  return text;
}

/**
 * Maps HTTP status codes to user-friendly error messages.
 * For 400 responses from auth endpoints, passes through the specific
 * server validation message so users see actionable guidance.
 */
function getUserFriendlyErrorMessage(status: number, originalMessage: string): string {
  // ── Auth / validation keyword pass-through (checked before generic buckets) ──
  // These patterns match the exact messages returned by the server's registerSchema
  // and registration endpoint so users see specific, actionable guidance.
  if (status === 400) {
    const raw = originalMessage.toLowerCase();

    if (raw.includes("special character"))
      return "Password must include at least one special character (!@#$%^&*)";
    if (raw.includes("uppercase"))
      return "Password must include at least one uppercase letter";
    if (raw.includes("lowercase"))
      return "Password must include at least one lowercase letter";
    if (raw.includes("number") || raw.includes("digit"))
      return "Password must include at least one number";
    if (raw.includes("8 characters") || raw.includes("too short"))
      return "Password must be at least 8 characters long";
    if (raw.includes("match"))
      return "Passwords do not match";
    if (raw.includes("already exists") || raw.includes("duplicate") || raw.includes("already registered"))
      return "An account with this email already exists. Try signing in instead.";
    if (raw.includes("invalid email") || raw.includes("valid email"))
      return "Please enter a valid email address";
    if (raw.includes("username already taken"))
      return "That username is already taken. Please choose another.";
    if (raw.includes("first name"))
      return "First name is required";
    if (raw.includes("last name"))
      return "Last name is required";

    // For any other 400 with a meaningful server message, pass it through
    if (originalMessage && originalMessage.length > MIN_CUSTOM_MESSAGE_LENGTH) {
      return originalMessage;
    }

    return "Something looks off with that request.";
  }

  if (status === 401) {
    // Pass through meaningful server messages (e.g. "Invalid username or password",
    // "Account locked", "MFA verification required") so the user sees actionable guidance.
    if (originalMessage && originalMessage.length > MIN_CUSTOM_MESSAGE_LENGTH) {
      return originalMessage;
    }
    return "Please log in to continue.";
  }
  if (status === 402) return "You've reached the limit for your current plan. Upgrade to Pro to unlock unlimited access.";
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "That resource doesn't exist.";
  if (status === 409) return "A conflict occurred — this may already exist.";
  if (status === 422) return "Some fields have errors. Please review and try again.";
  if (status === 429) return "Slow down — too many requests.";
  if (status >= 500) {
    return "Something went wrong on our end. Try again shortly. If this persists, please contact support.";
  }

  // For other statuses, use the original message if it looks like a custom message
  const statusCodePattern = new RegExp(`\\b${status}\\b`);
  if (originalMessage && !statusCodePattern.test(originalMessage) && originalMessage.length > MIN_CUSTOM_MESSAGE_LENGTH) {
    return originalMessage;
  }

  return "An unexpected error occurred.";
}

/**
 * Tries to extract a GatePayload from a 402 response body.
 * Returns null when the body is not the expected shape.
 */
async function tryParseGatePayload(res: Response): Promise<GatePayload | null> {
  try {
    const body = await res.json();
    if (body && typeof body.feature === "string") {
      return {
        feature: body.feature,
        remaining: typeof body.remaining === "number" ? body.remaining : 0,
        resetDate: body.resetDate ? new Date(body.resetDate) : null,
      };
    }
  } catch {
    // not JSON or wrong shape — ignore
  }
  return null;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Intercept 402 responses and publish to the feature-gate bus
    if (res.status === 402) {
      const payload = await tryParseGatePayload(res);
      if (payload) publish402(payload);
    }
    
    const rawText = (await res.text()) || res.statusText;
    const extracted = extractRawMessage(rawText);
    const userFriendlyMessage = getUserFriendlyErrorMessage(res.status, extracted);
    
    throw new Error(userFriendlyMessage);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
