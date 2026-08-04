import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { success, unauthorized, serverError, error } from '@/lib/response';

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    let profile = await db.userProfile.findUnique({
      where: { userId: session.userId },
    });

    if (!profile) {
      // Return empty profile if none exists yet
      return success({
        firstName: null,
        lastName: null,
        age: null,
        gender: null,
        heightCm: null,
        weightKg: null,
        country: null,
        timezone: 'UTC',
        avatarUrl: null,
      });
    }

    return success(profile);
  } catch (err) {
    console.error('Get profile error:', err);
    return serverError();
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    const body = await request.json();
    const { firstName, lastName, age, gender, heightCm, weightKg, country } = body;

    // Validate types
    if (age !== undefined && age !== null && (typeof age !== 'number' || age < 1 || age > 150)) {
      return error('Age must be a number between 1 and 150');
    }
    if (heightCm !== undefined && heightCm !== null && (typeof heightCm !== 'number' || heightCm < 50 || heightCm > 300)) {
      return error('Height must be between 50 and 300 cm');
    }
    if (weightKg !== undefined && weightKg !== null && (typeof weightKg !== 'number' || weightKg < 20 || weightKg > 500)) {
      return error('Weight must be between 20 and 500 kg');
    }

    const profile = await db.userProfile.upsert({
      where: { userId: session.userId },
      update: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(age !== undefined && { age }),
        ...(gender !== undefined && { gender }),
        ...(heightCm !== undefined && { heightCm }),
        ...(weightKg !== undefined && { weightKg }),
        ...(country !== undefined && { country }),
      },
      create: {
        userId: session.userId,
        firstName: firstName || null,
        lastName: lastName || null,
        age: age || null,
        gender: gender || null,
        heightCm: heightCm || null,
        weightKg: weightKg || null,
        country: country || null,
      },
    });

    return success(profile);
  } catch (err) {
    console.error('Update profile error:', err);
    return serverError();
  }
}
