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
  Camera, Loader2, Sparkles, UtensilsCrossed, Lightbulb, Clock, ScanLine, Plus,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { apiFetch } from './api';
import { SLOTS, SLOT_LABELS, fadeIn } from './constants';
import type { RecognizedFood } from './types';

interface RecentScan {
  id: string;
  name?: string | null;
  meal?: { name: string };
  calories: number;
  createdAt: string;
}

interface PortionSel {
  value: number;
  unit: 'g' | 'pc' | 'ml';
  custom: boolean;
}

const PORTION_LABEL: Record<string, string> = {
  piece: 'Confirm pieces',
  portion: 'Confirm portion',
  bowl: 'Confirm bowl size',
  drink: 'Confirm serving (ml)',
  weight: 'Confirm amount',
};

const UNIT_LABEL: Record<string, string> = {
  g: 'grams',
  pc: 'pieces',
  ml: 'ml',
};

const SOURCE_LABEL: Record<string, string> = {
  meal: 'From DB',
  stored: 'Reused',
  ingredients: 'AI ingredients',
  extracted: 'AI estimated',
};

const SOURCE_COLOR: Record<string, string> = {
  meal: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
  stored: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
  ingredients: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800',
  extracted: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800',
};

function defaultSlot(): string {
  const h = new Date().getHours();
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 18) return 'snack';
  return 'dinner';
}

