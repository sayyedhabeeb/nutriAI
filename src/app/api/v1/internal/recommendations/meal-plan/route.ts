import { validateServiceToken } from '@/lib/auth/serviceAuth';
import { NextResponse } from 'next/server';
import { generateMealPlan, generateWeeklyMealPlan, GenerationError } from '@/lib/meal-plan-generation';
import { db } from '@/lib/db';
import { buildPlanItems } from '@/lib/meal-plan-view';
import { getTodayStr } from '@/lib/recommendation-engine';

export async function POST(request: Request) {
  const startedAt = Date.now();
  const authResult = await validateServiceToken(request);
  if (authResult.error) {
    return authResult.error;
  }

  const { user } = authResult;
  
  let refreshSlot: string | null = null;
  let generateDays = 1;
  let recentMealNames: string[] = [];
  let activityContext: any = null;
  let force = false;
  try {
    const body = await request.json();
    refreshSlot = body.refresh || null;
    if (body.generateDays && typeof body.generateDays === 'number') {
      generateDays = body.generateDays;
    }
    if (Array.isArray(body.recentMealNames)) {
      recentMealNames = body.recentMealNames;
    }
    if (body.activityContext) {
      activityContext = body.activityContext;
    }
    if (body.force === true || body.generate === 'true' || body.generate === true) {
      force = true;
    }
  } catch {
    // Body is optional
  }

  try {
    // If not forcing generation, check if all requested days already exist in DB
    if (!force && !refreshSlot) {
      const existingDays: any[] = [];
      for (let i = 0; i < generateDays; i++) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + i);
        const planDateStr = targetDate.toISOString().split('T')[0];

        const planDay = await db.mealPlanDay.findUnique({
          where: { userId_planDate: { userId: user.id, planDate: planDateStr } },
          include: {
            items: {
              include: {
                meal: {
                  include: { nutrition: true },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        });

        if (planDay && planDay.items.length > 0) {
          existingDays.push({
            planDate: planDay.planDate,
            targetCalories: planDay.targetCalories,
            targetProtein: planDay.targetProtein,
            targetCarbs: planDay.targetCarbs,
            targetFat: planDay.targetFat,
            items: buildPlanItems(planDay.items),
          });
        }
      }

      if (existingDays.length === generateDays) {
        return NextResponse.json({
          success: true,
          data: {
            days: existingDays,
          }
        });
      }
    }

    // 1. Generate the plan (or refresh slot)
    // If it's a refresh, we only do today
    if (refreshSlot) {
      await generateMealPlan(user.id, refreshSlot, startedAt, { 
        externalRecentMealNames: recentMealNames, 
        persist: true, 
        force: true,
        activityContext
      });
      generateDays = 1;
    } else {
      // Generate the weekly plan in a single AI operation with updated preferences
      const result = await generateWeeklyMealPlan(user.id, generateDays, startedAt, {
        externalRecentMealNames: recentMealNames,
        force,
        activityContext
      });

      if (result.status === 'generated' && Array.isArray(result.data)) {
        const generatedPayloads = result.data;
        const datesToReplace = generatedPayloads.map(p => p.planDate);

        // Commit all days atomically
        await db.$transaction([
          db.mealPlanDay.deleteMany({
            where: {
              userId: user.id,
              planDate: { in: datesToReplace }
            }
          }),
          ...generatedPayloads.map(payload => db.mealPlanDay.create({ data: payload }))
        ]);
      }
    }

    // 2. Fetch the updated complete plan(s) to return to Swapp Backend
    const planDays: any[] = [];
    
    // We fetch all requested days by date to construct the final response
    for (let i = 0; i < generateDays; i++) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + i);
      const planDateStr = targetDate.toISOString().split('T')[0];

      const planDay = await db.mealPlanDay.findUnique({
        where: { userId_planDate: { userId: user.id, planDate: planDateStr } },
        include: {
          items: {
            include: {
              meal: {
                include: { nutrition: true },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (planDay) {
        planDays.push({
          planDate: planDay.planDate,
          targetCalories: planDay.targetCalories,
          targetProtein: planDay.targetProtein,
          targetCarbs: planDay.targetCarbs,
          targetFat: planDay.targetFat,
          items: buildPlanItems(planDay.items),
        });
      }
    }

    if (planDays.length === 0) {
      return NextResponse.json({ success: false, error: 'Failed to retrieve generated plan' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        days: planDays,
      }
    });
  } catch (err) {
    if (err instanceof GenerationError) {
      return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: err.status });
    }
    console.error('Internal meal plan generate error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
