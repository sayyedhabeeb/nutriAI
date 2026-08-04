'use client';

import React, { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Camera, Loader2, Sparkles, UtensilsCrossed, Lightbulb,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { apiFetch } from './api';
import { SLOTS, SLOT_LABELS, CUISINES, fadeIn } from './constants';
import type { RecognizedFood } from './types';

export function UploadView() {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [results, setResults] = useState<RecognizedFood[]>([]);
  const [unknownForms, setUnknownForms] = useState<Record<number, {
    confirmedName: string; confirmedPortion: number; caloriesPer100g: number;
    proteinPer100g: number; carbsPer100g: number; fatPer100g: number;
    mealType: string; cuisine: string;
  }>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (file: File) => {
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleFileSelect(file);
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

  return (
    <motion.div {...fadeIn} className="p-4 max-w-lg mx-auto space-y-5 pb-4">
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

      {/* Upload Zone */}
      <Card className="rounded-2xl shadow-sm border border-gray-100/80 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`min-h-[280px] border-2 border-dashed transition-colors cursor-pointer flex items-center justify-center p-8 ${
            dragOver
              ? 'border-emerald-400 bg-emerald-50/30 dark:bg-emerald-900/20'
              : 'border-emerald-200 dark:border-emerald-700 hover:border-emerald-400 dark:hover:border-emerald-500 bg-gradient-to-b from-emerald-50/30 to-transparent dark:from-emerald-900/10'
          } ${imagePreview ? 'p-4' : ''}`}
        >
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
          {imagePreview ? (
            <div className="space-y-3 text-center">
              <img src={imagePreview} alt="Preview" className="max-h-56 mx-auto rounded-xl object-contain" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Tap to change image</p>
            </div>
          ) : (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center mx-auto border border-emerald-100 dark:border-emerald-800">
                <Camera className="h-8 w-8 text-emerald-400 dark:text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Take a photo or upload an image to identify your meal</p>
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-2">Tap to Upload</p>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Supports JPG, PNG, WebP</p>
              <div className="flex gap-2 justify-center">
                {['JPG', 'PNG', 'WebP'].map((fmt) => (
                  <span key={fmt} className="px-2 py-0.5 rounded-full text-[10px] text-gray-300 dark:text-gray-600">{fmt}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* How it works — Connected Step Indicator */}
      <Card className="rounded-2xl shadow-md border border-gray-100/60 dark:border-gray-800/60 bg-gray-50/50 dark:bg-gray-800/30 p-5">
        <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-6">How it works</h3>
        <div className="relative">
          {/* Connecting line behind circles */}
          <div className="absolute top-[18px] left-[calc(16.67%+18px)] right-[calc(16.67%+18px)] h-0.5 bg-emerald-200 dark:bg-emerald-800 -z-0" />
          <div className="grid grid-cols-3 gap-4 relative z-10">
            {[
              { step: 1, icon: Camera, title: 'Upload Photo', desc: 'Take or select a food photo' },
              { step: 2, icon: Sparkles, title: 'AI Analyzes', desc: 'Identifies food & nutrition' },
              { step: 3, icon: UtensilsCrossed, title: 'Log Meal', desc: 'One-tap meal logging' },
            ].map((item) => (
              <div key={item.step} className="flex flex-col items-center text-center gap-2">
                <div className="w-9 h-9 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center ring-4 ring-white dark:ring-gray-900 shadow-sm shadow-emerald-200 dark:shadow-emerald-900/30">{item.step}</div>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                  <item.icon className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{item.title}</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 leading-tight">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Tips section */}
      <Card className="rounded-2xl shadow-md border border-amber-100 dark:border-amber-900/30 bg-amber-50/50 dark:bg-amber-900/10 p-5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0 mt-0.5">
            <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400" />
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
