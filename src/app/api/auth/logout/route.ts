import { getSessionFromRequest, destroySession } from '@/lib/auth';
import { success, unauthorized } from '@/lib/response';

export async function POST(request: Request) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return unauthorized();
    }

    // Extract session ID from request
    const authHeader = request.headers.get('authorization');
    let sessionId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      sessionId = authHeader.slice(7);
    } else {
      const cookieHeader = request.headers.get('cookie');
      if (cookieHeader) {
        const match = cookieHeader.match(/session=([^;]+)/);
        if (match) sessionId = match[1];
      }
    }

    if (sessionId) {
      destroySession(sessionId);
    }

    return success({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    return success({ message: 'Logged out successfully' });
  }
}
