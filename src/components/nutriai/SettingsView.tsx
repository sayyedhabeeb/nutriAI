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
import { Settings, User, Target, Heart, Loader2, LogOut } from 'lucide-react';
import { apiFetch } from './api';
import {
  ALLERGENS, CUISINES, GOAL_TYPES, ACTIVITY_LEVELS, DIET_TYPES, DIET_LABELS,
  formatLabel, fadeIn,
} from './constants';

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

export function SettingsView({ onLogout }: { onLogout: () => void }) {
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
    ? Number(bmi) < 18.5 ? { label: 'Underweight', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' }
      : Number(bmi) < 25 ? { label: 'Normal', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' }
      : Number(bmi) < 30 ? { label: 'Overweight', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' }
      : { label: 'Obese', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
    : null;

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
    <motion.div {...fadeIn} className="p-4 max-w-lg mx-auto space-y-5 pb-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <Settings className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500">Manage your profile and preferences</p>
        </div>
      </div>

      {/* ═══ Profile Section ═══ */}
      <Card className="rounded-2xl shadow-sm border border-gray-100/80 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
        <div className="flex items-center gap-2 mb-4">
          <User className="h-4 w-4 text-emerald-600" />
          <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Personal Profile</span>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">First Name</Label>
              <Input className="h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100" placeholder="e.g., John" value={profile.firstName} onChange={(e) => setProfile((p) => ({ ...p, firstName: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Last Name</Label>
              <Input className="h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100" placeholder="e.g., Doe" value={profile.lastName} onChange={(e) => setProfile((p) => ({ ...p, lastName: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Age</Label>
              <Input type="number" className="h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100" value={profile.age} onChange={(e) => setProfile((p) => ({ ...p, age: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Height</Label>
              <Input type="number" className="h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100" placeholder="cm" value={profile.heightCm} onChange={(e) => setProfile((p) => ({ ...p, heightCm: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Weight</Label>
              <Input type="number" className="h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100" placeholder="kg" value={profile.weightKg} onChange={(e) => setProfile((p) => ({ ...p, weightKg: e.target.value }))} />
            </div>
          </div>

          {/* Gender Segmented Control */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Gender</Label>
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
              {GENDER_OPTIONS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => setProfile((p) => ({ ...p, gender: g.value }))}
                  className={`flex-1 rounded-xl text-sm font-medium py-2 transition-colors min-h-[36px] ${
                    profile.gender === g.value
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {bmi && bmiCategory && (
            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
              <span className="text-sm text-gray-600 dark:text-gray-300">BMI: <b className="text-gray-900 dark:text-gray-100">{bmi}</b></span>
              <Badge className={bmiCategory.color}>{bmiCategory.label}</Badge>
            </div>
          )}

          <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl min-h-[44px] font-semibold" onClick={saveProfile} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Profile
          </Button>
        </div>
      </Card>

      {/* ═══ Goals Section ═══ */}
      <Card className="rounded-2xl shadow-sm border border-gray-100/80 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Target className="h-4 w-4 text-emerald-600" />
          <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Fitness Goals</span>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Goal Type</Label>
            <Select value={goals.goalType} onValueChange={(v) => setGoals((g) => ({ ...g, goalType: v }))}>
              <SelectTrigger className="h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"><SelectValue /></SelectTrigger>
              <SelectContent>{GOAL_TYPES.map((g) => <SelectItem key={g} value={g}>{formatLabel(g)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Activity Level</Label>
            <Select value={goals.activityLevel} onValueChange={(v) => setGoals((g) => ({ ...g, activityLevel: v }))}>
              <SelectTrigger className="h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"><SelectValue /></SelectTrigger>
              <SelectContent>{ACTIVITY_LEVELS.map((a) => <SelectItem key={a} value={a}>{formatLabel(a)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Target Weight</Label>
            <Input type="number" className="h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100" placeholder="kg" value={goals.targetWeightKg} onChange={(e) => setGoals((g) => ({ ...g, targetWeightKg: e.target.value }))} />
          </div>
          <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl min-h-[44px] font-semibold" onClick={saveGoals} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Goals
          </Button>
        </div>
      </Card>

      {/* ═══ Preferences Section ═══ */}
      <Card className="rounded-2xl shadow-sm border border-gray-100/80 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Heart className="h-4 w-4 text-emerald-600" />
          <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Dietary Preferences</span>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Cuisine Preference</Label>
            <Select value={prefs.cuisinePreference} onValueChange={(v) => setPrefs((p) => ({ ...p, cuisinePreference: v }))}>
              <SelectTrigger className="h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"><SelectValue /></SelectTrigger>
              <SelectContent>{CUISINES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Diet Type</Label>
            <Select value={prefs.dietType} onValueChange={(v) => setPrefs((p) => ({ ...p, dietType: v }))}>
              <SelectTrigger className="h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"><SelectValue /></SelectTrigger>
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
                        : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {a}
                  </button>
                );
              })}
            </div>
          </div>

          <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl min-h-[44px] font-semibold" onClick={savePrefs} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Preferences
          </Button>
        </div>
      </Card>

      {/* Logout */}
      <Button
        variant="outline"
        className="w-full border-2 border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 min-h-[44px] rounded-xl font-semibold"
        onClick={onLogout}
      >
        <LogOut className="mr-2 h-4 w-4" />Log Out
      </Button>
    </motion.div>
  );
}
