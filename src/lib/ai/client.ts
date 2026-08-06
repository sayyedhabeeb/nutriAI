import { db } from '@/lib/db';

// ═══ AI Client Abstraction ═══
// Lightweight OpenAI-compatible client (works with LM Studio / Ollama / any
// OpenAI-compatible endpoint). Two purpose-specific clients are exposed so the
// food-recognition and recommendation models can later point at different
// servers/models without changing the calling routes.

export interface AIClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

export interface AIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIClient {
  chat(params: {
    system?: string;
    user: string;
    model?: string;
  }): Promise<string>;
  vision(params: {
    system?: string;
    user: string;
    imageBase64: string;
    mimeType: string;
    model?: string;
  }): Promise<string>;
}

interface OpenAIResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
}

function extractContent(data: unknown): string {
  const r = data as OpenAIResponse;
  return r?.choices?.[0]?.message?.content ?? '';
}

async function postCompletion(
  baseUrl: string,
  apiKey: string,
  body: unknown,
  timeoutMs: number
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `AI request failed (${res.status} ${res.statusText}): ${text.slice(0, 300)}`
      );
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export function createAIClient(config: AIClientConfig): AIClient {
  const timeoutMs = config.timeoutMs ?? 90_000;

  return {
    async chat({ system, user, model }) {
      const data = await postCompletion(
        config.baseUrl,
        config.apiKey,
        {
          model: model ?? config.model,
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            { role: 'user', content: user },
          ],
        },
        timeoutMs
      );
      const content = extractContent(data);
      if (!content) throw new Error('Empty AI response');
      return content.trim();
    },

    async vision({ system, user, imageBase64, mimeType, model }) {
      const data = await postCompletion(
        config.baseUrl,
        config.apiKey,
        {
          model: model ?? config.model,
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            {
              role: 'user',
              content: [
                { type: 'text', text: user },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${imageBase64}`,
                  },
                },
              ],
            },
          ],
        },
        timeoutMs
      );
      const content = extractContent(data);
      if (!content) throw new Error('Empty AI vision response');
      return content.trim();
    },
  };
}

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

// AI #1: Food recognition (image → food + portion + confirmation variants)
export function getFoodRecognitionClient(): AIClient {
  return createAIClient({
    baseUrl: env('FOOD_AI_BASE_URL', 'http://localhost:1234/v1'),
    apiKey: env('FOOD_AI_API_KEY', 'lm-studio'),
    model: env('FOOD_AI_MODEL', 'gemma-3-4b-it-qat'),
    timeoutMs: envInt('FOOD_AI_TIMEOUT_MS', 120_000),
  });
}

// AI #2: Meal recommendations / chat / daily summary
export function getRecommendationClient(): AIClient {
  return createAIClient({
    baseUrl: env('RECO_AI_BASE_URL', 'http://localhost:1234/v1'),
    apiKey: env('RECO_AI_API_KEY', 'lm-studio'),
    model: env('RECO_AI_MODEL', 'gemma-3-4b-it-qat'),
    timeoutMs: envInt('RECO_AI_TIMEOUT_MS', 120_000),
  });
}

// ═══ AI Call Logging ═══
// Persists each AI call to the AiLog table for monitoring/cost analysis.
export interface AiLogInput {
  userId?: string;
  modelType: string;
  requestPayload?: string;
  responsePayload?: string;
  latencyMs?: number;
  tokensUsed?: number;
  costUsd?: number;
}

export async function logAiCall(input: AiLogInput): Promise<void> {
  try {
    await db.aiLog.create({ data: input });
  } catch {
    // Logging must never break the main request flow
  }
}
