import jwt from 'jsonwebtoken';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET as string;
if (!INTERNAL_SERVICE_SECRET) {
  throw new Error('INTERNAL_SERVICE_SECRET is missing. Cannot start service.');
}

export async function validateServiceToken(request: Request) {
  const authHeader = request.headers.get('authorization');
  console.log('[serviceAuth] Incoming authorization header:', authHeader ? `${authHeader.substring(0, 15)}... (len: ${authHeader.length})` : 'MISSING');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error('[serviceAuth] Auth header missing or malformed');
    return { error: NextResponse.json({ error: 'Missing or malformed Authorization header' }, { status: 401 }) };
  }

  const token = authHeader.split(' ')[1];
  console.log('[serviceAuth] Validating token with audience="nutriai-service", issuer="swapp-backend"');

  let decoded: jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, INTERNAL_SERVICE_SECRET, {
      audience: 'nutriai-service',
      issuer: 'swapp-backend'
    }) as jwt.JwtPayload;
    console.log('[serviceAuth] JWT verified successfully:', {
      sub: decoded.sub,
      iss: decoded.iss,
      aud: decoded.aud,
      exp: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : undefined,
    });
  } catch (jwtErr: any) {
    console.error('[serviceAuth] JWT verification failed:', {
      errorName: jwtErr.name,
      errorMessage: jwtErr.message,
      stack: jwtErr.stack,
    });
    if (jwtErr.name === 'TokenExpiredError') {
      return { error: NextResponse.json({ error: 'Service token expired' }, { status: 401 }) };
    }
    return { error: NextResponse.json({ error: 'Invalid service token', details: jwtErr.message }, { status: 401 }) };
  }

  const swappUserId = decoded.sub;
  if (!swappUserId) {
    console.error('[serviceAuth] Token is missing subject (sub) claim:', decoded);
    return { error: NextResponse.json({ error: 'Missing subject claim' }, { status: 401 }) };
  }

  try {
    console.log('[serviceAuth] Upserting NutriAI user for swappUserId:', swappUserId);
    // Upsert NutriAI user matching the swappUserId
    const user = await db.user.upsert({
      where: { swappUserId },
      update: {},
      create: {
        swappUserId,
        email: `swapp-${swappUserId}@internal.local`, // Dummy email since NutriAI requires it
        passwordHash: 'service-provisioned',
        role: 'user',
        isActive: true,
      },
    });

    console.log('[serviceAuth] User synced successfully:', { localUserId: user.id, swappUserId: user.swappUserId });
    return { user };
  } catch (dbErr: any) {
    console.error('[serviceAuth] DB User Sync Error:', {
      code: dbErr.code,
      meta: dbErr.meta,
      message: dbErr.message,
      stack: dbErr.stack,
    });
    return { error: NextResponse.json({ error: 'Database error during user sync', details: dbErr.message }, { status: 500 }) };
  }
}
