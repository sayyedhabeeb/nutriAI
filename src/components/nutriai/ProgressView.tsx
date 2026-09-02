'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  TrendingUp, Flame, Dumbbell, Scale, Droplets, Plus, Minus,
  BarChart3, Download, Lightbulb, Trophy, Lock, CalendarDays, Leaf,
} from 'lucide-react';
import { apiFetch } from './api';
import { PIE_COLORS, fadeIn } from './constants';

export function ProgressView({ onNavigate }: { onNavigate?: (v: string) => void } = {}) {
  const [tab, setTab] = useState('weekly');
  const [weeklyData, setWeeklyData] = useState<Record<string, unknown>[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [weightLogs, setWeightLogs] = useState<Record<string, unknown>[]>([]);
  const [waterGlasses, setWaterGlasses] = useState(0);
  const [loading, setLoading] = useState(true);
  const [weightInput, setWeightInput] = useState('');
  const [weightNotes, setWeightNotes] = useState('');
  const [justFilledIndex, setJustFilledIndex] = useState<number | null>(null);

  // Achievements state
  const [achievements, setAchievements] = useState<{ id: string; name: string; description: string; icon: string; earned: boolean; earnedDate?: string }[]>([]);

  // Export dialog state
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');
  const [exportDays, setExportDays] = useState('7');
  const [exporting, setExporting] = useState(false);

  const fetchProgress = useCallback(async () => {
    setLoading(true);
    try {
      const [weekData, sumData, wLogs, waterData] = await Promise.all([
        apiFetch('/api/progress/weekly'),
        apiFetch(`/api/progress/summary?period=${tab === 'monthly' ? 'month' : 'week'}`),
        apiFetch('/api/weight-log?limit=30'),
        apiFetch('/api/water-log'),
      ]);
      setWeeklyData(weekData || []);
      setSummary(sumData?.summary || null);
      setWeightLogs(wLogs || []);
      setWaterGlasses(waterData?.glassesConsumed || 0);

      // Fetch achievements
      try {
        const achData = await apiFetch('/api/achievements');
        setAchievements(achData.achievements || []);
      } catch {
        // Silent fail
      }
    } catch { toast.error('Failed to load progress'); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { fetchProgress(); }, [fetchProgress]);

  const handleAddWater = async (delta: number) => {
    const newCount = waterGlasses + delta;
    if (newCount < 0) return;
    if (delta > 0) {
      setJustFilledIndex(waterGlasses);
      setTimeout(() => setJustFilledIndex(null), 600);
      try {
        await apiFetch('/api/water-log', { method: 'POST', body: JSON.stringify({ glasses: delta }) });
        setWaterGlasses(newCount);
        toast.success(`\uD83D\uDCA7 +${delta} glass${delta > 1 ? 'es' : ''} of water`);
      } catch { toast.error('Failed to log water'); }
    } else {
      setWaterGlasses(Math.max(0, newCount));
    }
  };

  const handleWaterAdd = async () => {
    setJustFilledIndex(waterGlasses);
    setTimeout(() => setJustFilledIndex(null), 600);
    try {
      await apiFetch('/api/water-log', { method: 'POST', body: JSON.stringify({ glasses: 1 }) });
      setWaterGlasses(waterGlasses + 1);
      toast.success('\uD83D\uDCA7 +1 glass of water');
    } catch { toast.error('Failed to log water'); }
  };

  const handleLogWeight = async () => {
    if (!weightInput || Number(weightInput) <= 0) return;
    try {
      await apiFetch('/api/weight-log', { method: 'POST', body: JSON.stringify({ weightKg: Number(weightInput), notes: weightNotes || null }) });
      toast.success('Weight logged!');
      setWeightInput('');
      setWeightNotes('');
      fetchProgress();
    } catch (err) { toast.error((err as Error).message); }
  };

  const handleExportCsv = () => {
    if (weeklyData.length === 0) {
      toast.error('No data to export');
      return;
    }
    const header = 'Date,Calories,Protein,Carbs,Fat,Fiber';
    const rows = weeklyData.map((d) => {
      const consumed = d.consumed as Record<string, number>;
      return `${d.date},${consumed?.calories || 0},${consumed?.proteinG || 0},${consumed?.carbsG || 0},${consumed?.fatG || 0},${consumed?.fiberG || 0}`;
    });
    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nutriai-${tab}-report.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Report exported!');
    setExportOpen(false);
  };

  const handleExport = async () => {
    if (exportFormat === 'csv') {
      handleExportCsv();
      return;
    }
    setExporting(true);
    try {
      const token = localStorage.getItem('nutriai_session');
      const url = `/api/export?format=${exportFormat}&days=${exportDays}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const ext = exportFormat === 'csv' ? 'csv' : 'json';
      const contentType = exportFormat === 'csv' ? 'text/csv' : 'application/json';
      const blobUrl = URL.createObjectURL(new Blob([blob], { type: contentType }));
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `nutriai-export-${exportDays}days.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      toast.success('Data exported successfully!');
      setExportOpen(false);
    } catch {
      toast.error('Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  const chartData = weeklyData.map((d) => {
    const consumed = d.consumed as Record<string, number>;
    const targets = d.targets as Record<string, number> | null;
    return {
      date: format(parseISO(d.date as string), 'EEE'),
      calories: consumed?.calories || 0,
      target: targets?.calories || 0,
    };
  });

  const allCaloriesZero = chartData.every((d) => d.calories === 0 && d.target === 0);

  const nonZeroDays = weeklyData.filter((d) => (d.consumed as Record<string, number>)?.calories > 0).length;
  const isSparse = weeklyData.length > 0 && nonZeroDays <= 1;

  const macroData = [
    { name: 'Protein', value: Number(summary?.avgProtein) || 0, color: PIE_COLORS[0] },
    { name: 'Carbs', value: Number(summary?.avgCarbs) || 0, color: PIE_COLORS[1] },
    { name: 'Fat', value: Number(summary?.avgFat) || 0, color: PIE_COLORS[2] },
    { name: 'Fiber', value: Number(summary?.avgFiber) || 0, color: PIE_COLORS[3] },
  ];
  const allMacrosZero = macroData.every((m) => m.value === 0);

  const weightChartData = weightLogs.slice().reverse().slice(-7).map((w) => ({
    date: format(parseISO(w.logDate as string), 'MMM d'),
    weight: w.weightKg as number,
  }));

  const noWeightData = weightChartData.length < 2;

  // Calorie breakdown table data - filter out zero-eaten days
  const breakdownData = weeklyData
    .map((d) => {
      const consumed = d.consumed as Record<string, number>;
      const targets = d.targets as Record<string, number> | null;
      const consumedCal = consumed?.calories || 0;
      const targetCal = targets?.calories || 0;
      const diff = consumedCal - targetCal;
      const pct = targetCal > 0 ? Math.round((consumedCal / targetCal) * 100) : 0;
      return {
        date: d.date as string,
        consumedCal,
        targetCal,
        diff,
        pct: Math.min(pct, 150),
      };
    })
    .filter((d) => d.consumedCal > 0);

  const weeklyTotalConsumed = breakdownData.reduce((sum, d) => sum + d.consumedCal, 0);
  const weeklyTotalTarget = breakdownData.reduce((sum, d) => sum + d.targetCal, 0);
  const weeklyTotalDiff = weeklyTotalConsumed - weeklyTotalTarget;

  // Yearly summary data
  const yearlyDaysLogged = Number(summary?.totalDays) || 0;
  const yearlyAvgCalories = Math.round(Number(summary?.avgCalories) || 0);
  const yearlyHasData = yearlyDaysLogged > 0 || yearlyAvgCalories > 0;

  const yearlyBestDay = weeklyData.reduce((best: Record<string, unknown> | null, d) => {
    const cal = (d.consumed as Record<string, number>)?.calories || 0;
    const bestCal = best ? (best.consumed as Record<string, number>)?.calories || 0 : 0;
    return cal > bestCal ? d : best;
  }, null);
  const yearlyWorstDay = weeklyData.reduce((worst: Record<string, unknown> | null, d) => {
    const cal = (d.consumed as Record<string, number>)?.calories || 0;
    const worstCal = worst ? (worst.consumed as Record<string, number>)?.calories || 0 : Infinity;
    return (cal < worstCal && cal > 0) ? d : worst;
  }, null);

  const currentWeight = summary?.currentWeight as number | undefined;
  const firstWeightLog = weightLogs.length > 0 ? weightLogs[0] : null;
  const startWeight = firstWeightLog ? (firstWeightLog.weightKg as number) : null;
  const weightDiff = currentWeight && startWeight ? (currentWeight - startWeight).toFixed(1) : null;

  const statCards = [
    { label: 'Avg Daily Calories', value: `${Math.round(Number(summary?.avgCalories) || 0)}`, icon: Flame, iconBg: 'bg-orange-100 dark:bg-orange-900/30', iconColor: 'text-orange-600 dark:text-orange-400' },
    { label: 'Avg Protein', value: `${Math.round(Number(summary?.avgProtein) || 0)}g`, icon: Dumbbell, iconBg: 'bg-blue-100 dark:bg-blue-900/30', iconColor: 'text-blue-600 dark:text-blue-400' },
    { label: 'Avg Fiber', value: `${Math.round(Number(summary?.avgFiber) || 0)}g`, icon: Leaf, iconBg: 'bg-green-100 dark:bg-green-900/30', iconColor: 'text-green-600 dark:text-green-400' },
    { label: 'Total Days', value: `${Number(summary?.totalDays) || 0}`, icon: CalendarDays, iconBg: 'bg-emerald-100 dark:bg-emerald-900/30', iconColor: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Current Weight', value: currentWeight ? `${currentWeight}kg` : 'N/A', icon: Scale, iconBg: 'bg-purple-100 dark:bg-purple-900/30', iconColor: 'text-purple-600 dark:text-purple-400' },
  ];

  if (loading) {
    return (
      <div className="p-4 max-w-lg mx-auto space-y-4">
        <Skeleton className="h-8 w-32 rounded-xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-4"><Skeleton className="h-28 w-full rounded-2xl" /><Skeleton className="h-28 w-full rounded-2xl" /></div>
      </div>
    );
  }

  return (
    <motion.div {...fadeIn} className="p-4 max-w-lg mx-auto space-y-5 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Progress</h1>
        </div>
        <button
          onClick={() => setExportOpen(true)}
          className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md rounded-xl px-3.5 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Export</span>
        </button>
      </div>

      {/* Export Dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Export Data</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Format</Label>
              <Select value={exportFormat} onValueChange={setExportFormat}>
                <SelectTrigger className="h-11 rounded-xl focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV Spreadsheet</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Period</Label>
              <Select value={exportDays} onValueChange={setExportDays}>
                <SelectTrigger className="h-11 rounded-xl focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="14">Last 14 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button variant="outline" className="rounded-xl">Cancel</Button>
            </DialogClose>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl" onClick={handleExport} disabled={exporting}>
              {exporting ? 'Exporting...' : 'Download'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full rounded-xl">
          <TabsTrigger value="weekly" className="flex-1 rounded-lg data-[state=active]:shadow-sm">Weekly</TabsTrigger>
          <TabsTrigger value="monthly" className="flex-1 rounded-lg text-gray-500 dark:text-gray-400 data-[state=active]:text-foreground data-[state=active]:shadow-sm">Monthly</TabsTrigger>
          <TabsTrigger value="yearly" className="flex-1 rounded-lg text-gray-500 dark:text-gray-400 data-[state=active]:text-foreground data-[state=active]:shadow-sm">Yearly</TabsTrigger>
        </TabsList>

        {/* Yearly Tab Content */}
        <TabsContent value="yearly">
          {yearlyHasData ? (
            <Card className="p-5 rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-200/80 dark:border-gray-800/70 bg-white dark:bg-gray-900">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">Yearly Overview</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Total Days Logged</p>
                    <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1 tabular-nums">{yearlyDaysLogged}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-900/20">
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Avg Daily Calories</p>
                    <p className="text-2xl font-bold text-orange-700 dark:text-orange-400 mt-1 tabular-nums">{yearlyAvgCalories}</p>
                  </div>
                </div>
                {yearlyBestDay && (
                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Best Day</p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-1">
                      {format(parseISO(yearlyBestDay.date as string), 'EEEE, MMM d')} — {((yearlyBestDay.consumed as Record<string, number>)?.calories || 0).toLocaleString()} kcal
                    </p>
                  </div>
                )}
                {yearlyWorstDay && (
                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Lowest Day</p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-1">
                      {format(parseISO(yearlyWorstDay.date as string), 'EEEE, MMM d')} — {((yearlyWorstDay.consumed as Record<string, number>)?.calories || 0).toLocaleString()} kcal
                    </p>
                  </div>
                )}
                {weightDiff !== null && (
                  <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-900/20">
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Weight Change</p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-1">
                      {startWeight}kg → {currentWeight}kg ({Number(weightDiff) > 0 ? '+' : ''}{weightDiff}kg)
                    </p>
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <Card className="p-8 rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-200/80 dark:border-gray-800/70 bg-white dark:bg-gray-900">
              <div className="flex flex-col items-center justify-center py-8">
                <CalendarDays className="h-12 w-12 text-gray-400 dark:text-gray-500 mb-3" />
                <p className="text-sm font-medium text-gray-400 dark:text-gray-500">Start tracking to see your yearly overview</p>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Only show charts for weekly/monthly */
      tab !== 'yearly' && (
        <>
          {/* Calorie Chart */}
          <Card className="p-5 rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-200/80 dark:border-gray-800/70 bg-white dark:bg-gray-900">
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">Calorie Intake</h3>
            <div className="h-48 relative">
              {isSparse && !allCaloriesZero && (
                <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/70 dark:bg-gray-900/70 rounded-lg">
                  <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">Log meals to see your weekly trends</p>
                </div>
              )}
              {allCaloriesZero ? (
                <div className="h-full flex flex-col items-center justify-center py-6">
                  <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                    <BarChart3 className="h-7 w-7 text-gray-400 dark:text-gray-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Log meals to see your trends</p>
                  <Button
                    onClick={onNavigate ? () => onNavigate('foodlog') : undefined}
                    className="mt-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-5 h-9 text-sm font-semibold"
                  >
                    <Plus className="h-4 w-4 mr-1" />Log Meal
                  </Button>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barCategoryGap="20%">
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      axisLine={false}
                      tickLine={false}
                      domain={[0, (dataMax: number) => Math.ceil(Math.max(dataMax, (chartData[0]?.target || 0) * 1.1) / 500) * 500]}
                      ticks={[0, 500, 1000, 1500, 2000, 2500, 3000]}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                    />
                    <defs>
                      <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0.8} />
                      </linearGradient>
                    </defs>
                    <Bar dataKey="calories" fill="url(#barGrad)" radius={[4, 4, 0, 0]} name="Consumed" />
                    <Bar dataKey="target" fill="#e5e7eb" radius={[4, 4, 0, 0]} name="Target" />
                    {chartData[0]?.target > 0 && (
                      <ReferenceLine
                        y={chartData[0].target}
                        stroke="#f43f5e"
                        strokeDasharray="6 3"
                        strokeOpacity={0.5}
                        label={{ value: 'Goal', position: 'right', fill: '#f43f5e', fontSize: 10, fontWeight: 600 }}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          {/* Macro Pie + Weight Trend */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card className="p-5 rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-200/80 dark:border-gray-800/70 bg-white dark:bg-gray-900">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">Macro Breakdown</h3>
              <div className="h-44 relative">
                {allMacrosZero ? (
                  <div className="h-full flex flex-col items-center justify-center py-8">
                    <Dumbbell className="h-12 w-12 mb-3 text-gray-400 dark:text-gray-500" />
                    <p className="text-sm font-medium text-gray-400 dark:text-gray-500">Start logging meals</p>
                  </div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={macroData} cx="50%" cy="50%" innerRadius={38} outerRadius={60} dataKey="value" strokeWidth={2}>
                          {macroData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb' }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-lg font-bold text-gray-800 dark:text-gray-100 tabular-nums">{Math.round(Number(summary?.avgCalories) || 0)}</span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">avg kcal</span>
                    </div>
                  </>
                )}
              </div>
              {!allMacrosZero && (
                <div className="flex justify-center gap-4 mt-1">
                  {macroData.map((m) => (
                    <div key={m.name} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                      <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">{m.name} {Math.round(m.value)}g</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card className="p-5 rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-200/80 dark:border-gray-800/70 bg-white dark:bg-gray-900">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">Weight Trend</h3>
              {noWeightData ? (
                <div className="h-44 flex flex-col items-center justify-center py-8">
                  <Scale className="h-12 w-12 mb-3 text-gray-400 dark:text-gray-500" />
                  <p className="text-sm font-medium text-gray-400 dark:text-gray-500">Log your weight to see trends</p>
                </div>
              ) : (
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={weightChartData}>
                      <defs>
                        <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                      <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb' }} />
                      <Area type="monotone" dataKey="weight" stroke="#10b981" strokeWidth={2.5} fill="url(#weightGrad)" dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 5 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          {/* Weekly Summary Insight */}
          {summary && !allCaloriesZero && (
            <div className="rounded-xl p-4 border border-emerald-100 dark:border-emerald-800/50 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100/80 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                  <Lightbulb className="h-[18px] w-[18px] text-emerald-500" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">{tab === 'monthly' ? 'Monthly' : 'Weekly'} Insight</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
                    {(() => {
                      const avgCal = Math.round(Number(summary?.avgCalories) || 0);
                      const targetCal = chartData[0]?.target || 0;
                      const avgProtein = Math.round(Number(summary?.avgProtein) || 0);
                      const targetProtein = summary?.targetProtein ? Math.round(summary.targetProtein as number) : 0;
                      const proteinPct = targetProtein > 0 ? Math.round((avgProtein / targetProtein) * 100) : 0;
                      const avgFiber = Math.round(Number(summary?.avgFiber) || 0);
                      const targetFiber = summary?.targetFiber ? Math.round(summary.targetFiber as number) : 0;
                      const fiberPct = targetFiber > 0 ? Math.round((avgFiber / targetFiber) * 100) : 0;
                      const bestDay = weeklyData.reduce((best: Record<string, unknown> | null, d) => {
                        const cal = (d.consumed as Record<string, number>)?.calories || 0;
                        const bestCal = best ? (best.consumed as Record<string, number>)?.calories || 0 : 0;
                        return cal > bestCal ? d : best;
                      }, null);
                      const bestDayName = bestDay ? format(parseISO(bestDay.date as string), 'EEEE') : '';
                      const parts = [`You averaged ${avgCal} kcal/day this ${tab === 'monthly' ? 'month' : 'week'}.`];
                      if (proteinPct > 0) parts.push(`Protein intake was ${proteinPct}% of target.`);
                      if (fiberPct > 0) parts.push(`Fiber intake was ${fiberPct}% of target.`);
                      if (targetCal > 0 && avgCal < targetCal) parts.push(`You're ${targetCal - avgCal} kcal under daily target.`);
                      else if (targetCal > 0 && avgCal > targetCal) parts.push(`You're ${avgCal - targetCal} kcal over daily target.`);
                      if (bestDayName) parts.push(`Best day: ${bestDayName}.`);
                      parts.push('Keep it up!');
                      return parts.join(' ');
                    })()}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-3">
            {statCards.map((s) => (
              <div key={s.label} className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50/80 dark:bg-gray-800/30">
                <div className={`w-9 h-9 rounded-lg ${s.iconBg} flex items-center justify-center shrink-0`}>
                  <s.icon className={`h-4 w-4 ${s.iconColor}`} />
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 dark:text-gray-300 font-medium uppercase">{s.label}</p>
                  <p className="text-base font-bold text-gray-900 dark:text-gray-100 tabular-nums">{s.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Achievements Grid */}
          {achievements.length > 0 && (
            <Card className="p-4 rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-200/80 dark:border-gray-800/70 bg-white dark:bg-gray-900">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="h-4 w-4 text-amber-500" />
                <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">Achievements</h3>
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">{achievements.filter((a) => a.earned).length}/8 Unlocked</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {achievements.map((ach) => (
                  <div
                    key={ach.id}
                    className={`relative p-3 rounded-xl border transition-colors ${
                      ach.earned
                        ? 'bg-white dark:bg-gray-900 border-l-4 border-l-emerald-500 border-t-0 border-r-0 border-b-0 border-emerald-200 dark:border-gray-700'
                        : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {ach.earned ? (
                        <span className="text-3xl leading-none">{ach.icon}</span>
                      ) : (
                        <Lock className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                      )}
                    </div>
                    <p className={`text-sm font-semibold ${ach.earned ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}>
                      {ach.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-300 mt-0.5 leading-snug">
                      {ach.description}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Calorie Breakdown Table */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="p-0 rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-200/80 dark:border-gray-800/70 bg-white dark:bg-gray-900 overflow-hidden">
              {/* Table header */}
              <div className="bg-gray-50/80 px-5 py-3 border-b border-gray-100">
                <h3 className="text-base font-semibold text-gray-800">Calorie Breakdown</h3>
                <p className="text-xs text-gray-400 mt-0.5">This {tab === 'monthly' ? 'month' : 'week'}&apos;s daily calorie tracking</p>
              </div>

              {breakdownData.length === 0 ? (
                <div className="py-10 flex flex-col items-center justify-center">
                  <Flame className="h-12 w-12 mb-3 text-gray-400 dark:text-gray-500" />
                  <p className="text-sm font-medium text-gray-400 dark:text-gray-500">No calorie data yet</p>
                </div>
              ) : (
                <>
                  {/* Column headers */}
                  <div className="grid grid-cols-12 gap-1 px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                    <div className="col-span-3">Date</div>
                    <div className="col-span-3 text-right">Eaten</div>
                    <div className="col-span-3 text-right">Target</div>
                    <div className="col-span-3 text-right">Diff</div>
                  </div>

                  {/* Table rows */}
                  <div className="divide-y divide-gray-50">
                    {breakdownData.map((row, idx) => {
                      const isOver = row.diff > 0;
                      const isToday = row.date === format(new Date(), 'yyyy-MM-dd');
                      return (
                        <div
                          key={row.date}
                          className={`grid grid-cols-12 gap-1 py-3 px-4 items-center text-xs hover:bg-gray-50/50 transition-colors ${
                            isToday
                              ? 'bg-emerald-50/80 border-l-[3px] border-l-emerald-500'
                              : ''
                          }`}
                        >
                          {/* Date column */}
                          <div className="col-span-3 flex items-center gap-1.5">
                            {isToday && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
                            <span className={`${isToday ? 'font-semibold text-emerald-700' : 'text-gray-700'}`}>{
                              format(parseISO(row.date), 'EEE d')
                            }</span>
                          </div>

                          {/* Consumed */}
                          <div className="col-span-3 text-right font-medium text-gray-800">
                            {row.consumedCal.toLocaleString()}
                            <span className="text-gray-400 ml-0.5">kcal</span>
                          </div>

                          {/* Target */}
                          <div className="col-span-3 text-right text-gray-500">
                            {row.targetCal.toLocaleString()}
                          </div>

                          {/* Difference + mini bar */}
                          <div className="col-span-3 flex flex-col items-end gap-1">
                            <span className={`font-medium ${isOver ? 'text-red-500' : 'text-emerald-600'}`}>{
                              isOver ? '+' : ''}{row.diff}
                            </span>
                            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <motion.div
                                className={`h-full rounded-full ${isOver ? 'bg-red-400' : 'bg-emerald-400'}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(row.pct, 100)}%` }}
                                transition={{ duration: 0.6, delay: idx * 0.05 }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Weekly total row */}
                  <div className="grid grid-cols-12 gap-1 px-5 py-3 bg-gray-50 border-t border-gray-200 text-xs font-bold">
                    <div className="col-span-3 text-gray-700">Total</div>
                    <div className="col-span-3 text-right text-gray-900">{weeklyTotalConsumed.toLocaleString()}</div>
                    <div className="col-span-3 text-right text-gray-500">{weeklyTotalTarget.toLocaleString()}</div>
                    <div className={`col-span-3 text-right ${weeklyTotalDiff > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{
                      weeklyTotalDiff > 0 ? '+' : ''}{weeklyTotalDiff}
                    </div>
                  </div>
                </>
              )}
            </Card>
          </motion.div>

          {/* Water Tracking */}
          <Card className="p-5 rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-200/80 dark:border-gray-800/70 bg-white dark:bg-gray-900">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                <Droplets className="h-4 w-4 text-blue-500" /> Water Intake
              </h3>
              <span className="text-sm font-semibold text-gray-700">{waterGlasses} / 8 glasses ({waterGlasses * 250}ml / 2000ml)</span>
            </div>
            <div className="flex items-center justify-center gap-4">
              <Button
                size="icon"
                variant="outline"
                className="h-10 w-10 rounded-xl"
                onClick={() => handleAddWater(-1)}
                disabled={waterGlasses <= 0}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <div className="flex gap-2 flex-wrap justify-center">
                {Array.from({ length: 8 }, (_, i) => {
                  const isFilled = i < waterGlasses;
                  const isJustFilled = justFilledIndex === i;
                  return (
                    <motion.div
                      key={i}
                      className="relative"
                      animate={isJustFilled ? { scale: [1, 1.25, 1] } : {}}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                    >
                      <motion.div
                        className={`w-7 h-9 rounded-md border-2 flex items-center justify-center transition-colors ${
                          isFilled
                            ? 'bg-blue-100 border-blue-300'
                            : 'bg-gray-50 border-gray-200'
                        }`}
                        animate={{
                          backgroundColor: isJustFilled ? ['#bfdbfe', '#dbeafe'] : undefined,
                        }}
                        transition={{ duration: 0.4 }}
                      >
                        <Droplets
                          className={`h-4 w-4 transition-colors ${
                            isFilled ? 'text-blue-500' : 'text-gray-200'
                          }`}
                        />
                      </motion.div>
                      {isJustFilled && (
                        <motion.div
                          className="absolute inset-0 rounded-md bg-blue-400/20"
                          initial={{ opacity: 1, scale: 0.8 }}
                          animate={{ opacity: 0, scale: 1.4 }}
                          transition={{ duration: 0.6 }}
                        />
                      )}
                    </motion.div>
                  );
                })}
              </div>
              <Button
                size="icon"
                className="h-10 w-10 bg-blue-500 hover:bg-blue-600 rounded-xl"
                onClick={() => handleAddWater(1)}
                disabled={waterGlasses >= 16}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </Card>

          {/* Weight Logging */}
          <Card className="p-5 rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-200/80 dark:border-gray-800/70 bg-white dark:bg-gray-900">
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
              <Scale className="h-4 w-4 text-purple-500" /> Log Weight
            </h3>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="e.g., 74.5"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                className="flex-1 rounded-xl h-11 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
              <Input
                placeholder="Optional notes..."
                value={weightNotes}
                onChange={(e) => setWeightNotes(e.target.value)}
                className="flex-1 rounded-xl h-11 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl min-h-[44px] font-semibold px-5"
                onClick={handleLogWeight}
                disabled={!weightInput}
              >
                Log
              </Button>
            </div>
            {weightLogs.length > 0 && (
              <div className="mt-4 space-y-1">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">Recent Entries</p>
                {weightLogs.slice(0, 5).map((w) => (
                  <div key={w.id as string} className="flex justify-between text-xs text-gray-600 py-2 px-3 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors rounded">
                    <span>{format(parseISO(w.logDate as string), 'MMM d, yyyy')}</span>
                    <span className="font-semibold">{w.weightKg as number} kg</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Quick Log Water */}
          <Card className="p-4 rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-200/80 dark:border-gray-800/70">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
                  <Droplets className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Log Water</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-300">Tap to add a glass ({waterGlasses}/8)</p>
                </div>
              </div>
              <Button
                size="sm"
                className="bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-medium min-h-[36px]"
                onClick={handleWaterAdd}
              >
                <Plus className="h-4 w-4 mr-1" />Add
              </Button>
            </div>
          </Card>
        </>
      )}
    </motion.div>
  );
}