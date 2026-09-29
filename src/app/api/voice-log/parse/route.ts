import { getSessionFromRequest } from '@/lib/auth';
import { error, serverError, success, unauthorized } from '@/lib/response';
import { extractRecipeIngredients, getFoodRecognitionClient, logAiCall } from '@/lib/ai/client';
import { checkAiRateLimit } from '@/lib/ai/rate-limiter';
import { classifyMeasurementType, resolveRecognizedFoods } from '@/lib/food-resolution';
import type { AIFood } from '@/lib/food-resolution';
import type { MealLogDraft, MealSlot } from '@/lib/meal-log-draft';

// Voice is only an ALTERNATIVE INPUT. The transcript is fed to the same
// food-recognition model (Gemma 3 4B) used for photos, just text-only. The
// normalized result then reuses the SAME shared food-resolution engine, DB
// matching, Nutrition DB, portion flow, nutrition calculation, confirmation
// and meal-logging workflow as photo recognition.
//
// Because the input is VOICE-TO-TEXT, the food-understanding step must expect
// and correct transcription errors, using food context to recover the user's
// INTENDED food (e.g. "italy and amber for breakfast" → idli + sambar)
// instead of blindly logging the literal misrecognized words.
const PROMPT = `You convert what a user SAYS about a meal into structured meal facts. The input is the output of automatic speech recognition (voice-to-text), so it may contain transcription errors: wrong words, misspellings, mis-heard words, missing punctuation, and run-together words.

Your job: extract the user's INTENDED foods and beverages, quantities, portions, and meal context (breakfast/lunch/dinner/snack).

Handle transcription errors:
- Treat every input as spoken-language text. Expect and tolerate spelling, word, and pronunciation errors.
- Focus on food/beverage names, quantities, portions, and meal context.
- Identify the dish the user ACTUALLY said. Keep local and regional dish names as recognized ("puttu", "kadala", "puttu kadala", "pongal", "upma"). NEVER output a food the user did not say, even if it seems common or likely to exist in a nutrition database.
- Food understanding is INDEPENDENT of any nutrition database: the DB is searched only after this step, so never change a food to guess what might "match" a database. Do not "correct" an uncommon but plausible dish into a different, more common one.
- Only fix a word that is clearly a mis-heard food on its own: Example: "I ate italy and amber for breakfast." most likely means "I ate idli and sambar for breakfast." When the spoken word is a plausible dish, keep it and simply lower "confidence".
- Correct obvious speech-to-text mistakes when the intended food is clear from context, but stay CONSERVATIVE: only correct words that are clearly food/beverage items; never invent foods that were not spoken.
- Preserve the user's intended food rather than the literal transcription when the context clearly supports the correction.
- Keep a compound dish intact: do not break "banana chips" into two foods just because one of its words also resembles a standalone food.
- Capture ONLY quantities and portions the user actually stated; never invent them ("two eggs" -> quantity 2, "one bowl of sambar" -> unit "bowl").
- Do NOT provide, calculate, or invent calories, macros, or any nutritional values.

Return ONLY JSON, no markdown, no code fences, no commentary:
{"mealType":"breakfast|lunch|dinner|snack|null","items":[{"foodName":"string","quantity":number|null,"unit":"piece|plate|bowl|glass|cup|serving|grams|ml|null","portionSpecified":boolean,"portionType":"piece|glass|plate|bowl|grams|ml|null","confidence":0.0-1.0}]}

Rules:
- "mealType" is one of breakfast|lunch|dinner|snack, or null if no meal slot was spoken.
- Split foods into SEPARATE items ONLY when they are clearly two dishes joined by a connector such as "and", "with", or a comma (e.g. "idli and sambar" becomes two items).
- A multi-word name that is a SINGLE dish is ONE item, never split into its words: "banana chips", "chicken biryani", "masala dosa", "potato curry" are each one item, not "banana"+"chips".
- When a phrase could be read as either one dish or a list, prefer the ONE combined item.
- "foodName" is the corrected, plain food name ONLY (no adjectives, sauces, or extra words, no embedded quantities or counts). "two eggs" -> foodName "eggs", quantity 2, unit "piece".
- For countable foods (egg, idli, dosa, roti, chapati, naan, banana, samosa, vada, paratha, bread, etc.) always set quantity to the spoken count and unit to "piece".
- "portionType" is the NATURAL way that food is portioned, chosen from food knowledge and independent of whether an amount was spoken:
  * countable pieces (idli, chapati, porotta, dosa, egg, banana, samosa, roti) -> "piece"
  * gram-based or snack foods (banana chips, chips, nuts, muesli, granola, namkeen, wafers, any food weighed in grams) -> "grams"
  * liquids (milk, juice, tea, coffee, water, lassi, smoothie) -> "glass"
  * meal plates (biryani, rice, pulao, noodles, pasta, thali, fried rice) -> "plate"
  * curries and side dishes (curry, sambar, dal, sabzi, stew, soup, rasam) -> "bowl"
  * "ml" only when the user stated a millilitre amount; null when genuinely ambiguous.
- Express a stated portion in the matching unit: "one bowl of sambar" -> quantity 1, unit "bowl", portionType "bowl"; "two glasses of milk" -> quantity 2, unit "glass", portionType "glass"; "50 grams of banana chips" -> quantity 50, unit "grams", portionType "grams".
- In "banana chips" with no amount: quantity null, unit null, portionSpecified false, portionType "grams".
- "portionSpecified" is true only when the user actually stated an amount/portion, false otherwise.
- "confidence" is how sure you are of the interpreted food name AFTER error correction (0.0 to 1.0; higher = more certain).`;

