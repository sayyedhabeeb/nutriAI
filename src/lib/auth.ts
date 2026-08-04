import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Persistent session store using globalThis to survive HMR
const globalForSessions = globalThis as unknown as {
  __nutriaiSessions: Map<string, { userId: string; createdAt: number; expiresAt: number }> | undefined;
};

if (!globalForSessions.__nutriaiSessions) {
  globalForSessions.__nutriaiSessions = new Map();
}

const sessions = globalForSessions.__nutriaiSessions;

export function createSession(userId: string): string {
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  sessions.set(sessionId, {
    userId,
    createdAt: now,
    expiresAt: now + 7 * 24 * 60 * 60 * 1000,
  });
  return sessionId;
}

export function getSession(sessionId: string | null): { userId: string } | null {
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }
  return { userId: session.userId };
}

export function destroySession(sessionId: string): void {
  sessions.delete(sessionId);
}

// Clean expired sessions periodically
if (typeof globalThis !== 'undefined' && !(globalThis as Record<string, unknown>).__nutriaiSessionCleanup) {
  (globalThis as Record<string, unknown>).__nutriaiSessionCleanup = true;
  setInterval(() => {
    const now = Date.now();
    for (const [key, session] of sessions) {
      if (now > session.expiresAt) sessions.delete(key);
    }
  }, 60 * 60 * 1000);
}

// Helper to get session from request
export function getSessionFromRequest(request: Request): { userId: string } | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return getSession(authHeader.slice(7));
  }
  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader) {
    const match = cookieHeader.match(/session=([^;]+)/);
    if (match) return getSession(match[1]);
  }
  return null;
}
