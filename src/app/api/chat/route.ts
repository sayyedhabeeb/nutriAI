import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getRecommendationClient, logAiCall } from '@/lib/ai/client';

export async function POST(request: Request) {
  const startedAt = Date.now();
  let userId: string | null = null;
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }
    userId = session.userId;

    const body = await request.json();
    const { message, context } = body as {
      message: string;
      context?: {
        todayCalories: number;
        todayProtein: number;
        todayCarbs: number;
        todayFat: number;
        targetCalories: number;
        targetProtein: number;
        targetCarbs: number;
        targetFat: number;
        recentMeals: string[];
      };
    };

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Message is required' },
        { status: 400 },
      );
    }

    let contextStr = '';
    if (context) {
      contextStr = `\n\nUser's nutrition context for today:\n- Calories: ${context.todayCalories}/${context.targetCalories} kcal\n- Protein: ${context.todayProtein}/${context.targetProtein}g\n- Carbs: ${context.todayCarbs}/${context.targetCarbs}g\n- Fat: ${context.todayFat}/${context.targetFat}g${context.recentMeals.length > 0 ? `\n- Recent meals: ${context.recentMeals.join(', ')}` : ''}`;
    }

    const systemPrompt = `You are NutriAI, a friendly and knowledgeable nutrition assistant. You help users with diet questions, meal suggestions, and nutritional advice. Be concise but informative. Use the user's nutrition context to give personalized advice. Keep responses under 150 words unless asked for detailed info.${contextStr}`;

    const ai = getRecommendationClient();
    const reply = await ai.chat({
      system: systemPrompt,
      user: message,
    });

    await logAiCall({
      userId,
      modelType: 'chat',
      requestPayload: JSON.stringify({ message }).slice(0, 2000),
      responsePayload: reply.slice(0, 4000),
      latencyMs: Date.now() - startedAt,
    });

    if (!reply) {
      return NextResponse.json({
        success: true,
        data: { reply: 'Sorry, I had trouble processing that. Please try again.' },
      });
    }

    return NextResponse.json({ success: true, data: { reply } });
  } catch (err) {
    console.error('Chat API error:', err);
    await logAiCall({
      userId: userId ?? undefined,
      modelType: 'chat',
      requestPayload: '',
      responsePayload: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - startedAt,
    });
    return NextResponse.json({
      success: true,
      data: { reply: 'Sorry, I had trouble processing that. Please try again.' },
    });
  }
}
