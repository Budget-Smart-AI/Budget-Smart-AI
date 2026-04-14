import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

/**
 * Custom hook for handling user logout.
 *
 * Clears every piece of state that could leak across users on a shared
 * browser. Specifically:
 *
 *   1. Server-side session destroyed via /api/auth/logout
 *   2. React Query cache fully cleared (no per-user data lingers)
 *   3. localStorage AND sessionStorage wiped — defends against the
 *      cross-user-token-leak case where a Plaid public_token, MX member_guid,
 *      or any future provider's session credential might have been cached
 *      client-side by a third-party widget
 *
 * The bank-link intent system on the server (server/lib/bank-link-security.ts)
 * is the authoritative defense — even if any of these client clears miss
 * something, the server will reject any token-exchange whose intent wasn't
 * issued for the now-current session user. This client-side cleanup is
 * defense in depth.
 */
export function useLogout(onLogout?: () => void) {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/logout");
      return response.json();
    },
    onSuccess: () => {
      // 1. Wipe React Query cache so no previous user's API responses remain.
      queryClient.clear();

      // 2. Wipe browser storage. Some Plaid / MX widgets persist state to
      //    sessionStorage; we don't want that leaking to the next user.
      try {
        sessionStorage.clear();
      } catch {
        // sessionStorage can throw under strict-cookie / private-mode rules.
        // Failing to clear it is non-fatal — the server intent guard will
        // still reject any cross-user replay.
      }
      try {
        // localStorage may legitimately hold app preferences. Clear only the
        // keys we know could carry sensitive provider state. Add to this list
        // when a new provider is added.
        const SENSITIVE_PREFIXES = [
          "plaid", "Plaid", "PLAID",
          "mx", "MX",
          "link_token", "linkToken",
          "intent_id", "intentId",
          "public_token", "publicToken",
          "member_guid", "memberGuid",
          "access_token", "accessToken",
        ];
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && SENSITIVE_PREFIXES.some((p) => k.includes(p))) {
            localStorage.removeItem(k);
          }
        }
      } catch {
        // Same defensive rationale as sessionStorage.
      }

      toast({
        title: "Logged Out",
        description: "You have been logged out successfully",
      });
      if (onLogout) onLogout();
    },
    onError: (error: Error) => {
      toast({
        title: "Logout Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
