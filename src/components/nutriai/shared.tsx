'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';

// ═══ Nutrition Facts Label Component ═══
export function NutritionFactsLabel({
  nutrition, servingGms, label,
}: {
  nutrition: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG?: number; sugarG?: number; sodiumMg?: number } | null;
  servingGms: number;
  label?: string;
}) {
  if (!nutrition) return null;
  const scaled = {
    calories: Math.round(nutrition.calories * servingGms / 100),
    proteinG: Math.round(nutrition.proteinG * servingGms / 100 * 10) / 10,
    carbsG: Math.round(nutrition.carbsG * servingGms / 100 * 10) / 10,
    fatG: Math.round(nutrition.fatG * servingGms / 100 * 10) / 10,
    fiberG: nutrition.fiberG ? Math.round(nutrition.fiberG * servingGms / 100 * 10) / 10 : null,
    sugarG: nutrition.sugarG ? Math.round(nutrition.sugarG * servingGms / 100 * 10) / 10 : null,
    sodiumMg: nutrition.sodiumMg ? Math.round(nutrition.sodiumMg * servingGms / 100) : null,
  };

  return (
    <div className="border-2 border-gray-800 rounded-lg p-0 bg-white">
      <div className="px-3 py-2.5 border-b-[3px] border-gray-800">
        <h4 className="text-lg font-extrabold text-gray-900 tracking-tight">Nutrition Facts</h4>
      </div>
      <div className="px-3 py-1.5 border-b border-gray-300 flex justify-between">
        <span className="text-sm font-medium text-gray-700">Serving Size</span>
        <span className="text-sm font-bold text-gray-900">{servingGms}g</span>
      </div>
      <div className="px-3 py-2 border-b-2 border-gray-800 flex justify-between">
        <span className="text-sm font-medium text-gray-700">{label || 'Per Serving'}</span>
        <span className="text-sm font-bold text-gray-900">{scaled.calories} kcal</span>
      </div>
      <div className="px-3 py-1.5 border-b border-gray-200 flex justify-between">
        <span className="text-xs font-bold text-gray-900">Total Fat</span>
        <span className="text-xs font-bold text-gray-900">{scaled.fatG}g</span>
      </div>
      <div className="px-3 py-1.5 border-b border-gray-200 pl-6 flex justify-between">
        <span className="text-xs text-gray-600">Protein</span>
        <span className="text-xs text-gray-900 font-medium">{scaled.proteinG}g</span>
      </div>
      <div className="px-3 py-1.5 border-b border-gray-200 flex justify-between">
        <span className="text-xs font-bold text-gray-900">Total Carbohydrate</span>
        <span className="text-xs font-bold text-gray-900">{scaled.carbsG}g</span>
      </div>
      {scaled.sugarG !== null && (
        <div className="px-3 py-1 border-b border-gray-200 pl-6 flex justify-between">
          <span className="text-xs text-gray-600">Total Sugars</span>
          <span className="text-xs text-gray-900 font-medium">{scaled.sugarG}g</span>
        </div>
      )}
      {scaled.fiberG !== null && (
        <div className="px-3 py-1 border-b border-gray-200 pl-6 flex justify-between">
          <span className="text-xs text-gray-600">Dietary Fiber</span>
          <span className="text-xs text-gray-900 font-medium">{scaled.fiberG}g</span>
        </div>
      )}
      {scaled.sodiumMg !== null && (
        <div className="px-3 py-1.5 border-b border-gray-200 flex justify-between">
          <span className="text-xs font-bold text-gray-900">Sodium</span>
          <span className="text-xs font-bold text-gray-900">{scaled.sodiumMg}mg</span>
        </div>
      )}
      <div className="px-3 py-2 flex justify-between">
        <span className="text-xs font-bold text-gray-900">Calories</span>
        <span className="text-xs font-bold text-gray-900">{scaled.calories}</span>
      </div>
    </div>
  );
}

// ═══ Calorie Ring SVG (with gradient stroke + pulsing glow) ═══
export function CalorieRing({ consumed, target }: { consumed: number; target: number }) {
  const pct = target > 0 ? Math.min(consumed / target, 1) : 0;
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - pct);
  const remaining = Math.max(0, target - consumed);
  const gradId = 'calRingGrad';
  const glowId = 'calRingGlow';
  const isLow = pct < 0.5 && pct > 0;

  return (
    <div className="relative inline-flex items-center justify-center">
      {/* Pulsing glow ring when under 50% */}
      {isLow && (
        <motion.div
          className="absolute w-[180px] h-[180px] rounded-full ring-2 ring-emerald-300/20"
          style={{
            background: 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)',
          }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <svg width="180" height="180" viewBox="0 0 180 180" className="-rotate-90">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
          <filter id={glowId}>
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Background track */}
        <circle cx="90" cy="90" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="12" />
        {/* Animated progress arc */}
        <motion.circle
          cx="90" cy="90" r={radius} fill="none"
          stroke={pct > 1 ? '#f43f5e' : `url(#${gradId})`}
          strokeWidth="12" strokeLinecap="round"
          strokeDasharray={circumference}
          filter={isLow ? `url(#${glowId})` : undefined}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Flame className={`h-5 w-5 mb-1 ${pct > 1 ? 'text-rose-500' : 'text-orange-500'}`} />
        <span className="text-3xl font-bold text-gray-900">{consumed}</span>
        <span className="text-xs text-gray-500">of {target} kcal</span>
        <span className={`text-xs font-semibold mt-1 ${pct >= 1 ? 'text-rose-600' : 'text-emerald-600'}`}>{pct >= 1 ? 'Goal reached!' : `${remaining} left`}</span>
      </div>
    </div>
  );
}
