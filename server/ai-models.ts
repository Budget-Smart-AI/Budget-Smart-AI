export interface ModelDefinition {
  provider: 'deepseek' | 'openai';
  modelId: string;
  displayName: string;
  description: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
  supportsReasoning: boolean;
  contextWindow: number;
  recommended: boolean;
  badge?: string;
  bestFor: string[];
}

export const MODEL_REGISTRY: ModelDefinition[] = [
  {
    provider: 'deepseek',
    modelId: 'deepseek-chat',
    displayName: 'Deepseek V3',
    description: 'Fast, capable. Best for extraction, summarization and chat.',
    inputCostPer1M: 0.27,
    outputCostPer1M: 1.10,
    supportsReasoning: false,
    contextWindow: 64000,
    recommended: true,
    badge: 'Best Value',
    bestFor: [
      'chat_assistant', 'chat_fullscreen', 'vault_ai', 'receipt_analysis',
      'detection_auto', 'ai_coach', 'anomaly_detection', 'support_assistant',
    ],
  },
  {
    provider: 'deepseek',
    modelId: 'deepseek-reasoner',
    displayName: 'Deepseek R1',
    description: 'Advanced reasoning for complex financial analysis.',
    inputCostPer1M: 0.55,
    outputCostPer1M: 2.19,
    supportsReasoning: true,
    contextWindow: 64000,
    recommended: false,
    badge: 'Best Reasoning',
    bestFor: ['planning_advisor', 'anomaly_detection'],
  },
  {
    provider: 'openai',
    modelId: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    description: 'Affordable OpenAI model for classification and extraction.',
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
    supportsReasoning: false,
    contextWindow: 128000,
    recommended: false,
    badge: 'Lowest Cost',
    bestFor: ['receipt_analysis', 'detection_auto', 'ai_coach', 'support_assistant'],
  },
  {
    provider: 'openai',
    modelId: 'gpt-4o',
    displayName: 'GPT-4o',
    description: 'OpenAI flagship for complex reasoning and nuanced responses.',
    inputCostPer1M: 2.50,
    outputCostPer1M: 10.00,
    supportsReasoning: false,
    contextWindow: 128000,
    recommended: false,
    badge: 'Highest Quality',
    bestFor: ['planning_advisor', 'chat_fullscreen', 'vault_ai'],
  },
  {
    provider: 'openai',
    modelId: 'o1-mini',
    displayName: 'OpenAI o1 Mini',
    description: 'OpenAI reasoning for financial planning and calculations.',
    inputCostPer1M: 1.10,
    outputCostPer1M: 4.40,
    supportsReasoning: true,
    contextWindow: 128000,
    recommended: false,
    badge: 'OpenAI Reasoning',
    bestFor: ['planning_advisor', 'anomaly_detection'],
  },
];

export function getModelDefinition(
  provider: string,
  modelId: string,
): ModelDefinition | undefined {
  return MODEL_REGISTRY.find(m => m.provider === provider && m.modelId === modelId);
}

export function calculateCost(
  provider: string,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const model = getModelDefinition(provider, modelId);
  if (!model) return 0;
  return (inputTokens / 1_000_000) * model.inputCostPer1M
    + (outputTokens / 1_000_000) * model.outputCostPer1M;
}

export function getRecommendedModels(taskSlot: string): ModelDefinition[] {
  return MODEL_REGISTRY.filter(m => m.bestFor.includes(taskSlot));
}
