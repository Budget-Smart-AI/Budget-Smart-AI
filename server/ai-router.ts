/**
 * AI Router — now backed by AWS Bedrock.
 * All existing routeAI() call sites continue to work unchanged.
 * The taskSlot is mapped to a Bedrock feature key for DB-driven model selection.
 */

import { bedrockChat } from './lib/bedrock';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIRouterOptions {
  taskSlot: string;
  messages: AIMessage[];
  userId?: string;
  maxTokens?: number;
  temperature?: number;
  featureContext?: string;
  jsonMode?: boolean;
}

export interface AIRouterResult {
  content: string;
  provider: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  durationMs: number;
  success: boolean;
}

/** Map legacy taskSlot names → Bedrock feature keys */
const TASK_SLOT_TO_FEATURE: Record<string, string> = {
  // Chat & conversations
  ai_assistant: 'ai_assistant',
  help_chat: 'ai_assistant',
  taxsmart: 'taxsmart_chat',
  taxsmart_chat: 'taxsmart_chat',
  taxsmart_proactive: 'taxsmart_proactive',
  taxsmart_analysis: 'taxsmart_analysis',
  sales_chatbot: 'sales_chatbot',
  // Analysis & intelligence
  planning_advisor: 'budget_suggestions',
  budget_suggest: 'budget_suggestions',
  savings_advisor: 'savings_advisor',
  ai_insights: 'ai_insights',
  ai_forecast: 'ai_forecast',
  transaction_analysis: 'transaction_analysis',
  // Automation
  auto_categorization: 'auto_categorization',
  subscription_detection: 'subscription_detection',
  bill_detection: 'bill_detection',
  income_detection: 'income_detection',
  support_triage: 'support_triage',
  kb_search: 'kb_search',
  admin_support_ai: 'admin_support_ai',
  // Documents & media
  receipt_scanning: 'receipt_scanning',
  vault_extraction: 'vault_extraction',
  // Emails & reports
  monthly_budget_email: 'monthly_budget_email',
  autoblog: 'autoblog',
  // Investments
  portfolio_advisor: 'portfolio_advisor',
  investment_advisor: 'portfolio_advisor',
  // Coach
  ai_daily_coach: 'ai_daily_coach',
  daily_coach: 'ai_daily_coach',
};

function resolveFeature(taskSlot: string): string {
  return TASK_SLOT_TO_FEATURE[taskSlot] ?? taskSlot;
}

/** Invalidate the in-memory model config cache (no-op now — Bedrock reads DB per call). */
export function invalidateModelConfigCache(): void {
  // No-op: bedrockChat reads DB on every call (with fallback to code defaults)
}

export async function routeAI(options: AIRouterOptions): Promise<AIRouterResult> {
  const {
    taskSlot,
    messages,
    maxTokens = 1024,
    temperature = 0.7,
    featureContext,
  } = options;

  const feature = resolveFeature(featureContext ?? taskSlot);

  // Separate system messages from user/assistant messages
  const systemMessages = messages.filter((m) => m.role === 'system');
  const chatMessages = messages.filter((m) => m.role !== 'system') as Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;

  const system = systemMessages.map((m) => m.content).join('\n\n') || undefined;

  const startMs = Date.now();

  const content = await bedrockChat({
    feature,
    messages: chatMessages,
    system,
    maxTokens,
    temperature,
  });

  const durationMs = Date.now() - startMs;

  return {
    content,
    provider: 'bedrock',
    modelId: feature,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
    durationMs,
    success: true,
  };
}
