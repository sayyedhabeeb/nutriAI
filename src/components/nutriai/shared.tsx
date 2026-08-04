'use client';

import React, { useState, useEffect } from 'react';
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
    <div className="border-2 border-gray-800 dark:border-gray-600 rounded-lg p-0 bg-white dark:bg-gray-900">
      <div className="px-3 py-2.5 border-b-[3px] border-gray-800 dark:border-gray-600">
        <h4 className="text-lg font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">Nutrition Facts</h4>
      </div>
      <div className="px-3 py-1.5 border-b border-gray-300 dark:border-gray-700 flex justify-between">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Serving Size</span>
        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{servingGms}g</span>
      </div>
      <div className="px-3 py-2 border-b-2 border-gray-800 dark:border-gray-600 flex justify-between">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label || 'Per Serving'}</span>
        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{scaled.calories} kcal</span>
      </div>
      <div className="px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 flex justify-between">
        <span className="text-xs font-bold text-gray-900 dark:text-gray-100">Total Fat</span>
        <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{scaled.fatG}g</span>
      </div>
      <div className="px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 pl-6 flex justify-between">
        <span className="text-xs text-gray-600 dark:text-gray-400">Protein</span>
        <span className="text-xs text-gray-900 dark:text-gray-100 font-medium">{scaled.proteinG}g</span>
      </div>
      <div className="px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 flex justify-between">
        <span className="text-xs font-bold text-gray-900 dark:text-gray-100">Total Carbohydrate</span>
        <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{scaled.carbsG}g</span>
      </div>
      {scaled.sugarG !== null && (
        <div className="px-3 py-1 border-b border-gray-200 dark:border-gray-700 pl-6 flex justify-between">
          <span className="text-xs text-gray-600 dark:text-gray-400">Total Sugars</span>
          <span className="text-xs text-gray-900 dark:text-gray-100 font-medium">{scaled.sugarG}g</span>
        </div>
      )}
      {scaled.fiberG !== null && (
        <div className="px-3 py-1 border-b border-gray-200 dark:border-gray-700 pl-6 flex justify-between">
          <span className="text-xs text-gray-600 dark:text-gray-400">Dietary Fiber</span>
          <span className="text-xs text-gray-900 dark:text-gray-100 font-medium">{scaled.fiberG}g</span>
        </div>
      )}
      {scaled.sodiumMg !== null && (
        <div className="px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 flex justify-between">
          <span className="text-xs font-bold text-gray-900 dark:text-gray-100">Sodium</span>
          <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{scaled.sodiumMg}mg</span>
        </div>
      )}
      <div className="px-3 py-2 flex justify-between">
        <span className="text-xs font-bold text-gray-900 dark:text-gray-100">Calories</span>
        <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{scaled.calories}</span>
      </div>
    </div>
  );
}

// ═══ Calorie Ring SVG (with gradient stroke + CSS transition + pulsing glow) ═══
export function CalorieRing({ consumed, target, pulse }: { consumed: number; target: number; pulse?: boolean }) {
  const pct = target > 0 ? Math.min(consumed / target, 1) : 0;
  const radius = 74;
  const circumference = 2 * Math.PI * radius;
  const targetOffset = circumference * (1 - pct);
  const remaining = Math.max(0, target - consumed);
  const gradId = 'calRingGrad';
  const glowId = 'calRingGlow';
  const isLow = pct < 0.5 && pct > 0;

  // Start from full (empty) and animate to target on mount
  const [dashOffset, setDashOffset] = useState(circumference);

  useEffect(() => {
    // Small delay to let CSS transition kick in from the initial full state
    const timer = requestAnimationFrame(() => {
      setDashOffset(targetOffset);
    });
    return () => cancelAnimationFrame(timer);
  }, [targetOffset]);

  return (
    <div className="relative inline-flex items-center justify-center">
      {/* Pulsing glow ring when under 50% */}
      {isLow && (
        <motion.div
          className="absolute w-[190px] h-[190px] rounded-full ring-2 ring-emerald-300/20"
          style={{
            background: 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)',
          }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      {/* Soft glow background */}
      <div className="absolute w-[160px] h-[160px] rounded-full bg-gradient-to-br from-emerald-100/40 to-teal-100/40 dark:from-emerald-900/20 dark:to-teal-900/20 blur-xl" />
      <svg width="190" height="190" viewBox="0 0 190 190" className="-rotate-90">
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
        <circle cx="90" cy="90" r={radius} fill="none" className="stroke-gray-200 dark:stroke-gray-700" strokeWidth="12" />
        {/* Animated progress arc with CSS transition */}
        <circle
          cx="90" cy="90" r={radius} fill="none"
          stroke={pct > 1 ? '#f43f5e' : `url(#${gradId})`}
          strokeWidth="12" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)' }}
          filter={(isLow || pct >= 0.75) ? `url(#${glowId})` : undefined}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Flame className={`h-4 w-4 mb-1 ${pct > 1 ? 'text-rose-500' : 'text-orange-500'}`} />
        <span className={`text-5xl font-extrabold text-gray-900 dark:text-gray-100 tabular-nums tracking-tight ${pulse ? 'animate-pulse' : ''}`}>{consumed}</span>
        <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium mt-0.5">
          of <span className="text-gray-600 dark:text-gray-300 font-semibold">{target}</span> kcal
        </span>
        <span className={`text-xs font-bold mt-1 ${pct >= 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
          {pct >= 1 ? '✓ Goal reached!' : `${remaining} remaining`}
        </span>
      </div>
    </div>
  );
}
