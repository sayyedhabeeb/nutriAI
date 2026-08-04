'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, subDays, parseISO } from 'date-fns';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { toast } from 'sonner';

// shadcn/ui
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

// Lucide icons
import {
  Leaf, Camera, Search, Plus, Minus, Droplets, Utensils, Flame,
  Dumbbell, Target, TrendingUp, User, Settings, LogOut, X, Check,
  AlertCircle, Home, List, BarChart3, Loader2, Trash2, GlassWater, Scale,
  CalendarDays, Clock, RotateCcw, Zap, ChevronRight, Sparkles, Salad,
} from 'lucide-react';

// ═══ Types ═══
type ViewType = 'auth' | 'onboarding' | 'dashboard' | 'foodlog' | 'upload' | 'progress' | 'settings';
type TabType = 'dashboard' | 'foodlog' | 'upload' | 'progress' | 'settings';

interface NutritionData {
  targets: { calories: number; proteinG: number; carbsG: number; fatG: number };
  consumed: { calories: number; proteinG: number; carbsG: number; fatG: number };
  remaining: { calories: number; proteinG: number; carbsG: number; fatG: number };
  percentages: { calories: number; proteinG: number; carbsG: number; fatG: number };
}

interface MealRecommendation {
  meal: {
    id: string; name: string; mealType: string; cuisine: string;
    imageUrl: string | null; prepTimeMin: number | null;
    isVeg?: boolean; isVegan?: boolean; description?: string | null;
  };
  score: number;
  recommendedServingGms: number;
  estimatedNutrition: { calories: number; proteinG: number; carbsG: number; fatG: number } | null;
  baseNutritionPer100g: { calories: number; proteinG: number; carbsG: number; fatG: number } | null;
}

interface FoodLogItem {
  id: string;
  mealId: string | null;
  servingGms: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  mealSlot: string;
  meal: { name: string; nutrition: { calories: number; proteinG: number; carbsG: number; fatG: number } | null } | null;
}

interface RecognizedFood {
  name: string;
  servingDescription: string;
  servingWeightGrams: number;
  confidence: number;
  matched: boolean;
  unknown_food?: boolean;
  meal: Record<string, unknown> | null;
}

interface SearchMeal {
  id: string;
  name: string;
  mealType: string;
  cuisine: string;
  baseServingGms: number;
  nutrition: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number; sugarG: number; sodiumMg: number } | null;
  isVeg: boolean;
  isVegan: boolean;
  prepTimeMin: number | null;
  servings: { servingSizeGms: number; servingDescription: string }[];
}

// ═══ API Helper ═══
function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('nutriai_session');
}
function setToken(token: string) {
  localStorage.setItem('nutriai_session', token);
}
function clearToken() {
  localStorage.removeItem('nutriai_session');
}
async function apiFetch(url: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { ...options, headers });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Request failed');
  return json.data;
}

// ═══ Constants ═══
const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const SLOT_LABELS: Record<string, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack',
};
const SLOT_ICONS: Record<string, string> = {
  breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍿',
};
const SLOT_BORDER_COLORS: Record<string, string> = {
  breakfast: 'border-l-amber-400',
  lunch: 'border-l-orange-400',
  dinner: 'border-l-indigo-400',
  snack: 'border-l-purple-400',
};
const SLOT_BADGE_COLORS: Record<string, string> = {
  breakfast: 'bg-amber-50 text-amber-700 border-amber-200',
  lunch: 'bg-orange-50 text-orange-700 border-orange-200',
  dinner: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  snack: 'bg-purple-50 text-purple-700 border-purple-200',
};
const ALLERGENS = ['Peanuts', 'Tree Nuts', 'Dairy', 'Eggs', 'Gluten', 'Shellfish', 'Soy', 'Fish'];
const PIE_COLORS = ['#3b82f6', '#f59e0b', '#f43f5e'];

// ═══ Animation Variants ═══
const fadeIn = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.25 },
};

