import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { error, serverError, success, unauthorized } from '@/lib/response';
import { getFoodRecognitionClient, logAiCall } from '@/lib/ai/client';
import { buildPortionOptions, type PortionType } from '@/lib/ingredient-nutrition';
import { scaleNutrition } from '@/lib/nutrition-engine';
import type { MealLogDraft, MealSlot } from '@/lib/meal-log-draft';

const PROMPT = `Extract only meal facts from a spoken meal description. Return JSON only:
{"mealType":"breakfast|lunch|dinner|snack|null","items":[{"foodName":"string","quantity":number|null,"unit":"piece|plate|bowl|glass|cup|serving|grams|ml|small|medium|large|null","portionSpecified":boolean}]}
Rules: split separate foods; preserve an explicitly stated quantity and unit; use null and false when no portion was stated. Never infer a portion. Never return calories, nutrition, ingredients, or explanations.`;

const classify = (name: string): PortionType => {
  const n = name.toLowerCase();
  if (/juice|milk|tea|coffee|chai|smoothie|lassi|shake|buttermilk|chaas/.test(n)) return 'drink';
  if (/curry|dal|dhal|sambar|rasam|gravy|stew|sabzi|korma|rajma|chana|soup/.test(n)) return 'bowl';
  if (/idli|dosa|chapati|chappati|roti|paratha|naan|egg|omelette|banana|samosa|vada|pakora|bread/.test(n)) return 'piece';
  if (/biryani|fried rice|pulao|khichdi|noodle|pasta|pizza|burger/.test(n)) return 'portion';
  return 'weight';
};

const nutritionValues = (n: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number | null; sugarG: number | null; sodiumMg: number | null; calciumMg: number | null; ironMg: number | null; zincMg: number | null; magnesiumMg: number | null; cholesterolMg: number | null }) => ({
  calories: n.calories, proteinG: n.proteinG, carbsG: n.carbsG, fatG: n.fatG, fiberG: n.fiberG ?? 0, sugarG: n.sugarG ?? 0, sodiumMg: n.sodiumMg ?? 0, calciumMg: n.calciumMg ?? 0, ironMg: n.ironMg ?? 0, zincMg: n.zincMg ?? 0, magnesiumMg: n.magnesiumMg ?? 0, cholesterolMg: n.cholesterolMg ?? 0,
});

const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

