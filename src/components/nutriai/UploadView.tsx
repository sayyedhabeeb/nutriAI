'use client';

import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Camera, Loader2, Sparkles, UtensilsCrossed, Lightbulb, ImageIcon, Clock, ScanLine, Plus,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { apiFetch } from './api';
import { SLOTS, SLOT_LABELS, CUISINES, fadeIn } from './constants';
import type { RecognizedFood } from './types';

interface RecentScan {
  id: string;
  meal?: { name: string };
  calories: number;
  createdAt: string;
}

export function UploadView() {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [results, setResults] = useState<RecognizedFood[]>([]);
  const [unknownForms, setUnknownForms] = useState<Record<number, {
    confirmedName: string; confirmedPortion: number; caloriesPer100g: number;
    proteinPer100g: number; carbsPer100g: number; fatPer100g: number;
    mealType: string; cuisine: string;
  }>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Recent scans
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [scansLoading, setScansLoading] = useState(true);
  const [quickRelogging, setQuickRelogging] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/food-logs?limit=3')
      .then((data: Record<string, unknown>) => {
        const allItems = (data.itemsBySlot as Record<string, RecentScan[]> | undefined) || {};
        const flat: RecentScan[] = [];
        for (const slot of Object.keys(allItems)) {
          for (const item of allItems[slot]) {
            flat.push(item);
          }
        }
        flat.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setRecentScans(flat.slice(0, 3));
      })
      .catch(() => setRecentScans([]))
      .finally(() => setScansLoading(false));
  }, []);

  const handleFileSelect = (file: File) => {
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleRecognize = async () => {
    if (!imageFile) return;
    setRecognizing(true);
    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      const data = await apiFetch('/api/food-recognize', { method: 'POST', body: formData });
      setResults(data.foods || []);
      const forms: typeof unknownForms = {};
      (data.foods || []).forEach((f: RecognizedFood, idx: number) => {
        if (f.unknown_food) {
          forms[idx] = { confirmedName: f.name, confirmedPortion: f.servingWeightGrams || 200, caloriesPer100g: 0, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 0, mealType: 'lunch', cuisine: 'Mixed' };
        }
      });
      setUnknownForms(forms);
    } catch (err) { toast.error((err as Error).message || 'Recognition failed'); }
    finally { setRecognizing(false); }
  };

  const confidenceBadge = (conf: number) => {
    const pct = Math.round(conf * 100);
    const color = conf >= 0.9 ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' : conf >= 0.7 ? 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800' : conf >= 0.5 ? 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800' : 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
    return <Badge className={`${color} text-xs`}>{pct}%</Badge>;
  };

  const handleLogRecognized = async (mealId: string, servingWeightGrams: number) => {
    try {
      await apiFetch('/api/food-logs', { method: 'POST', body: JSON.stringify({ mealId, servingGms: servingWeightGrams, mealSlot: 'lunch' }) });
      toast.success('Food logged!');
    } catch (err) { toast.error((err as Error).message); }
  };

  const handleSubmitUnknown = async (idx: number, aiName: string) => {
    const form = unknownForms[idx];
    if (!form || !form.confirmedName || !form.caloriesPer100g) { toast.error('Please fill in all required fields'); return; }
    try {
      const data = await apiFetch('/api/unknown-food/submit', { method: 'POST', body: JSON.stringify({ aiDetectedName: aiName, ...form }) });
      toast.success('Food submitted and logged!');
      if (data?.meal?.id) await handleLogRecognized(data.meal.id, form.confirmedPortion);
    } catch (err) { toast.error((err as Error).message); }
  };

  const formatTimeAgo = (dateStr: string) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <motion.div {...fadeIn} className="p-4 max-w-lg mx-auto space-y-5 pb-28">
      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
          <Camera className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Scan Food</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500">Identify meals with AI-powered recognition</p>
        </div>
      </div>

      {/* Image Preview (shown when image is selected) */}
      {imagePreview && (
        <Card className="rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-100/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 overflow-hidden p-3">
          <div className="text-center space-y-2">
            <img src={imagePreview} alt="Preview" className="max-h-40 mx-auto rounded-xl object-contain" />
            <p className="text-xs text-gray-400 dark:text-gray-500">Tap &quot;Scan Another&quot; to change image</p>
          </div>
        </Card>
      )}

      {/* Hero Area — shown when no image selected */}
      {!imagePreview && (
        <div className="text-center py-6 space-y-3">
          <motion.div
            className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30"
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <UtensilsCrossed className="h-9 w-9 text-white" />
          </motion.div>
          <div className="space-y-1">
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">Point your camera at your meal</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">AI will identify the food and estimate nutrition</p>
          </div>
        </div>
      )}

      {/* Primary CTA — Take Photo */}
      {!results.length && (
        <div className="space-y-2">
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-12 text-base rounded-xl font-semibold flex items-center justify-center gap-2 min-h-[44px]"
            onClick={() => cameraInputRef.current?.click()}
          >
            <Camera className="h-5 w-5" />
            Take Photo
          </Button>
          <button
            type="button"
            className="w-full text-sm text-emerald-600 dark:text-emerald-400 font-medium underline underline-offset-2 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors py-1"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose from Gallery
          </button>
        </div>
      )}

      {/* How it works — Card Steps with Connecting Lines */}
      <Card className="rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-100/60 dark:border-gray-800/60 bg-gray-50/50 dark:bg-gray-800/30 p-5">
        <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">How it works</h3>
        <div className="space-y-0">
          {[
            { step: 1, icon: Camera, title: 'Upload Photo', desc: 'Take or select a food photo' },
            { step: 2, icon: Sparkles, title: 'AI Analyzes', desc: 'Identifies food & nutrition' },
            { step: 3, icon: UtensilsCrossed, title: 'Log Meal', desc: 'One-tap meal logging' },
          ].map((item, idx) => (
            <div key={item.step}>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                <div className="w-9 h-9 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center shrink-0 shadow-sm shadow-emerald-200 dark:shadow-emerald-900/30">{item.step}</div>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0">
                  <item.icon className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{item.title}</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{item.desc}</p>
                </div>
              </div>
              {idx < 2 && (
                <div className="flex justify-center py-1">
                  <div className="w-0.5 h-4 bg-emerald-200 dark:bg-emerald-800 rounded-full" />
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Tips section */}
      <Card className="rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-amber-100 dark:border-amber-900/30 bg-amber-50/50 dark:bg-amber-900/10 p-5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0 mt-0.5">
            <Lightbulb className="h-4 w-4 text-amber-600 dark:amber-400" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tips for best results</h3>
            <ul className="space-y-1.5">
              <li className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>
                Take a clear photo with good lighting
              </li>
              <li className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>
                Include the full plate or food item
              </li>
              <li className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>
                Avoid blurry or dark images
              </li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Recent Scans */}
      <Card className="rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-100/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 p-4">
        <div className="flex items-center gap-2 mb-3">
          <ScanLine className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Recent Scans</h3>
        </div>
        {scansLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : recentScans.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">No recent scans yet</p>
        ) : (
          <div className="space-y-2">
            {recentScans.map((scan) => (
              <div key={scan.id} className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{scan.meal?.name || 'Unknown'}</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTimeAgo(scan.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300 tabular-nums">{Math.round(scan.calories)}</span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">kcal</span>
                  <button
                    onClick={async () => {
                      // Find the meal ID from the scan data — quick re-log using food-logs/quick
                      setQuickRelogging(scan.id);
                      try {
                        await apiFetch('/api/food-logs/quick', {
                          method: 'POST',
                          body: JSON.stringify({
                            name: scan.meal?.name || 'Food',
                            calories: Math.round(scan.calories),
                            proteinG: 0,
                            carbsG: 0,
                            fatG: 0,
                            mealSlot: 'lunch',
                            servingGms: 100,
                          }),
                        });
                        toast.success(`Re-logged ${scan.meal?.name || 'food'}!`);
                      } catch (err) {
                        toast.error((err as Error).message || 'Failed to re-log');
                      } finally {
                        setQuickRelogging(null);
                      }
                    }}
                    disabled={quickRelogging === scan.id}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors border border-emerald-200 dark:border-emerald-800 shrink-0"
                    title="Re-log this meal"
                  >
                    {quickRelogging === scan.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Plus className="h-3.5 w-3.5" />
                    }
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Recognize Button */}
      {imageFile && !results.length && (
        <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px] rounded-xl font-semibold" onClick={handleRecognize} disabled={recognizing}>
          {recognizing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyzing...</> : 'Recognize Food'}
        </Button>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Recognized Foods</h2>
          {results.map((food, idx) => (
            <Card key={idx} className="p-5 rounded-2xl shadow-sm border border-gray-100/80 dark:border-gray-800 bg-white dark:bg-gray-900">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{food.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{food.servingDescription}</p>
                </div>
                {confidenceBadge(food.confidence)}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Est. serving: {food.servingWeightGrams}g</p>
              {food.matched && food.meal && (
                <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 space-y-1 border border-green-100 dark:border-green-800">
                  <p className="text-sm text-green-800 dark:text-green-400 font-medium">&#10003; Found in database</p>
                  <p className="text-xs text-green-700 dark:text-green-400">
                    {(food.meal as Record<string, unknown>).nutrition
                      ? `${(food.meal as Record<string, Record<string, unknown>>).nutrition?.calories} kcal, ${(food.meal as Record<string, Record<string, unknown>>).nutrition?.proteinG}g protein per 100g`
                      : 'Nutrition data available'}
                  </p>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white mt-2 rounded-lg" onClick={() => handleLogRecognized((food.meal as Record<string, unknown>).id as string, food.servingWeightGrams)}>Log This</Button>
                </div>
              )}
              {food.unknown_food && unknownForms[idx] && (
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-3 space-y-3 border border-orange-100 dark:border-orange-800">
                  <p className="text-sm text-orange-800 dark:text-orange-400 font-medium">&#9888;&#65039; New Food — Please provide nutrition info</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><Label className="text-xs text-gray-700 dark:text-gray-300">Name</Label><Input className="h-9 rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100" value={unknownForms[idx].confirmedName} onChange={(e) => setUnknownForms({ ...unknownForms, [idx]: { ...unknownForms[idx], confirmedName: e.target.value } })} /></div>
                    <div className="space-y-1"><Label className="text-xs text-gray-700 dark:text-gray-300">Portion (g)</Label><Input type="number" className="h-9 rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100" value={unknownForms[idx].confirmedPortion} onChange={(e) => setUnknownForms({ ...unknownForms, [idx]: { ...unknownForms[idx], confirmedPortion: Number(e.target.value) } })} /></div>
                    <div className="space-y-1"><Label className="text-xs text-gray-700 dark:text-gray-300">Cal/100g</Label><Input type="number" className="h-9 rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100" placeholder="e.g. 250" value={unknownForms[idx].caloriesPer100g || ''} onChange={(e) => setUnknownForms({ ...unknownForms, [idx]: { ...unknownForms[idx], caloriesPer100g: Number(e.target.value) } })} /></div>
                    <div className="space-y-1"><Label className="text-xs text-gray-700 dark:text-gray-300">Protein/100g</Label><Input type="number" className="h-9 rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100" placeholder="e.g. 15" value={unknownForms[idx].proteinPer100g || ''} onChange={(e) => setUnknownForms({ ...unknownForms, [idx]: { ...unknownForms[idx], proteinPer100g: Number(e.target.value) } })} /></div>
                    <div className="space-y-1"><Label className="text-xs text-gray-700 dark:text-gray-300">Carbs/100g</Label><Input type="number" className="h-9 rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100" placeholder="e.g. 30" value={unknownForms[idx].carbsPer100g || ''} onChange={(e) => setUnknownForms({ ...unknownForms, [idx]: { ...unknownForms[idx], carbsPer100g: Number(e.target.value) } })} /></div>
                    <div className="space-y-1"><Label className="text-xs text-gray-700 dark:text-gray-300">Fat/100g</Label><Input type="number" className="h-9 rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100" placeholder="e.g. 10" value={unknownForms[idx].fatPer100g || ''} onChange={(e) => setUnknownForms({ ...unknownForms, [idx]: { ...unknownForms[idx], fatPer100g: Number(e.target.value) } })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-700 dark:text-gray-300">Meal Type</Label>
                      <Select value={unknownForms[idx].mealType} onValueChange={(v) => setUnknownForms({ ...unknownForms, [idx]: { ...unknownForms[idx], mealType: v } })}>
                        <SelectTrigger className="h-9 rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"><SelectValue /></SelectTrigger>
                        <SelectContent>{SLOTS.map((s) => <SelectItem key={s} value={s}>{SLOT_LABELS[s]}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-700 dark:text-gray-300">Cuisine</Label>
                      <Select value={unknownForms[idx].cuisine} onValueChange={(v) => setUnknownForms({ ...unknownForms, [idx]: { ...unknownForms[idx], cuisine: v } })}>
                        <SelectTrigger className="h-9 rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"><SelectValue /></SelectTrigger>
                        <SelectContent>{CUISINES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white w-full rounded-lg" onClick={() => handleSubmitUnknown(idx, food.name)}>Submit & Log</Button>
                </div>
              )}
            </Card>
          ))}
          <Button variant="outline" className="w-full rounded-xl border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300" onClick={() => { setResults([]); setImagePreview(null); setImageFile(null); }}>Scan Another Photo</Button>
        </div>
      )}
    </motion.div>
  );
}
