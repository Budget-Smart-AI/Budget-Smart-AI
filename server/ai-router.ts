import OpenAI from 'openai';
import { calculateCost } from './ai-models';
import { db } from './db';

const deepseekClient = process.env.DEEPSEEK_API_KEY
  ? new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com' })
  : null;

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

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

// Simple in-memory config cache (refreshed every 5 minutes)
let configCache: {
  data: Record<string, { provider: string; modelId: string }>;
  fetchedAt: number;
} | null = null;

const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;

async function getTaskConfig(
  taskSlot: string,
): Promise<{ provider: string; modelId: string }> {
  const now = Date.now();
  if (!configCache || now - configCache.fetchedAt > CONFIG_CACHE_TTL_MS) {
    try {
      const result = await (db as any).$client.query(
        'SELECT task_slot, provider, model_id FROM ai_model_config WHERE is_active = true',
      );
      const data: Record<string, { provider: string; modelId: string }> = {};
      for (const row of result.rows) {
        data[row.task_slot] = { provider: row.provider, modelId: row.model_id };
      }
      configCache = { data, fetchedAt: now };
    } catch {
      // Fall back to defaults if table isn't available yet
      configCache = { data: {}, fetchedAt: now };
    }
  }

  return (
    configCache.data[taskSlot] ?? { provider: 'deepseek', modelId: 'deepseek-chat' }
  );
}

async function logUsage(
  taskSlot: string,
  provider: string,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  estimatedCostUsd: number,
  durationMs: number,
  success: boolean,
  userId?: string,
  featureContext?: string,
  errorMessage?: string,
): Promise<void> {
  try {
    await (db as any).$client.query(
      `INSERT INTO ai_usage_log
        (user_id, task_slot, provider, model_id, input_tokens, output_tokens,
         total_tokens, estimated_cost_usd, duration_ms, success, error_message, feature_context)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        userId ?? null,
        taskSlot,
        provider,
        modelId,
        inputTokens,
        outputTokens,
        inputTokens + outputTokens,
        estimatedCostUsd,
        durationMs,
        success,
        errorMessage ?? null,
        featureContext ?? null,
      ],
    );
  } catch {
    // Non-fatal — never let logging failures break the feature
  }
}

/**
 * Route an AI call to the configured provider/model for the given task slot.
 * Falls back to deepseek-chat if the config table is unavailable.
 */
/** Invalidate the in-memory model config cache (call after admin updates a slot). */
export function invalidateModelConfigCache(): void {
  configCache = null;
}

export async function routeAI(options: AIRouterOptions): Promise<AIRouterResult> {
  const { taskSlot, messages, userId, maxTokens = 1024, temperature = 0.7, featureContext, jsonMode } = options;

  const { provider, modelId } = await getTaskConfig(taskSlot);

  const client = provider === 'openai' ? openaiClient : deepseekClient;

  if (!client) {
    throw new Error('No AI provider configured. Set DEEPSEEK_API_KEY or OPENAI_API_KEY.');
  }

  const startMs = Date.now();
  let success = true;
  let errorMessage: string | undefined;
  let content = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const requestParams: any = {
      model: modelId,
      messages,
      max_tokens: maxTokens,
      temperature,
    };
    if (jsonMode) {
      requestParams.response_format = { type: 'json_object' };
    }

    const response = await client.chat.completions.create(requestParams);
    content = response.choices[0]?.message?.content ?? '';
    inputTokens = response.usage?.prompt_tokens ?? 0;
    outputTokens = response.usage?.completion_tokens ?? 0;
  } catch (err: any) {
    success = false;
    errorMessage = err?.message ?? String(err);
    content = '';
  }

  const durationMs = Date.now() - startMs;
  const estimatedCostUsd = calculateCost(provider, modelId, inputTokens, outputTokens);

  await logUsage(
    taskSlot, provider, modelId, inputTokens, outputTokens,
    estimatedCostUsd, durationMs, success, userId, featureContext, errorMessage,
  );

  if (!success) {
    throw new Error(errorMessage ?? 'AI request failed');
  }

  return {
    content,
    provider,
    modelId,
    inputTokens,
    outputTokens,
    estimatedCostUsd,
    durationMs,
    success,
  };
}
