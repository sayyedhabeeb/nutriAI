# Task 3 — Dashboard+Scan+Nav Fix Agent

## Files Modified
1. `/home/z/my-project/src/app/page.tsx` — Removed ThemeToggle import and nav bar button (lines 17, 101-103)
2. `/home/z/my-project/src/components/nutriai/SettingsView.tsx` — Added ThemeToggle import, placed in header top-right
3. `/home/z/my-project/src/components/nutriai/shared.tsx` — Added `motion` import, `UtensilsCrossed` import. Empty calorie ring shows friendly icon + text. Improved "of X kcal" contrast.
4. `/home/z/my-project/src/components/nutriai/DashboardView.tsx` — Added `pb-28`, reduced calorie card padding, improved macro bar track visibility
5. `/home/z/my-project/src/components/nutriai/UploadView.tsx` — Complete rewrite of top section: removed drag-drop zone, added hero area, mobile CTAs, removed format badges

## Status
- All changes complete
- Lint: 0 errors
- Dev server: Compiles successfully
