import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

export default function DemoPage() {
  const [, setLocation] = useLocation();
  const initiated = useRef(false);

  const demoLoginMutation = useMutation({
    mutationFn: async () => {
      queryClient.clear();
      const res = await apiRequest("POST", "/api/auth/demo-login");
      return res.json();
    },
    onSuccess: () => {
      // Invalidate session query so App re-reads auth state, then go to dashboard
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
      setLocation("/dashboard");
    },
    onError: () => {
      // Fall back to login page if demo is unavailable
      setLocation("/login");
    },
  });

  useEffect(() => {
    if (initiated.current) return;
    initiated.current = true;
    demoLoginMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
      <span className="ml-2 text-muted-foreground">Loading demo...</span>
    </div>
  );
}
