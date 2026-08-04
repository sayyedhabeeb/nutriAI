import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { created, unauthorized, serverError, error } from '@/lib/response';
import ZAI from 'z-ai-web-dev-sdk';

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

    // Read file as buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');

    // Call VLM
    const zai = await ZAI.create();
    const result = await zai.chat.completions.createVision({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: VISION_PROMPT },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${base64}` },
            },
          ],
        },
      ],
    });

    // Parse AI response
    interface FoodItem {
      name: string;
      serving_description: string;
      serving_weight_grams: number;
      confidence: number;
    }
    interface AIResponse {
      foods: FoodItem[];
    }
    interface AIMessage {
      content?: string;
    }
    interface AIChoice {
      message?: AIMessage;
    }
    interface AIResult {
      choices?: AIChoice[];
    }

    let aiResponse: AIResponse;
    try {
      let content = '';
      if (typeof result === 'string') {
        content = result;
      } else {
        const r = result as AIResult;
        content = r.choices?.[0]?.message?.content || '';
      }
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return error('Failed to parse AI response', 500, 'AI_001');
      }
      aiResponse = JSON.parse(jsonMatch[0]);
    } catch {
      return error('Failed to parse AI food recognition response', 500, 'AI_001');
    }

    // Match foods against database
    const results = [];

    for (const food of aiResponse.foods || []) {
      const dbMeal = await db.meal.findFirst({
        where: {
          isActive: true,
          OR: [
            { name: { contains: food.name, mode: 'insensitive' } },
            { aliases: { some: { aliasName: { contains: food.name, mode: 'insensitive' } } } },
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

    return created({ foods: results });
  } catch (err) {
    console.error('Food recognize error:', err);
    return serverError();
  }
}
