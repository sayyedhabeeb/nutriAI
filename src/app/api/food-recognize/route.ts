import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getSessionFromRequest } from '@/lib/auth';
import { created, unauthorized, serverError, error } from '@/lib/response';
import { getFoodRecognitionClient, detectFoodPresence, logAiCall } from '@/lib/ai/client';
import { checkAiRateLimit } from '@/lib/ai/rate-limiter';
import { computePayloadHash, executeIdempotent } from '@/lib/ai/idempotency';
import { resolveRecognizedFoods, type AIResponse } from '@/lib/food-resolution';
import { splitFoodNames } from '@/lib/food-names';

const VISION_PROMPT = `You are a food recognition assistant for a nutrition tracking app. Analyze the image carefully.

STEP 1 — FOOD PRESENCE. Decide whether the image actually contains an edible food or drink item that is physically visible.
- "food_detected" is true ONLY when a real, edible food/drink item is visible in the image (a meal, dish, snack, fruit, vegetable, beverage, etc.).
- Visible text, words, labels, packaging, menus, recipe cards, papers, documents, screens, or any other writing do NOT count as food. An image that only shows the word "Chapathi" on paper is NOT food.
- If the image shows only text, an object, a person, scenery, or anything non-edible, set "food_detected" to false.
- Never guess a food from context, titles, or words visible in the image. Only what you can SEE as edible food/drink counts.

When "food_detected" is TRUE, also decide the food's MEASUREMENT TYPE based on how people naturally measure and consume it:
- "piece" — individually countable foods: idli, dosa, chapati, roti, paratha, naan, bread, toast, eggs, omelette, banana, samosa, vada, pakora, taco, wing, kebab, cutlet, roll, cookie, biscuit, muffin, papad.
- "portion" — served as a plated portion: biryani, fried rice, pulao, khichdi, noodles, pasta, hakka, chow mein, thali, pizza, burger, risotto.
- "bowl" — served in a bowl as a dish/side: curry, dal, sambar, rasam, soup, gravy, stew, sabzi, korma, chana, rajma, mixed vegetables.
- "drink" — served as a beverage by volume: juice, milk, tea, coffee, chai, smoothie, lassi, shake, buttermilk, chaas, coconut water.
- "weight" — anything else measured in grams.

Return ONLY a JSON object. No markdown, no code fences, no commentary. "food_detected" MUST be the first field.

When food IS detected, example:
{
  "food_detected": true,
  "foods": [
    {
      "name": "Biryani",
      "serving_description": "one plate",
      "measurement_type": "portion",
      "estimated_grams": 350,
      "estimated_ml": null,
      "estimated_pieces": null,
      "grams_per_piece": null,
      "confidence": 0.8,
      "needs_confirmation": true,
      "variants": ["Chicken Biryani", "Mutton Biryani", "Vegetable Biryani"],
      "ingredients": [
        { "name": "Basmati Rice", "estimated_grams": 180 },
        { "name": "Chicken", "estimated_grams": 80 },
        { "name": "Onions", "estimated_grams": 30 }
      ]
    }
  ]
}

When NO food is detected, return exactly this:
{
  "food_detected": false,
  "foods": []
}

Rules:
- "food_detected" MUST be true or false, and "foods" MUST be an empty array when it is false.
- "foods" MUST only be populated when "food_detected" is true.
- NEVER identify a food based only on text, labels, packaging, or words visible in the image. A word on paper is not food.
- "measurement_type" MUST always be exactly one of: piece, portion, bowl, drink, weight.
- For piece foods: set "estimated_pieces" (count) and "grams_per_piece" (weight of one piece, e.g. naan ~80g, roti ~50g, wing ~35g, idli ~35g, dosa ~120g). Set "estimated_grams" to null.
- For portion, bowl, weight foods: set "estimated_grams" (total weight in grams). Set "estimated_pieces" and "grams_per_piece" to null.
- For drink foods: set "estimated_ml" (volume in millilitres, e.g. tea ~240ml, juice glass ~250ml, smoothie ~300ml). Set "estimated_grams" to null.
- "name" is the short dish name.
- "serving_description" describes how it was served (e.g. one plate, one bowl, one cup, two idlis).
- "confidence" is how sure you are of the dish identity, 0.0 to 1.0.
- "needs_confirmation" must be true when the exact dish is ambiguous (e.g. "Biryani" could be chicken, beef, mutton, or vegetarian) or when confidence is low.
- "variants" lists plausible specific variants only when needs_confirmation is true; otherwise an empty array.
- "ingredients" lists the main ingredients you can identify with estimated weights in grams. Use simple common names (e.g. "Chicken", "Basmati Rice", "Onions", "Tomatoes", "Paneer", "Butter", "Lentils", "Milk"). Include at least 2 and at most 8.
- If the image contains MULTIPLE dishes, list EACH dish as its own entry in "foods". NEVER combine two or more dishes into a single food "name" (e.g. do NOT write "Dosa + Kadala Curry" as one name). A food "name" must always be a single dish.`;

