import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { FlaskConical, X, Loader2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * DemoBanner — shown on financial pages when the user has demo data loaded.
 * Detects demo data via GET /api/user/has-demo-data.
 * "Connect Bank" navigates to /accounts?connect=1 (auto-opens ConnectBankWizard).
 * "Clear Demo Data" calls POST /api/auth/fresh-start silently, then redirects
 * to /accounts?connect=1.
 */
export function DemoBanner() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [dismissed, setDismissed] = useState(false);

  const { data, isLoading } = useQuery<{ hasDemo: boolean }>({
    queryKey: ["/api/user/has-demo-data"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/user/has-demo-data");
      if (!res.ok) return { hasDemo: false };
      return res.json();
    },
    staleTime: 30_000,
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/fresh-start", {
        confirmation: "FRESH START",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to clear demo data");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.clear();
      toast({
        title: "Demo data cleared",
        description: "Your account has been reset. Connect a bank to get started.",
      });
      navigate("/accounts?connect=1");
    },
    onError: (err: Error) => {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Don't render while loading, if no demo data, or if dismissed
  if (isLoading || !data?.hasDemo || dismissed) return null;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
      {/* Icon */}
      <FlaskConical className="h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400" />

      {/* Message */}
      <p className="flex-1 text-sm font-medium">
        You're viewing <span className="font-semibold">demo data</span>. Connect a real bank account to see your actual finances.
      </p>

      {/* Action buttons */}
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-7 border-blue-300 bg-white text-blue-700 hover:bg-blue-100 hover:text-blue-800 dark:border-blue-700 dark:bg-transparent dark:text-blue-300 dark:hover:bg-blue-900"
          onClick={() => navigate("/accounts?connect=1")}
        >
          <Building2 className="mr-1.5 h-3.5 w-3.5" />
          Connect Bank
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="h-7 border-blue-300 bg-white text-blue-700 hover:bg-blue-100 hover:text-blue-800 dark:border-blue-700 dark:bg-transparent dark:text-blue-300 dark:hover:bg-blue-900"
          onClick={() => clearMutation.mutate()}
          disabled={clearMutation.isPending}
        >
          {clearMutation.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : null}
          Clear Demo Data
        </Button>
      </div>

      {/* Dismiss */}
      <button
        onClick={() => setDismissed(true)}
        className="ml-1 shrink-0 rounded p-0.5 text-blue-400 hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900 dark:hover:text-blue-200"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