// ═══ Nutrition Facts Label Component ═══
function NutritionFactsLabel({
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
      <div className="px-3 py-2 border-b-2 border-gray-800">
        <h4 className="text-lg font-extrabold text-gray-900 tracking-tight">Nutrition Facts</h4>
      </div>
      <div className="px-3 py-1.5 border-b border-gray-300 flex justify-between">
        <span className="text-sm font-medium text-gray-700">Serving Size</span>
        <span className="text-sm font-bold text-gray-900">{servingGms}g</span>
      </div>
      <div className="px-3 py-1.5 border-b-2 border-gray-800 flex justify-between">
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

// ═══ Main Component ═══
export default function NutriAIPage() {
  const [view, setView] = useState<ViewType>('auth');
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');

  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    if (!token) return;
    (async () => {
      try {
        const user = await apiFetch('/api/auth/me');
        if (!cancelled) {
          if (user.profile && user.goal && user.preference) {
            setView('dashboard');
          } else {
            setView('onboarding');
          }
        }
      } catch {
        if (!cancelled) clearToken();
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as TabType);
    setView(tab as ViewType);
  };

  const handleLogout = () => {
    clearToken();
    setView('auth');
    setActiveTab('dashboard');
    toast.success('Logged out successfully');
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50/50">
      <main className="flex-1 pb-20">
        <AnimatePresence mode="wait">
          {view === 'auth' && <AuthView key="auth" onAuth={(v: ViewType) => { setView(v); if (v === 'dashboard') setActiveTab('dashboard'); }} />}
          {view === 'onboarding' && <OnboardingView key="onboarding" onComplete={() => { setView('dashboard'); setActiveTab('dashboard'); }} />}
          {view === 'dashboard' && <DashboardView key="dashboard" onNavigate={setView} />}
          {view === 'foodlog' && <FoodLogView key="foodlog" />}
          {view === 'upload' && <UploadView key="upload" />}
          {view === 'progress' && <ProgressView key="progress" />}
          {view === 'settings' && <SettingsView key="settings" onLogout={handleLogout} />}
        </AnimatePresence>
      </main>

      {view !== 'auth' && view !== 'onboarding' && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-gray-200/60 safe-area-bottom">
          <div className="max-w-lg mx-auto flex justify-around items-center h-16">
            {([
              { tab: 'dashboard' as TabType, icon: Home, label: 'Home' },
              { tab: 'foodlog' as TabType, icon: List, label: 'Log' },
              { tab: 'upload' as TabType, icon: Camera, label: 'Scan' },
              { tab: 'progress' as TabType, icon: BarChart3, label: 'Progress' },
              { tab: 'settings' as TabType, icon: Settings, label: 'Settings' },
            ]).map(({ tab, icon: Icon, label }) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`relative flex flex-col items-center justify-center gap-0.5 w-full h-full min-h-[44px] transition-colors ${
                  activeTab === tab ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <div className="relative">
                  <Icon className="h-5 w-5" strokeWidth={activeTab === tab ? 2.5 : 2} />
                  {activeTab === tab && (
                    <motion.div
                      layoutId="nav-dot"
                      className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-600"
                      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    />
                  )}
                </div>
                <span className={`text-[10px] ${activeTab === tab ? 'font-semibold' : 'font-medium'}`}>{label}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// AUTH VIEW
// ═══════════════════════════════════════════════════════════
function AuthView({ onAuth }: { onAuth: (v: ViewType) => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const url = isLogin ? '/api/auth/login' : '/api/auth/register';
      const body: Record<string, string> = { email, password };
      if (!isLogin && name) body.name = name;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error || 'Authentication failed');
        return;
      }
      setToken(json.data.token);
      toast.success(isLogin ? 'Welcome back!' : 'Account created!');
      const me = await apiFetch('/api/auth/me');
      if (me.profile && me.goal && me.preference) {
        onAuth('dashboard');
      } else {
        onAuth('onboarding');
      }
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div {...fadeIn} className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-emerald-50 via-green-50/30 to-white">
      <Card className="w-full max-w-md shadow-xl border-0 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 pt-8 pb-6 text-center">
          <div className="mx-auto w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-3">
            <Leaf className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white">NutriAI</h2>
          <p className="text-emerald-100 text-sm mt-1">AI-Powered Nutrition Tracker</p>
        </div>
        <CardContent className="pt-6 px-6 pb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">Full Name</Label>
                <Input id="name" placeholder="John Doe" value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl" />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Password</Label>
              <Input id="password" type="password" placeholder="Min 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="h-11 rounded-xl" />
            </div>
            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px] rounded-xl font-semibold" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLogin ? 'Sign In' : 'Create Account'}
            </Button>
          </form>
          <div className="mt-5 text-center text-sm text-gray-500">
            {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button onClick={() => setIsLogin(!isLogin)} className="text-emerald-600 font-semibold hover:underline">
              {isLogin ? 'Sign Up' : 'Sign In'}
            </button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// ONBOARDING VIEW
// ═══════════════════════════════════════════════════════════
function OnboardingView({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState({ firstName: '', lastName: '', age: '', gender: 'male', heightCm: '', weightKg: '' });
  const [goals, setGoals] = useState({ goalType: 'maintain', activityLevel: 'moderately_active', targetWeightKg: '' });
  const [prefs, setPrefs] = useState<{ cuisinePreference: string; dietType: string; allergies: string[] }>({ cuisinePreference: 'Mixed', dietType: 'non-veg', allergies: [] });

  const toggleAllergy = (a: string) => {
    setPrefs((p) => ({
      ...p,
      allergies: p.allergies.includes(a) ? p.allergies.filter((x) => x !== a) : [...p.allergies, a],
    }));
  };

  const saveProfile = async () => {
    await apiFetch('/api/users/profile', {
      method: 'PUT',
      body: JSON.stringify({
        firstName: profile.firstName || null, lastName: profile.lastName || null,
        age: profile.age ? Number(profile.age) : null, gender: profile.gender,
        heightCm: profile.heightCm ? Number(profile.heightCm) : null,
        weightKg: profile.weightKg ? Number(profile.weightKg) : null,
      }),
    });
  };

  const handleNext = async () => {
    if (step === 1) {
      setLoading(true);
      try { await saveProfile(); setStep(2); }
      catch (err) { toast.error((err as Error).message); }
      finally { setLoading(false); }
    } else if (step === 2) {
      setLoading(true);
      try {
        await apiFetch('/api/users/goals', {
          method: 'PUT',
          body: JSON.stringify({ goalType: goals.goalType, activityLevel: goals.activityLevel, targetWeightKg: goals.targetWeightKg ? Number(goals.targetWeightKg) : null }),
        });
        setStep(3);
      } catch (err) { toast.error((err as Error).message); }
      finally { setLoading(false); }
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      await apiFetch('/api/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify({ goalType: goals.goalType, activityLevel: goals.activityLevel, cuisinePreference: prefs.cuisinePreference, dietType: prefs.dietType, allergies: prefs.allergies }),
      });
      toast.success('Setup complete! Welcome to NutriAI!');
      onComplete();
    } catch (err) { toast.error((err as Error).message); }
    finally { setLoading(false); }
  };

  const steps = [{ num: 1, label: 'Profile' }, { num: 2, label: 'Goals' }, { num: 3, label: 'Preferences' }];

  return (
    <motion.div {...fadeIn} className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-emerald-50 via-green-50/30 to-white">
      <Card className="w-full max-w-md shadow-xl border-0 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 pt-6 pb-5 text-center">
          <div className="mx-auto w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center mb-2">
            <Leaf className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-white text-lg">Let's Get Started</CardTitle>
          <CardDescription className="text-emerald-100">Step {step} of 3</CardDescription>
          <div className="flex gap-2 justify-center mt-4">
            {steps.map((s) => (
              <div key={s.num} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  step >= s.num ? 'bg-white text-emerald-600' : 'bg-white/20 text-white/60'
                }`}>
                  {step > s.num ? <Check className="h-4 w-4" /> : s.num}
                </div>
                {s.num < 3 && <div className={`w-8 h-0.5 ${step > s.num ? 'bg-white' : 'bg-white/30'}`} />}
              </div>
            ))}
          </div>
        </div>
        <CardContent className="pt-5 px-6 pb-6 space-y-4">
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-sm font-medium">First Name</Label><Input placeholder="John" value={profile.firstName} onChange={(e) => setProfile((p) => ({ ...p, firstName: e.target.value }))} className="h-11 rounded-xl" /></div>
                <div className="space-y-1.5"><Label className="text-sm font-medium">Last Name</Label><Input placeholder="Doe" value={profile.lastName} onChange={(e) => setProfile((p) => ({ ...p, lastName: e.target.value }))} className="h-11 rounded-xl" /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-sm font-medium">Age</Label><Input type="number" placeholder="25" value={profile.age} onChange={(e) => setProfile((p) => ({ ...p, age: e.target.value }))} className="h-11 rounded-xl" /></div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Gender</Label>
                <RadioGroup value={profile.gender} onValueChange={(v) => setProfile((p) => ({ ...p, gender: v }))} className="flex gap-4">
                  {['male', 'female', 'other'].map((g) => (
                    <div key={g} className="flex items-center gap-2">
                      <RadioGroupItem value={g} id={`o-${g}`} />
                      <Label htmlFor={`o-${g}`} className="font-normal text-sm capitalize">{g}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-sm font-medium">Height (cm)</Label><Input type="number" placeholder="170" value={profile.heightCm} onChange={(e) => setProfile((p) => ({ ...p, heightCm: e.target.value }))} className="h-11 rounded-xl" /></div>
                <div className="space-y-1.5"><Label className="text-sm font-medium">Weight (kg)</Label><Input type="number" placeholder="70" value={profile.weightKg} onChange={(e) => setProfile((p) => ({ ...p, weightKg: e.target.value }))} className="h-11 rounded-xl" /></div>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Goal</Label>
                <Select value={goals.goalType} onValueChange={(v) => setGoals((g) => ({ ...g, goalType: v }))}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{['muscle_gain', 'lose_fat', 'maintain', 'recomp', 'weight_gain', 'athlete'].map((g) => <SelectItem key={g} value={g}>{g.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Activity Level</Label>
                <Select value={goals.activityLevel} onValueChange={(v) => setGoals((g) => ({ ...g, activityLevel: v }))}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{['sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active'].map((a) => <SelectItem key={a} value={a}>{a.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label className="text-sm font-medium">Target Weight (kg)</Label><Input type="number" placeholder="70" value={goals.targetWeightKg} onChange={(e) => setGoals((g) => ({ ...g, targetWeightKg: e.target.value }))} className="h-11 rounded-xl" /></div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Cuisine Preference</Label>
                <Select value={prefs.cuisinePreference} onValueChange={(v) => setPrefs((p) => ({ ...p, cuisinePreference: v }))}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{['Indian', 'Chinese', 'Italian', 'American', 'Mexican', 'Mediterranean', 'Japanese', 'Thai', 'Mixed'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Diet Type</Label>
                <Select value={prefs.dietType} onValueChange={(v) => setPrefs((p) => ({ ...p, dietType: v }))}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{['non-veg', 'vegetarian', 'vegan', 'eggetarian'].map((d) => <SelectItem key={d} value={d}>{d === 'non-veg' ? 'Non-Vegetarian' : d === 'vegan' ? 'Vegan' : d === 'vegetarian' ? 'Vegetarian' : 'Eggetarian'}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Allergies</Label>
                <div className="grid grid-cols-2 gap-2">
                  {ALLERGENS.map((a) => (
                    <label key={a} className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-200 cursor-pointer hover:bg-emerald-50/50 hover:border-emerald-200 transition-colors min-h-[44px]">
                      <Checkbox checked={prefs.allergies.includes(a)} onCheckedChange={() => toggleAllergy(a)} />
                      <span className="text-sm">{a}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            {step > 1 && <Button variant="outline" onClick={() => setStep(step - 1)} className="min-h-[44px] rounded-xl">Back</Button>}
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px] rounded-xl font-semibold" disabled={loading} onClick={step === 3 ? handleComplete : handleNext}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {step === 3 ? 'Complete Setup' : 'Next'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// CALORIE RING SVG (with gradient stroke)
// ═══════════════════════════════════════════════════════════
function CalorieRing({ consumed, target }: { consumed: number; target: number }) {
  const pct = target > 0 ? Math.min(consumed / target, 1) : 0;
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - pct);
  const remaining = Math.max(0, target - consumed);
  const gradId = 'calRingGrad';

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="180" height="180" viewBox="0 0 180 180" className="-rotate-90">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
        </defs>
        <circle cx="90" cy="90" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="12" />
        <motion.circle
          cx="90" cy="90" r={radius} fill="none"
          stroke={pct > 1 ? '#f43f5e' : `url(#${gradId})`}
          strokeWidth="12" strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Flame className="h-5 w-5 text-orange-500 mb-1" />
        <span className="text-2xl font-bold text-gray-900">{consumed}</span>
        <span className="text-xs text-gray-500">of {target} kcal</span>
        <span className="text-xs text-emerald-600 font-semibold mt-1">{remaining} left</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD VIEW
// ═══════════════════════════════════════════════════════════
function DashboardView({ onNavigate }: { onNavigate: (v: ViewType) => void }) {
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [nutrition, setNutrition] = useState<NutritionData | null>(null);
  const [recommendations, setRecommendations] = useState<Record<string, MealRecommendation[]>>({});
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState(0);

  // Log meal dialog state
  const [logDialog, setLogDialog] = useState<{
    open: boolean;
    meal: MealRecommendation;
    slot: string;
    baseNutritionPer100g: { calories: number; proteinG: number; carbsG: number; fatG: number } | null;
    mealName: string;
    cuisine: string;
    mealType: string;
    description?: string | null;
    isVeg?: boolean;
    isVegan?: boolean;
  } | { open: false }>({ open: false });
  const [servingGms, setServingGms] = useState(100);

  // Meal search dialog state (per-slot)
  const [slotSearchDialog, setSlotSearchDialog] = useState<{ open: boolean; slot: string } | { open: false }>({ open: false });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchMeal[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchDebounce, setSearchDebounce] = useState<NodeJS.Timeout | null>(null);

  // Meal detail sheet
  const [detailSheet, setDetailSheet] = useState<{
    open: boolean;
    rec: MealRecommendation;
  } | { open: false }>({ open: false });

  const fetchData = useCallback(async () => {
    try {
      const [me, nut, summaryData] = await Promise.all([
        apiFetch('/api/auth/me'),
        apiFetch('/api/nutrition/daily'),
        apiFetch('/api/progress/summary?period=week').catch(() => ({ summary: { totalDays: 0 } })),
      ]);
      setUser(me);
      setNutrition(nut);

      // Calculate streak from weekly data
      const weeklyData = await apiFetch('/api/progress/weekly').catch(() => [] as Record<string, unknown>[]);
      let streakCount = 0;
      for (let i = (weeklyData as Record<string, unknown>[]).length - 1; i >= 0; i--) {
        const day = weeklyData[i];
        const consumed = (day.consumed as Record<string, number>)?.calories || 0;
        if (consumed > 0) streakCount++;
        else break;
      }
      setStreak(streakCount);

      const recs = await Promise.all(
        SLOTS.map(async (slot) => {
          try {
            const r = await apiFetch(`/api/recommendations?slot=${slot}`);
            return { slot, recs: r.recommendations || [] };
          } catch { return { slot, recs: [] }; }
        })
      );
      const recMap: Record<string, MealRecommendation[]> = {};
      for (const r of recs) recMap[r.slot] = r.recs;
      setRecommendations(recMap);
    } catch {
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleLogMeal = async () => {
    if (!logDialog.open) return;
    try {
      await apiFetch('/api/food-logs', {
        method: 'POST',
        body: JSON.stringify({ mealId: logDialog.meal.meal.id, servingGms, mealSlot: logDialog.slot }),
      });
      toast.success(`Logged ${logDialog.mealName}!`);
      setLogDialog({ open: false });
      fetchData();
    } catch (err) { toast.error((err as Error).message); }
  };

  // Per-slot search with debounce
  const handleSlotSearch = (query: string) => {
    setSearchQuery(query);
    if (searchDebounce) clearTimeout(searchDebounce);
    if (!query.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
 setSearchLoading(true);
      try {
        const res = await apiFetch(`/api/meals/search?q=${encodeURIComponent(query)}`);
        setSearchResults((res.meals || []) as SearchMeal[]);
      } catch { toast.error('Search failed'); }
      finally { setSearchLoading(false); }
    }, 350);
    setSearchDebounce(timer);
  };

  const handleLogFromSearch = (meal: SearchMeal) => {
    const slot = slotSearchDialog.open ? slotSearchDialog.slot : 'lunch';
    setServingGms(meal.baseServingGms || 100);
    setLogDialog({
      open: true,
      meal: {
        meal: { id: meal.id, name: meal.name, mealType: meal.mealType, cuisine: meal.cuisine, imageUrl: null, prepTimeMin: meal.prepTimeMin, isVeg: meal.isVeg, isVegan: meal.isVegan },
        score: 0, recommendedServingGms: meal.baseServingGms || 100, estimatedNutrition: meal.nutrition ? { calories: meal.nutrition.calories, proteinG: meal.nutrition.proteinG, carbsG: meal.nutrition.carbsG, fatG: meal.nutrition.fatG } : null,
        baseNutritionPer100g: meal.nutrition ? { calories: meal.nutrition.calories, proteinG: meal.nutrition.proteinG, carbsG: meal.nutrition.carbsG, fatG: meal.nutrition.fatG } : null,
      },
      slot,
      baseNutritionPer100g: meal.nutrition || null,
      mealName: meal.name,
      cuisine: meal.cuisine,
      mealType: meal.mealType,
      isVeg: meal.isVeg,
      isVegan: meal.isVegan,
    });
    setSlotSearchDialog({ open: false });
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleWaterAdd = async () => {
    try {
      await apiFetch('/api/water-log', { method: 'POST', body: JSON.stringify({ glasses: 1 }) });
      toast.success('\uD83D\uDCA7 +1 glass of water');
    } catch { toast.error('Failed to log water'); }
  };

  const firstName = (user?.profile as Record<string, unknown> | null)?.firstName || (user?.name as string) || 'there';
  const todayStr = format(new Date(), 'EEEE, MMMM d');

  if (loading) {
    return (
      <div className="p-4 max-w-lg mx-auto space-y-4">
        <Skeleton className="h-8 w-56 rounded-xl" />
        <div className="flex justify-center"><Skeleton className="h-[180px] w-[180px] rounded-full" /></div>
        <div className="space-y-3"><Skeleton className="h-10 w-full rounded-xl" /><Skeleton className="h-10 w-full rounded-xl" /><Skeleton className="h-10 w-full rounded-xl" /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Skeleton className="h-56 w-full rounded-xl" /><Skeleton className="h-56 w-full rounded-xl" /></div>
      </div>
    );
  }

  const targetCal = nutrition?.targets?.calories || 0;
  const consumedCal = nutrition?.consumed?.calories || 0;

  return (
    <motion.div {...fadeIn} className="p-4 max-w-lg mx-auto space-y-4">
      {/* Greeting Section with Date & Streak */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Hi, {firstName}! &#x1F44B;</h1>
          <p className="text-sm text-gray-500 mt-0.5">{todayStr}</p>
        </div>
        <div className="flex items-center gap-2">
          {streak > 0 && (
            <Badge className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 gap-1">
              <Zap className="h-3 w-3" />{streak} day{streak > 1 ? 's' : ''}
            </Badge>
          )}
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
            <User className="h-5 w-5 text-emerald-600" />
          </div>
        </div>
      </div>

      {/* Calorie Ring */}
      <Card className="p-6 rounded-xl shadow-sm">
        <div className="flex justify-center">
          <CalorieRing consumed={consumedCal} target={targetCal} />
        </div>
      </Card>

      {/* Macro Progress Bars with gradient & percentage */}
      <Card className="p-4 rounded-xl shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Today&apos;s Macros</h3>
        {[
          { label: 'Protein', val: nutrition?.consumed?.proteinG || 0, target: nutrition?.targets?.proteinG || 0, from: '#3b82f6', to: '#60a5fa', unit: 'g' },
          { label: 'Carbs', val: nutrition?.consumed?.carbsG || 0, target: nutrition?.targets?.carbsG || 0, from: '#f59e0b', to: '#fbbf24', unit: 'g' },
          { label: 'Fat', val: nutrition?.consumed?.fatG || 0, target: nutrition?.targets?.fatG || 0, from: '#f43f5e', to: '#fb7185', unit: 'g' },
        ].map((m) => {
          const pct = Math.min(Math.round((m.val / (m.target || 1)) * 100), 100);
          return (
            <div key={m.label}>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-gray-600 font-medium">{m.label}</span>
                <span className="text-gray-500">{m.val}{m.unit} / {m.target}{m.unit} &middot; {pct}%</span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: `linear-gradient(90deg, ${m.from}, ${m.to})` }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8 }}
                />
              </div>
            </div>
          );
        })}
      </Card>

      {/* Meal Slots with colored left borders & search buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SLOTS.map((slot) => {
          const recs = recommendations[slot] || [];
          return (
            <Card key={slot} className={`p-0 rounded-xl shadow-sm border-l-4 ${SLOT_BORDER_COLORS[slot]} overflow-hidden`}>
              <div className="p-4 pb-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{SLOT_ICONS[slot]}</span>
                    <h3 className="font-semibold text-sm text-gray-900">{SLOT_LABELS[slot]}</h3>
                  </div>
                  <Button
                    variant="ghost" size="icon"
                    className="h-8 w-8 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50"
                    onClick={() => { setSearchQuery(''); setSearchResults([]); setSlotSearchDialog({ open: true, slot }); }}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="px-4 pb-3 space-y-2 max-h-64 overflow-y-auto">
                {recs.length === 0 && (
                  <div className="text-center py-3">
                    <p className="text-xs text-gray-400">No recommendations</p>
                    <Button variant="ghost" size="sm" className="text-emerald-600 text-xs mt-1 hover:bg-emerald-50" onClick={() => { setSearchQuery(''); setSearchResults([]); setSlotSearchDialog({ open: true, slot }); }}>
                      <Search className="h-3 w-3 mr-1" />Search for meals
                    </Button>
                  </div>
                )}
                {recs.map((rec) => (
                  <div
                    key={rec.meal.id}
                    className="p-2.5 rounded-xl border border-gray-100 bg-white space-y-1.5 hover:shadow-sm hover:border-emerald-100 transition-all cursor-pointer"
                    onClick={() => setDetailSheet({ open: true, rec })}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-800 leading-tight line-clamp-1">{rec.meal.name}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        {rec.meal.isVeg && <span className="text-green-600 text-xs font-bold border border-green-300 rounded px-1">V</span>}
                        {rec.meal.isVegan && <span className="text-green-700 text-xs font-bold border border-green-400 rounded px-1">VG</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-medium border-gray-200 text-gray-500">{rec.meal.cuisine}</Badge>
                      {rec.meal.prepTimeMin && (
                        <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><Clock className="h-3 w-3" />{rec.meal.prepTimeMin}m</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-gray-500">
                      <span className="font-medium text-gray-700">{rec.baseNutritionPer100g?.calories || 0} kcal/100g</span>
                      <span>&middot;</span>
                      <span>P: {rec.baseNutritionPer100g?.proteinG || 0}g</span>
                      {rec.estimatedNutrition && (
                        <span>&middot; <span className="text-emerald-600">~{rec.estimatedNutrition.calories} kcal ({rec.recommendedServingGms}g)</span></span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs min-h-[32px] rounded-lg mt-1 font-medium"
                      onClick={(e) => {
                        e.stopPropagation();
                        setServingGms(rec.recommendedServingGms);
                        setLogDialog({
                          open: true, meal: rec, slot,
                          baseNutritionPer100g: rec.baseNutritionPer100g,
                          mealName: rec.meal.name,
                          cuisine: rec.meal.cuisine,
                          mealType: rec.meal.mealType,
                          description: rec.meal.description,
                          isVeg: rec.meal.isVeg,
                          isVegan: rec.meal.isVegan,
                        });
                      }}
                    >
                      I Ate This
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      {/* FAB buttons */}
      <div className="fixed bottom-20 right-4 z-40 flex flex-col gap-2">
        <Button size="icon" className="w-12 h-12 rounded-full bg-blue-500 hover:bg-blue-600 text-white shadow-lg" onClick={handleWaterAdd}>
          <Droplets className="h-5 w-5" />
        </Button>
        <Button size="icon" className="w-12 h-12 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg" onClick={() => { setSearchQuery(''); setSearchResults([]); setSlotSearchDialog({ open: true, slot: 'lunch' }); }}>
          <Search className="h-5 w-5" />
        </Button>
        <Button size="icon" className="w-12 h-12 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg" onClick={() => onNavigate('upload')}>
          <Camera className="h-5 w-5" />
        </Button>
      </div>

      {/* ═══ Log Meal Dialog with Nutrition Facts Label ═══ */}
      <Dialog open={logDialog.open} onOpenChange={(open) => setLogDialog(open ? logDialog : { open: false })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log Meal</DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              {logDialog.open && <span className="font-medium text-gray-700">{logDialog.mealName}</span>}
              {logDialog.open && logDialog.cuisine && <Badge variant="outline" className="text-xs">{logDialog.cuisine}</Badge>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Serving Size (grams)</Label>
              <Input type="number" value={servingGms} onChange={(e) => setServingGms(Number(e.target.value))} min={10} max={1000} className="h-11 rounded-xl" />
            </div>

            {/* Per-100g vs Estimated nutrition display */}
            {logDialog.open && logDialog.baseNutritionPer100g && (
              <div className="space-y-3">
                {/* Per 100g info */}
                <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Per 100g</p>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <span className="text-gray-600">Calories:</span><span className="font-bold text-gray-900">{logDialog.baseNutritionPer100g.calories} kcal</span>
                    <span className="text-gray-600">Protein:</span><span className="font-bold text-blue-600">{logDialog.baseNutritionPer100g.proteinG}g</span>
                    <span className="text-gray-600">Carbs:</span><span className="font-bold text-amber-600">{logDialog.baseNutritionPer100g.carbsG}g</span>
                    <span className="text-gray-600">Fat:</span><span className="font-bold text-rose-600">{logDialog.baseNutritionPer100g.fatG}g</span>
                  </div>
                </div>
                {/* Estimated for serving */}
                <div className="bg-emerald-50 rounded-xl p-3 text-sm space-y-1 border border-emerald-100">
                  <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1.5">Estimated for {servingGms}g serving</p>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <span className="text-gray-600">Calories:</span><span className="font-bold text-gray-900">{Math.round((logDialog.baseNutritionPer100g.calories / 100) * servingGms)} kcal</span>
                    <span className="text-gray-600">Protein:</span><span className="font-bold text-blue-600">{Math.round((logDialog.baseNutritionPer100g.proteinG / 100) * servingGms * 10) / 10}g</span>
                    <span className="text-gray-600">Carbs:</span><span className="font-bold text-amber-600">{Math.round((logDialog.baseNutritionPer100g.carbsG / 100) * servingGms * 10) / 10}g</span>
                    <span className="text-gray-600">Fat:</span><span className="font-bold text-rose-600">{Math.round((logDialog.baseNutritionPer100g.fatG / 100) * servingGms * 10) / 10}g</span>
                  </div>
                </div>
              </div>
            )}

            {/* Nutrition Facts Label */}
            {logDialog.open && logDialog.baseNutritionPer100g && (
              <NutritionFactsLabel
                nutrition={logDialog.baseNutritionPer100g}
                servingGms={servingGms}
                label="Per Serving"
              />
            )}

            <div className="space-y-2">
              <Label className="text-sm font-medium">Meal Slot</Label>
              <Select value={logDialog.open ? logDialog.slot : 'lunch'} onValueChange={(v) => logDialog.open && setLogDialog({ ...logDialog, slot: v })}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{SLOTS.map((s) => <SelectItem key={s} value={s}>{SLOT_LABELS[s]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogDialog({ open: false })} className="rounded-xl">Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold" onClick={handleLogMeal}>Log It</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Per-Slot Meal Search Dialog ═══ */}
      <Dialog open={slotSearchDialog.open} onOpenChange={(open) => { if (!open) { setSlotSearchDialog({ open: false }); setSearchQuery(''); setSearchResults([]); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Search Meals</DialogTitle>
            <DialogDescription>Find and log a meal for {slotSearchDialog.open ? SLOT_LABELS[slotSearchDialog.slot] : ''}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search meals..."
                value={searchQuery}
                onChange={(e) => handleSlotSearch(e.target.value)}
                className="h-11 rounded-xl pl-9"
                autoFocus
              />
            </div>
            <ScrollArea className="max-h-72">
              <div className="space-y-2">
                {searchLoading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-emerald-600" /></div>}
                {!searchLoading && searchQuery && searchResults.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-6">No results found</p>
                )}
                {!searchLoading && searchResults.map((meal) => (
                  <div
                    key={meal.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-emerald-50/50 hover:border-emerald-100 transition-colors cursor-pointer"
                    onClick={() => handleLogFromSearch(meal)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-800 truncate">{meal.name}</p>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-medium border-gray-200 text-gray-500 shrink-0">{meal.cuisine}</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                        <span>{meal.nutrition?.calories || 0} kcal/100g</span>
                        <span>&middot;</span>
                        <span className="text-blue-600 font-medium">P: {meal.nutrition?.proteinG || 0}g</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ Meal Detail Sheet ═══ */}
      <Sheet open={detailSheet.open} onOpenChange={(open) => { if (!open) setDetailSheet({ open: false }); }}>
        <SheetContent side="bottom" className="max-w-lg mx-auto rounded-t-2xl max-h-[85vh]">
          {detailSheet.open && (
            <>
              <SheetHeader className="pt-2">
                <div className="flex items-center gap-2 pr-8">
                  {detailSheet.rec.meal.isVeg && <span className="text-green-600 text-xs font-bold border border-green-300 rounded px-1.5 py-0.5">Veg</span>}
                  {detailSheet.rec.meal.isVegan && <span className="text-green-700 text-xs font-bold border border-green-400 rounded px-1.5 py-0.5">Vegan</span>}
                </div>
                <SheetTitle className="text-lg">{detailSheet.rec.meal.name}</SheetTitle>
                <SheetDescription className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">{detailSheet.rec.meal.cuisine}</Badge>
                  <Badge variant="outline" className={`text-xs ${SLOT_BADGE_COLORS[detailSheet.rec.meal.mealType] || ''}`}>{detailSheet.rec.meal.mealType}</Badge>
                  {detailSheet.rec.meal.prepTimeMin && (
                    <span className="text-xs text-gray-500 flex items-center gap-1"><Clock className="h-3 w-3" />{detailSheet.rec.meal.prepTimeMin} min</span>
                  )}
                </SheetDescription>
              </SheetHeader>
              <ScrollArea className="flex-1 px-4 pb-4">
                <div className="space-y-4">
                  {detailSheet.rec.meal.description && (
                    <p className="text-sm text-gray-600 leading-relaxed">{detailSheet.rec.meal.description}</p>
                  )}

                  {/* Per 100g nutrition */}
                  {detailSheet.rec.baseNutritionPer100g && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Nutrition per 100g</h4>
                      <NutritionFactsLabel nutrition={detailSheet.rec.baseNutritionPer100g} servingGms={100} label="Per 100g" />
                    </div>
                  )}

                  {/* Estimated for recommended serving */}
                  {detailSheet.rec.estimatedNutrition && (
                    <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                      <h4 className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2">Recommended: {detailSheet.rec.recommendedServingGms}g serving</h4>
                      <div className="grid grid-cols-2 gap-1.5 text-xs">
                        <span className="text-gray-600">Calories:</span><span className="font-bold">{detailSheet.rec.estimatedNutrition.calories} kcal</span>
                        <span className="text-gray-600">Protein:</span><span className="font-bold text-blue-600">{detailSheet.rec.estimatedNutrition.proteinG}g</span>
                        <span className="text-gray-600">Carbs:</span><span className="font-bold text-amber-600">{detailSheet.rec.estimatedNutrition.carbsG}g</span>
                        <span className="text-gray-600">Fat:</span><span className="font-bold text-rose-600">{detailSheet.rec.estimatedNutrition.fatG}g</span>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
              <SheetFooter className="border-t pt-3">
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold min-h-[44px]"
                  onClick={() => {
                    const r = detailSheet.rec;
                    setServingGms(r.recommendedServingGms);
                    setLogDialog({
                      open: true, meal: r, slot: r.meal.mealType,
                      baseNutritionPer100g: r.baseNutritionPer100g,
                      mealName: r.meal.name, cuisine: r.meal.cuisine,
                      mealType: r.meal.mealType, description: r.meal.description,
                      isVeg: r.meal.isVeg, isVegan: r.meal.isVegan,
                    });
                    setDetailSheet({ open: false });
                  }}
                >
                  Log This Meal
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// FOOD LOG VIEW (with Quick Re-log)
// ═══════════════════════════════════════════════════════════
function FoodLogView() {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [foodLog, setFoodLog] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [relogDialog, setRelogDialog] = useState<{ open: boolean; item: FoodLogItem } | { open: false }>({ open: false });
  const [relogSlot, setRelogSlot] = useState('lunch');

  const dates = Array.from({ length: 7 }, (_, i) => format(subDays(new Date(), 6 - i), 'yyyy-MM-dd'));

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/food-logs?date=${selectedDate}`);
      setFoodLog(data);
    } catch { toast.error('Failed to load food log'); }
    finally { setLoading(false); }
  }, [selectedDate]);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  const handleDelete = async (itemId: string) => {
    try {
      await apiFetch(`/api/food-logs?id=${itemId}`, { method: 'DELETE' });
      toast.success('Item removed');
      fetchLog();
    } catch (err) { toast.error((err as Error).message); }
  };

  const handleRelog = async () => {
    if (!relogDialog.open) return;
    const item = relogDialog.item;
    try {
      if (item.mealId) {
        await apiFetch('/api/food-logs', {
          method: 'POST',
          body: JSON.stringify({ mealId: item.mealId, servingGms: item.servingGms, mealSlot: relogSlot }),
        });
      } else {
        await apiFetch('/api/food-logs', {
          method: 'POST',
          body: JSON.stringify({ customName: item.meal?.name || 'Food', servingGms: item.servingGms, mealSlot: relogSlot, caloriesPer100g: Math.round(item.calories / item.servingGms * 100), proteinPer100g: Math.round(item.proteinG / item.servingGms * 100) }),
        });
      }
      toast.success(`Re-logged ${item.meal?.name || 'meal'}!`);
      setRelogDialog({ open: false });
      fetchLog();
    } catch (err) { toast.error((err as Error).message); }
  };

  const itemsBySlot = (foodLog?.itemsBySlot || {}) as Record<string, FoodLogItem[]>;
  const hasItems = Object.values(itemsBySlot).some((items: FoodLogItem[]) => items.length > 0);

  return (
    <motion.div {...fadeIn} className="p-4 max-w-lg mx-auto space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Food Log</h1>

      {/* Date strip */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {dates.map((date) => {
          const isToday = date === format(new Date(), 'yyyy-MM-dd');
          const isSelected = date === selectedDate;
          return (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              className={`flex flex-col items-center min-w-[52px] py-2 px-2 rounded-xl transition-all shrink-0 min-h-[44px] ${
                isSelected
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : isToday
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-100'
              }`}
            >
              <span className="text-[10px] font-medium uppercase">{format(parseISO(date), 'EEE')}</span>
              <span className="text-sm font-bold">{format(parseISO(date), 'd')}</span>
            </button>
          );
        })}
      </div>

      {/* Summary */}
      <Card className="p-4 rounded-xl shadow-sm">
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: 'Calories', val: foodLog?.totalCalories || 0, unit: 'kcal', color: 'text-orange-600' },
            { label: 'Protein', val: foodLog?.totalProtein || 0, unit: 'g', color: 'text-blue-600' },
            { label: 'Carbs', val: foodLog?.totalCarbs || 0, unit: 'g', color: 'text-amber-600' },
            { label: 'Fat', val: foodLog?.totalFat || 0, unit: 'g', color: 'text-rose-600' },
          ].map((s) => (
            <div key={s.label} className="bg-gray-50 rounded-lg py-2 px-1">
              <p className={`text-lg font-bold ${s.color}`}>{Math.round(s.val)}</p>
              <p className="text-[10px] text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      )}

      {/* Empty state with camera icon */}
      {!loading && !hasItems && (
        <Card className="p-8 text-center rounded-xl shadow-sm">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Camera className="h-8 w-8 text-gray-300" />
          </div>
          <p className="text-gray-700 font-semibold text-base">Start logging your meals!</p>
          <p className="text-sm text-gray-400 mt-1">Scan a photo or search for meals to get started</p>
        </Card>
      )}

      {/* Food items by slot with better cards */}
      {!loading && SLOTS.map((slot) => {
        const items = itemsBySlot[slot] || [];
        if (items.length === 0) return null;
        return (
          <Card key={slot} className={`p-0 rounded-xl shadow-sm border-l-4 ${SLOT_BORDER_COLORS[slot]} overflow-hidden`}>
            <div className="p-4 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-base">{SLOT_ICONS[slot]}</span>
                <h3 className="font-semibold text-sm text-gray-900">{SLOT_LABELS[slot]}</h3>
                <Badge variant="secondary" className="text-xs ml-auto bg-gray-100 text-gray-600">{items.length} item{items.length > 1 ? 's' : ''}</Badge>
              </div>
            </div>
            <div className="px-4 pb-3 space-y-2">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50/80 border border-gray-100 group hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.meal?.name || 'Unknown'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.servingGms}g &middot; {Math.round(item.calories)} kcal &middot; P: {Math.round(item.proteinG * 10) / 10}g</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => { setRelogDialog({ open: true, item }); setRelogSlot(item.mealSlot); }}
                      title="Log Again"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        );
      })}

      {/* Quick Re-log Dialog */}
      <Dialog open={relogDialog.open} onOpenChange={(open) => setRelogDialog(open ? relogDialog : { open: false })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Log Again</DialogTitle>
            <DialogDescription>{relogDialog.open ? relogDialog.item.meal?.name || 'This meal' : ''} ({relogDialog.open ? relogDialog.item.servingGms : 0}g)</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Log as</Label>
              <Select value={relogSlot} onValueChange={setRelogSlot}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{SLOTS.map((s) => <SelectItem key={s} value={s}>{SLOT_LABELS[s]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRelogDialog({ open: false })} className="rounded-xl">Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold" onClick={handleRelog}>Log Again</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// UPLOAD VIEW
// ═══════════════════════════════════════════════════════════
function UploadView() {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
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
    <motion.div {...fadeIn} className="p-4 max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Camera className="h-5 w-5 text-emerald-600" />
        <h1 className="text-xl font-bold text-gray-900">Scan Food</h1>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-colors"
      >
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
        {imagePreview ? (
          <div className="space-y-3">
            <img src={imagePreview} alt="Preview" className="max-h-64 mx-auto rounded-xl object-contain" />
            <p className="text-sm text-gray-500">Tap to change image</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto">
              <Camera className="h-8 w-8 text-emerald-400" />
            </div>
            <p className="text-gray-600 font-medium">Drag & drop or tap to upload</p>
            <p className="text-sm text-gray-400">Supports JPG, PNG, WebP</p>
          </div>
        )}
      </div>

      {imageFile && !results.length && (
        <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px] rounded-xl font-semibold" onClick={handleRecognize} disabled={recognizing}>
          {recognizing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyzing...</> : 'Recognize Food'}
        </Button>
      )}

      {results.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-semibold text-gray-900">Recognized Foods</h2>
          {results.map((food, idx) => (
            <Card key={idx} className="p-4 rounded-xl shadow-sm">
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
                        <SelectContent>{['Indian', 'Chinese', 'Italian', 'American', 'Mexican', 'Mediterranean', 'Japanese', 'Thai', 'Mixed'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
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

// ═══════════════════════════════════════════════════════════
// PROGRESS VIEW (improved chart styling)
// ═══════════════════════════════════════════════════════════
function ProgressView() {
  const [tab, setTab] = useState('weekly');
  const [weeklyData, setWeeklyData] = useState<Record<string, unknown>[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [weightLogs, setWeightLogs] = useState<Record<string, unknown>[]>([]);
  const [waterGlasses, setWaterGlasses] = useState(0);
  const [loading, setLoading] = useState(true);
  const [weightInput, setWeightInput] = useState('');
  const [weightNotes, setWeightNotes] = useState('');

  const fetchProgress = useCallback(async () => {
    setLoading(true);
    try {
      const [weekData, sumData, wLogs, waterData] = await Promise.all([
        apiFetch('/api/progress/weekly'),
        apiFetch(`/api/progress/summary?period=${tab === 'monthly' ? 'month' : 'week'}`),
        apiFetch('/api/weight-log?limit=30'),
        apiFetch('/api/water-log'),
      ]);
      setWeeklyData(weekData || []);
      setSummary(sumData?.summary || null);
      setWeightLogs(wLogs || []);
      setWaterGlasses(waterData?.glassesConsumed || 0);
    } catch { toast.error('Failed to load progress'); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { fetchProgress(); }, [fetchProgress]);

  const handleAddWater = async (delta: number) => {
    const newCount = waterGlasses + delta;
    if (newCount < 0) return;
    if (delta > 0) {
      try {
        await apiFetch('/api/water-log', { method: 'POST', body: JSON.stringify({ glasses: delta }) });
        setWaterGlasses(newCount);
        toast.success(`\uD83D\uDCA7 +${delta} glass${delta > 1 ? 'es' : ''} of water`);
      } catch { toast.error('Failed to log water'); }
    } else {
      setWaterGlasses(Math.max(0, newCount));
    }
  };

  const handleLogWeight = async () => {
    if (!weightInput || Number(weightInput) <= 0) return;
    try {
      await apiFetch('/api/weight-log', { method: 'POST', body: JSON.stringify({ weightKg: Number(weightInput), notes: weightNotes || null }) });
      toast.success('Weight logged!');
      setWeightInput('');
      setWeightNotes('');
      fetchProgress();
    } catch (err) { toast.error((err as Error).message); }
  };

  const chartData = weeklyData.map((d) => {
    const consumed = d.consumed as Record<string, number>;
    const targets = d.targets as Record<string, number> | null;
    return {
      date: format(parseISO(d.date as string), 'EEE'),
      calories: consumed?.calories || 0,
      target: targets?.calories || 0,
    };
  });

  const macroData = [
    { name: 'Protein', value: summary?.avgProtein || 0, color: PIE_COLORS[0] },
    { name: 'Carbs', value: summary?.avgCarbs || 0, color: PIE_COLORS[1] },
    { name: 'Fat', value: summary?.avgFat || 0, color: PIE_COLORS[2] },
  ];

  const weightChartData = weightLogs.slice().reverse().slice(-7).map((w) => ({
    date: format(parseISO(w.logDate as string), 'MMM d'),
    weight: w.weightKg as number,
  }));

  if (loading) {
    return (
      <div className="p-4 max-w-lg mx-auto space-y-4">
        <Skeleton className="h-8 w-32 rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-4"><Skeleton className="h-28 w-full rounded-xl" /><Skeleton className="h-28 w-full rounded-xl" /></div>
      </div>
    );
  }

  return (
    <motion.div {...fadeIn} className="p-4 max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-emerald-600" />
        <h1 className="text-xl font-bold text-gray-900">Progress</h1>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full rounded-xl">
          <TabsTrigger value="weekly" className="flex-1 rounded-lg">Weekly</TabsTrigger>
          <TabsTrigger value="monthly" className="flex-1 rounded-lg">Monthly</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Calorie Chart - improved with gradient */}
      <Card className="p-4 rounded-xl shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Calorie Intake</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="20%">
              <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
              />
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0.8} />
                </linearGradient>
              </defs>
              <Bar dataKey="calories" fill="url(#barGrad)" radius={[6, 6, 0, 0]} name="Consumed" />
              <Bar dataKey="target" fill="#e5e7eb" radius={[6, 6, 0, 0]} name="Target" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Macro Pie + Weight Trend */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-4 rounded-xl shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Macro Breakdown</h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={macroData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value" label={({ name, value }) => `${name}: ${value}g`} strokeWidth={2}>
                  {macroData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4 rounded-xl shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Weight Trend</h3>
          {weightChartData.length > 1 ? (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weightChartData}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb' }} />
                  <Line type="monotone" dataKey="weight" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Log at least 2 weights to see trend</div>
          )}
        </Card>
      </div>

      {/* Stats Cards with icons */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Avg Daily Calories', value: `${summary?.avgCalories || 0}`, icon: Flame, color: 'text-orange-500', bg: 'bg-orange-50' },
          { label: 'Avg Protein', value: `${summary?.avgProtein || 0}g`, icon: Dumbbell, color: 'text-blue-500', bg: 'bg-blue-50' },
          { label: 'Weight Change', value: `${(summary?.weightChange as number) >= 0 ? '+' : ''}${summary?.weightChange ?? 'N/A'}kg`, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-50' },
          { label: 'Current Weight', value: `${summary?.currentWeight ?? 'N/A'}kg`, icon: Scale, color: 'text-purple-500', bg: 'bg-purple-50' },
        ].map((s) => (
          <Card key={s.label} className="p-4 rounded-xl shadow-sm">
            <div className="flex items-center gap-2.5 mb-2">
              <div className={`w-8 h-8 ${s.bg} rounded-lg flex items-center justify-center`}>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <span className="text-xs text-gray-500 font-medium">{s.label}</span>
            </div>
            <p className="text-lg font-bold text-gray-900">{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Water Tracking */}
      <Card className="p-4 rounded-xl shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Droplets className="h-4 w-4 text-blue-500" /> Water Intake
          </h3>
          <span className="text-sm font-bold text-blue-600">{waterGlasses}/8 glasses</span>
        </div>
        <div className="flex items-center justify-center gap-4">
          <Button size="icon" variant="outline" className="h-11 w-11 rounded-xl" onClick={() => handleAddWater(-1)} disabled={waterGlasses <= 0}>
            <Minus className="h-4 w-4" />
          </Button>
          <div className="flex gap-1.5 flex-wrap justify-center">
            {Array.from({ length: 8 }, (_, i) => (
              <motion.div
                key={i}
                className={`w-6 h-8 rounded-md border-2 transition-colors ${i < waterGlasses ? 'bg-blue-400 border-blue-500' : 'bg-gray-100 border-gray-200'}`}
                animate={i < waterGlasses ? { scale: [1, 1.1, 1] } : {}}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              />
            ))}
          </div>
          <Button size="icon" className="h-11 w-11 bg-blue-500 hover:bg-blue-600 rounded-xl" onClick={() => handleAddWater(1)} disabled={waterGlasses >= 16}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {/* Weight Logging */}
      <Card className="p-4 rounded-xl shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Scale className="h-4 w-4 text-purple-500" /> Log Weight
        </h3>
        <div className="flex gap-2">
          <Input type="number" placeholder="Weight (kg)" value={weightInput} onChange={(e) => setWeightInput(e.target.value)} className="flex-1 h-11 rounded-xl" />
          <Input placeholder="Notes" value={weightNotes} onChange={(e) => setWeightNotes(e.target.value)} className="flex-1 h-11 rounded-xl" />
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl" onClick={handleLogWeight} disabled={!weightInput}>Log</Button>
        </div>
        {weightLogs.length > 0 && (
          <div className="mt-3 space-y-1">
            <p className="text-xs text-gray-500 font-medium">Recent Entries</p>
            {weightLogs.slice(0, 5).map((w) => (
              <div key={w.id as string} className="flex justify-between text-xs text-gray-600 py-1.5 border-b border-gray-50 last:border-0">
                <span>{format(parseISO(w.logDate as string), 'MMM d, yyyy')}</span>
                <span className="font-semibold">{w.weightKg as number} kg</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// SETTINGS VIEW (with section separators)
// ═══════════════════════════════════════════════════════════
function SettingsView({ onLogout }: { onLogout: () => void }) {
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({ firstName: '', lastName: '', age: '', gender: 'male', heightCm: '', weightKg: '' });
  const [goals, setGoals] = useState({ goalType: 'maintain', activityLevel: 'moderately_active', targetWeightKg: '' });
  const [prefs, setPrefs] = useState<{ cuisinePreference: string; dietType: string; allergies: string[] }>({ cuisinePreference: 'Mixed', dietType: 'non-veg', allergies: [] });

  const fetchUser = useCallback(async () => {
    try {
      const me = await apiFetch('/api/auth/me');
      setUser(me);
      const p = me.profile as Record<string, unknown> | null;
      if (p) setProfile({ firstName: (p.firstName as string) || '', lastName: (p.lastName as string) || '', age: p.age ? String(p.age) : '', gender: (p.gender as string) || 'male', heightCm: p.heightCm ? String(p.heightCm) : '', weightKg: p.weightKg ? String(p.weightKg) : '' });
      const g = me.goal as Record<string, unknown> | null;
      if (g) setGoals({ goalType: (g.goalType as string) || 'maintain', activityLevel: (g.activityLevel as string) || 'moderately_active', targetWeightKg: g.targetWeightKg ? String(g.targetWeightKg) : '' });
      const pr = me.preference as Record<string, unknown> | null;
      if (pr) setPrefs({ cuisinePreference: (pr.cuisinePreference as string) || 'Mixed', dietType: (pr.dietType as string) || 'non-veg', allergies: (me.allergies as string[]) || [] });
    } catch { toast.error('Failed to load settings'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const toggleAllergy = (a: string) => {
    setPrefs((p) => ({ ...p, allergies: p.allergies.includes(a) ? p.allergies.filter((x) => x !== a) : [...p.allergies, a] }));
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/users/profile', { method: 'PUT', body: JSON.stringify({ firstName: profile.firstName || null, lastName: profile.lastName || null, age: profile.age ? Number(profile.age) : null, gender: profile.gender, heightCm: profile.heightCm ? Number(profile.heightCm) : null, weightKg: profile.weightKg ? Number(profile.weightKg) : null }) });
      toast.success('Profile saved');
    } catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };

  const saveGoals = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/users/goals', { method: 'PUT', body: JSON.stringify({ goalType: goals.goalType, activityLevel: goals.activityLevel, targetWeightKg: goals.targetWeightKg ? Number(goals.targetWeightKg) : null }) });
      toast.success('Goals updated');
    } catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };

  const savePrefs = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/onboarding/complete', { method: 'POST', body: JSON.stringify({ goalType: goals.goalType, activityLevel: goals.activityLevel, cuisinePreference: prefs.cuisinePreference, dietType: prefs.dietType, allergies: prefs.allergies }) });
      toast.success('Preferences saved');
    } catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };

  const bmi = profile.heightCm && profile.weightKg ? (Number(profile.weightKg) / ((Number(profile.heightCm) / 100) ** 2)).toFixed(1) : null;
  const bmiCategory = bmi
    ? Number(bmi) < 18.5 ? { label: 'Underweight', color: 'bg-yellow-100 text-yellow-700' }
      : Number(bmi) < 25 ? { label: 'Normal', color: 'bg-green-100 text-green-700' }
      : Number(bmi) < 30 ? { label: 'Overweight', color: 'bg-orange-100 text-orange-700' }
      : { label: 'Obese', color: 'bg-red-100 text-red-700' }
    : null;

  if (loading) {
    return (
      <div className="p-4 max-w-lg mx-auto space-y-4">
        <Skeleton className="h-8 w-32 rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <motion.div {...fadeIn} className="p-4 max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-emerald-600" />
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
      </div>

      {/* Profile Section */}
      <Card className="p-4 rounded-xl shadow-sm">
        <CardHeader className="p-0 pb-3">
          <CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4 text-emerald-600" />Profile</CardTitle>
        </CardHeader>
        <Separator className="mb-3" />
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs font-medium">First Name</Label><Input className="h-10 rounded-xl" value={profile.firstName} onChange={(e) => setProfile((p) => ({ ...p, firstName: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs font-medium">Last Name</Label><Input className="h-10 rounded-xl" value={profile.lastName} onChange={(e) => setProfile((p) => ({ ...p, lastName: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label className="text-xs font-medium">Age</Label><Input type="number" className="h-10 rounded-xl" value={profile.age} onChange={(e) => setProfile((p) => ({ ...p, age: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs font-medium">Height (cm)</Label><Input type="number" className="h-10 rounded-xl" value={profile.heightCm} onChange={(e) => setProfile((p) => ({ ...p, heightCm: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs font-medium">Weight (kg)</Label><Input type="number" className="h-10 rounded-xl" value={profile.weightKg} onChange={(e) => setProfile((p) => ({ ...p, weightKg: e.target.value }))} /></div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Gender</Label>
            <RadioGroup value={profile.gender} onValueChange={(v) => setProfile((p) => ({ ...p, gender: v }))} className="flex gap-4">
              {['male', 'female', 'other'].map((g) => (
                <div key={g} className="flex items-center gap-2">
                  <RadioGroupItem value={g} id={`s-${g}`} />
                  <Label htmlFor={`s-${g}`} className="font-normal text-sm capitalize">{g}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          {bmi && bmiCategory && (
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5">
              <span className="text-sm text-gray-600">BMI: <b>{bmi}</b></span>
              <Badge className={bmiCategory.color}>{bmiCategory.label}</Badge>
            </div>
          )}
          <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold" onClick={saveProfile} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Profile
          </Button>
        </div>
      </Card>

      {/* Goal Section */}
      <Card className="p-4 rounded-xl shadow-sm">
        <CardHeader className="p-0 pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4 text-emerald-600" />Goals</CardTitle>
        </CardHeader>
        <Separator className="mb-3" />
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Goal Type</Label>
            <Select value={goals.goalType} onValueChange={(v) => setGoals((g) => ({ ...g, goalType: v }))}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>{['muscle_gain', 'lose_fat', 'maintain', 'recomp', 'weight_gain', 'athlete'].map((g) => <SelectItem key={g} value={g}>{g.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Activity Level</Label>
            <Select value={goals.activityLevel} onValueChange={(v) => setGoals((g) => ({ ...g, activityLevel: v }))}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>{['sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active'].map((a) => <SelectItem key={a} value={a}>{a.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs font-medium">Target Weight (kg)</Label><Input type="number" className="h-10 rounded-xl" value={goals.targetWeightKg} onChange={(e) => setGoals((g) => ({ ...g, targetWeightKg: e.target.value }))} /></div>
          <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold" onClick={saveGoals} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Goals
          </Button>
        </div>
      </Card>

      {/* Preferences Section */}
      <Card className="p-4 rounded-xl shadow-sm">
        <CardHeader className="p-0 pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-emerald-600" />Preferences</CardTitle>
        </CardHeader>
        <Separator className="mb-3" />
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Cuisine Preference</Label>
            <Select value={prefs.cuisinePreference} onValueChange={(v) => setPrefs((p) => ({ ...p, cuisinePreference: v }))}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>{['Indian', 'Chinese', 'Italian', 'American', 'Mexican', 'Mediterranean', 'Japanese', 'Thai', 'Mixed'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Diet Type</Label>
            <Select value={prefs.dietType} onValueChange={(v) => setPrefs((p) => ({ ...p, dietType: v }))}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>{['non-veg', 'vegetarian', 'vegan', 'eggetarian'].map((d) => <SelectItem key={d} value={d}>{d === 'non-veg' ? 'Non-Vegetarian' : d === 'vegan' ? 'Vegan' : d === 'vegetarian' ? 'Vegetarian' : 'Eggetarian'}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Allergies</Label>
            <div className="grid grid-cols-2 gap-2">
              {ALLERGENS.map((a) => (
                <label key={a} className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-200 cursor-pointer hover:bg-emerald-50/50 hover:border-emerald-200 transition-colors min-h-[44px]">
                  <Checkbox checked={prefs.allergies.includes(a)} onCheckedChange={() => toggleAllergy(a)} />
                  <span className="text-sm">{a}</span>
                </label>
              ))}
            </div>
          </div>
          <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold" onClick={savePrefs} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Preferences
          </Button>
        </div>
      </Card>

      {/* Logout */}
      <Button variant="outline" className="w-full text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600 min-h-[44px] rounded-xl font-medium" onClick={onLogout}>
        <LogOut className="mr-2 h-4 w-4" />Log Out
      </Button>
    </motion.div>
  );
}
