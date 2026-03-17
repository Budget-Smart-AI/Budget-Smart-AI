import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Zap, Brain, DollarSign, CheckCircle2, XCircle, FlaskConical } from "lucide-react";

// ─── Model registry (mirrors server/lib/bedrock.ts) ───────────────────────────
const BEDROCK_MODELS = {
  HAIKU_45: {
    id: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
    label: "Claude Haiku 4.5",
    inputPer1k: 0.0008,
    outputPer1k: 0.004,
    tier: "fast",
  },
  SONNET_46: {
    id: "global.anthropic.claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    inputPer1k: 0.003,
    outputPer1k: 0.015,
    tier: "smart",
  },
  DEEPSEEK_R1: {
    id: "us.deepseek.r1-v1:0",
    label: "DeepSeek R1",
    inputPer1k: 0.00135,
    outputPer1k: 0.0054,
    tier: "reasoning",
  },
  NOVA_MICRO: {
    id: "us.amazon.nova-micro-v1:0",
    label: "Amazon Nova Micro",
    inputPer1k: 0.000035,
    outputPer1k: 0.00014,
    tier: "economy",
  },
  NOVA_LITE: {
    id: "us.amazon.nova-lite-v1:0",
    label: "Amazon Nova Lite",
    inputPer1k: 0.00006,
    outputPer1k: 0.00024,
    tier: "economy",
  },
} as const;

type ModelKey = keyof typeof BEDROCK_MODELS;

// ─── Feature groups ────────────────────────────────────────────────────────────
const FEATURE_GROUPS: { label: string; features: string[] }[] = [
  {
    label: "💬 Conversational AI",
    features: ["ai_assistant", "sales_chatbot", "taxsmart_chat"],
  },
  {
    label: "📊 Analysis & Insights",
    features: [
      "ai_insights",
      "transaction_analysis",
      "budget_suggestions",
      "savings_advisor",
      "ai_forecast",
      "ai_daily_coach",
    ],
  },
  {
    label: "🔍 Detection & Categorization",
    features: [
      "auto_categorization",
      "subscription_detection",
      "bill_detection",
      "income_detection",
    ],
  },
  {
    label: "📄 Document Processing",
    features: ["receipt_scanning", "vault_extraction"],
  },
  {
    label: "💼 Tax & Portfolio",
    features: [
      "taxsmart_proactive",
      "taxsmart_analysis",
      "portfolio_advisor",
    ],
  },
  {
    label: "📧 Communications & Support",
    features: [
      "monthly_budget_email",
      "support_triage",
      "kb_search",
      "admin_support_ai",
      "autoblog",
    ],
  },
];

