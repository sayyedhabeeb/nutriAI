'use client';

import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Camera, Loader2, Sparkles, UtensilsCrossed, Lightbulb, Clock, ScanLine, Plus, Mic, RotateCcw,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { apiFetch } from './api';
import { fadeIn } from './constants';
import type { RecognizedFood } from './types';
import { FoodConfirmCard, type PortionSel } from '@/components/food-log/FoodConfirmCard';
import { VoiceFoodLog } from '@/components/food-log/VoiceFoodLog';

interface RecentScan {
  id: string;
  name?: string | null;
  meal?: { name: string };
  calories: number;
  createdAt: string;
}

function defaultSlot(): string {
  const h = new Date().getHours();
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 18) return 'snack';
  return 'dinner';
}

export function UploadView() {
  const [inputMode, setInputMode] = useState<'photo' | 'voice'>('photo');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [results, setResults] = useState<RecognizedFood[]>([]);
  const [tempImagePath, setTempImagePath] = useState<string | null>(null);
  const [portions, setPortions] = useState<Record<number, PortionSel>>({});
  const [slots, setSlots] = useState<Record<number, string>>({});
  const [logging, setLogging] = useState<number | null>(null);
  const [selectedVariants, setSelectedVariants] = useState<Record<number, string>>({});
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceTranscript, setVoiceTranscript] = useState<string | null>(null);
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

  // Clear cross-mode state when switching between photo and voice input.
  const switchMode = (mode: 'photo' | 'voice') => {
    setVoiceError(null);
    setVoiceTranscript(null);
    setVoiceLoading(false);
    if (mode === 'voice') {
      setImagePreview(null);
      setImageFile(null);
      setTempImagePath(null);
      setResults([]);
      setPortions({});
      setSlots({});
      setSelectedVariants({});
    }
    setInputMode(mode);
  };

  const handleFileSelect = (file: File) => {
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleRecognize = async () => {
    if (!imageFile || recognizing) return;
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

  const handleVoiceTranscript = async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 3) {
      setVoiceError("We couldn't understand the meal. Please try again.");
      return;
    }
    setVoiceError(null);
    setVoiceTranscript(trimmed);
    setVoiceLoading(true);
    try {
      const data = await apiFetch('/api/voice-log/parse', {
        method: 'POST',
        body: JSON.stringify({ text: trimmed }),
      });
      const foods: RecognizedFood[] = data.foods || [];
      if (!foods.length) {
        setVoiceError("We couldn't identify any food. Please try again.");
        return;
      }
      setResults(foods);
      setTempImagePath(null);
      setSelectedVariants({});
      const draftSlot = (data.draft?.mealType as string | undefined) ?? '';
      const initialPortions: Record<number, PortionSel> = {};
      const initialSlots: Record<number, string> = {};
      foods.forEach((f, idx) => {
        const def =
          (f.portionOptions || []).find((o) => o.kind === 'preset' && o.default) ||
          (f.portionOptions || []).find((o) => o.kind === 'preset' && o.value > 0);
        initialPortions[idx] = def
          ? { value: def.value, unit: def.unit, custom: false }
          : { value: 200, unit: 'g', custom: false };
        initialSlots[idx] = draftSlot || defaultSlot();
      });
      setPortions(initialPortions);
      setSlots(initialSlots);
    } catch (err) {
      setVoiceError((err as Error).message || "Couldn't process your meal description.");
    } finally {
      setVoiceLoading(false);
    }
  };

  const selFor = (_food: RecognizedFood, idx: number): PortionSel =>
    portions[idx] ?? { value: 200, unit: 'g', custom: false };

  const handleConfirmAndLog = async (food: RecognizedFood, idx: number) => {
    const sel = selFor(food, idx);
    const variantName = selectedVariants[idx];
    const source = inputMode;
    setLogging(idx);
    try {
      const confirm = await apiFetch('/api/food-recognize/confirm', {
        method: 'POST',
        body: JSON.stringify({
          name: variantName ?? food.name,
          mealId: variantName ? undefined : food.mealId,
          newFoodId: variantName ? undefined : food.newFoodId,
          tempImagePath: source === 'photo' ? (tempImagePath ?? undefined) : undefined,
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
            source,
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
            source,
          };
      await apiFetch('/api/food-logs', { method: 'POST', body: JSON.stringify(payload) });
      toast.success('Food logged!');
    } catch (err) { toast.error((err as Error).message); }
    finally { setLogging(null); }
  };

  const clearResults = () => {
    setResults([]);
    setImagePreview(null);
    setImageFile(null);
    setTempImagePath(null);
    setPortions({});
    setSlots({});
    setSelectedVariants({});
    setVoiceError(null);
    setVoiceLoading(false);
    setVoiceTranscript(null);
    setInputMode('photo');
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

  const photoMode = inputMode === 'photo';

  const steps = photoMode
    ? [
        { step: 1, icon: Camera, title: 'Upload Photo', desc: 'Take or select a food photo' },
        { step: 2, icon: Sparkles, title: 'AI Identifies', desc: 'Recognizes food & portion' },
        { step: 3, icon: UtensilsCrossed, title: 'Confirm & Log', desc: 'Confirm portion, one-tap logging' },
      ]
    : [
        { step: 1, icon: Mic, title: 'Speak Your Meal', desc: 'Describe what you ate' },
        { step: 2, icon: Sparkles, title: 'AI Understands', desc: 'Extracts food & quantity' },
        { step: 3, icon: UtensilsCrossed, title: 'Confirm & Log', desc: 'Confirm portion, one-tap logging' },
      ];

  return (
    <motion.div {...fadeIn} className="p-4 max-w-lg mx-auto space-y-5 pb-28">
      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
          {photoMode
            ? <Camera className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            : <Mic className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{photoMode ? 'Scan Food' : 'Voice Log'}</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500">{photoMode ? 'Identify meals with AI-powered recognition' : 'Describe what you ate, we do the rest'}</p>
        </div>
      </div>

      {/* Mode toggle */}
      {!results.length && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant={photoMode ? 'default' : 'outline'}
            onClick={() => switchMode('photo')}
            disabled={recognizing || voiceLoading}
            className={`flex-1 rounded-xl ${photoMode ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}
          >
            <Camera className="mr-2 h-4 w-4" /> Photo
          </Button>
          <Button
            type="button"
            variant={!photoMode ? 'default' : 'outline'}
            onClick={() => switchMode('voice')}
            disabled={recognizing || voiceLoading}
            className={`flex-1 rounded-xl ${!photoMode ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}
          >
            <Mic className="mr-2 h-4 w-4" /> Voice
          </Button>
        </div>
      )}

      {/* Image Preview (shown when image is selected) */}
      {photoMode && imagePreview && (
        <Card className="rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-200/80 dark:border-gray-800/70 bg-white dark:bg-gray-900 overflow-hidden p-3">
          <div className="text-center space-y-2">
            <img src={imagePreview} alt="Preview" className="max-h-40 mx-auto rounded-xl object-contain" />
            <p className="text-xs text-gray-400 dark:text-gray-500">Tap &quot;Scan Another&quot; to change image</p>
          </div>
        </Card>
      )}

      {/* Hero Area — shown when no image selected */}
      {photoMode && !imagePreview && !results.length && (
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

      {/* Voice input */}
      {!photoMode && !results.length && !voiceLoading && !voiceError && (
        <Card className="rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-200/80 dark:border-gray-800/70 bg-white dark:bg-gray-900 p-1">
          <VoiceFoodLog onTranscript={handleVoiceTranscript} />
        </Card>
      )}

      {/* Voice processing */}
      {!photoMode && voiceLoading && !results.length && (
        <Card className="rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-200/80 dark:border-gray-800/70 bg-white dark:bg-gray-900 p-6">
          <div className="text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-emerald-600" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">Understanding your meal...</p>
          </div>
        </Card>
      )}

      {/* Voice error */}
      {!photoMode && voiceError && !results.length && (
        <Card className="rounded-2xl border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-950/10 p-5">
          <p className="text-sm text-red-600 dark:text-red-400">{voiceError}</p>
          <Button variant="outline" size="sm" onClick={() => setVoiceError(null)} className="mt-3 rounded-lg border-red-200 dark:border-red-800 text-red-600 dark:text-red-400">
            <RotateCcw className="mr-2 h-3.5 w-3.5" /> Try Again
          </Button>
        </Card>
      )}

      {/* Primary CTA — Take Photo */}
      {photoMode && !results.length && (
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
          {steps.map((item, idx) => (
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
      {photoMode ? (
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
      ) : (
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
                  Speak clearly and name each food you ate
                </li>
                <li className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">•</span>
                  Include quantities like &quot;two eggs&quot; or &quot;one bowl of curry&quot;
                </li>
                <li className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">•</span>
                  Say the meal like &quot;for breakfast&quot; or &quot;for dinner&quot;
                </li>
              </ul>
            </div>
          </div>
        </Card>
      )}

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
      {photoMode && imageFile && !results.length && (
        <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px] rounded-xl font-semibold" onClick={handleRecognize} disabled={recognizing}>
          {recognizing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyzing...</> : 'Recognize Food'}
        </Button>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Recognized Foods</h2>
            {inputMode === 'voice' && voiceTranscript && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                You said: &ldquo;{voiceTranscript}&rdquo;
              </p>
            )}
          </div>
          {results.map((food, idx) => (
            <FoodConfirmCard
              key={idx}
              food={food}
              index={idx}
              portion={selFor(food, idx)}
              slot={slots[idx] ?? 'lunch'}
              variantName={selectedVariants[idx]}
              logging={logging === idx}
              allowConfirmWithoutNutrition={inputMode === 'voice'}
              onPortionChange={(i, s) => setPortions({ ...portions, [i]: s })}
              onSlotChange={(i, s) => setSlots({ ...slots, [i]: s })}
              onVariantChange={(i, n) => {
                if (n) setSelectedVariants({ ...selectedVariants, [i]: n });
                else { const next = { ...selectedVariants }; delete next[i]; setSelectedVariants(next); }
              }}
              onConfirm={handleConfirmAndLog}
            />
          ))}
          <Button variant="outline" className="w-full rounded-xl border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300" onClick={clearResults}>{photoMode ? 'Scan Another Photo' : 'Log Another Meal'}</Button>
        </div>
      )}
    </motion.div>
  );
}