export function UploadView() {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [results, setResults] = useState<RecognizedFood[]>([]);
  const [tempImagePath, setTempImagePath] = useState<string | null>(null);
  const [portions, setPortions] = useState<Record<number, PortionSel>>({});
  const [slots, setSlots] = useState<Record<number, string>>({});
  const [logging, setLogging] = useState<number | null>(null);
  const [selectedVariants, setSelectedVariants] = useState<Record<number, string>>({});
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
      const foods: RecognizedFood[] = data.foods || [];
      setResults(foods);
      setTempImagePath((data.tempImagePath as string | undefined) || null);
      setSelectedVariants({});
      const initialPortions: Record<number, PortionSel> = {};
      const initialSlots: Record<number, string> = {};
      foods.forEach((f, idx) => {
        const def =
          (f.portionOptions || []).find((o) => o.kind === 'preset' && o.default) ||
          (f.portionOptions || []).find((o) => o.kind === 'preset' && o.value > 0);
        initialPortions[idx] = def
          ? { value: def.value, unit: def.unit, custom: false }
          : { value: 200, unit: 'g', custom: false };
        initialSlots[idx] = defaultSlot();
      });
      setPortions(initialPortions);
      setSlots(initialSlots);
    } catch (err) { toast.error((err as Error).message || 'Recognition failed'); }
    finally { setRecognizing(false); }
  };

  const confidenceBadge = (conf: number) => {
    const pct = Math.round(conf * 100);
    const color = conf >= 0.9 ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' : conf >= 0.7 ? 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800' : conf >= 0.5 ? 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800' : 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
    return <Badge className={`${color} text-xs`}>{pct}%</Badge>;
  };

  const selFor = (food: RecognizedFood, idx: number): PortionSel =>
    portions[idx] ?? { value: 200, unit: 'g', custom: false };

  const selectedGrams = (food: RecognizedFood, sel: PortionSel): number => {
    if (sel.unit === 'ml') return sel.value;
    if (sel.unit === 'pc') return sel.value * (food.gramsPerPiece || 80);
    return sel.value;
  };

  const previewFor = (food: RecognizedFood, idx: number) => {
    const variant = selectedVariants[idx]
      ? food.variants.find((v) => v.name === selectedVariants[idx])
      : undefined;
    const n = variant?.estimatedNutrition ?? food.estimatedNutrition;
    if (!n) return null;
    const g = selectedGrams(food, selFor(food, idx));
    const ratio = g / (food.totalGrams || g);
    const r1 = (v: number) => Math.round(v * 10) / 10;
    return {
      grams: g,
      calories: Math.round(n.calories * ratio),
      proteinG: r1(n.proteinG * ratio),
      carbsG: r1(n.carbsG * ratio),
      fatG: r1(n.fatG * ratio),
    };
  };

  const handleConfirmAndLog = async (food: RecognizedFood, idx: number) => {
    const sel = selFor(food, idx);
    const variantName = selectedVariants[idx];
    setLogging(idx);
    try {
      const confirm = await apiFetch('/api/food-recognize/confirm', {
        method: 'POST',
        body: JSON.stringify({
          name: variantName ?? food.name,
          mealId: variantName ? undefined : food.mealId,
          newFoodId: variantName ? undefined : food.newFoodId,
          tempImagePath: tempImagePath ?? undefined,
          ingredients: variantName ? [] : food.ingredients,
          portionType: food.portionType,
          gramsPerPiece: food.gramsPerPiece,
          totalGrams: food.totalGrams,
          portionValue: sel.value,
          unit: sel.unit,
        }),
      });
      const missingIngredients = (confirm.missingIngredients as string[] | undefined) ??
        ((confirm.foods as Array<{ missingIngredients?: string[] }> | undefined) || [])
          .flatMap((f) => f.missingIngredients || []);
      if (missingIngredients.length) {
        toast.warning(`Some ingredients weren't found in the nutrition database, so this estimate may be approximate: ${missingIngredients.join(', ')}`);
      }
      const mealSlot = slots[idx] ?? 'lunch';
      const payload = confirm.mealId
        ? {
            mealId: confirm.mealId,
            servingGms: confirm.grams,
            mealSlot,
          }
        : {
            name: food.name,
            servingGms: confirm.grams,
            calories: confirm.nutrition.calories,
            proteinG: confirm.nutrition.proteinG,
            carbsG: confirm.nutrition.carbsG,
            fatG: confirm.nutrition.fatG,
            fiberG: confirm.nutrition.fiberG,
            sugarG: confirm.nutrition.sugarG,
            sodiumMg: confirm.nutrition.sodiumMg,
            mealSlot,
            source: 'photo',
          };
      await apiFetch('/api/food-logs', { method: 'POST', body: JSON.stringify(payload) });
      toast.success('Food logged!');
    } catch (err) { toast.error((err as Error).message); }
    finally { setLogging(null); }
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
        <Card className="rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-200/80 dark:border-gray-800/70 bg-white dark:bg-gray-900 overflow-hidden p-3">
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
            <p className="text-sm text-gray-500 dark:text-gray-400">AI will identify the food, you confirm the portion</p>
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
      <Card className="rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-200/80 dark:border-gray-800/70 bg-gray-50/50 dark:bg-gray-800/30 p-5">
        <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">How it works</h3>
        <div className="space-y-0">
          {[
            { step: 1, icon: Camera, title: 'Upload Photo', desc: 'Take or select a food photo' },
            { step: 2, icon: Sparkles, title: 'AI Identifies', desc: 'Recognizes food & portion' },
            { step: 3, icon: UtensilsCrossed, title: 'Confirm & Log', desc: 'Confirm portion, one-tap logging' },
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
      <Card className="rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-200/80 dark:border-gray-800/70 bg-white dark:bg-gray-900 p-4">
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
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{scan.name || scan.meal?.name || 'Unknown'}</p>
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
                      setQuickRelogging(scan.id);
                      try {
                        await apiFetch('/api/food-logs/quick', {
                          method: 'POST',
                          body: JSON.stringify({
                            name: scan.name || scan.meal?.name || 'Food',
                            calories: Math.round(scan.calories),
                            proteinG: 0,
                            carbsG: 0,
                            fatG: 0,
                            mealSlot: 'lunch',
                            servingGms: 100,
                          }),
                        });
                        toast.success(`Re-logged ${scan.name || scan.meal?.name || 'food'}!`);
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
          {results.map((food, idx) => {
            const sel = selFor(food, idx);
            const preview = previewFor(food, idx);
            const isCustom = sel.custom;
            return (
              <Card key={idx} className="p-5 rounded-2xl shadow-sm border border-gray-100/80 dark:border-gray-800 bg-white dark:bg-gray-900">
                <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{food.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{food.servingDescription}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {confidenceBadge(food.confidence)}
                    <Badge className={`${SOURCE_COLOR[food.nutritionSource] || 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'} text-xs`}>
                      {SOURCE_LABEL[food.nutritionSource] || food.nutritionSource}
                    </Badge>
                  </div>
                </div>

                {food.variants.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Which one exactly?</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedVariants((prev) => { const next = { ...prev }; delete next[idx]; return next; })}
                        className={`px-3 h-8 rounded-full text-xs font-medium border transition-colors ${!selectedVariants[idx]
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-200 dark:shadow-emerald-900/30'
                          : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700'
                        }`}
                      >
                        Just {food.name}
                      </button>
                      {food.variants.map((v) => {
                        const active = selectedVariants[idx] === v.name;
                        return (
                          <button
                            key={v.name}
                            type="button"
                            onClick={() => setSelectedVariants((prev) => ({ ...prev, [idx]: v.name }))}
                            className={`px-3 h-8 rounded-full text-xs font-medium border transition-colors ${active
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-200 dark:shadow-emerald-900/30'
                              : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700'
                            }`}
                          >
                            {v.name}
                            {v.matched && <span className="ml-1.5 text-[10px] opacity-80">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {food.ingredients.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {food.ingredients.map((ing, i) => (
                      <span key={i} className={`text-[11px] px-2 py-0.5 rounded-full border ${ing.matched ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800' : 'bg-gray-100 text-gray-400 border-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700'}`}>
                        {ing.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Portion confirmation */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 border border-gray-100 dark:border-gray-800">
                  <Label className="text-xs text-gray-600 dark:text-gray-400">{PORTION_LABEL[food.portionType] || 'Confirm amount'}</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(food.portionOptions || []).map((opt) => {
                      const active = !sel.custom && sel.value === opt.value && sel.unit === opt.unit && opt.kind !== 'custom';
                      return (
                        <button
                          key={`${opt.label}-${opt.value}`}
                          type="button"
                          onClick={() => setPortions({ ...portions, [idx]: { value: opt.value, unit: opt.unit, custom: opt.kind === 'custom' } })}
                          className={`px-3 h-9 rounded-lg text-sm font-medium border transition-colors min-w-[44px] ${active
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-200 dark:shadow-emerald-900/30'
                            : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700'
                          }`}
                        >
                          {opt.kind === 'custom'
                            ? 'More'
                            : opt.unit === 'g'
                              ? `${opt.label} · ${opt.value}g`
                              : opt.unit === 'ml'
                                ? `${opt.label} · ${opt.value}ml`
                                : `${opt.label} pc`}
                        </button>
                      );
                    })}
                  </div>
                  {isCustom && (
                    <div className="mt-2 flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        className="h-9 w-28 rounded-lg bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                        value={sel.value || ''}
                        onChange={(e) => setPortions({ ...portions, [idx]: { ...sel, value: Math.max(1, Number(e.target.value) || 1) } })}
                      />
                      <span className="text-sm text-gray-500 dark:text-gray-400">{UNIT_LABEL[sel.unit]}</span>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    AI estimate: {food.portionType === 'piece' ? `${food.estimatedPieces} pc` : food.portionType === 'drink' ? `${food.estimatedMl} ml` : `${food.estimatedGrams || food.totalGrams} g`}
                  </p>
                </div>

                {/* Computed nutrition for the selected portion */}
                {preview ? (
                  <p className="text-xs text-gray-700 dark:text-gray-300 mt-3 font-medium">
                    {preview.calories} kcal · {preview.proteinG}g protein · {preview.carbsG}g carbs · {preview.fatG}g fat for {preview.grams}g
                  </p>
                ) : (
                  <p className="text-xs text-orange-500 dark:text-orange-400 mt-3">Could not estimate nutrition for this food.</p>
                )}

                {/* Slot + Log */}
                <div className="flex items-center gap-2 mt-3">
                  <Select value={slots[idx] ?? 'lunch'} onValueChange={(v) => setSlots({ ...slots, [idx]: v })}>
                    <SelectTrigger className="h-9 w-32 rounded-lg bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SLOTS.map((s) => <SelectItem key={s} value={s}>{SLOT_LABELS[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg h-9 flex-1"
                    disabled={!preview || logging === idx}
                    onClick={() => handleConfirmAndLog(food, idx)}
                  >
                    {logging === idx ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Logging...</> : 'Confirm & Log'}
                  </Button>
                </div>
              </Card>
            );
          })}
          <Button variant="outline" className="w-full rounded-xl border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300" onClick={() => { setResults([]); setImagePreview(null); setImageFile(null); setTempImagePath(null); setPortions({}); setSlots({}); setSelectedVariants({}); }}>Scan Another Photo</Button>
        </div>
      )}
    </motion.div>
  );
}
