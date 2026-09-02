// ═══ Hydration Engine ═══
// Self-contained hydration goal calculations - kept fully separate from the
// meal nutrition engine.

export const GLASS_ML = 250;
export const DEFAULT_TARGET_GLASSES = 8;

export interface HydrationTarget {
  targetGlasses: number;
  targetMl: number;
  basis: 'weight_activity' | 'preference' | 'default';
}

export interface HydrationProfile {
  weightKg: number;
  activityLevel: string;
  goalType?: string | null;
}

// Standard hydration formula: base ~30 ml/kg/day, adjusted for activity level
// and goal (higher for active/athletic intents, slightly lower for cut).
const ACTIVITY_WATER_BONUS: Record<string, number> = {
  sedentary: 0,
  lightly_active: 2,
  moderately_active: 4,
  very_active: 6,
  extra_active: 8,
};

const GOAL_WATER_BONUS: Record<string, number> = {
  athlete: 5,
  muscle_gain: 3,
  weight_gain: 3,
  recomp: 2,
  maintain: 0,
  lose_fat: 0,
};

export function computeHydrationTarget(
  profile: HydrationProfile | null | undefined,
  preferenceTargetGlasses?: number | null
): HydrationTarget {
  if (preferenceTargetGlasses && preferenceTargetGlasses > 0) {
    return {
      targetGlasses: Math.round(preferenceTargetGlasses),
      targetMl: Math.round(preferenceTargetGlasses) * GLASS_ML,
      basis: 'preference',
    };
  }

  if (profile && profile.weightKg > 0) {
    const baseMlPerKg = 30;
    const activityBonus = ACTIVITY_WATER_BONUS[profile.activityLevel] ?? 0;
    const goalBonus = GOAL_WATER_BONUS[profile.goalType ?? ''] ?? 0;
    const totalMlPerKg = baseMlPerKg + activityBonus + goalBonus;
    const targetMl = Math.round(profile.weightKg * totalMlPerKg);
    const targetGlasses = Math.max(4, Math.round(targetMl / GLASS_ML));
    return {
      targetGlasses,
      targetMl: targetGlasses * GLASS_ML,
      basis: 'weight_activity',
    };
  }

  return {
    targetGlasses: DEFAULT_TARGET_GLASSES,
    targetMl: DEFAULT_TARGET_GLASSES * GLASS_ML,
    basis: 'default',
  };
}

export function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}
