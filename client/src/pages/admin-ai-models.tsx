import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Cpu, Save, RefreshCw, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface AiModelConfig {
  id: number;
  feature: string;
  provider: string;
  model: string;
  maxTokens: number;
  temperature: string;
  isEnabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

const PROVIDERS = ["deepseek", "openai"];
const MODELS: Record<string, string[]> = {
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
};

const FEATURE_LABELS: Record<string, string> = {
  taxsmart: "TaxSmart AI",
  ai_coach: "AI Financial Coach",
  help_chat: "Help Center Chat",
  sales_chatbot: "Sales Chatbot",
  onboarding: "Onboarding Analysis",
};

export default function AdminAIModels() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [edits, setEdits] = useState<Partial<AiModelConfig>>({});

  const { data: configs = [], isLoading } = useQuery<AiModelConfig[]>({
    queryKey: ["/api/admin/ai-models"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ feature, data }: { feature: string; data: Partial<AiModelConfig> }) => {
      const res = await apiRequest("PATCH", `/api/admin/ai-models/${feature}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-models"] });
      setEditingId(null);
      setEdits({});
      toast({ title: "Saved", description: "AI model configuration updated." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to save", variant: "destructive" });
    },
  });

  const startEdit = (config: AiModelConfig) => {
    setEditingId(config.id);
    setEdits({
      provider: config.provider,
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      isEnabled: config.isEnabled,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEdits({});
  };

  const saveEdit = (feature: string) => {
    updateMutation.mutate({ feature, data: edits });
  };

  const handleProviderChange = (provider: string) => {
    const defaultModel = MODELS[provider]?.[0] || "";
    setEdits((prev) => ({ ...prev, provider, model: defaultModel }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Cpu className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">AI Model Configuration</h1>
          <p className="text-muted-foreground text-sm">
            Manage AI provider and model settings per feature
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-200">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          Changes take effect immediately. Disabling a feature will return a 503 error to users.
          Ensure the selected model's API key is configured in environment variables.
        </span>
      </div>

      {configs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Cpu className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>No AI model configurations found.</p>
            <p className="text-sm mt-1">
              Configurations are seeded automatically when features are first used.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {configs.map((config) => {
            const isEditing = editingId === config.id;
            const current = isEditing ? { ...config, ...edits } : config;

            return (
              <Card key={config.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      {FEATURE_LABELS[config.feature] || config.feature}
                      <Badge variant="outline" className="text-xs font-mono">
                        {config.feature}
                      </Badge>
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEdit}
                            disabled={updateMutation.isPending}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => saveEdit(config.feature)}
                            disabled={updateMutation.isPending}
                          >
                            <Save className="w-3 h-3 mr-1" />
                            Save
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => startEdit(config)}>
                          Edit
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {/* Enabled Toggle */}
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground font-medium">Enabled</label>
                      <div className="flex items-center gap-2 pt-1">
                        <Switch
                          checked={current.isEnabled}
                          onCheckedChange={(v) =>
                            isEditing
                              ? setEdits((p) => ({ ...p, isEnabled: v }))
                              : undefined
                          }
                          disabled={!isEditing}
                        />
                        <span className="text-sm">
                          {current.isEnabled ? (
                            <span className="text-green-600">Active</span>
                          ) : (
                            <span className="text-red-500">Disabled</span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Provider */}
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground font-medium">Provider</label>
                      {isEditing ? (
                        <Select
                          value={current.provider}
                          onValueChange={handleProviderChange}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PROVIDERS.map((p) => (
                              <SelectItem key={p} value={p}>
                                {p}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm font-medium pt-1">{config.provider}</p>
                      )}
                    </div>

                    {/* Model */}
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground font-medium">Model</label>
                      {isEditing ? (
                        <Select
                          value={current.model}
                          onValueChange={(v) => setEdits((p) => ({ ...p, model: v }))}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(MODELS[current.provider] || []).map((m) => (
                              <SelectItem key={m} value={m}>
                                {m}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm font-medium pt-1 font-mono">{config.model}</p>
                      )}
                    </div>

                    {/* Max Tokens */}
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground font-medium">Max Tokens</label>
                      {isEditing ? (
                        <input
                          type="number"
                          value={current.maxTokens}
                          onChange={(e) =>
                            setEdits((p) => ({ ...p, maxTokens: parseInt(e.target.value) || 500 }))
                          }
                          className="w-full h-8 text-sm px-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                          min={100}
                          max={8000}
                        />
                      ) : (
                        <p className="text-sm font-medium pt-1">{config.maxTokens}</p>
                      )}
                    </div>

                    {/* Temperature */}
                    <div className="space-y-1 col-span-2 sm:col-span-1">
                      <label className="text-xs text-muted-foreground font-medium">
                        Temperature ({isEditing ? edits.temperature ?? config.temperature : config.temperature})
                      </label>
                      {isEditing ? (
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={parseFloat(current.temperature as string) || 0.7}
                          onChange={(e) =>
                            setEdits((p) => ({ ...p, temperature: parseFloat(e.target.value).toFixed(2) }))
                          }
                          className="w-full"
                        />
                      ) : (
                        <div className="flex items-center gap-2 pt-1">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${parseFloat(config.temperature) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium">{config.temperature}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {config.updatedAt && (
                    <p className="text-xs text-muted-foreground mt-3">
                      Last updated: {new Date(config.updatedAt).toLocaleString()}
                      {config.updatedBy && ` by ${config.updatedBy}`}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
