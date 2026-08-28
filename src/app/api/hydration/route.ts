import { getSessionFromRequest } from '@/lib/auth';
import { success, unauthorized, serverError } from '@/lib/response';
import { getHydrationSummary } from '@/lib/hydration-service';

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    const hydration = await getHydrationSummary(session.userId);

    return success({ hydration });
  } catch (err) {
    console.error('Hydration error:', err);
    return serverError();
  }
}
