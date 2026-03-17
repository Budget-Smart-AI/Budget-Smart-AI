/**
 * AWS Bedrock unified AI client
 * Single entry-point for all AI calls in Budget-Smart-AI
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { pool } from "../db";

// ─── Client ──────────────────────────────────────────────────────────────────

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    ...(process.env.AWS_SESSION_TOKEN
      ? { sessionToken: process.env.AWS_SESSION_TOKEN }
      : {}),
  },
});

// ─── Model Registry ──────────────────────────────────────────────────────────

export const BEDROCK_MODELS: Record<
  string,
  { id: string; label: string; inputPer1k: number; outputPer1k: number }
> = {
  HAIKU_45: {
    id: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
    label: "Claude Haiku 4.5",
    inputPer1k: 0.0008,
    outputPer1k: 0.004,
  },
  SONNET_46: {
    id: "global.anthropic.claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    inputPer1k: 0.003,
    outputPer1k: 0.015,
  },
  DEEPSEEK_R1: {
    id: "us.deepseek.r1-v1:0",
    label: "DeepSeek R1",
    inputPer1k: 0.00135,
    outputPer1k: 0.0054,
  },
  NOVA_MICRO: {
    id: "us.amazon.nova-micro-v1:0",
    label: "Amazon Nova Micro",
    inputPer1k: 0.000035,
    outputPer1k: 0.00014,
  },
  NOVA_LITE: {
    id: "us.amazon.nova-lite-v1:0",
    label: "Amazon Nova Lite",
    inputPer1k: 0.00006,
    outputPer1k: 0.00024,
  },
};

// ─── Feature → Default Model Mapping ─────────────────────────────────────────

export const FEATURE_MODEL_DEFAULTS: Record<string, string> = {
  ai_assistant: "HAIKU_45",
  receipt_scanning: "HAIKU_45",
  auto_categorization: "HAIKU_45",
  subscription_detection: "HAIKU_45",
  budget_suggestions: "HAIKU_45",
  savings_advisor: "HAIKU_45",
  bill_detection: "HAIKU_45",
  income_detection: "HAIKU_45",
  transaction_analysis: "HAIKU_45",
  support_triage: "HAIKU_45",
  kb_search: "HAIKU_45",
  admin_support_ai: "HAIKU_45",
  ai_daily_coach: "SONNET_46",
  ai_insights: "SONNET_46",
  portfolio_advisor: "SONNET_46",
  monthly_budget_email: "SONNET_46",
  autoblog: "SONNET_46",
  taxsmart_chat: "SONNET_46",
  taxsmart_proactive: "SONNET_46",
  taxsmart_analysis: "SONNET_46",
  sales_chatbot: "HAIKU_45",
  vault_extraction: "HAIKU_45",
  ai_forecast: "HAIKU_45",
};

// ─── DB Config Lookup ─────────────────────────────────────────────────────────

export async function getFeatureModel(feature: string): Promise<{
  modelId: string;
  modelKey: string;
  maxTokens: number;
  isEnabled: boolean;
}> {
  try {
    const { rows } = await pool.query(
      `SELECT model_key, max_tokens, is_enabled
         FROM ai_model_config
        WHERE feature = $1
        LIMIT 1`,
      [feature]
    );
    if (rows.length > 0) {
      const row = rows[0];
      const modelKey = row.model_key ?? "HAIKU_45";
      const model = BEDROCK_MODELS[modelKey] ?? BEDROCK_MODELS["HAIKU_45"];
      return {
        modelId: model.id,
        modelKey,
        maxTokens: row.max_tokens ?? 1000,
        isEnabled: row.is_enabled ?? true,
      };
    }
  } catch {
    // DB unavailable — fall through to code defaults
  }

  const modelKey = FEATURE_MODEL_DEFAULTS[feature] ?? "HAIKU_45";
  const model = BEDROCK_MODELS[modelKey] ?? BEDROCK_MODELS["HAIKU_45"];
  return { modelId: model.id, modelKey, maxTokens: 1000, isEnabled: true };
}

// ─── Seed Defaults ────────────────────────────────────────────────────────────

export async function seedAIModelDefaults(): Promise<void> {
  try {
    for (const [feature, modelKey] of Object.entries(FEATURE_MODEL_DEFAULTS)) {
      // Use raw SQL so this works regardless of the Drizzle schema / column type mismatch
      // between the legacy UUID primary key table and the new serial-based schema.
      // ON CONFLICT on the partial unique index (feature IS NOT NULL) handles idempotency.
      await pool.query(
        `INSERT INTO ai_model_config
           (task_slot, task_label, task_description, category, provider, model_id,
            feature, model_key, model, max_tokens, is_enabled)
         VALUES
           ($1, $1, $1, 'bedrock', 'bedrock', $2,
            $1, $2, $2, 1000, true)
         ON CONFLICT (task_slot) DO UPDATE
           SET feature    = EXCLUDED.feature,
               model_key  = EXCLUDED.model_key,
               model      = EXCLUDED.model,
               updated_at = NOW()`,
        [feature, modelKey]
      );
    }
    console.log("[Bedrock] AI model defaults seeded");
  } catch (err) {
    console.error("[Bedrock] Failed to seed AI model defaults:", err);
  }
}

// ─── Verify Connection ────────────────────────────────────────────────────────

export async function verifyBedrockConnection(): Promise<void> {
  try {
    await bedrockChat({
      feature: "ai_assistant",
      messages: [{ role: "user", content: "ping" }],
      maxTokens: 10,
    });
    console.log("[Bedrock] Connection verified ✓");
  } catch (err) {
    console.warn("[Bedrock] Connection check failed:", err);
  }
}

// ─── Core Chat Function ───────────────────────────────────────────────────────

export interface BedrockMessage {
  role: "user" | "assistant";
  content:
    | string
    | Array<{ type: string; text?: string; source?: Record<string, unknown> }>;
}

export interface BedrockChatOptions {
  feature: string;
  messages: BedrockMessage[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
  /** Override the model key (bypasses DB lookup) */
  modelKeyOverride?: string;
}

