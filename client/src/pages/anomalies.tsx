import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldAlert, CheckCircle, XCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface AnomalyAlert {
  id: string;
  userId: string;
  transactionId: string | null;
  anomalyType: string;
  severity: "low" | "medium" | "high";
  title: string;
  description: string;
  suggestedAction: string | null;
  isDismissed: boolean;
  isResolved: boolean;
  aiConfidence: number | null;
  detectedAt: string;
  dismissedAt: string | null;
}

interface AnomaliesResponse {
  anomalies: unknown[];
  alerts: AnomalyAlert[];
}

function severityColor(severity: string) {
  if (severity === "high") return "destructive";
  if (severity === "medium") return "secondary";
  return "outline";
}

function severityIcon(severity: string) {
  if (severity === "high") return <XCircle className="h-4 w-4 text-red-500" />;
  if (severity === "medium") return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  return <ShieldAlert className="h-4 w-4 text-blue-500" />;
}

export default function AnomaliesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"all" | "high" | "medium" | "low" | "dismissed">("all");

  const { data, isLoading, refetch } = useQuery<AnomaliesResponse>({
    queryKey: ["/api/anomalies"],
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("PATCH", `/api/anomalies/${id}/dismiss`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anomalies"] });
      toast({ title: "Anomaly dismissed" });
    },
    onError: () => toast({ title: "Failed to dismiss", variant: "destructive" }),
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("PATCH", `/api/anomalies/${id}/resolve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anomalies"] });
      toast({ title: "Anomaly resolved" });
    },
    onError: () => toast({ title: "Failed to resolve", variant: "destructive" }),
  });

  const allAlerts = data?.alerts ?? [];

  const filtered = allAlerts.filter((a) => {
    if (activeTab === "all") return !a.isDismissed;
    if (activeTab === "dismissed") return a.isDismissed;
    return a.severity === activeTab && !a.isDismissed;
  });

  const counts = {
    all: allAlerts.filter((a) => !a.isDismissed).length,
    high: allAlerts.filter((a) => a.severity === "high" && !a.isDismissed).length,
    medium: allAlerts.filter((a) => a.severity === "medium" && !a.isDismissed).length,
    low: allAlerts.filter((a) => a.severity === "low" && !a.isDismissed).length,
    dismissed: allAlerts.filter((a) => a.isDismissed).length,
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-7 w-7 text-amber-500" />
          <div>
            <h1 className="text-2xl font-bold">Security Alerts</h1>
            <p className="text-muted-foreground text-sm">AI-detected transaction anomalies</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="mb-4">
          <TabsTrigger value="all">
            All {counts.all > 0 && <Badge className="ml-1 h-5 px-1.5">{counts.all}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="high">
            High {counts.high > 0 && <Badge variant="destructive" className="ml-1 h-5 px-1.5">{counts.high}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="medium">Medium {counts.medium > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5">{counts.medium}</Badge>}</TabsTrigger>
          <TabsTrigger value="low">Low {counts.low > 0 && <Badge variant="outline" className="ml-1 h-5 px-1.5">{counts.low}</Badge>}</TabsTrigger>
          <TabsTrigger value="dismissed">Dismissed {counts.dismissed > 0 && <Badge variant="outline" className="ml-1 h-5 px-1.5">{counts.dismissed}</Badge>}</TabsTrigger>
        </TabsList>

        {(["all", "high", "medium", "low", "dismissed"] as const).map((tab) => (
          <TabsContent key={tab} value={tab}>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                  <p className="text-lg font-medium">No anomalies found</p>
                  <p className="text-muted-foreground text-sm mt-1">
                    {tab === "dismissed" ? "No dismissed alerts" : "Your transactions look normal"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filtered.map((alert) => (
                  <Card
                    key={alert.id}
                    className={`border ${
                      alert.severity === "high"
                        ? "border-red-200 dark:border-red-900"
                        : alert.severity === "medium"
                        ? "border-amber-200 dark:border-amber-900"
                        : "border-blue-200 dark:border-blue-900"
                    } ${alert.severity === "high" ? "animate-pulse-slow" : ""}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          {severityIcon(alert.severity)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">{alert.title}</span>
                              <Badge variant={severityColor(alert.severity) as any} className="capitalize text-xs">
                                {alert.severity}
                              </Badge>
                              <Badge variant="outline" className="text-xs capitalize">
                                {alert.anomalyType.replace(/_/g, " ")}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{alert.description}</p>
                            {alert.suggestedAction && (
                              <p className="text-xs text-muted-foreground mt-1">
                                <span className="font-medium">Suggestion: </span>
                                {alert.suggestedAction}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-2">
                              Detected {formatDistanceToNow(new Date(alert.detectedAt), { addSuffix: true })}
                              {alert.aiConfidence != null && (
                                <> · {Math.round(alert.aiConfidence * 100)}% confidence</>
                              )}
                            </p>
                          </div>
                        </div>
                        {!alert.isDismissed && (
                          <div className="flex gap-2 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => dismissMutation.mutate(alert.id)}
                              disabled={dismissMutation.isPending}
                            >
                              Dismiss
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => resolveMutation.mutate(alert.id)}
                              disabled={resolveMutation.isPending}
                            >
                              Resolve
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
