import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Settings, Shield, Save, RefreshCw, Download, Upload, Check, X } from "lucide-react";

// Types
interface PlanFeatureConfig {
  featureKey: string;
  displayName: string;
  category: string;
  tier: string;
  free: number | null;
  pro: number | null;
  family: number | null;
}

export default function AdminPlanFeaturesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingFeature, setEditingFeature] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  // Fetch all features
  const { data, isLoading } = useQuery<{ features: PlanFeatureConfig[]; totalFeatures: number }>({
    queryKey: ["/api/admin/plans/features"],
    queryFn: () => apiRequest("/api/admin/plans/features"),
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ plan, featureKey, limit_value }: { plan: string; featureKey: string; limit_value: number | null }) => {
      return apiRequest(`/api/admin/plans/${plan}/features/${featureKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit_value }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plans/features"] });
      toast({ title: "Success", description: "Feature limit updated. Changes are live immediately." });
      setEditingFeature(null);
      setEditValues({});
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update limit", variant: "destructive" });
    },
  });

  // Seed mutation
  const seedMutation = useMutation({
    mutationFn: () => apiRequest("/api/admin/plans/features/seed", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plans/features"] });
      toast({ title: "Success", description: "Database seeded from features.ts" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to seed", variant: "destructive" });
    },
  });

  const handleEdit = (featureKey: string, plan: string, currentValue: number | null) => {
    setEditingFeature(`${featureKey}:${plan}`);
    setEditValues({ [`${featureKey}:${plan}`]: currentValue === null ? '' : String(currentValue) });
  };

  const handleSave = (featureKey: string, plan: string) => {
    const key = `${featureKey}:${plan}`;
    const value = editValues[key];
    
    const limit_value = value === '' || value === 'null' ? null : parseInt(value, 10);
    
    if (value !== '' && value !== 'null' && (isNaN(limit_value as number) || (limit_value as number) < 0)) {
      toast({ title: "Error", description: "Limit must be a non-negative number or empty (unlimited)", variant: "destructive" });
      return;
    }

    updateMutation.mutate({ plan, featureKey, limit_value });
  };

  const handleCancel = () => {
    setEditingFeature(null);
    setEditValues({});
  };

  const formatLimit = (limit: number | null) => {
    if (limit === null) return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">Unlimited</Badge>;
    if (limit === 0) return <Badge variant="destructive">Disabled</Badge>;
    return <Badge variant="secondary">{limit}</Badge>;
  };

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      ai: "🤖",
      banking: "🏦",
      tracking: "📊",
      planning: "📅",
      reporting: "📈",
      household: "👥",
      utilities: "🔧",
    };
    return icons[category] || "📦";
  };

  // Group features by category
  const featuresByCategory = data?.features.reduce((acc, feature) => {
    if (!acc[feature.category]) acc[feature.category] = [];
    acc[feature.category].push(feature);
    return acc;
  }, {} as Record<string, PlanFeatureConfig[]>) || {};

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            Plan & Feature Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Control which features are available on each plan. <strong>Changes take effect immediately.</strong>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Re-seed from features.ts
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Features</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data?.totalFeatures || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{Object.keys(featuresByCategory).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Plans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">3</div>
            <p className="text-xs text-muted-foreground mt-1">Free, Pro, Family</p>
          </CardContent>
        </Card>
      </div>

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Legend</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">Unlimited</Badge>
            <span className="text-muted-foreground">= null (no limit)</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="destructive">Disabled</Badge>
            <span className="text-muted-foreground">= 0 (upgrade required)</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">50</Badge>
            <span className="text-muted-foreground">= specific limit</span>
          </div>
        </CardContent>
      </Card>

      {/* Features Table by Category */}
      {Object.entries(featuresByCategory).map(([category, features]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <span>{getCategoryIcon(category)}</span>
              {category.toUpperCase()}
              <Badge variant="outline">{features.length} features</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/3">Feature</TableHead>
                  <TableHead className="text-center w-1/6">Free</TableHead>
                  <TableHead className="text-center w-1/6">Pro</TableHead>
                  <TableHead className="text-center w-1/6">Family</TableHead>
                  <TableHead className="w-1/6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {features.map((feature) => (
                  <TableRow key={feature.featureKey}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{feature.displayName}</div>
                        <div className="text-xs text-muted-foreground">{feature.featureKey}</div>
                        <Badge variant="outline" className="text-xs mt-1">min: {feature.tier}</Badge>
                      </div>
                    </TableCell>
                    
                    {['free', 'pro', 'family'].map((plan) => {
                      const currentValue = feature[plan as keyof Pick<PlanFeatureConfig, 'free' | 'pro' | 'family'>];
                      const editKey = `${feature.featureKey}:${plan}`;
                      const isEditing = editingFeature === editKey;

                      return (
                        <TableCell key={plan} className="text-center">
                          {isEditing ? (
                            <Input
                              type="text"
                              value={editValues[editKey] || ''}
                              onChange={(e) => setEditValues({ ...editValues, [editKey]: e.target.value })}
                              placeholder="null=unlimited"
                              className="w-24 mx-auto text-center"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSave(feature.featureKey, plan);
                                if (e.key === 'Escape') handleCancel();
                              }}
                              autoFocus
                            />
                          ) : (
                            <button
                              onClick={() => handleEdit(feature.featureKey, plan, currentValue)}
                              className="hover:bg-muted px-2 py-1 rounded transition-colors"
                            >
                              {formatLimit(currentValue)}
                            </button>
                          )}
                        </TableCell>
                      );
                    })}

                    <TableCell>
                      {editingFeature?.startsWith(feature.featureKey + ':') ? (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => {
                              const plan = editingFeature.split(':')[1];
                              handleSave(feature.featureKey, plan);
                            }}
                            disabled={updateMutation.isPending}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCancel}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Click to edit</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