export async function POST(request: Request) {
  const startedAt = Date.now();
  let userId: string | null = null;
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();
    userId = session.userId;

    const rateCheck = checkAiRateLimit(userId, 'food-recognize');
    if (!rateCheck.allowed) {
      return error(
        'Too many food recognition requests. Please wait a minute before trying again.',
        429,
        'RATE_LIMIT_EXCEEDED'
      );
    }

    const formData = await request.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
      return error('Image file is required');
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowedTypes.includes(file.type) && !file.type.startsWith('image/')) {
      return error('Unsupported image format. Please use JPG, PNG, or WebP.');
    }

    if (file.size > 10 * 1024 * 1024) {
      return error('Image is too large. Maximum size is 10MB.');
    }

    const bytes = await file.arrayBuffer();
    let buffer: Buffer = Buffer.from(bytes);
    let mimeType = file.type || 'image/jpeg';

    // LM Studio's REST API can't decode WebP (and some other formats) images,
    // so re-encode anything that isn't JPEG/PNG before sending to the AI.
    if (!['image/jpeg', 'image/jpg', 'image/png'].includes(mimeType)) {
      try {
        buffer = await sharp(buffer).jpeg({ quality: 92 }).toBuffer();
        mimeType = 'image/jpeg';
      } catch {
        // Leave as-is; the AI call will surface a clear error below.
      }
    }
    const base64 = buffer.toString('base64');
    const idempotencyKey = `food-recognize:${userId}:${computePayloadHash(base64)}`;

    return await executeIdempotent(idempotencyKey, async () => {
      // ── Strict pre-validation: does the image actually contain food? ──
      const foodPresent = await detectFoodPresence({ imageBase64: base64, mimeType });
      if (!foodPresent) {
        return error('Sorry, no food detected.', 422, 'NO_FOOD_DETECTED');
      }

      const ai = getFoodRecognitionClient();
      const content = await ai.vision({
        system: VISION_PROMPT,
        user: 'Identify the food(s) in this image and return the JSON as instructed.',
        imageBase64: base64,
        mimeType,
      });

    let aiResponse: AIResponse;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }
      aiResponse = JSON.parse(jsonMatch[0]);
    } catch {
      return error('Failed to parse AI food recognition response', 500, 'AI_001');
    }

    // Strict food-presence gate: reject images that don't actually contain an
    // edible food/drink item. Text, labels, or words visible in the image never
    // count as food.
    const aiFoods = aiResponse.foods ?? [];
    if (aiResponse.food_detected === false || aiFoods.length === 0) {
      return error('Sorry, no food detected.', 422, 'NO_FOOD_DETECTED');
    }

    // Safety net: expand any compound food names ("Dosa + Kadala Curry") into
    // individual foods so each dish is recognized and stored separately. The
    // combined dish's ingredients/variants can't be attributed per-part, so
    // they are dropped and each part is resolved independently below.
    aiResponse.foods = (aiResponse.foods || []).flatMap((food) => {
      if (!food.name) return [food];
      const parts = splitFoodNames(food.name);
      if (parts.length <= 1) return [food];
      return parts.map((partName) => ({
        ...food,
        name: partName,
        ingredients: [],
        variants: [],
      }));
    });

    // Resolve every recognized food through the SHARED food-resolution engine:
    // the same Nutrition DB matching, stored new-food reuse, ingredient
    // composition, portion options and scaled nutrition used by the voice flow.
    const results = await resolveRecognizedFoods({ foods: aiResponse.foods ?? [] });

    // Final safety net: if nothing survived the per-food validation (e.g. the
    // model emitted food objects without a name), treat it as no food.
    if (results.length === 0) {
      return error('Sorry, no food detected.', 422, 'NO_FOOD_DETECTED');
    }

    // Persist the uploaded image temporarily so the confirm step can attach it
    // to a meal (public/uploads/<dietType>/<name>-<ts>.<ext>) if the user logs
    // it. Written only now so failed recognitions never leave orphaned files.
    let tempImagePath: string | null = null;
    try {
      const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
      const tempRelPath = `/uploads/temp/temp-${userId}-${Date.now()}.${ext}`;
      await mkdir(path.join(process.cwd(), 'public', 'uploads', 'temp'), { recursive: true });
      await writeFile(path.join(process.cwd(), 'public', tempRelPath), buffer);
      tempImagePath = tempRelPath;
    } catch (err) {
      // Non-fatal: the scan still works, the image just won't be attached.
      console.warn('Failed to persist temp image:', err);
    }

    await logAiCall({
      userId: userId ?? undefined,
      modelType: 'food-recognition',
      requestPayload: JSON.stringify({
        fileName: file.name,
        size: file.size,
        mimeType,
      }).slice(0, 2000),
      responsePayload: JSON.stringify(results).slice(0, 4000),
      latencyMs: Date.now() - startedAt,
    });

    return created({ foods: results, tempImagePath: tempImagePath ?? undefined });
    });
  } catch (err) {
    console.error('Food recognize error:', err);
    await logAiCall({
      userId: userId ?? undefined,
      modelType: 'food-recognition',
      requestPayload: '',
      responsePayload: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - startedAt,
    });
    const msg = err instanceof Error ? err.message : 'Recognition failed';
    if ((err as { code?: string })?.code === 'AI_BUSY' || msg.includes('currently busy')) {
      return error(
        'Food recognition is temporarily unavailable as the AI server is at capacity. Please try again in a few moments.',
        503,
        'AI_BUSY'
      );
    }
    if (msg.includes('format') || msg.includes('解析')) {
      return error('Failed to process image. Please try a different format (JPG, PNG, or WebP).');
    }
    if (msg.includes('Failed to load image') || msg.includes('Failed to load image or audio')) {
      return error('Could not read the image. The file may be corrupted or too small.');
    }
    if (
      msg.includes('AI request failed') ||
      msg.includes('Empty AI') ||
      msg.includes('fetch failed') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('ENOTFOUND') ||
      msg.includes('timed out') ||
      msg.includes('unreachable')
    ) {
      return error(
        'Food recognition is temporarily unavailable. Please make sure the local AI server is running.'
      );
    }
    return serverError();
  }
}
