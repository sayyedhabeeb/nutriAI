import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';

export const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export const SLOT_LABELS: Record<string, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack',
};

export const SLOT_ICONS: Record<string, string> = {
  breakfast: '\u{1F305}', lunch: '\u{2600}\u{FE0F}', dinner: '\u{1F319}', snack: '\u{1F37F}',
};

export const SLOT_BORDER_COLORS: Record<string, string> = {
  breakfast: 'border-l-amber-400',
  lunch: 'border-l-orange-400',
  dinner: 'border-l-indigo-400',
  snack: 'border-l-purple-400',
};

export const SLOT_BADGE_COLORS: Record<string, string> = {
  breakfast: 'bg-amber-50 text-amber-700 border-amber-200',
  lunch: 'bg-orange-50 text-orange-700 border-orange-200',
  dinner: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  snack: 'bg-purple-50 text-purple-700 border-purple-200',
};

export const SLOT_GRADIENT_COLORS: Record<string, { from: string; to: string }> = {
  breakfast: { from: 'from-amber-400/20', to: 'to-orange-400/5' },
  lunch: { from: 'from-orange-400/20', to: 'to-red-400/5' },
  dinner: { from: 'from-indigo-400/20', to: 'to-purple-400/5' },
  snack: { from: 'from-purple-400/20', to: 'to-pink-400/5' },
};

export const ALLERGENS = ['Peanuts', 'Tree Nuts', 'Dairy', 'Eggs', 'Gluten', 'Shellfish', 'Soy', 'Fish'];

export const PIE_COLORS = ['#3b82f6', '#f59e0b', '#f43f5e'];

export const CUISINES = ['Indian', 'Chinese', 'Italian', 'American', 'Mexican', 'Mediterranean', 'Japanese', 'Thai', 'Mixed'];

export const GOAL_TYPES = ['muscle_gain', 'lose_fat', 'maintain', 'recomp', 'weight_gain', 'athlete'] as const;

export const ACTIVITY_LEVELS = ['sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active'] as const;

export const DIET_TYPES = ['non-veg', 'vegetarian', 'vegan', 'eggetarian'] as const;

export const DIET_LABELS: Record<string, string> = {
  'non-veg': 'Non-Vegetarian',
  'vegan': 'Vegan',
  'vegetarian': 'Vegetarian',
  'eggetarian': 'Eggetarian',
};

export function formatLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const fadeIn: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.25 },
};

export function FadeInDiv({ children, className }: { children: React.ReactNode; className?: string }) {
  return <motion.div {...fadeIn} className={className}>{children}</motion.div>;
}
