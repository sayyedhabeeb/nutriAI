import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getRecommendationClient, logAiCall } from '@/lib/ai/client';

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function fallbackMessage(glasses: number, target: number, ml: number, targetMl: number, percentage: number): string {
  if (glasses === 0) {
    return "You haven't logged any water today. Start with a glass now — even mild dehydration affects energy and focus.";
  }
  if (percentage < 50) {
    return `You're at ${glasses} glasses (${ml}ml) — about ${percentage}% of your daily goal. Try sipping a glass with each meal to stay on track.`;
  }
  if (percentage < 80) {
    const remaining = target - glasses;
    return `Good progress at ${glasses} glasses! ${remaining} more glass${remaining === 1 ? '' : 'es'} to reach your ${target}-glass goal.`;
  }
  if (percentage <= 100) {
    return `Great hydration today — ${glasses} glasses (${percentage}%)! You're meeting your daily water target.`;
  }
  return `Excellent — you've exceeded your daily water goal with ${glasses} glasses. Well hydrated!`;
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  let userId: string | null = null;
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    userId = session.userId;

    const today = getTodayStr();
    const waterLog = await db.waterLog.findUnique({
      where: { userId_logDate: { userId: session.userId, logDate: today } },
    });

    const glasses = waterLog?.glassesConsumed ?? 0;
    const target = waterLog?.targetGlasses ?? 8;
    const ml = glasses * 250;
    const targetMl = target * 250;
    const percentage = target > 0 ? Math.round((glasses / target) * 100) : 0;

    const contextStr = `User has consumed ${glasses} glasses (${ml}ml) of water today out of a target of ${target} glasses (${targetMl}ml). Percentage: ${percentage}%.`;

    let analysis: string;
    try {
      const systemPrompt = `You are NutriAI, a hydration and nutrition assistant. Based on the user's water intake data, provide a brief, friendly hydration assessment in 2-3 sentences. Include: (1) current status (under-hydrated / on-track / well-hydrated), (2) one practical tip if needed, (3) mention of benefits if on track. Keep it under 80 words. Do not use markdown formatting.`;

      const ai = getRecommendationClient();
      const reply = await ai.chat({ system: systemPrompt, user: contextStr });

      analysis = reply || fallbackMessage(glasses, target, ml, targetMl, percentage);
    } catch {
      analysis = fallbackMessage(glasses, target, ml, targetMl, percentage);
    }

    await logAiCall({
      userId,
      modelType: 'hydration-analysis',
      requestPayload: contextStr.slice(0, 2000),
      responsePayload: analysis.slice(0, 4000),
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json({ success: true, data: { analysis } });
  } catch (err) {
    console.error('Hydration analysis error:', err);
    await logAiCall({
      userId: userId ?? undefined,
      modelType: 'hydration-analysis',
      requestPayload: '',
      responsePayload: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - startedAt,
    });

    const glasses = 0;
    const target = 8;
    return NextResponse.json({
      success: true,
      data: { analysis: fallbackMessage(glasses, target, 0, 2000, 0) },
    });
  }
}
