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
 * Maps HTTP status codes to user-friendly error messages
 */
function getUserFriendlyErrorMessage(status: number, originalMessage: string): string {
  if (status === 400) return "Something looks off with that request.";
  if (status === 401) return "Please log in to continue.";
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "That resource doesn't exist.";
  if (status === 409) return "A conflict occurred — this may already exist.";
  if (status === 422) return "Some fields have errors. Please review and try again.";
  if (status === 429) return "Slow down — too many requests.";
  if (status >= 500) {
    return "Something went wrong on our end. Try again shortly. If this persists, please contact support.";
  }
  
  // For other statuses, try to use the original message if it's helpful
  if (originalMessage && !originalMessage.includes(status.toString())) {
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
    
    const text = (await res.text()) || res.statusText;
    const userFriendlyMessage = getUserFriendlyErrorMessage(res.status, text);
    
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
