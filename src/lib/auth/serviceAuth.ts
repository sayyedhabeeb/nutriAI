import jwt from 'jsonwebtoken';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET as string;
if (!INTERNAL_SERVICE_SECRET) {
  throw new Error('INTERNAL_SERVICE_SECRET is missing. Cannot start service.');
}

export async function validateServiceToken(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Missing or malformed Authorization header' }, { status: 401 }) };
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, INTERNAL_SERVICE_SECRET, {
      audience: 'nutriai-service',
      issuer: 'swapp-backend'
    }) as jwt.JwtPayload;
    
    const swappUserId = decoded.sub;
    if (!swappUserId) {
      return { error: NextResponse.json({ error: 'Missing subject claim' }, { status: 401 }) };
    }

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

    return { user };
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return { error: NextResponse.json({ error: 'Service token expired' }, { status: 401 }) };
    }
    return { error: NextResponse.json({ error: 'Invalid service token' }, { status: 401 }) };
  }
}
