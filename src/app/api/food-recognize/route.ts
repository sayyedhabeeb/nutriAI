import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { created, unauthorized, serverError, error } from '@/lib/response';
import { getFoodRecognitionClient, logAiCall } from '@/lib/ai/client';

const VISION_PROMPT = `You are a food recognition assistant for a nutrition tracking app. Analyze the food image carefully.

Return ONLY a JSON object. No markdown, no code fences, no commentary. Example:
{
  "foods": [
    {
      "name": "Biryani",
      "serving_description": "one plate",
      "serving_weight_grams": 300,
      "confidence": 0.8,
      "needs_confirmation": true,
      "variants": ["Chicken Biryani", "Mutton Biryani", "Beef Biryani", "Vegetable Biryani"]
    }
  ]
}

Rules:
- List every distinct dish you can see in the image.
- "name" is the short dish name.
- "serving_description" describes how it was served (e.g. one plate, one bowl, one cup).
- "serving_weight_grams" is the estimated total weight of the portion (a number).
- "confidence" is how sure you are of the dish identity, 0.0 to 1.0.
- "needs_confirmation" must be true when the exact dish is ambiguous (e.g. "Biryani" could be chicken, beef, mutton, or vegetarian) or when confidence is low.
- "variants" lists the plausible specific variants only when needs_confirmation is true; otherwise an empty array.`;

export async function POST(request: Request) {
  const startedAt = Date.now();
  let userId: string | null = null;
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();
    userId = session.userId;

    const formData = await request.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
      return error('Image file is required');
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowedTypes.includes(file.type) && !file.type.startsWith('image/')) {
      return error('Unsupported image format. Please use JPG, PNG, or WebP.');
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return error('Image is too large. Maximum size is 10MB.');
    }

    // Read file as buffer with correct MIME type
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');
    const mimeType = file.type || 'image/jpeg';

    // Call local Gemma vision model (LM Studio / OpenAI-compatible)
    const ai = getFoodRecognitionClient();
    const content = await ai.vision({
      system: VISION_PROMPT,
      user: 'Identify the food(s) in this image and return the JSON as instructed.',
      imageBase64: base64,
      mimeType,
    });

    interface FoodItem {
      name: string;
      serving_description?: string;
      serving_weight_grams?: number;
      confidence?: number;
      needs_confirmation?: boolean;
      variants?: string[];
    }
    interface AIResponse {
      foods?: FoodItem[];
    }

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

    // Match foods (and their variants) against the database
    type MealWithNutrition = Awaited<ReturnType<typeof db.meal.findFirst>>;
    interface VariantResult {
      name: string;
      matched: boolean;
      meal: MealWithNutrition;
    }
    interface RecognizedResult {
      name: string;
      servingDescription: string;
      servingWeightGrams: number;
      confidence: number;
      needsConfirmation: boolean;
      variants: VariantResult[];
      matched: boolean;
      unknown_food?: boolean;
      meal: MealWithNutrition;
    }
    const results: RecognizedResult[] = [];
    for (const food of aiResponse.foods || []) {
      if (!food.name) continue;

      const findMatch = async (name: string) =>
        db.meal.findFirst({
          where: {
            isActive: true,
            OR: [
              { name: { contains: name } },
              { aliases: { some: { aliasName: { contains: name } } } },
            ],
          },
          include: { nutrition: true, servings: true },
        });

      const dbMeal = await findMatch(food.name);

      const variantResults: VariantResult[] = [];
      for (const variant of (food.variants || []).slice(0, 6)) {
        if (!variant || variant.toLowerCase() === food.name.toLowerCase()) {
          continue;
        }
        const variantMeal = await findMatch(variant);
        variantResults.push({
          name: variant,
          matched: !!variantMeal,
          meal: variantMeal,
        });
      }

      const confidence = food.confidence ?? 0;
      if (dbMeal) {
        results.push({
          name: food.name,
          servingDescription: food.serving_description || '',
          servingWeightGrams: food.serving_weight_grams || 200,
          confidence,
          needsConfirmation: food.needs_confirmation ?? confidence < 0.75,
          variants: variantResults,
          matched: true,
          meal: dbMeal,
        });
      } else if (confidence >= 0.7 || (food.variants || []).length > 0) {
        results.push({
          name: food.name,
          servingDescription: food.serving_description || '',
          servingWeightGrams: food.serving_weight_grams || 200,
          confidence,
          needsConfirmation: food.needs_confirmation ?? confidence < 0.75,
          variants: variantResults,
          matched: false,
          unknown_food: true,
          meal: null,
        });
      }
    }

    await logAiCall({
      userId,
      modelType: 'food-recognition',
      requestPayload: JSON.stringify({
        fileName: file.name,
        size: file.size,
        mimeType,
      }).slice(0, 2000),
      responsePayload: JSON.stringify(results).slice(0, 4000),
      latencyMs: Date.now() - startedAt,
    });

    return created({ foods: results });
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
