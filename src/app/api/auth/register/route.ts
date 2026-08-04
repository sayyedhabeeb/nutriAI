import { db } from '@/lib/db';
import { hashPassword, createSession } from '@/lib/auth';
import { success, created, error } from '@/lib/response';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return error('A valid email address is required');
    }

    // Validate password
    if (!password || password.length < 8) {
      return error('Password must be at least 8 characters long');
    }

    // Check if user already exists
    const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return error('An account with this email already exists', 409, 'AUTH_001');
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const user = await db.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        name: name || null,
      },
    });

    // Create session
    const sessionId = createSession(user.id);

    return created({
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
    console.error('Register error:', err);
    return error('Registration failed. Please try again.', 500, 'SYS_001');
  }
}
