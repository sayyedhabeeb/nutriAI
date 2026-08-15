'use server';

import { getSessionFromRequest } from '@/lib/auth';
import { success, unauthorized, serverError } from '@/lib/response';
import { computeAchievements } from '@/lib/achievements';

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    const achievements = await computeAchievements(session.userId);

    return success({ achievements });
  } catch (err) {
    console.error('Achievements error:', err);
    return serverError();
  }
}
