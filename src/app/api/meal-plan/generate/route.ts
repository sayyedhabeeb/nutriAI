import { getSessionFromRequest } from '@/lib/auth';
import { success, unauthorized, serverError, error } from '@/lib/response';
import { generateMealPlan, GenerationError, SLOTS } from '@/lib/meal-plan-generation';

export async function GET(request: Request) {
  const startedAt = Date.now();
  let userId: string | null = null;
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();
    userId = session.userId;

    const { searchParams } = new URL(request.url);
    const refreshSlot = searchParams.get('refresh');

    const result = await generateMealPlan(userId, refreshSlot, startedAt);

    return success(result);
  } catch (err) {
    if (err instanceof GenerationError) {
      return error(err.message, err.status, err.code);
    }
    console.error('Generate meal plan error:', err);
    return serverError();
  }
}
