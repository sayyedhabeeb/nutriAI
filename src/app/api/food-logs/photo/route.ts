import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { created, unauthorized, serverError, error } from '@/lib/response';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { getFoodRecognitionClient, logAiCall } from '@/lib/ai/client';

const VISION_PROMPT = `You are a food recognition assistant. Identify cooked food items in this image. Return ONLY JSON: { "foods": [{ "name": "...", "serving_description": "...", "serving_weight_grams": N, "confidence": N.N }] }`;

export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

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
    const mimeType = file.type || 'image/jpeg';

    // Save to uploads
    const uploadsDir = path.join(process.cwd(), 'uploads');
    await mkdir(uploadsDir, { recursive: true });
    const fileName = `${session.userId}-${Date.now()}-${file.name}`;
    const filePath = path.join(uploadsDir, fileName);
    await writeFile(filePath, buffer);

    // Convert to base64
    const base64 = buffer.toString('base64');

    // Call local Gemma vision model (LM Studio / OpenAI-compatible)
    const ai = getFoodRecognitionClient();
    const result = await ai.vision({
      system: VISION_PROMPT,
      user: 'Identify the food(s) in this image and return the JSON as instructed.',
      imageBase64: base64,
      mimeType,
    });

    // Parse AI response
    interface AIResponse {
      foods: Array<{
        name: string;
        serving_description: string;
        serving_weight_grams: number;
        confidence: number;
      }>;
    }

    let aiResponse: AIResponse;
    try {
      // Extract JSON from response (may be wrapped in markdown code blocks)
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return error('Failed to parse AI response', 500, 'AI_001');
      }
      aiResponse = JSON.parse(jsonMatch[0]);
    } catch {
      return error('Failed to parse AI food recognition response', 500, 'AI_001');
    }

    // Match foods against database
    type MealWithNutrition = Awaited<ReturnType<typeof db.meal.findFirst>>;
    interface RecognizedResult {
      name: string;
      servingDescription: string;
      servingWeightGrams: number;
      confidence: number;
      matched: boolean;
      unknown_food?: boolean;
      meal: MealWithNutrition;
    }
    const results: RecognizedResult[] = [];
    for (const food of aiResponse.foods || []) {
      // Try to find in database (SQLite is case-insensitive by default for ASCII)
      const words = food.name.toLowerCase().split(/\s+/);
      let dbMeal = await db.meal.findFirst({
        where: {
          isActive: true,
          OR: [
            { name: { contains: food.name } },
            { aliases: { some: { aliasName: { contains: food.name } } } },
            ...words
              .filter((w) => w.length > 3)
              .map((word) => ({
                name: { contains: word },
              })),
          ],
        },
        include: { nutrition: true, servings: true },
      });

      if (dbMeal) {
        results.push({
          name: food.name,
          servingDescription: food.serving_description,
          servingWeightGrams: food.serving_weight_grams,
          confidence: food.confidence,
          matched: true,
          meal: dbMeal,
        });
      } else if (food.confidence >= 0.7) {
        results.push({
          name: food.name,
          servingDescription: food.serving_description,
          servingWeightGrams: food.serving_weight_grams,
          confidence: food.confidence,
          matched: false,
          unknown_food: true,
          meal: null,
        });
      }
    }

    return created({
      imageFilePath: filePath,
      foods: results,
    });
  } catch (err) {
    console.error('Food photo recognition error:', err);
    const msg = err instanceof Error ? err.message : 'Recognition failed';
    if (msg.includes('format') || msg.includes('解析')) {
      return error('Failed to process image. Please try a different format (JPG, PNG, or WebP).');
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
