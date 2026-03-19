import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { FlaskConical, X, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * DemoBanner — shown on financial pages when the user has demo data loaded.
 * Detects demo data via GET /api/user/has-demo-data.
 * "Clear Demo Data" calls POST /api/auth/fresh-start silently (no modal).
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
        const err = await res.json();
        throw new Error(err.error || "Failed to clear demo data");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.clear();
      toast({
        title: "Demo data cleared",
        description: "Your account is now empty. Connect your bank to get started.",
      });
      navigate("/dashboard");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading || !data?.hasDemo || dismissed) return null;

  return (
    <div className="w-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-2 min-w-0">
        <FlaskConical className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <p className="text-sm text-amber-800 dark:text-amber-300 font-medium truncate">
          You're viewing <span className="font-semibold">demo data</span> — sample Canadian household finances.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-amber-400 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-900/40"
          disabled={clearMutation.isPending}
          onClick={() => clearMutation.mutate()}
        >
          {clearMutation.isPending ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3 mr-1" />
          )}
          Clear Demo Data
        </Button>
        <button
          className="text-amber-500 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-200 transition-colors"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss demo banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