const TIER_COLORS: Record<string, string> = {
  fast: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  smart: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  reasoning: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  economy: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

// ─── Types ─────────────────────────────────────────────────────────────────────
interface AIModelConfig {
  id: number;
  feature: string;
  provider: string;
  model: string;
  modelKey: string;
  maxTokens: number;
  temperature: string;
  isEnabled: boolean;
  notes: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

interface TestResult {
  success: boolean;
  feature?: string;
  modelId?: string;
  modelKey?: string;
  content?: string;
  latencyMs?: number;
  error?: string;
}

// ─── Feature row component ─────────────────────────────────────────────────────
function FeatureRow({
  config,
  onSave,
  onTest,
  isSaving,
  isTesting,
  testResult,
}: {
  config: AIModelConfig;
  onSave: (feature: string, data: Partial<AIModelConfig>) => void;
  onTest: (feature: string) => void;
  isSaving: boolean;
  isTesting: boolean;
  testResult: TestResult | null;
}) {
  const [modelKey, setModelKey] = useState<string>(config.modelKey || "HAIKU_45");
  const [maxTokens, setMaxTokens] = useState<number>(config.maxTokens || 1000);
  const [isEnabled, setIsEnabled] = useState<boolean>(config.isEnabled ?? true);

  const isDirty =
    modelKey !== (config.modelKey || "HAIKU_45") ||
    maxTokens !== (config.maxTokens || 1000) ||
    isEnabled !== (config.isEnabled ?? true);

  const selectedModel = BEDROCK_MODELS[modelKey as ModelKey];

  return (
    <TableRow>
      <TableCell className="font-mono text-sm">{config.feature}</TableCell>
      <TableCell>
        <Select value={modelKey} onValueChange={setModelKey}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(BEDROCK_MODELS).map(([key, m]) => (
              <SelectItem key={key} value={key}>
                <span className="flex items-center gap-2">
                  <span>{m.label}</span>
                  <Badge
                    variant="outline"
                    className={`text-xs ${TIER_COLORS[m.tier]}`}
                  >
                    {m.tier}
                  </Badge>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          type="number"
          value={maxTokens}
          onChange={(e) => setMaxTokens(Number(e.target.value))}
          className="w-24"
          min={10}
          max={8192}
        />
      </TableCell>
      <TableCell>
        <Switch
          checked={isEnabled}
          onCheckedChange={setIsEnabled}
        />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {selectedModel && (
          <span>
            ${selectedModel.inputPer1k}/1k in · ${selectedModel.outputPer1k}/1k out
          </span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={isDirty ? "default" : "outline"}
            disabled={!isDirty || isSaving}
            onClick={() =>
              onSave(config.feature, { modelKey, maxTokens, isEnabled })
            }
          >
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isTesting}
            onClick={() => onTest(config.feature)}
          >
            {isTesting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <FlaskConical className="h-3 w-3" />
            )}
          </Button>
          {testResult && (
            <span className="flex items-center gap-1 text-xs">
              {testResult.success ? (
                <>
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  <span className="text-green-600">{testResult.latencyMs}ms</span>
                </>
              ) : (
                <>
                  <XCircle className="h-3 w-3 text-red-500" />
                  <span className="text-red-600 max-w-[120px] truncate">
                    {testResult.error}
                  </span>
                </>
              )}
            </span>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function AdminAIModels() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [savingFeature, setSavingFeature] = useState<string | null>(null);
  const [testingFeature, setTestingFeature] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  // Fetch all configs
  const { data: configs = [], isLoading } = useQuery<AIModelConfig[]>({
    queryKey: ["/api/admin/ai-models"],
    queryFn: () => apiRequest("GET", "/api/admin/ai-models").then((r) => r.json()),
  });

  // Build a map for quick lookup
  const configMap = Object.fromEntries(configs.map((c) => [c.feature, c]));

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async ({
      feature,
      data,
    }: {
      feature: string;
      data: Partial<AIModelConfig>;
    }) => {
      const res = await apiRequest("PATCH", `/api/admin/ai-models/${feature}`, data);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_, { feature }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-models"] });
      toast({
        title: "Saved",
        description: `Model config for "${feature}" updated.`,
      });
      setSavingFeature(null);
    },
    onError: (err: Error, { feature }) => {
      toast({
        title: "Save failed",
        description: err.message,
        variant: "destructive",
      });
      setSavingFeature(null);
    },
  });

  const handleSave = (feature: string, data: Partial<AIModelConfig>) => {
    setSavingFeature(feature);
    saveMutation.mutate({ feature, data });
  };

  const handleTest = async (feature: string) => {
    setTestingFeature(feature);
    try {
      const res = await apiRequest(
        "GET",
        `/api/admin/ai-models/test/${feature}`
      );
      const result: TestResult = await res.json();
      setTestResults((prev) => ({ ...prev, [feature]: result }));
      if (result.success) {
        toast({
          title: "Test passed ✓",
          description: `${feature} responded in ${result.latencyMs}ms via ${result.modelKey}`,
        });
      } else {
        toast({
          title: "Test failed",
          description: result.error,
          variant: "destructive",
        });
      }
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [feature]: { success: false, error: err.message },
      }));
      toast({
        title: "Test error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setTestingFeature(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Model Configuration</h1>
        <p className="text-muted-foreground mt-1">
          Assign AWS Bedrock models to each feature. Changes take effect immediately.
        </p>
      </div>

      {/* Cost Reference Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Cost Reference — AWS Bedrock Models
          </CardTitle>
          <CardDescription>
            Pricing per 1,000 tokens (input / output). All models served via AWS Bedrock.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Input / 1k tokens</TableHead>
                <TableHead>Output / 1k tokens</TableHead>
                <TableHead>Best for</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(BEDROCK_MODELS).map(([key, m]) => (
                <TableRow key={key}>
                  <TableCell className="font-mono text-sm font-semibold">
                    {key}
                  </TableCell>
                  <TableCell>{m.label}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={TIER_COLORS[m.tier]}
                    >
                      {m.tier}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    ${m.inputPer1k.toFixed(6)}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    ${m.outputPer1k.toFixed(6)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {key === "HAIKU_45" && "Fast tasks, categorization, chat"}
                    {key === "SONNET_46" && "Complex analysis, coaching, insights"}
                    {key === "DEEPSEEK_R1" && "Deep reasoning, tax analysis"}
                    {key === "NOVA_MICRO" && "Ultra-cheap, simple classification"}
                    {key === "NOVA_LITE" && "Cheap, light multimodal tasks"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Feature Groups */}
      {FEATURE_GROUPS.map((group) => {
        const groupConfigs = group.features
          .map((f) => configMap[f])
          .filter(Boolean) as AIModelConfig[];

        if (groupConfigs.length === 0) return null;

        return (
          <Card key={group.label}>
            <CardHeader>
              <CardTitle className="text-lg">{group.label}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Feature</TableHead>
                    <TableHead className="w-[220px]">Model</TableHead>
                    <TableHead className="w-[100px]">Max Tokens</TableHead>
                    <TableHead className="w-[80px]">Enabled</TableHead>
                    <TableHead className="w-[180px]">Cost</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupConfigs.map((config) => (
                    <FeatureRow
                      key={config.feature}
                      config={config}
                      onSave={handleSave}
                      onTest={handleTest}
                      isSaving={savingFeature === config.feature}
                      isTesting={testingFeature === config.feature}
                      testResult={testResults[config.feature] ?? null}
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}

      {/* Uncategorized features */}
      {(() => {
        const categorized = new Set(FEATURE_GROUPS.flatMap((g) => g.features));
        const uncategorized = configs.filter((c) => !categorized.has(c.feature));
        if (uncategorized.length === 0) return null;
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">⚙️ Other Features</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Feature</TableHead>
                    <TableHead className="w-[220px]">Model</TableHead>
                    <TableHead className="w-[100px]">Max Tokens</TableHead>
                    <TableHead className="w-[80px]">Enabled</TableHead>
                    <TableHead className="w-[180px]">Cost</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uncategorized.map((config) => (
                    <FeatureRow
                      key={config.feature}
                      config={config}
                      onSave={handleSave}
                      onTest={handleTest}
                      isSaving={savingFeature === config.feature}
                      isTesting={testingFeature === config.feature}
                      testResult={testResults[config.feature] ?? null}
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
