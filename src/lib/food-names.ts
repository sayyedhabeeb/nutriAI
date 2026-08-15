const SPLIT_PATTERN = /[+&]/;

/**
 * Splits a food name on unambiguous combination markers (`+` and `&`) into
 * individual dishes. Single-dish names pass through unchanged. We deliberately
 * do NOT split on "and"/"with" (e.g. "Bread and Butter" is one dish).
 */
export function splitFoodNames(name: string): string[] {
  return name
    .split(SPLIT_PATTERN)
    .map((part) => part.trim().replace(/\s+/g, ' '))
    .filter((part) => part.length > 0);
}

/**
 * Returns a user-facing error message if the name combines multiple dishes,
 * otherwise null.
 */
export function assertSingleFoodName(name: string): string | null {
  const parts = splitFoodNames(name);
  if (parts.length <= 1) return null;
  const list = parts.map((p) => `'${p}'`).join(' and ');
  return `Please add ${list} as separate foods — a food name must be a single dish.`;
}
