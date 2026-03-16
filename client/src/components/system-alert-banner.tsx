/**
 * SystemAlertBanner
 * Polls /api/admin/communications/active-alerts every 30 seconds and renders
 * coloured banners at the top of the authenticated app layout.
 *
 * Alert behaviour by type:
 *  critical  – red,   cannot be dismissed
 *  warning   – amber, user can dismiss
 *  info      – blue,  user can dismiss
 *  success   – green, user can dismiss
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, AlertTriangle, Info, CheckCircle, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface SystemAlert {
  id: string;
  type: "info" | "warning" | "critical" | "success";
  message: string;
  linkUrl?: string | null;
  linkText?: string | null;
  createdAt: string;
  expiresAt?: string | null;
}

const ALERT_STYLES: Record<
  SystemAlert["type"],
  { bg: string; text: string; border: string; icon: React.ElementType }
> = {
  critical: {
    bg: "bg-red-600",
    text: "text-white",
    border: "border-red-700",
    icon: AlertCircle,
  },
  warning: {
    bg: "bg-amber-500",
    text: "text-amber-950",
    border: "border-amber-600",
    icon: AlertTriangle,
  },
  info: {
    bg: "bg-blue-600",
    text: "text-white",
    border: "border-blue-700",
    icon: Info,
  },
  success: {
    bg: "bg-emerald-600",
    text: "text-white",
    border: "border-emerald-700",
    icon: CheckCircle,
  },
};

export function SystemAlertBanner() {
  const qc = useQueryClient();

  const { data: alerts = [] } = useQuery<SystemAlert[]>({
    queryKey: ["/api/admin/communications/active-alerts"],
    refetchInterval: 30_000, // poll every 30 s
    staleTime: 25_000,
  });

  const dismissMutation = useMutation({
    mutationFn: (alertId: string) =>
      apiRequest("POST", `/api/admin/communications/active-alerts/${alertId}/dismiss`),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["/api/admin/communications/active-alerts"],
      });
    },
  });

  if (!alerts.length) return null;

  return (
    <div className="flex flex-col w-full">
      {alerts.map((alert) => {
        const style = ALERT_STYLES[alert.type] ?? ALERT_STYLES.info;
        const Icon = style.icon;
        const canDismiss = alert.type !== "critical";

        return (
          <div
            key={alert.id}
            className={`${style.bg} ${style.text} ${style.border} border-b px-4 py-2 flex items-center gap-3`}
            role="alert"
            aria-live={alert.type === "critical" ? "assertive" : "polite"}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1 text-sm font-medium">
              {alert.message}
              {alert.linkUrl && (
                <>
                  {" "}
                  <a
                    href={alert.linkUrl}
                    className="underline font-semibold hover:opacity-80"
                    target={alert.linkUrl.startsWith("http") ? "_blank" : undefined}
                    rel={alert.linkUrl.startsWith("http") ? "noopener noreferrer" : undefined}
                  >
                    {alert.linkText || "Learn more"}
                  </a>
                </>
              )}
            </span>
            {canDismiss && (
              <button
                type="button"
                aria-label="Dismiss alert"
                className="shrink-0 opacity-80 hover:opacity-100 transition-opacity"
                onClick={() => dismissMutation.mutate(alert.id)}
                disabled={dismissMutation.isPending}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
