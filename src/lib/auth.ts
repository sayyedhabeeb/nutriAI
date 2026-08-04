import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Session CRUD via Prisma (survives Turbopack module isolation)
export function createSession(userId: string): string {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  db.session.create({ data: { userId, expiresAt } });
  return sessionId;
}

export function getSession(sessionId: string | null): { userId: string } | null {
  if (!sessionId) return null;
  try {
    const session = db.session.findUnique({ where: { id: sessionId } });
    if (!session) return null;
    if (new Date(session.expiresAt) < new Date()) {
      db.session.delete({ where: { id: sessionId } });
      return null;
    }
    return { userId: session.userId };
  } catch {
    return null;
   }
}

export function destroySession(sessionId: string): void {
  try {
    db.session.delete({ where: { id: sessionId } });
  } catch {}
}

// Clean expired sessions periodically
if (!(globalThis as Record<string, unknown>).__nutriaiSessionCleanup) {
  (globalThis as Record<string, unknown>).__nutriaiSessionCleanup = true;
  setInterval(() => {
    const expired = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    try { db.session.deleteMany({ where: { expiresAt: { lt: expired } } }); } catch {}
  }, 60 * 60 * 1000);
}

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