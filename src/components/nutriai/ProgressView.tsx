'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, Flame, Dumbbell, Scale, Droplets, Plus, Minus } from 'lucide-react';
import { apiFetch } from './api';
import { PIE_COLORS, fadeIn } from './constants';

export function ProgressView() {
  const [tab, setTab] = useState('weekly');
  const [weeklyData, setWeeklyData] = useState<Record<string, unknown>[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [weightLogs, setWeightLogs] = useState<Record<string, unknown>[]>([]);
  const [waterGlasses, setWaterGlasses] = useState(0);
  const [loading, setLoading] = useState(true);
  const [weightInput, setWeightInput] = useState('');
  const [weightNotes, setWeightNotes] = useState('');

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
    } catch { toast.error('Failed to load progress'); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { fetchProgress(); }, [fetchProgress]);

  const handleAddWater = async (delta: number) => {
    const newCount = waterGlasses + delta;
    if (newCount < 0) return;
    if (delta > 0) {
      try {
        await apiFetch('/api/water-log', { method: 'POST', body: JSON.stringify({ glasses: delta }) });
        setWaterGlasses(newCount);
        toast.success(`\uD83D\uDCA7 +${delta} glass${delta > 1 ? 'es' : ''} of water`);
      } catch { toast.error('Failed to log water'); }
    } else {
      setWaterGlasses(Math.max(0, newCount));
    }
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

  const chartData = weeklyData.map((d) => {
    const consumed = d.consumed as Record<string, number>;
    const targets = d.targets as Record<string, number> | null;
    return {
      date: format(parseISO(d.date as string), 'EEE'),
      calories: consumed?.calories || 0,
      target: targets?.calories || 0,
    };
  });

  const macroData = [
    { name: 'Protein', value: summary?.avgProtein || 0, color: PIE_COLORS[0] },
    { name: 'Carbs', value: summary?.avgCarbs || 0, color: PIE_COLORS[1] },
    { name: 'Fat', value: summary?.avgFat || 0, color: PIE_COLORS[2] },
  ];

  const weightChartData = weightLogs.slice().reverse().slice(-7).map((w) => ({
    date: format(parseISO(w.logDate as string), 'MMM d'),
    weight: w.weightKg as number,
  }));

  // Feature 5: Calorie breakdown table data
  const breakdownData = weeklyData.map((d) => {
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
  });

  const weeklyTotalConsumed = breakdownData.reduce((sum, d) => sum + d.consumedCal, 0);
  const weeklyTotalTarget = breakdownData.reduce((sum, d) => sum + d.targetCal, 0);
  const weeklyTotalDiff = weeklyTotalConsumed - weeklyTotalTarget;

  if (loading) {
    return (
      <div className="p-4 max-w-lg mx-auto space-y-4">
        <Skeleton className="h-8 w-32 rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-4"><Skeleton className="h-28 w-full rounded-xl" /><Skeleton className="h-28 w-full rounded-xl" /></div>
      </div>
    );
  }

  return (
    <motion.div {...fadeIn} className="p-4 max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-emerald-600" />
        <h1 className="text-xl font-bold text-gray-900">Progress</h1>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full rounded-xl">
          <TabsTrigger value="weekly" className="flex-1 rounded-lg">Weekly</TabsTrigger>
          <TabsTrigger value="monthly" className="flex-1 rounded-lg">Monthly</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Calorie Chart */}
      <Card className="p-4 rounded-xl shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Calorie Intake</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="20%">
              <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
              />
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0.8} />
                </linearGradient>
              </defs>
              <Bar dataKey="calories" fill="url(#barGrad)" radius={[6, 6, 0, 0]} name="Consumed" />
              <Bar dataKey="target" fill="#e5e7eb" radius={[6, 6, 0, 0]} name="Target" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Macro Pie + Weight Trend */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-4 rounded-xl shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Macro Breakdown</h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={macroData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value" label={({ name, value }) => `${name}: ${value}g`} strokeWidth={2}>
                  {macroData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4 rounded-xl shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Weight Trend</h3>
          {weightChartData.length > 1 ? (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weightChartData}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb' }} />
                  <Line type="monotone" dataKey="weight" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Log at least 2 weights to see trend</div>
          )}
        </Card>
      </div>

      {/* Stats Cards with icons */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Avg Daily Calories', value: `${summary?.avgCalories || 0}`, icon: Flame, color: 'text-orange-500', bg: 'bg-orange-50' },
          { label: 'Avg Protein', value: `${summary?.avgProtein || 0}g`, icon: Dumbbell, color: 'text-blue-500', bg: 'bg-blue-50' },
          { label: 'Weight Change', value: `${(summary?.weightChange as number) >= 0 ? '+' : ''}${summary?.weightChange ?? 'N/A'}kg`, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-50' },
          { label: 'Current Weight', value: `${summary?.currentWeight ?? 'N/A'}kg`, icon: Scale, color: 'text-purple-500', bg: 'bg-purple-50' },
        ].map((s) => (
          <Card key={s.label} className="p-4 rounded-xl shadow-sm">
            <div className="flex items-center gap-2.5 mb-2">
              <div className={`w-8 h-8 ${s.bg} rounded-lg flex items-center justify-center`} >
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <span className="text-xs text-gray-500 font-medium">{s.label}</span>
            </div>
            <p className="text-lg font-bold text-gray-900">{s.value}</p>
          </Card>
        ))}
      </div>

      {/* ═══ Feature 5: Calorie Breakdown Table ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="p-0 rounded-xl shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Calorie Breakdown</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">This week&apos;s daily calorie tracking</p>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-12 gap-1 px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
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
                  className={`grid grid-cols-12 gap-1 px-4 py-2.5 items-center text-xs transition-colors ${isToday ? 'bg-emerald-50/50' : idx % 2 === 1 ? 'bg-gray-50/30' : 'bg-white'}`}
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
                    <span className={`font-medium ${isOver ? 'text-red-500' : 'text-emerald-600'}`}>
                      {isOver ? '+' : ''}{row.diff}
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
          <div className="grid grid-cols-12 gap-1 px-4 py-3 bg-gray-50 border-t border-gray-200 text-xs font-bold">
            <div className="col-span-3 text-gray-700">Total</div>
            <div className="col-span-3 text-right text-gray-900">{weeklyTotalConsumed.toLocaleString()}</div>
            <div className="col-span-3 text-right text-gray-500">{weeklyTotalTarget.toLocaleString()}</div>
            <div className={`col-span-3 text-right ${weeklyTotalDiff > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
              {weeklyTotalDiff > 0 ? '+' : ''}{weeklyTotalDiff}
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Water Tracking */}
      <Card className="p-4 rounded-xl shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Droplets className="h-4 w-4 text-blue-500" /> Water Intake
          </h3>
          <span className="text-sm font-bold text-blue-600">{waterGlasses}/8 glasses</span>
        </div>
        <div className="flex items-center justify-center gap-4">
          <Button size="icon" variant="outline" className="h-11 w-11 rounded-xl" onClick={() => handleAddWater(-1)} disabled={waterGlasses <= 0}>
            <Minus className="h-4 w-4" />
          </Button>
          <div className="flex gap-1.5 flex-wrap justify-center">
            {Array.from({ length: 8 }, (_, i) => (
              <motion.div
                key={i}
                className={`w-6 h-8 rounded-md border-2 transition-colors ${i < waterGlasses ? 'bg-blue-400 border-blue-500' : 'bg-gray-100 border-gray-200'}`}
                animate={i < waterGlasses ? { scale: [1, 1.1, 1] } : {}}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              />
            ))}
          </div>
          <Button size="icon" className="h-11 w-11 bg-blue-500 hover:bg-blue-600 rounded-xl" onClick={() => handleAddWater(1)} disabled={waterGlasses >= 16}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {/* Weight Logging */}
      <Card className="p-4 rounded-xl shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Scale className="h-4 w-4 text-purple-500" /> Log Weight
        </h3>
        <div className="flex gap-2">
          <Input type="number" placeholder="Weight (kg)" value={weightInput} onChange={(e) => setWeightInput(e.target.value)} className="flex-1 h-11 rounded-xl" />
          <Input placeholder="Notes" value={weightNotes} onChange={(e) => setWeightNotes(e.target.value)} className="flex-1 h-11 rounded-xl" />
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl" onClick={handleLogWeight} disabled={!weightInput}>Log</Button>
        </div>
        {weightLogs.length > 0 && (
          <div className="mt-3 space-y-1">
            <p className="text-xs text-gray-500 font-medium">Recent Entries</p>
            {weightLogs.slice(0, 5).map((w) => (
              <div key={w.id as string} className="flex justify-between text-xs text-gray-600 py-1.5 border-b border-gray-50 last:border-0">
                <span>{format(parseISO(w.logDate as string), 'MMM d, yyyy')}</span>
                <span className="font-semibold">{w.weightKg as number} kg</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  );
}
