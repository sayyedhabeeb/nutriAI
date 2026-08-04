'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, subDays, parseISO } from 'date-fns';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

// Lucide icons
import {
  Leaf, Camera, Search, Plus, Minus, Droplets, Utensils, Flame,
  Dumbbell, Target, TrendingUp, User, Settings, LogOut, X, Check,
  AlertCircle, Home, List, BarChart3, ChevronLeft, ChevronRight,
  Loader2, Trash2, GlassWater, Scale, CalendarDays,
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
  meal: { id: string; name: string; mealType: string; cuisine: string; imageUrl: string | null; prepTimeMin: number | null };
  score: number;
  recommendedServingGms: number;
  estimatedNutrition: { calories: number; proteinG: number; carbsG: number; fatG: number } | null;
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
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, { ...options, headers });
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || 'Request failed');
  }
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
const ALLERGENS = ['Peanuts', 'Tree Nuts', 'Dairy', 'Eggs', 'Gluten', 'Shellfish', 'Soy', 'Fish'];
const PIE_COLORS = ['#3b82f6', '#f59e0b', '#f43f5e'];

// ═══ Animation Variants ═══
const fadeIn = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.25 },
};

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
    <div className="min-h-screen flex flex-col bg-white">
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
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-bottom">
          <div className="max-w-lg mx-auto flex justify-around items-center h-16">
            {([
              { tab: 'dashboard' as TabType, icon: Home, label: 'Dashboard' },
              { tab: 'foodlog' as TabType, icon: List, label: 'Food Log' },
              { tab: 'upload' as TabType, icon: Camera, label: 'Upload' },
              { tab: 'progress' as TabType, icon: BarChart3, label: 'Progress' },
              { tab: 'settings' as TabType, icon: Settings, label: 'Settings' },
            ]).map(({ tab, icon: Icon, label }) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`flex flex-col items-center justify-center gap-0.5 w-full h-full min-h-[44px] transition-colors ${
                  activeTab === tab ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            ))}
          </div>
        </nav>
      )}

      {/* Sticky footer above nav */}
      {view !== 'auth' && view !== 'onboarding' && (
        <footer className="mt-auto text-center text-xs text-gray-400 pb-16 pt-4">
          NutriAI v1.0 — AI-Powered Nutrition
        </footer>
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
    <motion.div {...fadeIn} className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-emerald-50 to-white">
      <Card className="w-full max-w-md shadow-lg border-0">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mb-3">
            <Leaf className="h-7 w-7 text-emerald-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">NutriAI</CardTitle>
          <CardDescription>AI-Powered Nutrition Tracker</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" placeholder="John Doe" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="Min 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </div>
            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px]" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLogin ? 'Sign In' : 'Create Account'}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-gray-500">
            {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button onClick={() => setIsLogin(!isLogin)} className="text-emerald-600 font-medium hover:underline">
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

  const toggleAllergy = (name: string) => {
    setPrefs((p) => ({
      ...p,
      allergies: p.allergies.includes(name) ? p.allergies.filter((a) => a !== name) : [...p.allergies, name],
    }));
  };

  const saveProfile = async () => {
    await apiFetch('/api/users/profile', {
      method: 'PUT',
      body: JSON.stringify({
        firstName: profile.firstName || null,
        lastName: profile.lastName || null,
        age: profile.age ? Number(profile.age) : null,
        gender: profile.gender,
        heightCm: profile.heightCm ? Number(profile.heightCm) : null,
        weightKg: profile.weightKg ? Number(profile.weightKg) : null,
      }),
    });
  };

  const handleNext = async () => {
    if (step === 1) {
      setLoading(true);
      try {
        await saveProfile();
        setStep(2);
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setLoading(false);
      }
    } else if (step === 2) {
      setLoading(true);
      try {
        await apiFetch('/api/users/goals', {
          method: 'PUT',
          body: JSON.stringify({
            goalType: goals.goalType,
            activityLevel: goals.activityLevel,
            targetWeightKg: goals.targetWeightKg ? Number(goals.targetWeightKg) : null,
          }),
        });
        setStep(3);
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      await apiFetch('/api/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify({
          goalType: goals.goalType,
          activityLevel: goals.activityLevel,
          cuisinePreference: prefs.cuisinePreference,
          dietType: prefs.dietType,
          allergies: prefs.allergies,
        }),
      });
      toast.success('Setup complete! Welcome to NutriAI!');
      onComplete();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { num: 1, label: 'Profile' },
    { num: 2, label: 'Goals' },
    { num: 3, label: 'Preferences' },
  ];

  return (
    <motion.div {...fadeIn} className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-emerald-50 to-white">
      <Card className="w-full max-w-md shadow-lg border-0">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-2">
            <Leaf className="h-6 w-6 text-emerald-600" />
          </div>
          <CardTitle>Let's Get Started</CardTitle>
          <CardDescription>Step {step} of 3</CardDescription>
          {/* Progress indicator */}
          <div className="flex gap-2 justify-center mt-3">
            {steps.map((s) => (
              <div key={s.num} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  step >= s.num ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {step > s.num ? <Check className="h-4 w-4" /> : s.num}
                </div>
                {s.num < 3 && <div className={`w-8 h-0.5 ${step > s.num ? 'bg-emerald-600' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input placeholder="John" value={profile.firstName} onChange={(e) => setProfile((p) => ({ ...p, firstName: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input placeholder="Doe" value={profile.lastName} onChange={(e) => setProfile((p) => ({ ...p, lastName: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Age</Label>
                <Input type="number" placeholder="25" value={profile.age} onChange={(e) => setProfile((p) => ({ ...p, age: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Gender</Label>
                <RadioGroup value={profile.gender} onValueChange={(v) => setProfile((p) => ({ ...p, gender: v }))} className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="male" id="male" />
                    <Label htmlFor="male" className="font-normal">Male</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="female" id="female" />
                    <Label htmlFor="female" className="font-normal">Female</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="other" id="other" />
                    <Label htmlFor="other" className="font-normal">Other</Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Height (cm)</Label>
                  <Input type="number" placeholder="170" value={profile.heightCm} onChange={(e) => setProfile((p) => ({ ...p, heightCm: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Weight (kg)</Label>
                  <Input type="number" placeholder="70" value={profile.weightKg} onChange={(e) => setProfile((p) => ({ ...p, weightKg: e.target.value }))} />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Goal</Label>
                <Select value={goals.goalType} onValueChange={(v) => setGoals((g) => ({ ...g, goalType: v }))}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="muscle_gain">Muscle Gain</SelectItem>
                    <SelectItem value="lose_fat">Lose Fat</SelectItem>
                    <SelectItem value="maintain">Maintain Weight</SelectItem>
                    <SelectItem value="recomp">Body Recomposition</SelectItem>
                    <SelectItem value="weight_gain">Weight Gain</SelectItem>
                    <SelectItem value="athlete">Athlete</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Activity Level</Label>
                <Select value={goals.activityLevel} onValueChange={(v) => setGoals((g) => ({ ...g, activityLevel: v }))}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sedentary">Sedentary</SelectItem>
                    <SelectItem value="lightly_active">Lightly Active</SelectItem>
                    <SelectItem value="moderately_active">Moderately Active</SelectItem>
                    <SelectItem value="very_active">Very Active</SelectItem>
                    <SelectItem value="extra_active">Extra Active</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Target Weight (kg)</Label>
                <Input type="number" placeholder="70" value={goals.targetWeightKg} onChange={(e) => setGoals((g) => ({ ...g, targetWeightKg: e.target.value }))} />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Cuisine Preference</Label>
                <Select value={prefs.cuisinePreference} onValueChange={(v) => setPrefs((p) => ({ ...p, cuisinePreference: v }))}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Indian', 'Chinese', 'Italian', 'American', 'Mexican', 'Mediterranean', 'Japanese', 'Thai', 'Mixed'].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Diet Type</Label>
                <Select value={prefs.dietType} onValueChange={(v) => setPrefs((p) => ({ ...p, dietType: v }))}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="non-veg">Non-Vegetarian</SelectItem>
                    <SelectItem value="vegetarian">Vegetarian</SelectItem>
                    <SelectItem value="vegan">Vegan</SelectItem>
                    <SelectItem value="eggetarian">Eggetarian</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Allergies</Label>
                <div className="grid grid-cols-2 gap-2">
                  {ALLERGENS.map((a) => (
                    <label key={a} className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 min-h-[44px]">
                      <Checkbox checked={prefs.allergies.includes(a)} onCheckedChange={() => toggleAllergy(a)} />
                      <span className="text-sm">{a}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(step - 1)} className="min-h-[44px]">Back</Button>
            )}
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px]"
              disabled={loading}
              onClick={step === 3 ? handleComplete : handleNext}
            >
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
// CALORIE RING SVG
// ═══════════════════════════════════════════════════════════
function CalorieRing({ consumed, target }: { consumed: number; target: number }) {
  const pct = target > 0 ? Math.min(consumed / target, 1) : 0;
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - pct);
  const remaining = Math.max(0, target - consumed);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="180" height="180" viewBox="0 0 180 180" className="-rotate-90">
        <circle cx="90" cy="90" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="12" />
        <motion.circle
          cx="90" cy="90" r={radius} fill="none"
          stroke={pct > 1 ? '#f43f5e' : '#10b981'}
          strokeWidth="12"
          strokeLinecap="round"
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
        <span className="text-xs text-emerald-600 font-medium mt-1">{remaining} left</span>
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
  const [logDialog, setLogDialog] = useState<{ open: boolean; meal: MealRecommendation; slot: string } | { open: false }>({ open: false });
  const [servingGms, setServingGms] = useState(100);
  const [searchDialog, setSearchDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Record<string, unknown>[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [logSlot, setLogSlot] = useState('lunch');

  const fetchData = useCallback(async () => {
    try {
      const [me, nut] = await Promise.all([
        apiFetch('/api/auth/me'),
        apiFetch('/api/nutrition/daily'),
      ]);
      setUser(me);
      setNutrition(nut);

      // Fetch recommendations for all slots
      const recs = await Promise.all(
        SLOTS.map(async (slot) => {
          try {
            const r = await apiFetch(`/api/recommendations?slot=${slot}`);
            return { slot, recs: r.recommendations || [] };
          } catch {
            return { slot, recs: [] };
          }
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
        body: JSON.stringify({
          mealId: logDialog.meal.meal.id,
          servingGms,
          mealSlot: logDialog.slot,
        }),
      });
      toast.success(`Logged ${logDialog.meal.meal.name}!`);
      setLogDialog({ open: false });
      fetchData();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const res = await apiFetch(`/api/meals/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults(res.meals || []);
    } catch {
      toast.error('Search failed');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleQuickLog = async (mealItem: Record<string, unknown>) => {
    try {
      await apiFetch('/api/food-logs', {
        method: 'POST',
        body: JSON.stringify({
          mealId: mealItem.id,
          servingGms: (mealItem as Record<string, unknown>).baseServingGms || 100,
          mealSlot: logSlot,
        }),
      });
      toast.success('Meal logged!');
      setSearchDialog(false);
      setSearchQuery('');
      setSearchResults([]);
      fetchData();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleWaterAdd = async () => {
    try {
      await apiFetch('/api/water-log', {
        method: 'POST',
        body: JSON.stringify({ glasses: 1 }),
      });
      toast.success('💧 +1 glass of water');
    } catch {
      toast.error('Failed to log water');
    }
  };

  const firstName = (user?.profile as Record<string, unknown> | null)?.firstName || (user?.name as string) || 'there';

  if (loading) {
    return (
      <div className="p-4 max-w-lg mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="flex justify-center"><Skeleton className="h-[180px] w-[180px] rounded-full" /></div>
        <div className="space-y-2"><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-full" /></div>
        <div className="grid grid-cols-2 gap-4"><Skeleton className="h-48 w-full" /><Skeleton className="h-48 w-full" /></div>
      </div>
    );
  }

  const targetCal = nutrition?.targets?.calories || 0;
  const consumedCal = nutrition?.consumed?.calories || 0;

  return (
    <motion.div {...fadeIn} className="p-4 max-w-lg mx-auto space-y-4">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Hi, {firstName}! 👋</h1>
          <p className="text-sm text-gray-500">Track your nutrition today</p>
        </div>
        <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
          <User className="h-5 w-5 text-emerald-600" />
        </div>
      </div>

      {/* Calorie Ring */}
      <Card className="p-6">
        <div className="flex justify-center">
          <CalorieRing consumed={consumedCal} target={targetCal} />
        </div>
      </Card>

      {/* Macro Progress Bars */}
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Today's Macros</h3>
        {[
          { label: 'Protein', val: nutrition?.consumed?.proteinG || 0, target: nutrition?.targets?.proteinG || 0, color: 'bg-blue-500', unit: 'g' },
          { label: 'Carbs', val: nutrition?.consumed?.carbsG || 0, target: nutrition?.targets?.carbsG || 0, color: 'bg-amber-500', unit: 'g' },
          { label: 'Fat', val: nutrition?.consumed?.fatG || 0, target: nutrition?.targets?.fatG || 0, color: 'bg-rose-500', unit: 'g' },
        ].map((m) => (
          <div key={m.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-600 font-medium">{m.label}</span>
              <span className="text-gray-500">{m.val}{m.unit} / {m.target}{m.unit}</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${m.color}`}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min((m.val / (m.target || 1)) * 100, 100)}%` }}
                transition={{ duration: 0.8 }}
              />
            </div>
          </div>
        ))}
      </Card>

      {/* Meal Slots */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SLOTS.map((slot) => {
          const recs = recommendations[slot] || [];
          return (
            <Card key={slot} className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{SLOT_ICONS[slot]}</span>
                <h3 className="font-semibold text-sm text-gray-900">{SLOT_LABELS[slot]}</h3>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {recs.length === 0 && (
                  <p className="text-xs text-gray-400">No recommendations available</p>
                )}
                {recs.map((rec) => (
                  <div key={rec.meal.id} className="p-2 rounded-lg border border-gray-100 bg-gray-50/50 space-y-1">
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-sm font-medium text-gray-800 leading-tight">{rec.meal.name}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{rec.estimatedNutrition?.calories || rec.meal.prepTimeMin || 0} kcal/100g</span>
                      <span>•</span>
                      <span>P: {rec.estimatedNutrition?.proteinG || 0}g</span>
                    </div>
                    <Button
                      size="sm"
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs min-h-[36px] mt-1"
                      onClick={() => {
                        setServingGms(rec.recommendedServingGms);
                        setLogDialog({ open: true, meal: rec, slot });
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

      {/* FAB */}
      <div className="fixed bottom-20 right-4 z-40 flex flex-col gap-2">
        <Button
          size="icon"
          className="w-12 h-12 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg"
          onClick={handleWaterAdd}
        >
          <Droplets className="h-5 w-5" />
        </Button>
        <Button
          size="icon"
          className="w-12 h-12 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg"
          onClick={() => setSearchDialog(true)}
        >
          <Search className="h-5 w-5" />
        </Button>
        <Button
          size="icon"
          className="w-12 h-12 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg"
          onClick={() => onNavigate('upload')}
        >
          <Camera className="h-5 w-5" />
        </Button>
      </div>

      {/* Log Meal Dialog */}
      <Dialog open={logDialog.open} onOpenChange={(open) => setLogDialog(open ? logDialog : { open: false })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Meal</DialogTitle>
            <DialogDescription>{logDialog.open ? logDialog.meal.meal.name : ''}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Serving Size (grams)</Label>
              <Input type="number" value={servingGms} onChange={(e) => setServingGms(Number(e.target.value))} min={10} max={1000} />
            </div>
            {logDialog.open && logDialog.meal.estimatedNutrition && (
              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                <p>Estimated Nutrition:</p>
                <p>Calories: <b>{Math.round((logDialog.meal.estimatedNutrition.calories / (logDialog.meal.recommendedServingGms || 100)) * servingGms)}</b> kcal</p>
                <p>Protein: <b>{Math.round((logDialog.meal.estimatedNutrition.proteinG / (logDialog.meal.recommendedServingGms || 100)) * servingGms * 10) / 10}</b>g</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Meal Slot</Label>
              <Select value={logDialog.open ? logDialog.slot : 'lunch'} onValueChange={(v) => logDialog.open && setLogDialog({ ...logDialog, slot: v })}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SLOTS.map((s) => <SelectItem key={s} value={s}>{SLOT_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogDialog({ open: false })}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleLogMeal}>Log It</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Search Dialog */}
      <Dialog open={searchDialog} onOpenChange={setSearchDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Search Meals</DialogTitle>
            <DialogDescription>Find and log any meal</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input placeholder="Search meals..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
              <Button onClick={handleSearch} disabled={searchLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0">
                {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Log as</Label>
              <Select value={logSlot} onValueChange={setLogSlot}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SLOTS.map((s) => <SelectItem key={s} value={s}>{SLOT_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <ScrollArea className="max-h-64">
              <div className="space-y-2">
                {searchResults.length === 0 && !searchLoading && searchQuery && (
                  <p className="text-sm text-gray-400 text-center py-4">No results found</p>
                )}
                {searchResults.map((meal: Record<string, unknown>) => (
                  <div key={meal.id as string} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                    <div>
                      <p className="text-sm font-medium">{meal.name as string}</p>
                      <p className="text-xs text-gray-500">{(meal.nutrition as Record<string, unknown>)?.calories || 0} kcal/100g</p>
                    </div>
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleQuickLog(meal)}>Log</Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// FOOD LOG VIEW
// ═══════════════════════════════════════════════════════════
function FoodLogView() {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [foodLog, setFoodLog] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const dates = Array.from({ length: 7 }, (_, i) => format(subDays(new Date(), 6 - i), 'yyyy-MM-dd'));

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/food-logs?date=${selectedDate}`);
      setFoodLog(data);
    } catch {
      toast.error('Failed to load food log');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  const handleDelete = async (itemId: string) => {
    try {
      await apiFetch(`/api/food-logs?id=${itemId}`, { method: 'DELETE' });
      toast.success('Item removed');
      fetchLog();
    } catch (err) {
      toast.error((err as Error).message);
    }
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
              className={`flex flex-col items-center min-w-[52px] py-2 px-2 rounded-xl transition-colors shrink-0 min-h-[44px] ${
                isSelected
                  ? 'bg-emerald-600 text-white'
                  : isToday
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className="text-[10px] font-medium uppercase">{format(parseISO(date), 'EEE')}</span>
              <span className="text-sm font-bold">{format(parseISO(date), 'd')}</span>
            </button>
          );
        })}
      </div>

      {/* Summary */}
      <Card className="p-4">
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: 'Calories', val: foodLog?.totalCalories || 0, unit: 'kcal', color: 'text-orange-600' },
            { label: 'Protein', val: foodLog?.totalProtein || 0, unit: 'g', color: 'text-blue-600' },
            { label: 'Carbs', val: foodLog?.totalCarbs || 0, unit: 'g', color: 'text-amber-600' },
            { label: 'Fat', val: foodLog?.totalFat || 0, unit: 'g', color: 'text-rose-600' },
          ].map((s) => (
            <div key={s.label}>
              <p className={`text-lg font-bold ${s.color}`}>{Math.round(s.val)}</p>
              <p className="text-[10px] text-gray-500">{s.label} ({s.unit})</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !hasItems && (
        <Card className="p-8 text-center">
          <Utensils className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No meals logged</p>
          <p className="text-sm text-gray-400 mt-1">Start logging your meals to track nutrition</p>
        </Card>
      )}

      {/* Food items by slot */}
      {!loading && SLOTS.map((slot) => {
        const items = itemsBySlot[slot] || [];
        if (items.length === 0) return null;
        return (
          <Card key={slot} className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span>{SLOT_ICONS[slot]}</span>
              <h3 className="font-semibold text-sm text-gray-900">{SLOT_LABELS[slot]}</h3>
              <Badge variant="secondary" className="text-xs ml-auto">{items.length} item{items.length > 1 ? 's' : ''}</Badge>
            </div>
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.meal?.name || 'Unknown'}</p>
                    <p className="text-xs text-gray-500">{item.servingGms}g • {Math.round(item.calories)} kcal • P: {Math.round(item.proteinG * 10) / 10}g</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-gray-400 hover:text-red-500 shrink-0"
                    onClick={() => handleDelete(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        );
      })}
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
      const data = await apiFetch('/api/food-recognize', {
        method: 'POST',
        body: formData,
      });
      setResults(data.foods || []);

      // Initialize unknown forms
      const forms: typeof unknownForms = {};
      (data.foods || []).forEach((f: RecognizedFood, idx: number) => {
        if (f.unknown_food) {
          forms[idx] = {
            confirmedName: f.name,
            confirmedPortion: f.servingWeightGrams || 200,
            caloriesPer100g: 0,
            proteinPer100g: 0,
            carbsPer100g: 0,
            fatPer100g: 0,
            mealType: 'lunch',
            cuisine: 'Mixed',
          };
        }
      });
      setUnknownForms(forms);
    } catch (err) {
      toast.error((err as Error).message || 'Recognition failed');
    } finally {
      setRecognizing(false);
    }
  };

  const confidenceBadge = (conf: number) => {
    const pct = Math.round(conf * 100);
    const color = conf >= 0.9 ? 'bg-green-100 text-green-700' : conf >= 0.7 ? 'bg-yellow-100 text-yellow-700' : conf >= 0.5 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700';
    return <Badge className={`${color} text-xs`}>{pct}%</Badge>;
  };

  const handleLogRecognized = async (mealId: string, servingWeightGrams: number) => {
    try {
      await apiFetch('/api/food-logs', {
        method: 'POST',
        body: JSON.stringify({ mealId, servingGms: servingWeightGrams, mealSlot: 'lunch' }),
      });
      toast.success('Food logged!');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleSubmitUnknown = async (idx: number, aiName: string) => {
    const form = unknownForms[idx];
    if (!form || !form.confirmedName || !form.caloriesPer100g) {
      toast.error('Please fill in all required fields');
      return;
    }
    try {
      const data = await apiFetch('/api/unknown-food/submit', {
        method: 'POST',
        body: JSON.stringify({
          aiDetectedName: aiName,
          ...form,
        }),
      });
      toast.success('Food submitted and logged!');
      // Log the newly created meal
      if (data?.meal?.id) {
        await handleLogRecognized(data.meal.id, form.confirmedPortion);
      }
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <motion.div {...fadeIn} className="p-4 max-w-lg mx-auto space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Scan Food</h1>

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
            <Camera className="h-12 w-12 text-gray-300 mx-auto" />
            <p className="text-gray-500 font-medium">Drag & drop or tap to upload</p>
            <p className="text-sm text-gray-400">Supports JPG, PNG, WebP</p>
          </div>
        )}
      </div>

      {/* Recognize button */}
      {imageFile && !results.length && (
        <Button
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px]"
          onClick={handleRecognize}
          disabled={recognizing}
        >
          {recognizing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyzing...</> : 'Recognize Food'}
        </Button>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-semibold text-gray-900">Recognized Foods</h2>
          {results.map((food, idx) => (
            <Card key={idx} className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="font-medium text-gray-900">{food.name}</p>
                  <p className="text-xs text-gray-500">{food.servingDescription}</p>
                </div>
                {confidenceBadge(food.confidence)}
              </div>
              <p className="text-xs text-gray-500 mb-2">Est. serving: {food.servingWeightGrams}g</p>

              {food.matched && food.meal && (
                <div className="bg-green-50 rounded-lg p-3 space-y-1">
                  <p className="text-sm text-green-800">✅ Found in database</p>
                  <p className="text-xs text-green-700">
                    {(food.meal as Record<string, unknown>).nutrition
                      ? `${(food.meal as Record<string, Record<string, unknown>>).nutrition?.calories} kcal, ${(food.meal as Record<string, Record<string, unknown>>).nutrition?.proteinG}g protein per 100g`
                      : 'Nutrition data available' }
                  </p>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white mt-2" onClick={() => handleLogRecognized((food.meal as Record<string, unknown>).id as string, food.servingWeightGrams)}>Log This</Button>
                </div>
              )}

              {food.unknown_food && unknownForms[idx] && (
                <div className="bg-orange-50 rounded-lg p-3 space-y-3">
                  <p className="text-sm text-orange-800 font-medium">⚠️ New Food — Please provide nutrition info</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Name</Label>
                      <Input className="h-9" value={unknownForms[idx].confirmedName} onChange={(e) => setUnknownForms({ ...unknownForms, [idx]: { ...unknownForms[idx], confirmedName: e.target.value } })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Portion (g)</Label>
                      <Input type="number" className="h-9" value={unknownForms[idx].confirmedPortion} onChange={(e) => setUnknownForms({ ...unknownForms, [idx]: { ...unknownForms[idx], confirmedPortion: Number(e.target.value) } })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Cal/100g</Label>
                      <Input type="number" className="h-9" placeholder="e.g. 250" value={unknownForms[idx].caloriesPer100g || ''} onChange={(e) => setUnknownForms({ ...unknownForms, [idx]: { ...unknownForms[idx], caloriesPer100g: Number(e.target.value) } })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Protein/100g</Label>
                      <Input type="number" className="h-9" placeholder="e.g. 15" value={unknownForms[idx].proteinPer100g || ''} onChange={(e) => setUnknownForms({ ...unknownForms, [idx]: { ...unknownForms[idx], proteinPer100g: Number(e.target.value) } })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Carbs/100g</Label>
                      <Input type="number" className="h-9" placeholder="e.g. 30" value={unknownForms[idx].carbsPer100g || ''} onChange={(e) => setUnknownForms({ ...unknownForms, [idx]: { ...unknownForms[idx], carbsPer100g: Number(e.target.value) } })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Fat/100g</Label>
                      <Input type="number" className="h-9" placeholder="e.g. 10" value={unknownForms[idx].fatPer100g || ''} onChange={(e) => setUnknownForms({ ...unknownForms, [idx]: { ...unknownForms[idx], fatPer100g: Number(e.target.value) } })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Meal Type</Label>
                      <Select value={unknownForms[idx].mealType} onValueChange={(v) => setUnknownForms({ ...unknownForms, [idx]: { ...unknownForms[idx], mealType: v } })}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {SLOTS.map((s) => <SelectItem key={s} value={s}>{SLOT_LABELS[s]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Cuisine</Label>
                      <Select value={unknownForms[idx].cuisine} onValueChange={(v) => setUnknownForms({ ...unknownForms, [idx]: { ...unknownForms[idx], cuisine: v } })}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['Indian', 'Chinese', 'Italian', 'American', 'Mexican', 'Mediterranean', 'Japanese', 'Thai', 'Mixed'].map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white w-full" onClick={() => handleSubmitUnknown(idx, food.name)}>
                    Submit & Log
                  </Button>
                </div>
              )}
            </Card>
          ))}

          <Button variant="outline" className="w-full" onClick={() => { setResults([]); setImagePreview(null); setImageFile(null); }}>
            Scan Another Photo
          </Button>
        </div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// PROGRESS VIEW
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
    } catch {
      toast.error('Failed to load progress');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { fetchProgress(); }, [fetchProgress]);

  const handleAddWater = async (delta: number) => {
    const newCount = waterGlasses + delta;
    if (newCount < 0) return;
    if (delta > 0) {
      try {
        await apiFetch('/api/water-log', { method: 'POST', body: JSON.stringify({ glasses: delta }) });
        setWaterGlasses(newCount);
        toast.success(`💧 +${delta} glass${delta > 1 ? 'es' : ''} of water`);
      } catch {
        toast.error('Failed to log water');
      }
    } else {
      setWaterGlasses(Math.max(0, newCount));
    }
  };

  const handleLogWeight = async () => {
    if (!weightInput || Number(weightInput) <= 0) return;
    try {
      await apiFetch('/api/weight-log', {
        method: 'POST',
        body: JSON.stringify({ weightKg: Number(weightInput), notes: weightNotes || null }),
      });
      toast.success('Weight logged!');
      setWeightInput('');
      setWeightNotes('');
      fetchProgress();
    } catch (err) {
      toast.error((err as Error).message);
    }
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
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-64 w-full" />
        <div className="grid grid-cols-2 gap-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
      </div>
    );
  }

  return (
    <motion.div {...fadeIn} className="p-4 max-w-lg mx-auto space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Progress</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full">
          <TabsTrigger value="weekly" className="flex-1">Weekly</TabsTrigger>
          <TabsTrigger value="monthly" className="flex-1">Monthly</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Calorie Chart */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Calorie Intake</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="calories" fill="#10b981" radius={[4, 4, 0, 0]} name="Consumed" />
              <Bar dataKey="target" fill="#e5e7eb" radius={[4, 4, 0, 0]} name="Target" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Macro Pie + Weight Trend */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Macro Breakdown</h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={macroData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value" label={({ name, value }) => `${name}: ${value}g`}>
                  {macroData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Weight Trend</h3>
          {weightChartData.length > 1 ? (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weightChartData}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="weight" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Log at least 2 weights to see trend</div>
          )}
        </Card>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: 'Avg Daily Calories', value: `${summary?.avgCalories || 0}`, icon: Flame, color: 'text-orange-500' },
          { label: 'Avg Protein', value: `${summary?.avgProtein || 0}g`, icon: Dumbbell, color: 'text-blue-500' },
          { label: 'Weight Change', value: `${(summary?.weightChange as number) >= 0 ? '+' : ''}${summary?.weightChange ?? 'N/A'}kg`, icon: TrendingUp, color: 'text-emerald-500' },
          { label: 'Current Weight', value: `${summary?.currentWeight ?? 'N/A'}kg`, icon: Scale, color: 'text-purple-500' },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`h-4 w-4 ${s.color}`} />
              <span className="text-xs text-gray-500">{s.label}</span>
            </div>
            <p className="text-lg font-bold text-gray-900">{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Water Tracking */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Droplets className="h-4 w-4 text-blue-500" /> Water Intake
          </h3>
          <span className="text-sm font-bold text-blue-600">{waterGlasses}/8 glasses</span>
        </div>
        <div className="flex items-center justify-center gap-4">
          <Button size="icon" variant="outline" className="h-11 w-11" onClick={() => handleAddWater(-1)} disabled={waterGlasses <= 0}>
            <Minus className="h-4 w-4" />
          </Button>
          <div className="flex gap-1.5 flex-wrap justify-center">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className={`w-6 h-8 rounded-md border-2 transition-colors ${i < waterGlasses ? 'bg-blue-400 border-blue-500' : 'bg-gray-100 border-gray-200'}`} />
            ))}
          </div>
          <Button size="icon" className="h-11 w-11 bg-blue-500 hover:bg-blue-600" onClick={() => handleAddWater(1)} disabled={waterGlasses >= 16}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {/* Weight Logging */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Scale className="h-4 w-4 text-purple-500" /> Log Weight
        </h3>
        <div className="flex gap-2">
          <Input type="number" placeholder="Weight (kg)" value={weightInput} onChange={(e) => setWeightInput(e.target.value)} className="flex-1" />
          <Input placeholder="Notes (optional)" value={weightNotes} onChange={(e) => setWeightNotes(e.target.value)} className="flex-1" />
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleLogWeight} disabled={!weightInput}>Log</Button>
        </div>
        {weightLogs.length > 0 && (
          <div className="mt-3 space-y-1">
            <p className="text-xs text-gray-500 font-medium">Recent Entries</p>
            {weightLogs.slice(0, 5).map((w) => (
              <div key={w.id as string} className="flex justify-between text-xs text-gray-600 py-1 border-b border-gray-50">
                <span>{format(parseISO(w.logDate as string), 'MMM d, yyyy')}</span>
                <span className="font-medium">{w.weightKg as number} kg</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// SETTINGS VIEW
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
      if (p) {
        setProfile({
          firstName: (p.firstName as string) || '',
          lastName: (p.lastName as string) || '',
          age: p.age ? String(p.age) : '',
          gender: (p.gender as string) || 'male',
          heightCm: p.heightCm ? String(p.heightCm) : '',
          weightKg: p.weightKg ? String(p.weightKg) : '',
        });
      }
      const g = me.goal as Record<string, unknown> | null;
      if (g) {
        setGoals({
          goalType: (g.goalType as string) || 'maintain',
          activityLevel: (g.activityLevel as string) || 'moderately_active',
          targetWeightKg: g.targetWeightKg ? String(g.targetWeightKg) : '',
        });
      }
      const pr = me.preference as Record<string, unknown> | null;
      if (pr) {
        setPrefs({
          cuisinePreference: (pr.cuisinePreference as string) || 'Mixed',
          dietType: (pr.dietType as string) || 'non-veg',
          allergies: (me.allergies as string[]) || [],
        });
      }
    } catch {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const toggleAllergy = (name: string) => {
    setPrefs((p) => ({
      ...p,
      allergies: p.allergies.includes(name) ? p.allergies.filter((a) => a !== name) : [...p.allergies, name],
    }));
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/users/profile', {
        method: 'PUT',
        body: JSON.stringify({
          firstName: profile.firstName || null,
          lastName: profile.lastName || null,
          age: profile.age ? Number(profile.age) : null,
          gender: profile.gender,
          heightCm: profile.heightCm ? Number(profile.heightCm) : null,
          weightKg: profile.weightKg ? Number(profile.weightKg) : null,
        }),
      });
      toast.success('Profile saved');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveGoals = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/users/goals', {
        method: 'PUT',
        body: JSON.stringify({
          goalType: goals.goalType,
          activityLevel: goals.activityLevel,
          targetWeightKg: goals.targetWeightKg ? Number(goals.targetWeightKg) : null,
        }),
      });
      toast.success('Goals updated');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const savePrefs = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify({
          goalType: goals.goalType,
          activityLevel: goals.activityLevel,
          cuisinePreference: prefs.cuisinePreference,
          dietType: prefs.dietType,
          allergies: prefs.allergies,
        }),
      });
      toast.success('Preferences saved');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // BMI calc
  const bmi = profile.heightCm && profile.weightKg
    ? (Number(profile.weightKg) / ((Number(profile.heightCm) / 100) ** 2)).toFixed(1)
    : null;
  const bmiCategory = bmi
    ? Number(bmi) < 18.5 ? { label: 'Underweight', color: 'bg-yellow-100 text-yellow-700' }
      : Number(bmi) < 25 ? { label: 'Normal', color: 'bg-green-100 text-green-700' }
      : Number(bmi) < 30 ? { label: 'Overweight', color: 'bg-orange-100 text-orange-700' }
      : { label: 'Obese', color: 'bg-red-100 text-red-700' }
    : null;

  if (loading) {
    return (
      <div className="p-4 max-w-lg mx-auto space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <motion.div {...fadeIn} className="p-4 max-w-lg mx-auto space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Settings</h1>

      {/* Profile Section */}
      <Card className="p-4">
        <CardHeader className="p-0 pb-3">
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">First Name</Label>
              <Input className="h-10" value={profile.firstName} onChange={(e) => setProfile((p) => ({ ...p, firstName: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Last Name</Label>
              <Input className="h-10" value={profile.lastName} onChange={(e) => setProfile((p) => ({ ...p, lastName: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Age</Label>
              <Input type="number" className="h-10" value={profile.age} onChange={(e) => setProfile((p) => ({ ...p, age: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Height (cm)</Label>
              <Input type="number" className="h-10" value={profile.heightCm} onChange={(e) => setProfile((p) => ({ ...p, heightCm: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Weight (kg)</Label>
              <Input type="number" className="h-10" value={profile.weightKg} onChange={(e) => setProfile((p) => ({ ...p, weightKg: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Gender</Label>
            <RadioGroup value={profile.gender} onValueChange={(v) => setProfile((p) => ({ ...p, gender: v }))} className="flex gap-4">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="male" id="s-male" />
                <Label htmlFor="s-male" className="font-normal text-sm">Male</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="female" id="s-female" />
                <Label htmlFor="s-female" className="font-normal text-sm">Female</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="other" id="s-other" />
                <Label htmlFor="s-other" className="font-normal text-sm">Other</Label>
              </div>
            </RadioGroup>
          </div>
          {bmi && bmiCategory && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">BMI: <b>{bmi}</b></span>
              <Badge className={bmiCategory.color}>{bmiCategory.label}</Badge>
            </div>
          )}
          <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={saveProfile} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Profile
          </Button>
        </div>
      </Card>

      {/* Goal Section */}
      <Card className="p-4">
        <CardHeader className="p-0 pb-3">
          <CardTitle className="text-base">Goals</CardTitle>
        </CardHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Goal Type</Label>
            <Select value={goals.goalType} onValueChange={(v) => setGoals((g) => ({ ...g, goalType: v }))}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="muscle_gain">Muscle Gain</SelectItem>
                <SelectItem value="lose_fat">Lose Fat</SelectItem>
                <SelectItem value="maintain">Maintain Weight</SelectItem>
                <SelectItem value="recomp">Body Recomposition</SelectItem>
                <SelectItem value="weight_gain">Weight Gain</SelectItem>
                <SelectItem value="athlete">Athlete</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Activity Level</Label>
            <Select value={goals.activityLevel} onValueChange={(v) => setGoals((g) => ({ ...g, activityLevel: v }))}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sedentary">Sedentary</SelectItem>
                <SelectItem value="lightly_active">Lightly Active</SelectItem>
                <SelectItem value="moderately_active">Moderately Active</SelectItem>
                <SelectItem value="very_active">Very Active</SelectItem>
                <SelectItem value="extra_active">Extra Active</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Target Weight (kg)</Label>
            <Input type="number" className="h-10" value={goals.targetWeightKg} onChange={(e) => setGoals((g) => ({ ...g, targetWeightKg: e.target.value }))} />
          </div>
          <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={saveGoals} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Goals
          </Button>
        </div>
      </Card>

      {/* Preferences Section */}
      <Card className="p-4">
        <CardHeader className="p-0 pb-3">
          <CardTitle className="text-base">Preferences</CardTitle>
        </CardHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Cuisine Preference</Label>
            <Select value={prefs.cuisinePreference} onValueChange={(v) => setPrefs((p) => ({ ...p, cuisinePreference: v }))}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['Indian', 'Chinese', 'Italian', 'American', 'Mexican', 'Mediterranean', 'Japanese', 'Thai', 'Mixed'].map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Diet Type</Label>
            <Select value={prefs.dietType} onValueChange={(v) => setPrefs((p) => ({ ...p, dietType: v }))}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="non-veg">Non-Vegetarian</SelectItem>
                <SelectItem value="vegetarian">Vegetarian</SelectItem>
                <SelectItem value="vegan">Vegan</SelectItem>
                <SelectItem value="eggetarian">Eggetarian</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Allergies</Label>
            <div className="grid grid-cols-2 gap-2">
              {ALLERGENS.map((a) => (
                <label key={a} className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 min-h-[44px]">
                  <Checkbox checked={prefs.allergies.includes(a)} onCheckedChange={() => toggleAllergy(a)} />
                  <span className="text-sm">{a}</span>
                </label>
              ))}
            </div>
          </div>
          <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={savePrefs} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Preferences
          </Button>
        </div>
      </Card>

      {/* Logout */}
      <Button variant="outline" className="w-full text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600 min-h-[44px]" onClick={onLogout}>
        <LogOut className="mr-2 h-4 w-4" />Log Out
      </Button>
    </motion.div>
  );
}