export async function bedrockChat(opts: BedrockChatOptions): Promise<string> {
  const { feature, messages, system, temperature = 0.5, modelKeyOverride } =
    opts;

  const config = await getFeatureModel(feature);
  const modelKey = modelKeyOverride ?? config.modelKey;
  const model = BEDROCK_MODELS[modelKey] ?? BEDROCK_MODELS["HAIKU_45"];
  const maxTokens = opts.maxTokens ?? config.maxTokens;

  const isNova = model.id.includes("nova");
  const isDeepSeek = model.id.includes("deepseek");

  let body: Record<string, unknown>;

  if (isNova) {
    body = {
      messages,
      inferenceConfig: { max_new_tokens: maxTokens, temperature },
      ...(system ? { system: [{ text: system }] } : {}),
    };
  } else if (isDeepSeek) {
    body = {
      messages: system
        ? [{ role: "system", content: system }, ...messages]
        : messages,
      max_tokens: maxTokens,
      temperature,
    };
  } else {
    // Anthropic Claude via Bedrock
    body = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: maxTokens,
      temperature,
      messages,
      ...(system ? { system } : {}),
    };
  }

  const start = Date.now();

  const command = new InvokeModelCommand({
    modelId: model.id,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(body),
  });

  const response = await bedrockClient.send(command);
  const decoded = JSON.parse(new TextDecoder().decode(response.body));

  const latency = Date.now() - start;
  console.log(
    `[Bedrock] feature=${feature} model=${model.label} latency=${latency}ms`
  );

  // Parse response based on model family
  if (isNova) {
    return decoded?.output?.message?.content?.[0]?.text ?? "";
  } else if (isDeepSeek) {
    return decoded?.choices?.[0]?.message?.content ?? "";
  } else {
    // Anthropic Claude
    return decoded?.content?.[0]?.text ?? "";
  }
}

// ─── Vision Function ──────────────────────────────────────────────────────────

export interface BedrockVisionOptions {
  feature: string;
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  prompt: string;
  maxTokens?: number;
}

export async function bedrockVision(
  opts: BedrockVisionOptions
): Promise<string> {
  const { feature, imageBase64, mediaType, prompt, maxTokens = 1000 } = opts;

  const config = await getFeatureModel(feature);
  // Vision always uses a Claude model
  const modelKey =
    config.modelKey === "NOVA_MICRO" || config.modelKey === "NOVA_LITE"
      ? "HAIKU_45"
      : config.modelKey;
  const model = BEDROCK_MODELS[modelKey] ?? BEDROCK_MODELS["HAIKU_45"];

  const body = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: maxTokens,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: imageBase64,
            },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  };

  const start = Date.now();

  const command = new InvokeModelCommand({
    modelId: model.id,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(body),
  });

  const response = await bedrockClient.send(command);
  const decoded = JSON.parse(new TextDecoder().decode(response.body));

  const latency = Date.now() - start;
  console.log(
    `[Bedrock] vision feature=${feature} model=${model.label} latency=${latency}ms`
  );

  return decoded?.content?.[0]?.text ?? "";
}

// ─── Streaming Function ───────────────────────────────────────────────────────

export async function bedrockStream(
  opts: BedrockChatOptions,
  onChunk: (text: string) => void
): Promise<void> {
  const { feature, messages, system, temperature = 0.5 } = opts;

  const config = await getFeatureModel(feature);
  const model = BEDROCK_MODELS[config.modelKey] ?? BEDROCK_MODELS["HAIKU_45"];
  const maxTokens = opts.maxTokens ?? config.maxTokens;

  const body = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: maxTokens,
    temperature,
    messages,
    ...(system ? { system } : {}),
  };

  const command = new InvokeModelWithResponseStreamCommand({
    modelId: model.id,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(body),
  });

  const response = await bedrockClient.send(command);

  if (response.body) {
    for await (const event of response.body) {
      if (event.chunk?.bytes) {
        const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
        if (chunk.type === "content_block_delta" && chunk.delta?.text) {
          onChunk(chunk.delta.text);
        }
      }
    }
  }
}
