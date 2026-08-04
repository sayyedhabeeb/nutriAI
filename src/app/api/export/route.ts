import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { unauthorized, error, serverError } from '@/lib/response';
import { format, subDays } from 'date-fns';

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    const { searchParams } = new URL(request.url);
    const formatParam = searchParams.get('format') || 'csv';
    const daysParam = parseInt(searchParams.get('days') || '7', 10);

    if (!['csv', 'json'].includes(formatParam)) {
      return error('Invalid format. Use csv or json.');
    }
    if (![7, 14, 30].includes(daysParam)) {
      return error('Invalid days. Use 7, 14, or 30.');
    }

    const startDate = format(subDays(new Date(), daysParam - 1), 'yyyy-MM-dd');
    const endDate = format(new Date(), 'yyyy-MM-dd');

    // Fetch food logs with items and meal nutrition
    const foodLogs = await db.foodLog.findMany({
      where: {
        userId: session.userId,
        logDate: { gte: startDate, lte: endDate },
      },
      include: {
        items: {
          include: {
            meal: {
              include: {
                nutrition: true,
              },
            },
          },
          orderBy: { loggedAt: 'asc' },
        },
      },
      orderBy: { logDate: 'asc' },
    });

    // Build the export data structure
    const exportDays = foodLogs.map((log) => ({
      date: log.logDate,
      meals: log.items.map((item) => ({
        mealSlot: item.mealSlot,
        mealName: item.meal?.name || 'Unknown',
        servingGms: item.servingGms,
        calories: Math.round(item.calories),
        proteinG: Math.round(item.proteinG * 100) / 100,
        carbsG: Math.round(item.carbsG * 100) / 100,
        fatG: Math.round(item.fatG * 100) / 100,
      })),
    }));

    if (formatParam === 'json') {
      const jsonData = {
        exportDate: new Date().toISOString(),
        period: `${daysParam} days`,
        days: exportDays,
      };
      return new Response(JSON.stringify(jsonData, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="nutriai-export-${daysParam}days.json"`,
        },
      });
    }

    // CSV format
    const header = 'Date,Meal Slot,Meal Name,Serving (g),Calories,Protein (g),Carbs (g),Fat (g)';
    const rows = exportDays.flatMap((day) =>
      day.meals.map((m) =>
        `${day.date},${m.mealSlot},"${m.mealName.replace(/"/g, '""')}",${m.servingGms},${m.calories},${m.proteinG},${m.carbsG},${m.fatG}`
      )
    );
    const csv = [header, ...rows].join('\n');

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="nutriai-export-${daysParam}days.csv"`,
      },
    });
  } catch (err) {
    console.error('Export error:', err);
    return serverError();
  }
}
