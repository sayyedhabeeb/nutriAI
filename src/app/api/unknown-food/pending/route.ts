import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { success, unauthorized, serverError } from '@/lib/response';

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    const submissions = await db.unknownFoodSubmission.findMany({
      where: {
        userId: session.userId,
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
    });

    return success(submissions);
  } catch (err) {
    console.error('Get pending unknown foods error:', err);
    return serverError();
  }
}
