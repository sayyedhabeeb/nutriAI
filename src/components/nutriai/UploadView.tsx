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
  Camera, Loader2, Sparkles, UtensilsCrossed, Lightbulb, Upload,
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
    const color = conf >= 0.9 ? 'bg-green-100 text-green-700 border-green-200' : conf >= 0.7 ? 'bg-yellow-100 text-yellow-700 border-yellow-200' : conf >= 0.5 ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-red-100 text-red-700 border-red-200';
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
    <motion.div {...fadeIn} className="p-4 max-w-lg mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
          <Camera className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Scan Food</h1>
          <p className="text-xs text-gray-400">Identify meals with AI-powered recognition</p>
        </div>
      </div>

      {/* Upload Zone */}
      <Card className="rounded-2xl shadow-sm border border-gray-100/80 bg-white overflow-hidden">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`min-h-[280px] border-2 border-dashed transition-colors cursor-pointer flex items-center justify-center p-8 ${
            dragOver
              ? 'border-emerald-400 bg-emerald-50/30'
              : 'border-gray-300 hover:border-emerald-400 hover:bg-emerald-50/30'
          } ${imagePreview ? 'p-4' : ''}`}
        >
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
          {imagePreview ? (
            <div className="space-y-3 text-center">
              <img src={imagePreview} alt="Preview" className="max-h-56 mx-auto rounded-xl object-contain" />
              <p className="text-sm text-gray-500">Tap to change image</p>
            </div>
          ) : (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto border border-emerald-100">
                <Camera className="h-8 w-8 text-emerald-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-800">Scan Your Food</p>
                <p className="text-sm text-gray-500 mt-1">Take a photo or upload an image to identify your meal</p>
              </div>
              <div className="flex gap-2 justify-center">
                {['JPG', 'PNG', 'WebP'].map((fmt) => (
                  <span key={fmt} className="px-2.5 py-1 rounded-full bg-gray-100 text-xs font-medium text-gray-400">{fmt}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* How it works */}
      <Card className="rounded-2xl shadow-sm border border-gray-100/80 bg-white p-5">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">How it works</h3>
        <div className="flex items-center justify-center mb-3">
          <div className="h-px flex-1 bg-gray-100" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { step: 1, icon: Camera, title: 'Upload Photo', desc: 'Take or select a food photo' },
            { step: 2, icon: Sparkles, title: 'AI Analyzes', desc: 'Identifies food & nutrition' },
            { step: 3, icon: UtensilsCrossed, title: 'Log Meal', desc: 'One-tap meal logging' },
          ].map((item) => (
            <div key={item.step} className="flex flex-col items-center text-center gap-2">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center">{item.step}</div>
              <item.icon className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-xs font-semibold text-gray-700">{item.title}</p>
                <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Tips section */}
      <Card className="rounded-2xl shadow-sm border border-gray-100/80 bg-amber-50/50 p-5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
            <Lightbulb className="h-4 w-4 text-amber-600" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tips for best results</h3>
            <ul className="space-y-1.5">
              <li className="text-sm text-gray-600 flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>
                Take a clear photo with good lighting
              </li>
              <li className="text-sm text-gray-600 flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>
                Include the full plate or food item
              </li>
              <li className="text-sm text-gray-600 flex items-start gap-2">
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
          <h2 className="font-semibold text-gray-900">Recognized Foods</h2>
          {results.map((food, idx) => (
            <Card key={idx} className="p-5 rounded-2xl shadow-sm border border-gray-100/80 bg-white">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="font-medium text-gray-900">{food.name}</p>
                  <p className="text-xs text-gray-500">{food.servingDescription}</p>
                </div>
                {confidenceBadge(food.confidence)}
              </div>
              <p className="text-xs text-gray-500 mb-2">Est. serving: {food.servingWeightGrams}g</p>
              {food.matched && food.meal && (
                <div className="bg-green-50 rounded-xl p-3 space-y-1 border border-green-100">
                  <p className="text-sm text-green-800 font-medium">&#10003; Found in database</p>
                  <p className="text-xs text-green-700">
                    {(food.meal as Record<string, unknown>).nutrition
                      ? `${(food.meal as Record<string, Record<string, unknown>>).nutrition?.calories} kcal, ${(food.meal as Record<string, Record<string, unknown>>).nutrition?.proteinG}g protein per 100g`
                      : 'Nutrition data available'}
                  </p>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white mt-2 rounded-lg" onClick={() => handleLogRecognized((food.meal as Record<string, unknown>).id as string, food.servingWeightGrams)}>Log This</Button>
                </div>
              )}
              {food.unknown_food && unknownForms[idx] && (
                <div className="bg-orange-50 rounded-xl p-3 space-y-3 border border-orange-100">
                  <p className="text-sm text-orange-800 font-medium">&#9888;&#65039; New Food — Please provide nutrition info</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><Label className="text-xs">Name</Label><Input className="h-9 rounded-lg" value={unknownForms[idx].confirmedName} onChange={(e) => setUnknownForms({ ...unknownForms, [idx]: { ...unknownForms[idx], confirmedName: e.target.value } })} /></div>
                    <div className="space-y-1"><Label className="text-xs">Portion (g)</Label><Input type="number" className="h-9 rounded-lg" value={unknownForms[idx].confirmedPortion} onChange={(e) => setUnknownForms({ ...unknownForms, [idx]: { ...unknownForms[idx], confirmedPortion: Number(e.target.value) } })} /></div>
                    <div className="space-y-1"><Label className="text-xs">Cal/100g</Label><Input type="number" className="h-9 rounded-lg" placeholder="e.g. 250" value={unknownForms[idx].caloriesPer100g || ''} onChange={(e) => setUnknownForms({ ...unknownForms, [idx]: { ...unknownForms[idx], caloriesPer100g: Number(e.target.value) } })} /></div>
                    <div className="space-y-1"><Label className="text-xs">Protein/100g</Label><Input type="number" className="h-9 rounded-lg" placeholder="e.g. 15" value={unknownForms[idx].proteinPer100g || ''} onChange={(e) => setUnknownForms({ ...unknownForms, [idx]: { ...unknownForms[idx], proteinPer100g: Number(e.target.value) } })} /></div>
                    <div className="space-y-1"><Label className="text-xs">Carbs/100g</Label><Input type="number" className="h-9 rounded-lg" placeholder="e.g. 30" value={unknownForms[idx].carbsPer100g || ''} onChange={(e) => setUnknownForms({ ...unknownForms, [idx]: { ...unknownForms[idx], carbsPer100g: Number(e.target.value) } })} /></div>
                    <div className="space-y-1"><Label className="text-xs">Fat/100g</Label><Input type="number" className="h-9 rounded-lg" placeholder="e.g. 10" value={unknownForms[idx].fatPer100g || ''} onChange={(e) => setUnknownForms({ ...unknownForms, [idx]: { ...unknownForms[idx], fatPer100g: Number(e.target.value) } })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Meal Type</Label>
                      <Select value={unknownForms[idx].mealType} onValueChange={(v) => setUnknownForms({ ...unknownForms, [idx]: { ...unknownForms[idx], mealType: v } })}>
                        <SelectTrigger className="h-9 rounded-lg"><SelectValue /></SelectTrigger>
                        <SelectContent>{SLOTS.map((s) => <SelectItem key={s} value={s}>{SLOT_LABELS[s]}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Cuisine</Label>
                      <Select value={unknownForms[idx].cuisine} onValueChange={(v) => setUnknownForms({ ...unknownForms, [idx]: { ...unknownForms[idx], cuisine: v } })}>
                        <SelectTrigger className="h-9 rounded-lg"><SelectValue /></SelectTrigger>
                        <SelectContent>{CUISINES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white w-full rounded-lg" onClick={() => handleSubmitUnknown(idx, food.name)}>Submit & Log</Button>
                </div>
              )}
            </Card>
          ))}
          <Button variant="outline" className="w-full rounded-xl" onClick={() => { setResults([]); setImagePreview(null); setImageFile(null); }}>Scan Another Photo</Button>
        </div>
      )}
    </motion.div>
  );
}
