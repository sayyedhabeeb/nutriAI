import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { success, created, unauthorized, serverError, error } from '@/lib/response';

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    const today = getTodayStr();

    const waterLog = await db.waterLog.findUnique({
      where: {
        userId_logDate: {
          userId: session.userId,
          logDate: today,
        },
      },
    });

    if (!waterLog) {
      return success({
        logDate: today,
        glassesConsumed: 0,
        targetGlasses: 8,
        percentage: 0,
      });
    }

    return success({
      ...waterLog,
      percentage: Math.round((waterLog.glassesConsumed / waterLog.targetGlasses) * 100),
    });
  } catch (err) {
    console.error('Get water log error:', err);
    return serverError();
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    const body = await request.json();
    const { glasses, date } = body;

    if (!glasses || glasses <= 0) {
      return error('glasses must be a positive number');
    }

    const logDate = date || getTodayStr();

    const waterLog = await db.waterLog.upsert({
      where: {
        userId_logDate: {
          userId: session.userId,
          logDate,
        },
      },
      update: {
        glassesConsumed: { increment: glasses },
      },
      create: {
        userId: session.userId,
        logDate,
        glassesConsumed: glasses,
        targetGlasses: 8,
      },
    });

    return created({
      ...waterLog,
      percentage: Math.round((waterLog.glassesConsumed / waterLog.targetGlasses) * 100),
    });
  } catch (err) {
    console.error('Add water log error:', err);
    return serverError();
  }
}
