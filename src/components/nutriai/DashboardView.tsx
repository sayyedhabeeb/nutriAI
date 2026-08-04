'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  User, Search, Droplets, Camera, Clock, Zap, ChevronRight, Lightbulb, Sparkles, ChevronDown, Loader2, Trophy, Lock, Plus,
} from 'lucide-react';
import { apiFetch } from './api';
import {
  SLOTS, SLOT_LABELS, SLOT_ICONS, SLOT_BORDER_COLORS, SLOT_BADGE_COLORS,
  SLOT_GRADIENT_COLORS, fadeIn,
} from './constants';
import { CalorieRing, NutritionFactsLabel } from './shared';
import type { ViewType, NutritionData, MealRecommendation, SearchMeal, MealPlanItemData } from './types';

export function DashboardView({ onNavigate }: { onNavigate: (v: ViewType) => void }) {
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [nutrition, setNutrition] = useState<NutritionData | null>(null);
  const [recommendations, setRecommendations] = useState<Record<string, MealRecommendation[]>>({});
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState(0);
  const [waterCount, setWaterCount] = useState(0);
  const [mealsLoggedToday, setMealsLoggedToday] = useState(0);

  // Log meal dialog state
  const [logDialog, setLogDialog] = useState<{
    open: boolean;
    meal: MealRecommendation;
    slot: string;
    baseNutritionPer100g: { calories: number; proteinG: number; carbsG: number; fatG: number } | null;
    mealName: string;
    cuisine: string;
    mealType: string;
    description?: string | null;
    isVeg?: boolean;
    isVegan?: boolean;
  } | { open: false }>({ open: false });
  const [servingGms, setServingGms] = useState(100);

  // Meal search dialog state (per-slot)
  const [slotSearchDialog, setSlotSearchDialog] = useState<{ open: boolean; slot: string } | { open: false }>({ open: false });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchMeal[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchDebounce, setSearchDebounce] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Meal detail sheet
  const [detailSheet, setDetailSheet] = useState<{
    open: boolean;
    rec: MealRecommendation;
  } | { open: false }>({ open: false });

  // Achievements state
  const [achievements, setAchievements] = useState<{ id: string; name: string; description: string; icon: string; earned: boolean; earnedDate?: string }[]>([]);

  // Meal plan state (Feature 2)
  const [mealPlan, setMealPlan] = useState<{
    exists: boolean;
    items: MealPlanItemData[];
  } | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planExpanded, setPlanExpanded] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    try {
      const [me, nut, summaryData] = await Promise.all([
        apiFetch('/api/auth/me'),
        apiFetch('/api/nutrition/daily'),
        apiFetch('/api/progress/summary?period=week').catch(() => ({ summary: { totalDays: 0 } })),
      ]);
      setUser(me);
      setNutrition(nut);

      // Calculate streak from weekly data
      const weeklyData = await apiFetch('/api/progress/weekly').catch(() => [] as Record<string, unknown>[]);
      let streakCount = 0;
      for (let i = (weeklyData as Record<string, unknown>[]).length - 1; i >= 0; i--) {
        const day = weeklyData[i];
        const consumed = (day.consumed as Record<string, number>)?.calories || 0;
        if (consumed > 0) streakCount++;
        else break;
      }
      setStreak(streakCount);

      // Fetch water log for today
      try {
        const waterData = await apiFetch('/api/water-log');
        setWaterCount(waterData.glassesConsumed || 0);
      } catch {
        // Silent fail
      }

      // Fetch meals logged today
      try {
        const foodLogData = await apiFetch('/api/food-logs');
        const itemsBySlot = (foodLogData.itemsBySlot || {}) as Record<string, unknown[]>;
        let totalCount = 0;
        for (const slot of Object.keys(itemsBySlot)) {
          totalCount += itemsBySlot[slot].length;
        }
        setMealsLoggedToday(totalCount);
      } catch {
        // Silent fail
      }

      const recs = await Promise.all(
        SLOTS.map(async (slot) => {
          try {
            const r = await apiFetch(`/api/recommendations?slot=${slot}`);
            return { slot, recs: r.recommendations || [] };
          } catch { return { slot, recs: [] }; }
        })
      );
      const recMap: Record<string, MealRecommendation[]> = {};
      for (const r of recs) recMap[r.slot] = r.recs;
      setRecommendations(recMap);

      // Fetch meal plan (Feature 2)
      try {
        const plan = await apiFetch('/api/meal-plan');
        setMealPlan({ exists: plan.exists, items: plan.items || [] });
      } catch {
        setMealPlan(null);
      }

      // Fetch achievements
      try {
        const ach = await apiFetch('/api/achievements');
        setAchievements(ach.achievements || []);
      } catch {
        // Silent fail
      }
    } catch {
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleLogMeal = async () => {
    if (!logDialog.open) return;
    try {
      await apiFetch('/api/food-logs', {
        method: 'POST',
        body: JSON.stringify({ mealId: logDialog.meal.meal.id, servingGms, mealSlot: logDialog.slot }),
      });
      toast.success(`Logged ${logDialog.mealName}!`);
      setLogDialog({ open: false });
      fetchData();
    } catch (err) { toast.error((err as Error).message); }
  };

  // Per-slot search with debounce
  const handleSlotSearch = (query: string) => {
    setSearchQuery(query);
    if (searchDebounce) clearTimeout(searchDebounce);
    if (!query.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await apiFetch(`/api/meals/search?q=${encodeURIComponent(query)}`);
        setSearchResults((res.meals || []) as SearchMeal[]);
      } catch { toast.error('Search failed'); }
      finally { setSearchLoading(false); }
    }, 350);
    setSearchDebounce(timer);
  };

  const handleLogFromSearch = (meal: SearchMeal) => {
    const slot = slotSearchDialog.open ? slotSearchDialog.slot : 'lunch';
    setServingGms(meal.baseServingGms || 100);
    setLogDialog({
      open: true,
      meal: {
        meal: { id: meal.id, name: meal.name, mealType: meal.mealType, cuisine: meal.cuisine, imageUrl: null, prepTimeMin: meal.prepTimeMin, isVeg: meal.isVeg, isVegan: meal.isVegan },
        score: 0, recommendedServingGms: meal.baseServingGms || 100, estimatedNutrition: meal.nutrition ? { calories: meal.nutrition.calories, proteinG: meal.nutrition.proteinG, carbsG: meal.nutrition.carbsG, fatG: meal.nutrition.fatG } : null,
        baseNutritionPer100g: meal.nutrition ? { calories: meal.nutrition.calories, proteinG: meal.nutrition.proteinG, carbsG: meal.nutrition.carbsG, fatG: meal.nutrition.fatG } : null,
      },
      slot,
      baseNutritionPer100g: meal.nutrition || null,
      mealName: meal.name,
      cuisine: meal.cuisine,
      mealType: meal.mealType,
      isVeg: meal.isVeg,
      isVegan: meal.isVegan,
    });
    setSlotSearchDialog({ open: false });
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleWaterAdd = async () => {
    try {
      const result = await apiFetch('/api/water-log', { method: 'POST', body: JSON.stringify({ glasses: 1 }) });
      setWaterCount(result.glassesConsumed || waterCount + 1);
      toast.success('\uD83D\uDCA7 +1 glass of water');
    } catch { toast.error('Failed to log water'); }
  };

  // Generate meal plan (Feature 2)
  const handleGeneratePlan = async () => {
    setPlanLoading(true);
    try {
      const result = await apiFetch('/api/meal-plan/generate');
      toast.success(result.status === 'existing' ? 'Plan already exists for today!' : "Today's meal plan generated!");
      // Fetch the plan
      const plan = await apiFetch('/api/meal-plan');
      setMealPlan({ exists: plan.exists, items: plan.items || [] });
    } catch (err) { toast.error((err as Error).message); }
    finally { setPlanLoading(false); }
  };

  const firstName = (user?.profile as Record<string, unknown> | null)?.firstName || (user?.name as string) || '';
  const initial = firstName ? firstName.charAt(0).toUpperCase() : '';
  const displayName = firstName || 'there';
  const todayStr = format(new Date(), 'EEEE, MMMM d');

  // Insights logic (Feature 3)
  const targetCal = nutrition?.targets?.calories || 0;
  const consumedCal = nutrition?.consumed?.calories || 0;
  const pctConsumed = targetCal > 0 ? consumedCal / targetCal : 0;
  const targetProtein = nutrition?.targets?.proteinG || 0;
  const consumedProtein = nutrition?.consumed?.proteinG || 0;
  const pctProtein = targetProtein > 0 ? consumedProtein / targetProtein : 0;
  const hour = new Date().getHours();
  const timeOfDayTip = hour < 12
    ? 'Start your day with a protein-rich breakfast!'
    : hour < 17
      ? 'Keep up the good work! Stay consistent with your meals.'
      : 'Plan a balanced dinner to finish strong today.';

  if (loading) {
    return (
      <div className="p-4 max-w-lg mx-auto space-y-4">
        <Skeleton className="h-8 w-56 rounded-xl" />
        <div className="flex justify-center"><Skeleton className="h-[190px] w-[190px] rounded-full" /></div>
        <div className="space-y-3"><Skeleton className="h-10 w-full rounded-xl" /><Skeleton className="h-10 w-full rounded-xl" /><Skeleton className="h-10 w-full rounded-xl" /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Skeleton className="h-56 w-full rounded-xl" /><Skeleton className="h-56 w-full rounded-xl" /></div>
      </div>
    );
  }

  return (
    <motion.div {...fadeIn} className="p-4 max-w-lg mx-auto space-y-4">
      {/* ═══ Hero Section with gradient bg & decorative blobs ═══ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-500/5 to-teal-500/5 p-5 border border-emerald-100/50 dark:border-emerald-800/30 backdrop-blur-sm">
        <div className="absolute -top-8 -right-8 w-24 h-24 bg-emerald-200/20 rounded-full blur-2xl" />
        <div className="absolute -bottom-6 -left-6 w-20 h-20 bg-teal-200/20 rounded-full blur-2xl" />
        <div className="absolute top-1/2 right-1/4 w-12 h-12 bg-green-200/10 rounded-full blur-xl" />
        <div className="relative flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Hi, {displayName}! {'\uD83D\uDC4B'}</h1>
            <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-500 dark:text-gray-400">
              <CalendarIcon className="h-3.5 w-3.5" />
              <span>{todayStr}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {streak > 0 && (
              <Badge className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 px-2.5 py-1 gap-1 shadow-sm">
                <Zap className="h-3 w-3" />{streak} day{streak > 1 ? 's' : ''}
              </Badge>
            )}
            {initial ? (
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center shadow-md">
                <span className="text-white font-bold text-sm">{initial}</span>
              </div>
            ) : (
              <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/40 rounded-xl flex items-center justify-center shadow-md">
                <User className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Quick Stats Row ═══ */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-100/60 dark:border-gray-800/60 border-t-2 border-t-emerald-400 shadow-sm text-center">
          <p className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100 tabular-nums mb-1">{mealsLoggedToday}</p>
          <p className="text-[11px] text-gray-600 dark:text-gray-400 font-semibold">Meals Logged</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-100/60 dark:border-gray-800/60 border-t-2 border-t-cyan-400 shadow-sm text-center">
          <p className="text-2xl font-extrabold tracking-tight text-cyan-600 dark:text-cyan-400 tabular-nums mb-1">{waterCount}</p>
          <p className="text-[11px] text-gray-600 dark:text-gray-400 font-semibold">Glasses</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-100/60 dark:border-gray-800/60 border-t-2 border-t-amber-400 shadow-sm text-center">
          <p className="text-2xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums mb-1">{streak}</p>
          <p className="text-[11px] text-gray-600 dark:text-gray-400 font-semibold">Day Streak</p>
        </div>
      </div>

      {/* ═══ Calorie Ring Card ═══ */}
      <Card className="p-6 rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-100/60 dark:border-gray-800/60">
        <div className="flex justify-center">
          <CalorieRing consumed={consumedCal} target={targetCal} />
        </div>
        {pctConsumed >= 1 && (
          <motion.p
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200 }}
            className="text-center text-sm text-emerald-600 dark:text-emerald-400 font-bold mt-3"
          >
            You&apos;ve reached your calorie goal! Great job! 🎉
          </motion.p>
        )}
      </Card>

      {/* ═══ Macro Progress Bars ═══ */}
      <Card className="p-4 rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-100/60 dark:border-gray-800/60 space-y-3 mb-5">
        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Today&apos;s Macros</h3>
        {[
          { label: 'Protein', val: consumedProtein, target: targetProtein, from: '#3b82f6', to: '#60a5fa', unit: 'g' },
          { label: 'Carbs', val: nutrition?.consumed?.carbsG || 0, target: nutrition?.targets?.carbsG || 0, from: '#f59e0b', to: '#fbbf24', unit: 'g' },
          { label: 'Fat', val: nutrition?.consumed?.fatG || 0, target: nutrition?.targets?.fatG || 0, from: '#f43f5e', to: '#fb7185', unit: 'g' },
        ].map((m) => {
          const pct = Math.min(Math.round((m.val / (m.target || 1)) * 100), 100);
          return (
            <div key={m.label}>
              <div className="flex justify-between mb-1.5">
                <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">{m.label}</span>
                <span className="text-xs text-gray-600 dark:text-gray-400 font-medium text-right tabular-nums">{m.val}{m.unit} / {m.target}{m.unit} &middot; {pct}%</span>
              </div>
              <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: `linear-gradient(90deg, ${m.from}, ${m.to})` }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8 }}
                />
              </div>
            </div>
          );
        })}
      </Card>

      {/* ═══ Hydration Widget ═══ */}
      <Card className="p-4 rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-100/60 dark:border-gray-800/60">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Droplets className="h-4 w-4 text-cyan-500" />
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Hydration</h3>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">Goal: 8 glasses</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 flex gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((g) => (
              <div
                key={g}
                className={`h-6 flex-1 rounded-lg transition-all duration-500 ${g <= waterCount ? 'bg-gradient-to-t from-cyan-500 to-cyan-300 dark:from-cyan-600 dark:to-cyan-400' : 'bg-gray-100 dark:bg-gray-800'}`}
              />
            ))}
          </div>
          <Button
            size="icon"
            className="w-9 h-9 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white shadow-sm"
            onClick={handleWaterAdd}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{waterCount} of 8 glasses today</p>
      </Card>

      {/* ═══ Feature 3: Today's Insights Card ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card className={`p-4 rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-100/60 dark:border-gray-800/60 ${pctConsumed > 1 ? 'bg-amber-50/50 dark:bg-amber-900/10' : pctConsumed >= 0.75 ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : 'bg-blue-50/50 dark:bg-blue-900/10'}`}>
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${pctConsumed > 1 ? 'bg-amber-100/80 dark:bg-amber-900/30' : pctConsumed >= 0.75 ? 'bg-emerald-100/80 dark:bg-emerald-900/30' : 'bg-blue-100/80 dark:bg-blue-900/30'}`}>
              <Lightbulb className={`h-4.5 w-4.5 ${pctConsumed > 1 ? 'text-amber-500' : pctConsumed >= 0.75 ? 'text-emerald-500' : 'text-blue-500'}`} />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Today&apos;s Insights</h3>

              {/* Calorie status message */}
              {pctConsumed > 1 && (
                <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                  You&apos;ve exceeded your calorie goal by <span className="font-bold">{Math.round(consumedCal - targetCal)} kcal</span>. Consider lighter meals for the rest of the day.
                </p>
              )}
              {pctConsumed >= 0.75 && pctConsumed <= 1 && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed">
                  Great progress! You&apos;re <span className="font-bold">{Math.round(targetCal - consumedCal)} kcal</span> away from your daily goal.
                </p>
              )}
              {pctConsumed < 0.75 && pctConsumed > 0 && (
                <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
                  You still have <span className="font-bold">{Math.round(targetCal - consumedCal)} kcal</span> remaining. Time to fuel up!
                </p>
              )}
              {consumedCal === 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  No meals logged yet today. Start with a balanced breakfast!
                </p>
              )}

              {/* Protein status */}
              {consumedProtein > 0 && pctProtein >= 0.8 && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  Protein goal almost reached! {'\uD83C\uDF89'} ({Math.round(consumedProtein)}/{Math.round(targetProtein)}g)
                </p>
              )}

              {/* Time-of-day tip */}
              <p className="text-xs text-gray-500 dark:text-gray-400 italic">{'\uD83D\uDCAC'} {timeOfDayTip}</p>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* ═══ Feature 2: Meal Plan Generator Banner ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card className="p-4 rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-100/60 dark:border-gray-800/60 bg-gradient-to-r from-emerald-500/5 to-teal-500/5">
          {!mealPlan?.exists ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center">
                  <Sparkles className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Today&apos;s Plan</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Generate a personalized meal plan</p>
                </div>
              </div>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium min-h-[36px]"
                onClick={handleGeneratePlan}
                disabled={planLoading}
              >
                {planLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
                Generate
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center">
                    <Sparkles className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Today&apos;s Meal Plan</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">AI-generated for your goals</p>
                  </div>
                </div>
                <Badge className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 text-xs">Active</Badge>
              </div>

              {/* Plan items by slot */}
              {SLOTS.map((slot) => {
                const slotItems = (mealPlan?.items || []).filter((i) => i.mealSlot === slot);
                if (slotItems.length === 0) return null;
                const isExpanded = planExpanded[slot] || false;
                return (
                  <Collapsible
                    key={slot}
                    open={isExpanded}
                    onOpenChange={(open) => setPlanExpanded((prev) => ({ ...prev, [slot]: open }))}
                  >
                    <CollapsibleTrigger asChild>
                      <button className={`w-full flex items-center gap-2 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800 hover:bg-white/80 dark:hover:bg-gray-800/50 transition-colors text-left ${SLOT_GRADIENT_COLORS[slot].from} ${SLOT_GRADIENT_COLORS[slot].to}`}>
                        <span>{SLOT_ICONS[slot]}</span>
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{SLOT_LABELS[slot]}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1">{slotItems[0]?.meal.name}</span>
                        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 dark:text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    </CollapsibleTrigger>
                    <AnimatePresence>
                      {isExpanded && (
                        <CollapsibleContent forceMount>
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="pl-4 pr-1 pt-1 space-y-1.5">
                              {slotItems.map((item) => (
                                <div key={item.id} className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{item.meal.name}</p>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 font-medium border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">{item.meal.cuisine}</Badge>
                                      <span className="text-xs text-gray-400 dark:text-gray-500">{item.servingGms}g</span>
                                    </div>
                                    {item.nutrition && (
                                      <div className="flex gap-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                        <span className="text-orange-600 dark:text-orange-400 font-medium">{item.nutrition.calories} kcal</span>
                                        <span>P: {item.nutrition.proteinG}g</span>
                                        <span>C: {item.nutrition.carbsG}g</span>
                                        <span>F: {item.nutrition.fatG}g</span>
                                      </div>
                                    )}
                                  </div>
                                  <Button
                                    size="sm"
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold min-h-[30px] rounded-lg px-2.5 shrink-0"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setServingGms(item.servingGms);
                                      setLogDialog({
                                        open: true,
                                        meal: {
                                          meal: { id: item.meal.id, name: item.meal.name, mealType: item.mealSlot, cuisine: item.meal.cuisine, imageUrl: null, prepTimeMin: item.meal.prepTimeMin, isVeg: item.meal.isVeg, isVegan: item.meal.isVegan },
                                          score: 0,
                                          recommendedServingGms: item.servingGms,
                                          estimatedNutrition: item.nutrition,
                                          baseNutritionPer100g: item.nutrition ? { calories: Math.round(item.nutrition.calories / item.servingGms * 100), proteinG: Math.round(item.nutrition.proteinG / item.servingGms * 1000) / 10, carbsG: Math.round(item.nutrition.carbsG / item.servingGms * 1000) / 10, fatG: Math.round(item.nutrition.fatG / item.servingGms * 1000) / 10 } : null,
                                        },
                                        slot: item.mealSlot,
                                        baseNutritionPer100g: item.nutrition ? { calories: Math.round(item.nutrition.calories / item.servingGms * 100), proteinG: Math.round(item.nutrition.proteinG / item.servingGms * 1000) / 10, carbsG: Math.round(item.nutrition.carbsG / item.servingGms * 1000) / 10, fatG: Math.round(item.nutrition.fatG / item.servingGms * 1000) / 10 } : null,
                                        mealName: item.meal.name,
                                        cuisine: item.meal.cuisine,
                                        mealType: item.mealSlot,
                                        isVeg: item.meal.isVeg,
                                        isVegan: item.meal.isVegan,
                                      });
                                    }}
                                  >
                                    Log
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        </CollapsibleContent>
                      )}
                    </AnimatePresence>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </Card>
      </motion.div>

      {/* ═══ Achievements Row ═══ */}
      {achievements.length > 0 && (
        <Card className="p-4 rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-100/60 dark:border-gray-800/60">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Achievements</h3>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {achievements.filter((a) => a.earned).length}/8 Unlocked
            </span>
          </div>
          {achievements.every((a) => !a.earned) ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">Start logging meals to earn badges!</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {achievements.map((ach) => (
                <div
                  key={ach.id}
                  className={`shrink-0 w-16 flex flex-col items-center gap-1 p-2 rounded-xl border transition-colors ${
                    ach.earned
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                      : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-40'
                  }`}
                >
                  {ach.earned ? (
                    <span className="text-2xl leading-none">{ach.icon}</span>
                  ) : (
                    <Lock className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  )}
                  <span className={`text-[10px] font-medium text-center leading-tight ${
                    ach.earned ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'
                  }`}>
                    {ach.earned ? ach.name : 'Locked'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ═══ Meal Slots with gradient headers & search buttons ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SLOTS.map((slot) => {
          const recs = recommendations[slot] || [];
          const grad = SLOT_GRADIENT_COLORS[slot];
          return (
            <Card key={slot} className={`p-0 rounded-xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border-l-4 ${SLOT_BORDER_COLORS[slot]} overflow-hidden`}>
              <div className={`bg-gradient-to-r ${grad.from} ${grad.to} px-4 py-3`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{SLOT_ICONS[slot]}</span>
                    <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">{SLOT_LABELS[slot]}</h3>
                  </div>
                  <Button
                    variant="ghost" size="icon"
                    className="h-8 w-8 text-gray-400 dark:text-gray-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                    onClick={() => { setSearchQuery(''); setSearchResults([]); setSlotSearchDialog({ open: true, slot }); }}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="px-4 pb-3 pt-2 space-y-2 max-h-64 overflow-y-auto">
                {recs.length === 0 && (
                  <div className="text-center py-3">
                    <p className="text-xs text-gray-400 dark:text-gray-500">No recommendations</p>
                    <Button variant="ghost" size="sm" className="text-emerald-600 dark:text-emerald-400 text-xs mt-1 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" onClick={() => { setSearchQuery(''); setSearchResults([]); setSlotSearchDialog({ open: true, slot }); }}>
                      <Search className="h-3 w-3 mr-1" />Search for meals
                    </Button>
                  </div>
                )}
                {recs.map((rec) => (
                  <div
                    key={rec.meal.id}
                    className="p-2.5 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 space-y-1.5 hover:shadow-sm hover:border-emerald-100 dark:hover:border-emerald-800 transition-all cursor-pointer"
                    onClick={() => setDetailSheet({ open: true, rec })}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-tight line-clamp-1">{rec.meal.name}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        {rec.meal.isVeg && <span className="text-green-600 text-xs font-bold border border-green-300 dark:border-green-700 rounded px-1">V</span>}
                        {rec.meal.isVegan && <span className="text-green-700 text-xs font-bold border border-green-400 dark:border-green-600 rounded px-1">VG</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 font-medium border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">{rec.meal.cuisine}</Badge>
                      {rec.meal.prepTimeMin && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-0.5"><Clock className="h-3 w-3" />{rec.meal.prepTimeMin}m</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="font-medium text-gray-700 dark:text-gray-300">{rec.baseNutritionPer100g?.calories || 0} kcal/100g</span>
                      <span>&middot;</span>
                      <span>P: {rec.baseNutritionPer100g?.proteinG || 0}g</span>
                      {rec.estimatedNutrition && (
                        <span>&middot; <span className="text-emerald-600 dark:text-emerald-400">~{rec.estimatedNutrition.calories} kcal ({rec.recommendedServingGms}g)</span></span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold min-h-[32px] rounded-lg mt-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setServingGms(rec.recommendedServingGms);
                        setLogDialog({
                          open: true, meal: rec, slot,
                          baseNutritionPer100g: rec.baseNutritionPer100g,
                          mealName: rec.meal.name, cuisine: rec.meal.cuisine,
                          mealType: rec.meal.mealType, description: rec.meal.description,
                          isVeg: rec.meal.isVeg, isVegan: rec.meal.isVegan,
                        });
                      }}
                    >
                      I Ate This
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      {/* ═══ Log Meal Dialog ═══ */}
      <Dialog open={logDialog.open} onOpenChange={(open) => setLogDialog(open ? logDialog : { open: false })}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle>Log Meal</DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              {logDialog.open && <span className="font-medium text-gray-700 dark:text-gray-300">{logDialog.mealName}</span>}
              {logDialog.open && logDialog.cuisine && <Badge variant="outline" className="text-xs">{logDialog.cuisine}</Badge>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Serving Size (grams)</Label>
              <Input type="number" value={servingGms} onChange={(e) => setServingGms(Number(e.target.value))} min={10} max={1000} className="h-11 rounded-xl" />
            </div>
            {logDialog.open && logDialog.baseNutritionPer100g && (
              <div className="space-y-3">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-sm space-y-1">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Per 100g</p>
                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <span className="text-gray-600 dark:text-gray-400">Calories:</span><span className="font-bold text-gray-900 dark:text-gray-100">{logDialog.baseNutritionPer100g.calories} kcal</span>
                    <span className="text-gray-600 dark:text-gray-400">Protein:</span><span className="font-bold text-blue-600">{logDialog.baseNutritionPer100g.proteinG}g</span>
                    <span className="text-gray-600 dark:text-gray-400">Carbs:</span><span className="font-bold text-amber-600">{logDialog.baseNutritionPer100g.carbsG}g</span>
                    <span className="text-gray-600 dark:text-gray-400">Fat:</span><span className="font-bold text-rose-600">{logDialog.baseNutritionPer100g.fatG}g</span>
                  </div>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 text-sm space-y-1 border border-emerald-100 dark:border-emerald-800">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide mb-1.5">Estimated for {servingGms}g serving</p>
                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <span className="text-gray-600 dark:text-gray-400">Calories:</span><span className="font-bold text-gray-900 dark:text-gray-100">{Math.round((logDialog.baseNutritionPer100g.calories / 100) * servingGms)} kcal</span>
                    <span className="text-gray-600 dark:text-gray-400">Protein:</span><span className="font-bold text-blue-600">{Math.round((logDialog.baseNutritionPer100g.proteinG / 100) * servingGms * 10) / 10}g</span>
                    <span className="text-gray-600 dark:text-gray-400">Carbs:</span><span className="font-bold text-amber-600">{Math.round((logDialog.baseNutritionPer100g.carbsG / 100) * servingGms * 10) / 10}g</span>
                    <span className="text-gray-600 dark:text-gray-400">Fat:</span><span className="font-bold text-rose-600">{Math.round((logDialog.baseNutritionPer100g.fatG / 100) * servingGms * 10) / 10}g</span>
                  </div>
                </div>
              </div>
            )}
            {logDialog.open && logDialog.baseNutritionPer100g && (
              <NutritionFactsLabel nutrition={logDialog.baseNutritionPer100g} servingGms={servingGms} label="Per Serving" />
            )}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Meal Slot</Label>
              <Select value={logDialog.open ? logDialog.slot : 'lunch'} onValueChange={(v) => logDialog.open && setLogDialog({ ...logDialog, slot: v })}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{SLOTS.map((s) => <SelectItem key={s} value={s}>{SLOT_LABELS[s]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogDialog({ open: false })} className="rounded-xl">Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold" onClick={handleLogMeal}>Log It</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Per-Slot Meal Search Dialog ═══ */}
      <Dialog open={slotSearchDialog.open} onOpenChange={(open) => { if (!open) { setSlotSearchDialog({ open: false }); setSearchQuery(''); setSearchResults([]); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Search Meals</DialogTitle>
            <DialogDescription>Find and log a meal for {slotSearchDialog.open ? SLOT_LABELS[slotSearchDialog.slot] : ''}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search meals..."
                value={searchQuery}
                onChange={(e) => handleSlotSearch(e.target.value)}
                className="h-11 rounded-xl pl-9"
                autoFocus
              />
            </div>
            <ScrollArea className="max-h-72">
              <div className="space-y-2">
                {searchLoading && <div className="flex justify-center py-6"><LoaderIcon className="h-5 w-5 animate-spin text-emerald-600" /></div>}
                {!searchLoading && searchQuery && searchResults.length === 0 && (
                  <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">No results found</p>
                )}
                {!searchLoading && searchResults.map((meal) => (
                  <div
                    key={meal.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 hover:border-emerald-100 dark:hover:border-emerald-800 transition-colors cursor-pointer"
                    onClick={() => handleLogFromSearch(meal)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{meal.name}</p>
                        <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 font-medium border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 shrink-0">{meal.cuisine}</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        <span>{meal.nutrition?.calories || 0} kcal/100g</span>
                        <span>&middot;</span>
                        <span className="text-blue-600 font-medium">P: {meal.nutrition?.proteinG || 0}g</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600 shrink-0" />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ Meal Detail Sheet ═══ */}
      <Sheet open={detailSheet.open} onOpenChange={(open) => { if (!open) setDetailSheet({ open: false }); }}>
        <SheetContent side="bottom" className="max-w-lg mx-auto rounded-t-2xl max-h-[85vh]">
          {detailSheet.open && (
            <>
              <SheetHeader className="pt-2">
                <div className="flex items-center gap-2 pr-8">
                  {detailSheet.rec.meal.isVeg && <span className="text-green-600 text-xs font-bold border border-green-300 rounded px-1.5 py-0.5">Veg</span>}
                  {detailSheet.rec.meal.isVegan && <span className="text-green-700 text-xs font-bold border border-green-400 rounded px-1.5 py-0.5">Vegan</span>}
                </div>
                <SheetTitle className="text-lg">{detailSheet.rec.meal.name}</SheetTitle>
                <SheetDescription className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">{detailSheet.rec.meal.cuisine}</Badge>
                  <Badge variant="outline" className={`text-xs ${SLOT_BADGE_COLORS[detailSheet.rec.meal.mealType] || ''}`}>{detailSheet.rec.meal.mealType}</Badge>
                  {detailSheet.rec.meal.prepTimeMin && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><Clock className="h-3 w-3" />{detailSheet.rec.meal.prepTimeMin} min</span>
                  )}
                </SheetDescription>
              </SheetHeader>
              <ScrollArea className="flex-1 px-4 pb-4">
                <div className="space-y-4">
                  {detailSheet.rec.meal.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{detailSheet.rec.meal.description}</p>
                  )}
                  {detailSheet.rec.baseNutritionPer100g && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Nutrition per 100g</h4>
                      <NutritionFactsLabel nutrition={detailSheet.rec.baseNutritionPer100g} servingGms={100} label="Per 100g" />
                    </div>
                  )}
                  {detailSheet.rec.estimatedNutrition && (
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 border border-emerald-100 dark:border-emerald-800">
                      <h4 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide mb-2">Recommended: {detailSheet.rec.recommendedServingGms}g serving</h4>
                      <div className="grid grid-cols-2 gap-1.5 text-xs">
                        <span className="text-gray-600 dark:text-gray-400">Calories:</span><span className="font-bold">{detailSheet.rec.estimatedNutrition.calories} kcal</span>
                        <span className="text-gray-600 dark:text-gray-400">Protein:</span><span className="font-bold text-blue-600">{detailSheet.rec.estimatedNutrition.proteinG}g</span>
                        <span className="text-gray-600 dark:text-gray-400">Carbs:</span><span className="font-bold text-amber-600">{detailSheet.rec.estimatedNutrition.carbsG}g</span>
                        <span className="text-gray-600 dark:text-gray-400">Fat:</span><span className="font-bold text-rose-600">{detailSheet.rec.estimatedNutrition.fatG}g</span>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
              <SheetFooter className="border-t pt-3">
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold min-h-[44px]"
                  onClick={() => {
                    const r = detailSheet.rec;
                    setServingGms(r.recommendedServingGms);
                    setLogDialog({
                      open: true, meal: r, slot: r.meal.mealType,
                      baseNutritionPer100g: r.baseNutritionPer100g,
                      mealName: r.meal.name, cuisine: r.meal.cuisine,
                      mealType: r.meal.mealType, description: r.meal.description,
                      isVeg: r.meal.isVeg, isVegan: r.meal.isVegan,
                    });
                    setDetailSheet({ open: false });
                  }}
                >
                  Log This Meal
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </motion.div>
  );
}

// Simple inline icons
function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  );
}

function LoaderIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
