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
  breakfast: 'border-l-[#00b070]',
  lunch: 'border-l-[#00a070]',
  dinner: 'border-l-[#009060]',
  snack: 'border-l-[#00c080]',
};

export const SLOT_BADGE_COLORS: Record<string, string> = {
  breakfast: 'bg-[#e0f0f0] text-[#008555] border-[#c4e0e0]',
  lunch: 'bg-[#e0f0f0] text-[#00704a] border-[#c4e0e0]',
  dinner: 'bg-[#e0f0f0] text-[#00623f] border-[#c4e0e0]',
  snack: 'bg-[#e0f0f0] text-[#0a7d3a] border-[#c4e0e0]',
};

export const SLOT_GRADIENT_COLORS: Record<string, { from: string; to: string }> = {
  breakfast: { from: 'from-[#00b070]/15', to: 'to-[#00a070]/5' },
  lunch: { from: 'from-[#00a070]/15', to: 'to-[#00b070]/5' },
  dinner: { from: 'from-[#009060]/15', to: 'to-[#00a070]/5' },
  snack: { from: 'from-[#00c080]/15', to: 'to-[#00b070]/5' },
};

export const ALLERGENS = ['Peanuts', 'Tree Nuts', 'Dairy', 'Eggs', 'Gluten', 'Shellfish', 'Soy', 'Fish'];

export const PIE_COLORS = ['#009060', '#00a070', '#00b070', '#22c55e'];

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
};

export function FadeInDiv({ children, className }: { children: React.ReactNode; className?: string }) {
  return <motion.div {...fadeIn} transition={{ duration: 0.25 }} className={className}>{children}</motion.div>;
}