// A small, conservative offline fallback for when the configured local AI
// server is not running. It extracts only facts explicitly spoken by the user.
function fallbackDraft(text: string): MealLogDraft {
  const lower = text.toLowerCase().replace(/[.,!]/g, ' ').replace(/\s+/g, ' ').trim();
  const mealType = (['breakfast', 'lunch', 'dinner', 'snack'] as MealSlot[]).find((slot) => new RegExp(`\\b${slot}\\b`).test(lower));
  const withoutContext = lower.replace(/\b(i (ate|had|consumed)|for (breakfast|lunch|dinner|snack)|at (breakfast|lunch|dinner|snack))\b/g, ' ').replace(/\s+/g, ' ').trim();
  const items = withoutContext.split(/\s+(?:and|with)\s+|\s*,\s*/).map((part) => {
    const match = part.trim().match(/^(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(pieces?|plates?|bowls?|glasses?|cups?|servings?|grams?|g|ml)?\s*(?:of\s+)?(.+)$/);
    if (!match) return { foodName: part.trim(), quantity: null, unit: null, portionSpecified: false };
    const quantity = Number(match[1]) || NUMBER_WORDS[match[1]] || null;
    const foodName = match[3].trim();
    // Do not treat a leading article as a stated portion unless a unit followed it.
    const hasExplicitAmount = /^\d/.test(match[1]) || !!match[2];
    return { foodName, quantity: hasExplicitAmount ? quantity : null, unit: match[2]?.replace(/s$/, '') || null, portionSpecified: hasExplicitAmount };
  }).filter((item) => item.foodName.length > 0);
  return { source: 'voice', mealType, items };
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let userId: string | undefined;
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();
    userId = session.userId;
    const body = await request.json() as { text?: unknown };
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > 1000) return error('Please provide a meal description under 1,000 characters.');
    let parsed: Partial<MealLogDraft>;
    let parser: 'ai' | 'fallback' = 'ai';
    try {
      const raw = await getFoodRecognitionClient().chat({ system: PROMPT, user: text, temperature: 0 });
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('AI did not return JSON');
      parsed = JSON.parse(match[0]) as Partial<MealLogDraft>;
    } catch (aiError) {
      console.warn('Voice meal AI unavailable; using explicit-text fallback:', aiError);
      parsed = fallbackDraft(text);
      parser = 'fallback';
    }
    const validSlots: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
    const draft: MealLogDraft = {
      source: 'voice',
      mealType: validSlots.includes(parsed.mealType as MealSlot) ? parsed.mealType as MealSlot : undefined,
      items: Array.isArray(parsed.items) ? parsed.items.filter((item): item is MealLogDraft['items'][number] => !!item && typeof item.foodName === 'string' && item.foodName.trim().length > 0).slice(0, 8).map((item) => ({ foodName: item.foodName.trim(), quantity: Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0 ? Number(item.quantity) : null, unit: typeof item.unit === 'string' ? item.unit.toLowerCase() : null, portionSpecified: item.portionSpecified === true })) : [],
    };
    if (!draft.items.length) return error('No foods were found in that description.', 422);
    const meals = await db.meal.findMany({ where: { isActive: true }, include: { nutrition: true, servings: true, aliases: true } });
    const foods = draft.items.map((item) => {
      const query = item.foodName.toLowerCase();
      const meal = meals.find((m) => m.name.toLowerCase() === query || m.aliases.some((a) => a.aliasName.toLowerCase() === query)) ?? meals.find((m) => m.name.toLowerCase().includes(query) || query.includes(m.name.toLowerCase()) || m.aliases.some((a) => a.aliasName.toLowerCase().includes(query)));
      const portionType = classify(item.foodName);
      const base = meal?.baseServingGms || (portionType === 'piece' ? 80 : portionType === 'drink' ? 250 : 200);
      const unit = item.unit;
      const isPieces = portionType === 'piece' && (unit === 'piece' || unit === 'pieces' || !unit);
      const selected = item.portionSpecified && item.quantity ? (isPieces ? item.quantity : unit === 'grams' || unit === 'g' || unit === 'ml' ? item.quantity : base) : (portionType === 'piece' ? 1 : base);
      const gramsPerPiece = portionType === 'piece' ? Math.max(10, Math.round(base)) : null;
      const totalGrams = isPieces ? selected * (gramsPerPiece || 80) : selected;
      return { name: meal?.name || item.foodName, servingDescription: item.portionSpecified && item.quantity ? `${item.quantity} ${item.unit || ''}`.trim() : '', portionType, estimatedGrams: portionType === 'drink' ? null : totalGrams, estimatedMl: portionType === 'drink' ? totalGrams : null, estimatedPieces: portionType === 'piece' ? selected : null, gramsPerPiece, totalGrams, confidence: meal ? 1 : 0.6, needsConfirmation: true, variants: [], nutritionSource: meal ? 'meal' : 'extracted', portionOptions: buildPortionOptions(portionType, portionType === 'piece' ? selected : totalGrams), estimatedNutrition: meal?.nutrition ? scaleNutrition(nutritionValues(meal.nutrition), totalGrams) : null, ingredients: [], matched: !!meal, unknown_food: !meal, meal: meal || null, mealId: meal?.id || null, newFoodId: null };
    });
    await logAiCall({ userId, modelType: 'voice-meal-parse', requestPayload: JSON.stringify({ text }), responsePayload: JSON.stringify(draft), latencyMs: Date.now() - startedAt });
    return success({ draft, foods, parser });
  } catch (cause) {
    console.error('Voice meal parse error:', cause);
    return serverError('Unable to process your meal description. Please try again.');
  }
}