const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

// Safety net: if the model bundled a spoken count into foodName ("2 eggs",
// "two eggs"), strip only the leading count so the portion stays separate.
function stripLeadingCount(name: string): string {
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  const m = lower.match(/^(?:\d+(?:\.\d+)?|\d+\s+x\s*|\+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:of\s+)?(.+)$/);
  if (!m) return trimmed;
  return trimmed.slice(trimmed.length - m[1].length).trim();
}

const titleCase = (name: string): string => {
  const s = name.trim();
  return s.length > 1 ? s.charAt(0).toUpperCase() + s.slice(1) : s.toUpperCase();
};

// A small, conservative offline fallback for when the configured local AI
// server is not running. It extracts only facts explicitly spoken by the user
// and still feeds the SAME shared food-resolution engine as the AI path.
function fallbackDraft(text: string): MealLogDraft {
  const lower = text.toLowerCase().replace(/[.,!]/g, ' ').replace(/\s+/g, ' ').trim();
  const mealType = (['breakfast', 'lunch', 'dinner', 'snack'] as MealSlot[]).find((slot) => new RegExp(`\\b${slot}\\b`).test(lower));
  const withoutContext = lower.replace(/\b(i (ate|had|consumed)|for (breakfast|lunch|dinner|snack)|at (breakfast|lunch|dinner|snack))\b/g, ' ').replace(/\s+/g, ' ').trim();
  const items = withoutContext.split(/\s+(?:and|with)\s+|\s*,\s*/).map((part) => {
    const match = part.trim().match(/^(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(pieces?|plates?|bowls?|glasses?|cups?|servings?|grams?|g|ml)?\s*(?:of\s+)?(.+)$/);
    if (!match) return { foodName: part.trim(), quantity: null, unit: null, portionSpecified: false };
    const quantity = Number(match[1]) || NUMBER_WORDS[match[1]] || null;
    const foodName = match[3].trim();
    // Any spoken count (digit, number word ≥ one, "a plate", "two idlis") is a
    // stated portion; a bare leading article ("a", "an") alone is not treated
    // as a portion (piece foods still default to 1 piece on their own).
    const hasExplicitAmount = /^\d/.test(match[1]) || (NUMBER_WORDS[match[1]] ?? 0) > 1 || match[1] === 'one' || !!match[2];
    return { foodName, quantity: hasExplicitAmount ? quantity : null, unit: match[2]?.replace(/s$/, '') || null, portionSpecified: hasExplicitAmount };
  }).filter((item) => item.foodName.length > 0);
  return { source: 'voice', mealType, items };
}

// Convert a normalized voice draft item into the AIFood shape the SHARED
// resolver expects. The food knowledge from the model (portionType) drives the
// measurement type; the user's spoken amount sets the estimate so the matching
// portion option is the default. All matching/nutrition/calculation logic lives
// in the shared engine.
function draftItemToFood(item: MealLogDraft['items'][number]): AIFood {
  const foodName = stripLeadingCount(item.foodName).trim();
  const q = Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0 ? Number(item.quantity) : null;
  const unit = (item.unit || '').toLowerCase();

  const aiType = item.portionType || null;
  const measurementType =
    aiType === 'piece' || aiType === 'bowl'
      ? aiType
      : aiType === 'glass'
        ? 'drink'
        : aiType === 'plate'
          ? 'portion'
          : aiType === 'grams' || aiType === 'ml'
            ? 'weight'
            : classifyMeasurementType(foodName);
  const gramsLike = unit === 'g' || unit === 'gm' || unit === 'gram' || unit === 'grams';
  const displayUnit = measurementType === 'piece' && !gramsLike && unit !== 'ml' ? 'pc' : unit;

  const food: AIFood = {
    name: titleCase(foodName),
    serving_description: item.portionSpecified && q ? `${q} ${displayUnit}`.trim() : '',
    measurement_type: measurementType,
    needs_confirmation: true,
    variants: [],
    confidence: typeof item.confidence === 'number' ? Math.min(1, Math.max(0, item.confidence)) : 0.9,
  };

  if (measurementType === 'piece') {
    food.estimated_pieces = Math.max(1, Math.round(q ?? 1));
  } else if (measurementType === 'drink') {
    // Glass estimate: 1 glass ≈ 250ml; an explicit ml amount is used as-is.
    food.estimated_ml = q ? Math.max(1, Math.round(unit === 'ml' ? q : q * 250)) : 250;
  } else if (measurementType === 'portion' || measurementType === 'bowl') {
    // A stated plate/bowl ≈ 200g ("two bowls of curry" starts at 400g).
    food.estimated_grams = Math.max(100, Math.round((q ?? 1) * 200));
  } else if (q) {
    // weight: grams (or ml ≈ g) the user stated.
    food.estimated_grams = Math.max(1, Math.round(q));
  }
  return food;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let userId: string | undefined;
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();
    userId = session.userId;
    const rl = checkAiRateLimit(session.userId, 'voice-log');
    if (!rl.allowed) return error('Too many voice requests. Please try again shortly.', 429, 'RATE_LIMIT_EXCEEDED');
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
      items: Array.isArray(parsed.items) ? parsed.items.filter((item): item is MealLogDraft['items'][number] => !!item && typeof item.foodName === 'string' && item.foodName.trim().length > 0).slice(0, 8).map((item) => {
        const quantity = Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0 ? Number(item.quantity) : null;
        return { foodName: stripLeadingCount(item.foodName), quantity, unit: typeof item.unit === 'string' ? item.unit.toLowerCase() : null, portionSpecified: item.portionSpecified === true || quantity != null, confidence: typeof item.confidence === 'number' ? item.confidence : undefined, portionType: item.portionType === 'piece' || item.portionType === 'glass' || item.portionType === 'plate' || item.portionType === 'bowl' || item.portionType === 'grams' || item.portionType === 'ml' ? item.portionType : undefined };
      }) : [],
    };
    if (!draft.items.length) return error('No foods were found in that description.', 422);

    // Everything after this point is the EXISTING food-recognition workflow:
    // the same DB matching, stored new-food reuse, ingredient composition,
    // portion options, and nutrition calculation used by photo recognition.
    // The AI never computes nutrition — DB foods are scaled with scaleNutrition
    // and unknown foods are composed locally from the Ingredient table via the
    // existing AI fallback (recipe ingredients → local nutrition).
    const foods = await resolveRecognizedFoods({
      foods: draft.items.map(draftItemToFood),
      naturalPortions: true,
      exactMatchOnly: true,
      onUnknownFoodIngredients: async (food) => {
        try {
          const extracted = await extractRecipeIngredients({
            foodName: food.name,
            servingDescription: food.serving_description,
          });
          return extracted.map((i) => ({ name: i.name, grams: Math.max(1, i.grams || 0) }));
        } catch {
          return [];
        }
      },
    });

    await logAiCall({ userId, modelType: 'voice-meal-parse', requestPayload: JSON.stringify({ text }), responsePayload: JSON.stringify(draft), latencyMs: Date.now() - startedAt });
    return success({ draft, foods, parser });
  } catch (cause) {
    console.error('Voice meal parse error:', cause);
    return serverError('Unable to process your meal description. Please try again.');
  }
}