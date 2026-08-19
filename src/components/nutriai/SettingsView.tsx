'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Settings, User, Target, Heart, Loader2, LogOut, AlertTriangle, Save, Camera, Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';
import { apiFetch } from './api';
import { ThemeToggle } from './ThemeToggle';
import {
  ALLERGENS, CUISINES, GOAL_TYPES, ACTIVITY_LEVELS, DIET_TYPES, DIET_LABELS,
  formatLabel, fadeIn,
} from './constants';

const emptySubscribe = () => () => {};

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const INPUT_FOCUS = 'focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export function SettingsView({ onLogout }: { onLogout: () => void }) {
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const { theme, setTheme } = useTheme();
  const themeMounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
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
      if (pr) setPrefs({ cuisinePreference: (pr.cuisinePreference as string) || 'Mixed', dietType: (pr.dietType as string) || 'non-veg', allergies: Array.isArray(me.allergies) ? (me.allergies as string[]) : [] });
    } catch { toast.error('Failed to load settings'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const triggerSaved = (section: string) => {
    setSavedSection(section);
    setTimeout(() => setSavedSection(null), 1500);
  };

  const toggleAllergy = (a: string) => {
    setPrefs((p) => ({ ...p, allergies: p.allergies.includes(a) ? p.allergies.filter((x) => x !== a) : [...p.allergies, a] }));
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/users/profile', { method: 'PUT', body: JSON.stringify({ firstName: profile.firstName || null, lastName: profile.lastName || null, age: profile.age ? Number(profile.age) : null, gender: profile.gender, heightCm: profile.heightCm ? Number(profile.heightCm) : null, weightKg: profile.weightKg ? Number(profile.weightKg) : null }) });
      toast.success('Profile saved');
      triggerSaved('profile');
    } catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };

  const saveGoals = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/users/goals', { method: 'PUT', body: JSON.stringify({ goalType: goals.goalType, activityLevel: goals.activityLevel, targetWeightKg: goals.targetWeightKg ? Number(goals.targetWeightKg) : null }) });
      toast.success('Goals updated');
      triggerSaved('goals');
    } catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };

  const savePrefs = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/onboarding/complete', { method: 'POST', body: JSON.stringify({ goalType: goals.goalType, activityLevel: goals.activityLevel, cuisinePreference: prefs.cuisinePreference, dietType: prefs.dietType, allergies: prefs.allergies }) });
      toast.success('Preferences saved');
      triggerSaved('prefs');
    } catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };

  const bmi = profile.heightCm && profile.weightKg ? (Number(profile.weightKg) / ((Number(profile.heightCm) / 100) ** 2)).toFixed(1) : null;
  const bmiCategory = bmi
    ? Number(bmi) < 18.5 ? { label: 'Underweight', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' }
      : Number(bmi) < 25 ? { label: 'Normal', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' }
      : Number(bmi) < 30 ? { label: 'Overweight', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' }
      : { label: 'Obese', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
    : null;

  // Profile completion
  const profileFields = [
    !!profile.firstName,
    !!profile.lastName,
    !!profile.age,
    !!profile.heightCm,
    !!profile.weightKg,
    profile.gender !== '',
    goals.goalType !== '',
    goals.activityLevel !== '',
    prefs.dietType !== '',
    (prefs.allergies || []).length > 0,
  ];
  const filledCount = profileFields.filter(Boolean).length;
  const completionPct = Math.round((filledCount / profileFields.length) * 100);

  const renderSaveButton = (section: string, label: string, onClick: () => void) => {
    const isSaved = savedSection === section;
    return (
      <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl min-h-[44px] font-semibold" onClick={onClick} disabled={saving}>
        {isSaved ? (
          <>
            <span className="mr-1">✓</span> Saved!
          </>
        ) : (
          <>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{label}
          </>
        )}
      </Button>
    );
  };

  if (loading) {
    return (
      <div className="p-4 max-w-lg mx-auto space-y-4">
        <Skeleton className="h-8 w-32 rounded-xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <motion.div {...fadeIn} className="p-4 max-w-lg mx-auto space-y-5 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center">
            <Settings className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
            <p className="text-xs text-gray-400 dark:text-gray-500">Manage your profile and preferences</p>
          </div>
        </div>
        <ThemeToggle aria-label="Toggle theme" />
      </div>

      {/* Account Info Card */}
      <Card className="rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-200/80 dark:border-gray-800/70 bg-gradient-to-r from-emerald-500/5 to-teal-500/5 p-5">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-14 h-14 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-2xl flex items-center justify-center shadow-md">
              <span className="text-white font-bold text-xl">{((user?.name as string) || 'U').charAt(0).toUpperCase()}</span>
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center shadow-md border border-gray-200 dark:border-gray-700">
              <Camera className="h-3 w-3 text-gray-600 dark:text-gray-400" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 dark:text-gray-100">{user?.name as string || 'User'}</p>
            <p className="text-sm text-gray-500 dark:text-gray-300">{user?.email as string || ''}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400">Free Plan</Badge>
              {typeof user?.createdAt === 'string' && <span className="text-[10px] text-gray-400 dark:text-gray-500">Joined {new Date(user.createdAt).toLocaleDateString()}</span>}
            </div>
          </div>
        </div>
      </Card>

      {/* Profile Completion Bar */}
      <Card className="rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-200/80 dark:border-gray-800/70 bg-white dark:bg-gray-900 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Profile Completion</span>
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{completionPct}%</span>
        </div>
        <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500"
            style={{ width: `${completionPct}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">Profile {completionPct}% complete</p>
      </Card>

      {/* ═══ Appearance Section ═══ */}
      <Card className="rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-200/80 dark:border-gray-800/70 bg-white dark:bg-gray-900 p-5">
        <div className="flex items-center gap-2 mb-1">
          <Sun className="h-4 w-4 text-emerald-600" />
          <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Appearance</span>
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-4">Choose your preferred theme</p>
        <div className="grid grid-cols-3 gap-2">
          {([
            { value: 'light', label: 'Light', Icon: Sun },
            { value: 'dark', label: 'Dark', Icon: Moon },
            { value: 'system', label: 'System', Icon: Monitor },
          ] as const).map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              disabled={!themeMounted}
              className={`flex flex-col items-center gap-2 rounded-xl p-3 border-2 transition-all min-h-[80px] ${
                (themeMounted && theme === value)
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 ring-2 ring-emerald-500/20'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
              }`
              }
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                (themeMounted && theme === value)
                  ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}>
                <Icon className="h-4 w-4" />
              </div>
              <span className={`text-xs font-medium ${
                (themeMounted && theme === value)
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-gray-600 dark:text-gray-400'
              }`}>{label}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* ═══ Profile Section ═══ */}
      <Card className="rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-200/80 dark:border-gray-800/70 bg-white dark:bg-gray-900 p-5">
        <div className="flex items-center gap-2 mb-1">
          <User className="h-4 w-4 text-emerald-600" />
          <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Personal Profile</span>
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-4">Tap Save to apply changes</p>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">First Name</Label>
              <Input className={`h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 ${INPUT_FOCUS}`} placeholder="e.g., John" value={profile.firstName} onChange={(e) => setProfile((p) => ({ ...p, firstName: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Last Name</Label>
              <Input className={`h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 ${INPUT_FOCUS}`} placeholder="e.g., Doe" value={profile.lastName} onChange={(e) => setProfile((p) => ({ ...p, lastName: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Age</Label>
              <div className="relative">
                <Input type="number" className={`h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 pr-10 ${INPUT_FOCUS}`} placeholder="e.g., 28" value={profile.age} onChange={(e) => setProfile((p) => ({ ...p, age: e.target.value }))} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500 pointer-events-none">yrs</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Height</Label>
              <div className="relative">
                <Input type="number" className={`h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 pr-10 ${INPUT_FOCUS}`} placeholder="e.g., 175" value={profile.heightCm} onChange={(e) => setProfile((p) => ({ ...p, heightCm: e.target.value }))} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500 pointer-events-none">cm</span>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Weight</Label>
            <div className="relative">
              <Input type="number" className={`h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 pr-10 ${INPUT_FOCUS}`} placeholder="e.g., 74" value={profile.weightKg} onChange={(e) => setProfile((p) => ({ ...p, weightKg: e.target.value }))} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500 pointer-events-none">kg</span>
            </div>
          </div>

          {/* Gender Segmented Control */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Gender</Label>
            <div className="flex gap-1 rounded-xl p-1 border border-gray-200 dark:border-gray-700">
              {GENDER_OPTIONS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => setProfile((p) => ({ ...p, gender: g.value }))}
                  className={`flex-1 rounded-xl text-sm font-medium py-2 transition-colors min-h-[36px] ${
                    profile.gender === g.value
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {bmi && bmiCategory && (
            <div className="flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl p-4 border border-emerald-100 dark:border-emerald-800">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Body Mass Index</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-0.5 tabular-nums">{bmi}</p>
              </div>
              <Badge className={bmiCategory.color + ' text-sm px-3 py-1'}>{bmiCategory.label}</Badge>
            </div>
          )}

          {renderSaveButton('profile', 'Save Profile', saveProfile)}
        </div>
      </Card>

      {/* ═══ Goals Section ═══ */}
      <Card className="rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-200/80 dark:border-gray-800/70 bg-white dark:bg-gray-900 p-5">
        <div className="flex items-center gap-2 mb-1">
          <Target className="h-4 w-4 text-emerald-600" />
          <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Fitness Goals</span>
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-4">Tap Save to apply changes</p>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Goal Type</Label>
            <Select value={goals.goalType} onValueChange={(v) => setGoals((g) => ({ ...g, goalType: v }))}>
              <SelectTrigger className={`h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 ${INPUT_FOCUS}`}><SelectValue /></SelectTrigger>
              <SelectContent>{GOAL_TYPES.map((g) => <SelectItem key={g} value={g}>{formatLabel(g)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Activity Level</Label>
            <Select value={goals.activityLevel} onValueChange={(v) => setGoals((g) => ({ ...g, activityLevel: v }))}>
              <SelectTrigger className={`h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 ${INPUT_FOCUS}`}><SelectValue /></SelectTrigger>
              <SelectContent>{ACTIVITY_LEVELS.map((a) => <SelectItem key={a} value={a}>{formatLabel(a)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Target Weight</Label>
            <div className="relative">
              <Input type="number" className={`h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 pr-10 ${INPUT_FOCUS}`} placeholder="e.g., 70" value={goals.targetWeightKg} onChange={(e) => setGoals((g) => ({ ...g, targetWeightKg: e.target.value }))} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500 pointer-events-none">kg</span>
            </div>
          </div>
          {renderSaveButton('goals', 'Save Goals', saveGoals)}
        </div>
      </Card>

      {/* ═══ Preferences Section ═══ */}
      <Card className="rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-200/80 dark:border-gray-800/70 bg-white dark:bg-gray-900 p-5">
        <div className="flex items-center gap-2 mb-1">
          <Heart className="h-4 w-4 text-emerald-600" />
          <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Dietary Preferences</span>
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-4">Tap Save to apply changes</p>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Cuisine Preference</Label>
            <Select value={prefs.cuisinePreference} onValueChange={(v) => setPrefs((p) => ({ ...p, cuisinePreference: v }))}>
              <SelectTrigger className={`h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 ${INPUT_FOCUS}`}><SelectValue /></SelectTrigger>
              <SelectContent>{CUISINES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Diet Type</Label>
            <Select value={prefs.dietType} onValueChange={(v) => setPrefs((p) => ({ ...p, dietType: v }))}>
              <SelectTrigger className={`h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 ${INPUT_FOCUS}`}><SelectValue /></SelectTrigger>
              <SelectContent>{DIET_TYPES.map((d) => <SelectItem key={d} value={d}>{DIET_LABELS[d]}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {/* Allergy Pill Toggles */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Allergies</Label>
            <div className="grid grid-cols-2 gap-2">
              {ALLERGENS.map((a) => {
                const isSelected = prefs.allergies.includes(a);
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggleAllergy(a)}
                    className={`rounded-lg text-sm border px-3 py-2.5 font-medium transition-colors min-h-[44px] ${
                      isSelected
                        ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                        : 'bg-gray-50/80 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    {a}
                  </button>
                );
              })}
            </div>
          </div>

          {renderSaveButton('prefs', 'Save Preferences', savePrefs)}
        </div>
      </Card>

      {/* Logout */}
      <Button
        variant="outline"
        className="w-full border-2 border-red-200 dark:border-red-800/80 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 min-h-[44px] rounded-xl font-semibold shadow-sm"
        onClick={onLogout}
      >
        <LogOut className="mr-2 h-4 w-4" />Log Out
      </Button>

      {/* Danger Zone */}
      <Card className="rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-red-100 dark:border-red-900/30 bg-white dark:bg-gray-900 p-5">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Danger Zone</span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Once you delete your account, there is no going back. All your data will be permanently removed.</p>
        <Button
          variant="outline"
          className={`w-full border-2 min-h-[44px] rounded-xl font-semibold transition-colors ${
            deleteConfirm
              ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30'
              : 'border-red-200 dark:border-red-800/80 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
          }`}
          onClick={() => {
            if (deleteConfirm) {
              toast.error('Account deletion is disabled in demo mode');
              setDeleteConfirm(false);
            } else {
              setDeleteConfirm(true);
              setTimeout(() => setDeleteConfirm(false), 5000);
            }
          }}
        >
          <AlertTriangle className="mr-2 h-4 w-4" />{deleteConfirm ? 'Are you sure? Click again to confirm' : 'Delete My Account'}
        </Button>
      </Card>
    </motion.div>
  );
}
