import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { success, unauthorized, serverError } from '@/lib/response';

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return unauthorized();
    }

    const user = await db.user.findUnique({
      where: { id: session.userId },
      include: {
        profile: true,
        goal: true,
        preference: true,
        allergies: {
          select: { allergyName: true },
        },
      },
    });

    if (!user) {
      return unauthorized('User not found');
    }

    return success({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      profile: user.profile,
      goal: user.goal,
      preference: user.preference,
      allergies: user.allergies.map((a) => a.allergyName),
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error('Get current user error:', err);
    return serverError();
  }
}
