'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { format, subDays, parseISO } from 'date-fns';
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
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Camera, RotateCcw, Trash2, Plus, Search, ChevronDown, ChevronRight, Flame, Dumbbell, Wheat, Droplets, UtensilsCrossed } from 'lucide-react';
import { apiFetch } from './api';
import { SLOTS, SLOT_LABELS, SLOT_ICONS, SLOT_BORDER_COLORS, fadeIn } from './constants';
import type { FoodLogItem, SearchMeal } from './types';

export function FoodLogView() {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [foodLog, setFoodLog] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [relogDialog, setRelogDialog] = useState<{ open: boolean; item: FoodLogItem } | { open: false }>({ open: false });
  const [relogSlot, setRelogSlot] = useState('lunch');
  const [nutritionTargets, setNutritionTargets] = useState<Record<string, number>>({});

  // Feature 1: Quick Add Custom Food
  const [quickAddDialog, setQuickAddDialog] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickSlot, setQuickSlot] = useState('lunch');
  const [quickServing, setQuickServing] = useState(100);
  const [quickCalories, setQuickCalories] = useState('');
  const [quickProtein, setQuickProtein] = useState('');
  const [quickCarbs, setQuickCarbs] = useState('');
  const [quickFat, setQuickFat] = useState('');
  const [showMacros, setShowMacros] = useState(false);
  const [quickAdding, setQuickAdding] = useState(false);

  // Feature 4: Search Meals
  const [searchDialog, setSearchDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchMeal[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchDebounce, setSearchDebounce] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Log meal dialog from search (Feature 4)
  const [logFromSearchDialog, setLogFromSearchDialog] = useState<{
    open: boolean;
    meal: SearchMeal;
  } | { open: false }>({ open: false });
  const [searchLogServing, setSearchLogServing] = useState(100);

  const dates = Array.from({ length: 7 }, (_, i) => format(subDays(new Date(), 6 - i), 'yyyy-MM-dd'));
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    apiFetch('/api/nutrition/daily').then((d: Record<string, unknown>) => {
      const targets = d.targets as Record<string, number> | undefined;
      setNutritionTargets({
        calories: targets?.calories || 0,
        proteinG: targets?.proteinG || 0,
        carbsG: targets?.carbsG || 0,
        fatG: targets?.fatG || 0,
      });
    }).catch(() => {});
  }, []);

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/food-logs?date=${selectedDate}`);
      setFoodLog(data);
    } catch { toast.error('Failed to load food log'); }
    finally { setLoading(false); }
  }, [selectedDate]);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  const handleDelete = async (itemId: string) => {
    try {
      await apiFetch(`/api/food-logs?id=${itemId}`, { method: 'DELETE' });
      toast.success('Item removed');
      fetchLog();
    } catch (err) { toast.error((err as Error).message); }
  };

  const handleRelog = async () => {
    if (!relogDialog.open) return;
    const item = relogDialog.item;
    try {
      if (item.mealId) {
        await apiFetch('/api/food-logs', {
          method: 'POST',
          body: JSON.stringify({ mealId: item.mealId, servingGms: item.servingGms, mealSlot: relogSlot }),
        });
      } else {
        await apiFetch('/api/food-logs', {
          method: 'POST',
          body: JSON.stringify({ customName: item.meal?.name || 'Food', servingGms: item.servingGms, mealSlot: relogSlot, caloriesPer100g: Math.round(item.calories / item.servingGms * 100), proteinPer100g: Math.round(item.proteinG / item.servingGms * 100) }),
        });
      }
      toast.success(`Re-logged ${item.meal?.name || 'meal'}!`);
      setRelogDialog({ open: false });
      fetchLog();
    } catch (err) { toast.error((err as Error).message); }
  };

  // Feature 1: Handle quick add
  const handleQuickAdd = async () => {
    if (!quickName.trim()) { toast.error('Please enter a food name'); return; }
    if (!quickCalories || Number(quickCalories) <= 0) { toast.error('Please enter calories'); return; }
    setQuickAdding(true);
    try {
      await apiFetch('/api/food-logs/quick', {
        method: 'POST',
        body: JSON.stringify({
          name: quickName.trim(),
          calories: Number(quickCalories),
          proteinG: Number(quickProtein) || 0,
          carbsG: Number(quickCarbs) || 0,
          fatG: Number(quickFat) || 0,
          mealSlot: quickSlot,
          servingGms: quickServing,
        }),
      });
      toast.success(`Logged ${quickName.trim()}!`);
      // Reset form
      setQuickAddDialog(false);
      setQuickName('');
      setQuickCalories('');
      setQuickProtein('');
      setQuickCarbs('');
      setQuickFat('');
      setQuickServing(100);
      setShowMacros(false);
      fetchLog();
    } catch (err) { toast.error((err as Error).message); }
    finally { setQuickAdding(false); }
  };

  // Feature 4: Search handlers
  const handleSearch = (query: string) => {
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

  const handleLogFromSearch = async () => {
    if (!logFromSearchDialog.open) return;
    const meal = logFromSearchDialog.meal;
    try {
      await apiFetch('/api/food-logs', {
        method: 'POST',
        body: JSON.stringify({ mealId: meal.id, servingGms: searchLogServing, mealSlot: quickSlot }),
      });
      toast.success(`Logged ${meal.name}!`);
      setLogFromSearchDialog({ open: false });
      setSearchDialog(false);
      setSearchQuery('');
      setSearchResults([]);
      fetchLog();
    } catch (err) { toast.error((err as Error).message); }
  };

  const itemsBySlot = (foodLog?.itemsBySlot || {}) as Record<string, FoodLogItem[]>;
  const hasItems = Object.values(itemsBySlot).some((items: FoodLogItem[]) => items.length > 0);

  return (
    <motion.div {...fadeIn} className="p-4 max-w-lg mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Food Log</h1>

      {/* Feature 4: Search bar */}
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 shrink-0 pointer-events-none" />
          <button
            onClick={() => { setSearchQuery(''); setSearchResults([]); setSearchDialog(true); }}
            className="w-full flex items-center gap-2 pl-10 pr-4 h-11 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-emerald-200 dark:hover:border-emerald-800 transition-all text-left"
          >
            <span className="text-sm text-gray-400 dark:text-gray-500">Search meals to log...</span>
          </button>
        </div>
      </motion.div>

      {/* Date strip */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {dates.map((date) => {
          const isSelected = date === selectedDate;
          const isToday = date === todayStr;
          return (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              className={`flex flex-col items-center min-w-[52px] py-2 px-2 rounded-xl transition-all shrink-0 min-h-[44px] ${
                isSelected
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200/60 dark:shadow-emerald-900/40 -translate-y-0.5'
                  : `text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 ${isToday && !isSelected ? 'ring-1 ring-emerald-300 dark:ring-emerald-700' : ''}`
              }`}
            >
              <span className="text-[10px] font-medium uppercase">{format(parseISO(date), 'EEE')}</span>
              <span className={`text-sm font-bold ${isSelected ? '' : ''}`}>{format(parseISO(date), 'd')}</span>
              {isToday && !isSelected && (
                <span className="w-1 h-1 rounded-full bg-emerald-500 mt-0.5" />
              )}
            </button>
          );
        })}
      </div>
      <div className="h-px bg-gray-200/60 dark:bg-gray-800/60 -mt-1" />
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
          {format(parseISO(dates[0]), 'MMM d')} – {format(parseISO(dates[dates.length - 1]), 'MMM d')}
        </span>
        {selectedDate !== todayStr && (
          <button
            onClick={() => setSelectedDate(todayStr)}
            className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
          >
            Today
          </button>
        )}
      </div>

      {/* Summary */}
      <Card className="p-4 rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-100/60 dark:border-gray-800/60 bg-white dark:bg-gray-900">
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: 'Calories', val: foodLog?.totalCalories || 0, unit: 'kcal', color: 'text-orange-600 dark:text-orange-400', iconBg: 'bg-orange-100 dark:bg-orange-900/30', Icon: Flame },
            { label: 'Protein', val: foodLog?.totalProtein || 0, unit: 'g', color: 'text-blue-600 dark:text-blue-400', iconBg: 'bg-blue-100 dark:bg-blue-900/30', Icon: Dumbbell },
            { label: 'Carbs', val: foodLog?.totalCarbs || 0, unit: 'g', color: 'text-amber-600 dark:text-amber-400', iconBg: 'bg-amber-100 dark:bg-amber-900/30', Icon: Wheat },
            { label: 'Fat', val: foodLog?.totalFat || 0, unit: 'g', color: 'text-rose-600 dark:text-rose-400', iconBg: 'bg-rose-100 dark:bg-rose-900/30', Icon: Droplets },
          ].map((s) => {
            const targetKey = s.unit === 'kcal' ? 'calories' : s.label === 'Protein' ? 'proteinG' : s.label === 'Carbs' ? 'carbsG' : 'fatG';
            const targetVal = nutritionTargets[targetKey] || 0;
            return (
              <div key={s.label} className="flex flex-col items-center gap-1.5 border border-gray-100 dark:border-gray-800 rounded-xl p-2.5 shadow-sm">
                <div className={`w-8 h-8 rounded-full ${s.iconBg} flex items-center justify-center`}>
                  <s.Icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <p className={`text-lg font-bold ${s.color} tabular-nums`}>{Math.round(s.val)}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">{s.label}</p>
                {targetVal > 0 && (
                  <div className="w-full h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        s.label === 'Calories' ? 'bg-orange-500' : s.label === 'Protein' ? 'bg-blue-500' : s.label === 'Carbs' ? 'bg-amber-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.round(s.val / targetVal * 100))}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !hasItems && (
        <Card className="p-8 text-center rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-100/60 dark:border-gray-800/60 bg-white dark:bg-gray-900">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <UtensilsCrossed className="h-8 w-8 text-gray-300 dark:text-gray-600" />
          </div>
          <p className="text-gray-700 dark:text-gray-300 font-semibold text-base">No meals logged</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Search for meals or add a custom food</p>
        </Card>
      )}

      {/* Food items by slot */}
      {!loading && SLOTS.map((slot) => {
        const items = itemsBySlot[slot] || [];
        if (items.length === 0) return null;
        return (
          <Card key={slot} className={`p-0 rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-100/60 dark:border-gray-800/60 border-l-4 ${SLOT_BORDER_COLORS[slot]} overflow-hidden bg-white dark:bg-gray-900`}>
            <div className="p-4 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-base">{SLOT_ICONS[slot]}</span>
                <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">{SLOT_LABELS[slot]}</h3>
                <Badge variant="secondary" className="text-xs ml-auto bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">{items.length} item{items.length > 1 ? 's' : ''}</Badge>
              </div>
            </div>
            <div className="px-4 pb-3 space-y-3">
              {items.map((item) => (
                <div key={item.id} className={`flex items-center justify-between p-3 rounded-xl bg-gray-50/80 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 border-l-3 ${SLOT_BORDER_COLORS[slot]} group shadow-sm hover:shadow-md hover:bg-gray-50/100 dark:hover:bg-gray-800/80 hover:border-gray-200/80 dark:hover:border-gray-700 transition-all`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{item.meal?.name || 'Unknown'}</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{item.servingGms}g</p>
                  </div>
                  <div className="text-right shrink-0 mr-2">
                    <p className="text-sm font-bold text-gray-800 dark:text-gray-200 tabular-nums">{Math.round(item.calories)}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">kcal</p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0 ml-2">
                    <button
                      className="h-7 w-7 flex items-center justify-center rounded-lg text-emerald-600 dark:text-emerald-400 font-semibold text-xs hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                      onClick={() => { setRelogDialog({ open: true, item }); setRelogSlot(item.mealSlot); }}
                      title="Log Again"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7 text-gray-300 dark:text-gray-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-40 hover:opacity-100 transition-opacity"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        );
      })}

      {/* Feature 1: Quick Add FAB (above nav) */}
      <motion.div
        className="fixed bottom-24 right-4 z-40"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.2 }}
      >
        <Button
          size="icon"
          className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-xl hover:shadow-2xl transition-shadow"
          onClick={() => setQuickAddDialog(true)}
        >
          <Plus className="h-6 w-6" />
        </Button>
      </motion.div>

      {/* ═══ Feature 1: Quick Add Custom Food Dialog ═══ */}
      <Dialog open={quickAddDialog} onOpenChange={setQuickAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Quick Add Food</DialogTitle>
            <DialogDescription>Log a custom food with its nutrition info</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Food Name *</Label>
              <Input
                placeholder="e.g. Chicken Sandwich"
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
                className="h-11 rounded-xl"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Meal Slot</Label>
              <Select value={quickSlot} onValueChange={setQuickSlot}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{SLOTS.map((s) => <SelectItem key={s} value={s}>{SLOT_LABELS[s]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Serving (g)</Label>
                <Input
                  type="number"
                  value={quickServing}
                  onChange={(e) => setQuickServing(Number(e.target.value) || 100)}
                  min={1} max={5000}
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Calories * (kcal)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 350"
                  value={quickCalories}
                  onChange={(e) => setQuickCalories(e.target.value)}
                  min={1}
                  className="h-11 rounded-xl"
                />
              </div>
            </div>

            {/* Collapsible macros */}
            <Collapsible open={showMacros} onOpenChange={setShowMacros}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors">
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMacros ? 'rotate-180' : ''}`} />
                  {showMacros ? 'Hide' : 'Add'} protein, carbs & fat
                </button>
              </CollapsibleTrigger>
              <AnimatePresence>
                {showMacros && (
                  <CollapsibleContent forceMount>
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-3 gap-2 pt-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-gray-500 dark:text-gray-400">Protein (g)</Label>
                          <Input type="number" placeholder="0" value={quickProtein} onChange={(e) => setQuickProtein(e.target.value)} min={0} className="h-10 rounded-lg text-sm" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-gray-500 dark:text-gray-400">Carbs (g)</Label>
                          <Input type="number" placeholder="0" value={quickCarbs} onChange={(e) => setQuickCarbs(e.target.value)} min={0} className="h-10 rounded-lg text-sm" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-gray-500 dark:text-gray-400">Fat (g)</Label>
                          <Input type="number" placeholder="0" value={quickFat} onChange={(e) => setQuickFat(e.target.value)} min={0} className="h-10 rounded-lg text-sm" />
                        </div>
                      </div>
                    </motion.div>
                  </CollapsibleContent>
                )}
              </AnimatePresence>
            </Collapsible>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickAddDialog(false)} className="rounded-xl">Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold"
              onClick={handleQuickAdd}
              disabled={quickAdding || !quickName.trim() || !quickCalories}
            >
              {quickAdding ? 'Logging...' : 'Log It'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Feature 4: Search Meals Dialog ═══ */}
      <Dialog open={searchDialog} onOpenChange={(open) => { if (!open) { setSearchDialog(false); setSearchQuery(''); setSearchResults([]); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Search Meals</DialogTitle>
            <DialogDescription>Find and log a meal</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search meals..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="h-11 rounded-xl pl-9"
                autoFocus
              />
            </div>
            <ScrollArea className="max-h-72">
              <div className="space-y-2">
                {searchLoading && <div className="flex justify-center py-6"><SpinnerIcon /></div>}
                {!searchLoading && searchQuery && searchResults.length === 0 && (
                  <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">No results found</p>
                )}
                {!searchLoading && searchResults.map((meal) => (
                  <div
                    key={meal.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 hover:border-emerald-100 dark:hover:border-emerald-800 transition-colors cursor-pointer"
                    onClick={() => {
                      setSearchLogServing(meal.baseServingGms || 100);
                      setLogFromSearchDialog({ open: true, meal });
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{meal.name}</p>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-medium border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 shrink-0">{meal.cuisine}</Badge>
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

      {/* ═══ Feature 4: Log Meal from Search Dialog ═══ */}
      <Dialog open={logFromSearchDialog.open} onOpenChange={(open) => { if (!open) setLogFromSearchDialog({ open: false }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log Meal</DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              {logFromSearchDialog.open && <span className="font-medium text-gray-700 dark:text-gray-300">{logFromSearchDialog.meal.name}</span>}
              {logFromSearchDialog.open && <Badge variant="outline" className="text-xs">{logFromSearchDialog.meal.cuisine}</Badge>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Serving Size (grams)</Label>
              <Input type="number" value={searchLogServing} onChange={(e) => setSearchLogServing(Number(e.target.value))} min={10} max={1000} className="h-11 rounded-xl" />
            </div>
            {logFromSearchDialog.open && logFromSearchDialog.meal.nutrition && (
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 text-sm space-y-1 border border-emerald-100 dark:border-emerald-800">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide mb-1.5">Estimated for {searchLogServing}g serving</p>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <span className="text-gray-600 dark:text-gray-400">Calories:</span><span className="font-bold text-gray-900 dark:text-gray-100">{Math.round((logFromSearchDialog.meal.nutrition!.calories / 100) * searchLogServing)} kcal</span>
                  <span className="text-gray-600 dark:text-gray-400">Protein:</span><span className="font-bold text-blue-600">{Math.round((logFromSearchDialog.meal.nutrition!.proteinG / 100) * searchLogServing * 10) / 10}g</span>
                  <span className="text-gray-600 dark:text-gray-400">Carbs:</span><span className="font-bold text-amber-600">{Math.round((logFromSearchDialog.meal.nutrition!.carbsG / 100) * searchLogServing * 10) / 10}g</span>
                  <span className="text-gray-600 dark:text-gray-400">Fat:</span><span className="font-bold text-rose-600">{Math.round((logFromSearchDialog.meal.nutrition!.fatG / 100) * searchLogServing * 10) / 10}g</span>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Meal Slot</Label>
              <Select value={quickSlot} onValueChange={setQuickSlot}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{SLOTS.map((s) => <SelectItem key={s} value={s}>{SLOT_LABELS[s]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogFromSearchDialog({ open: false })} className="rounded-xl">Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold" onClick={handleLogFromSearch}>Log It</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Re-log Dialog */}
      <Dialog open={relogDialog.open} onOpenChange={(open) => setRelogDialog(open ? relogDialog : { open: false })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Log Again</DialogTitle>
            <DialogDescription>{relogDialog.open ? relogDialog.item.meal?.name || 'This meal' : ''} ({relogDialog.open ? relogDialog.item.servingGms : 0}g)</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Log as</Label>
              <Select value={relogSlot} onValueChange={setRelogSlot}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{SLOTS.map((s) => <SelectItem key={s} value={s}>{SLOT_LABELS[s]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRelogDialog({ open: false })} className="rounded-xl">Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold" onClick={handleRelog}>Log Again</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

function SpinnerIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 animate-spin text-emerald-600">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
