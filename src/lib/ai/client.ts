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
    temperature?: number;
    timeoutMs?: number;
  }): Promise<string>;
  vision(params: {
    system?: string;
    user: string;
    imageBase64: string;
    mimeType: string;
    model?: string;
    temperature?: number;
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
    async chat({ system, user, model, temperature, timeoutMs: callTimeoutMs }) {
      const data = await postCompletion(
        config.baseUrl,
        config.apiKey,
        {
          model: model ?? config.model,
          temperature: temperature ?? 0,
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            { role: 'user', content: user },
          ],
        },
        callTimeoutMs ?? timeoutMs
      );
      const content = extractContent(data);
      if (!content) throw new Error('Empty AI response');
      return content.trim();
    },

    async vision({ system, user, imageBase64, mimeType, model, temperature }) {
      const data = await postCompletion(
        config.baseUrl,
        config.apiKey,
        {
          model: model ?? config.model,
          temperature: temperature ?? 0,
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

// ═══ AI Food-Presence Classifier (strict pre-validation) ═══
// Runs BEFORE food recognition. Its only job is to answer whether the image
// contains a real, edible food/drink item that is physically visible. Text,
// labels, words, drawings, or handwriting never count. Fails closed: any
// ambiguous/unparseable answer is treated as "no food detected".

const FOOD_PRESENCE_SYSTEM = `You are a strict food detection system. Your ONLY task is to decide whether the image contains a real, edible food or drink item that is PHYSICALLY VISIBLE in the photo.

You must COMPLETELY IGNORE:
- Any text, words, handwriting, labels, menus, recipe cards, papers, documents, or screens.
- Drawings, illustrations, logos, or any written/pictorial representation of food.
A paper that only has the word "Chapathi" written on it is NOT food, because no actual food is visible.

"food_present" is true ONLY when you can actually SEE a real edible item, such as: a meal, a plate of food, a dish, a snack, a fruit, a vegetable, bread, rice, a curry, or a beverage in a cup/glass.

Return ONLY one of these two JSON objects, no markdown, no code fences, no commentary:
{"food_present": true}
or
{"food_present": false}`;

export async function detectFoodPresence(opts: {
  imageBase64: string;
  mimeType: string;
}): Promise<boolean> {
  const ai = getFoodRecognitionClient();
  const content = await ai.vision({
    system: FOOD_PRESENCE_SYSTEM,
    user: 'Analyze this image and answer whether a real, edible food or drink item is physically visible.',
    imageBase64: opts.imageBase64,
    mimeType: opts.mimeType,
    temperature: 0,
  });

  let present = false;
  try {
    const jsonMatch = content.match(/\{[^{}]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      present = parsed?.food_present === true;
    }
  } catch {
    present = false;
  }

  await logAiCall({
    modelType: 'food-presence',
    requestPayload: JSON.stringify({ mimeType: opts.mimeType }).slice(0, 500),
    responsePayload: JSON.stringify({ food_present: present, raw: content.slice(0, 500) }),
  });

  return present;
}

// ═══ AI Ingredient Extraction (fallback for foods not in the DB) ═══
// The vision model only identifies the dish + portion. When the confirmed food
// is NOT in the database, this second (text) call asks the model for the
// dish's recipe ingredients with quantities. It MUST NOT return any macros —
// the backend always computes nutrition itself from the Ingredient table.

export interface ExtractedIngredient {
  name: string;
  grams: number;
}

const INGREDIENT_EXTRACTION_SYSTEM = `You are an expert nutrition assistant specializing in global and South Asian cuisine. Your ONLY job is to list the recipe ingredients of a dish so the backend can compute its nutrition. You never provide calories, macros, or any nutritional values.

Return ONLY a JSON object, no markdown, no code fences, no commentary:
{
  "ingredients": [
    { "name": "Basmati Rice", "grams": 180 },
    { "name": "Chicken Breast", "grams": 80 }
  ]
}

Rules:
- Include the main ingredients (at least 3, at most 12): grains/rice/bread, protein, vegetables, dairy, and any significant oil/ghee/sugar.
- "grams" is the approximate weight of that ingredient as consumed in the dish (cooked weight for cooked items).
- Use simple common names (e.g. "Basmati Rice", "Chicken", "Onions", "Tomatoes", "Paneer", "Cooking Oil", "Toor Dal", "Milk").
- NEVER use vague placeholder ingredient names. "Meat", "Vegetables", "Mixed Vegetables", "Greens", "Spices", "Herbs", "Curry", "Gravy", "Sauce" and similar generic categories are FORBIDDEN — always name the specific ingredient (e.g. "Chicken", "Potatoes", "Spinach", "Cumin", "Curry Leaves", "Tomato Gravy").
- Ignore trace seasoning unless it meaningfully contributes (e.g. omit a pinch of salt).
- NEVER include calories, protein, carbs, fat, or any other nutritional values.
- NEVER include "water".`;

export async function extractRecipeIngredients(opts: {
  foodName: string;
  servingDescription?: string;
}): Promise<ExtractedIngredient[]> {
  const ai = getFoodRecognitionClient();
  const user = `Dish: "${opts.foodName}"${opts.servingDescription ? ` (served as: ${opts.servingDescription})` : ''}\n\nReturn the ingredient JSON now.`;
  const content = await ai.chat({
    system: INGREDIENT_EXTRACTION_SYSTEM,
    user,
  });

  let ingredients: ExtractedIngredient[] = [];
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const list = Array.isArray(parsed) ? parsed : parsed?.ingredients;
      if (Array.isArray(list)) {
        ingredients = list
          .filter(
            (i): i is ExtractedIngredient =>
              !!i &&
              typeof i.name === 'string' &&
              i.name.trim().length > 0 &&
              Number.isFinite(Number(i.grams)) &&
              Number(i.grams) > 0
          )
          .map((i) => ({ name: i.name.trim(), grams: Math.round(Number(i.grams)) }))
          .slice(0, 12);
      }
    }
  } catch {
    ingredients = [];
  }

  await logAiCall({
    modelType: 'ingredient-extraction',
    requestPayload: JSON.stringify({ foodName: opts.foodName, servingDescription: opts.servingDescription }),
    responsePayload: JSON.stringify(ingredients).slice(0, 4000),
  });

  return ingredients;
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
