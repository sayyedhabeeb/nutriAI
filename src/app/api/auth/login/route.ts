import { db } from '@/lib/db';
import { verifyPassword, createSession } from '@/lib/auth';
import { success, error } from '@/lib/response';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return error('Email and password are required');
    }

    // Find user
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      return error('Invalid email or password', 401, 'AUTH_002');
    }

    if (!user.isActive) {
      return error('Account is deactivated', 403, 'AUTH_003');
    }

    // Verify password
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return error('Invalid email or password', 401, 'AUTH_002');
    }

    // Update last login
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Create session
    const sessionId = await createSession(user.id);

    return success({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
      token: sessionId,
    });
  } catch (err) {
    console.error('Login error:', err);
    return error('Login failed. Please try again.', 500, 'SYS_001');
  }
}
