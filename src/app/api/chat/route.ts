import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import ZAI from 'z-ai-web-dev-sdk';

export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

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

    const zai = await ZAI.create();
    const result = await zai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
    });

    const reply = result.choices?.[0]?.message?.content || '';

    if (!reply) {
      return NextResponse.json({
        success: true,
        data: { reply: 'Sorry, I had trouble processing that. Please try again.' },
      });
    }

    return NextResponse.json({ success: true, data: { reply } });
  } catch (err) {
    console.error('Chat API error:', err);
    return NextResponse.json({
      success: true,
      data: { reply: 'Sorry, I had trouble processing that. Please try again.' },
    });
  }
}
