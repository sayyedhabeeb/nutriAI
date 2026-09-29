'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { SLOTS, SLOT_LABELS } from '@/components/nutriai/constants';
import type { RecognizedFood } from '@/components/nutriai/types';

export interface PortionSel {
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

function confidenceBadge(conf: number) {
  const pct = Math.round(conf * 100);
  const color = conf >= 0.9 ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' : conf >= 0.7 ? 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800' : conf >= 0.5 ? 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800' : 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
  return <Badge className={`${color} text-xs`}>{pct}%</Badge>;
}

function selectedGrams(food: RecognizedFood, sel: PortionSel): number {
  if (sel.unit === 'ml') return sel.value;
  if (sel.unit === 'pc') return sel.value * (food.gramsPerPiece || 80);
  return sel.value;
}

function previewFor(food: RecognizedFood, sel: PortionSel, variantName?: string) {
  const variant = variantName
    ? food.variants.find((v) => v.name === variantName)
    : undefined;
  const n = variant?.estimatedNutrition ?? food.estimatedNutrition;
  if (!n) return null;
  const g = selectedGrams(food, sel);
  const ratio = g / (food.totalGrams || g);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return {
    grams: g,
    calories: Math.round(n.calories * ratio),
    proteinG: r1(n.proteinG * ratio),
    carbsG: r1(n.carbsG * ratio),
    fatG: r1(n.fatG * ratio),
  };
}

interface FoodConfirmCardProps {
  food: RecognizedFood;
  index: number;
  portion: PortionSel;
  slot: string;
  variantName?: string;
  logging: boolean;
  allowConfirmWithoutNutrition?: boolean;
  onPortionChange: (index: number, sel: PortionSel) => void;
  onSlotChange: (index: number, slot: string) => void;
  onVariantChange: (index: number, name: string | undefined) => void;
  onConfirm: (food: RecognizedFood, index: number) => void;
}

export function FoodConfirmCard({
  food,
  index,
  portion,
  slot,
  variantName,
  logging,
  allowConfirmWithoutNutrition = false,
  onPortionChange,
  onSlotChange,
  onVariantChange,
  onConfirm,
}: FoodConfirmCardProps) {
  const sel = portion;
  const preview = previewFor(food, sel, variantName);
  const isCustom = sel.custom;

  return (
    <Card className="p-5 rounded-2xl shadow-sm border border-gray-100/80 dark:border-gray-800 bg-white dark:bg-gray-900">
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
              onClick={() => onVariantChange(index, undefined)}
              className={`px-3 h-8 rounded-full text-xs font-medium border transition-colors ${!variantName
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-200 dark:shadow-emerald-900/30'
                : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700'
              }`}
            >
              Just {food.name}
            </button>
            {food.variants.map((v) => {
              const active = variantName === v.name;
              return (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => onVariantChange(index, v.name)}
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
                onClick={() => onPortionChange(index, { value: opt.value, unit: opt.unit, custom: opt.kind === 'custom' })}
                className={`px-3 h-9 rounded-lg text-sm font-medium border transition-colors min-w-[44px] ${active
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-200 dark:shadow-emerald-900/30'
                  : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700'
                }`}
              >
                {opt.kind === 'custom'
                  ? 'More'
                  : opt.unit === 'g'
                    ? /\d/.test(opt.label)
                      ? opt.label
                      : `${opt.label} · ${opt.value}g`
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
              onChange={(e) => onPortionChange(index, { ...sel, value: Math.max(1, Number(e.target.value) || 1) })}
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
        <Select value={slot ?? 'lunch'} onValueChange={(v) => onSlotChange(index, v)}>
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
          disabled={logging || (!allowConfirmWithoutNutrition && !preview)}
          onClick={() => onConfirm(food, index)}
        >
          {logging ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Logging...</> : 'Confirm & Log'}
        </Button>
      </div>
    </Card>
  );
}