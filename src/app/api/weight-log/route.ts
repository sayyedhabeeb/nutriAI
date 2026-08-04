import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { success, created, unauthorized, serverError, error } from '@/lib/response';

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(365, Math.max(1, parseInt(searchParams.get('limit') || '30', 10)));

    const logs = await db.weightLog.findMany({
      where: { userId: session.userId },
      orderBy: { logDate: 'desc' },
      take: limit,
    });

    return success(logs);
  } catch (err) {
    console.error('Get weight logs error:', err);
    return serverError();
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    const body = await request.json();
    const { weightKg, date, notes } = body;

    if (!weightKg || weightKg <= 0) {
      return error('weightKg must be a positive number');
    }

    function getTodayStr(): string {
      return new Date().toISOString().split('T')[0];
    }

    const logDate = date || getTodayStr();

    const log = await db.weightLog.create({
      data: {
        userId: session.userId,
        weightKg,
        logDate,
        notes: notes || null,
      },
    });

    // Update user profile weight
    await db.userProfile.upsert({
      where: { userId: session.userId },
      update: { weightKg },
      create: { userId: session.userId, weightKg },
    });

    return created(log);
  } catch (err) {
    console.error('Create weight log error:', err);
    return serverError();
  }
}
