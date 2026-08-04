'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Settings, User, Target, Sparkles, Loader2, LogOut } from 'lucide-react';
import { apiFetch } from './api';
import {
  ALLERGENS, CUISINES, GOAL_TYPES, ACTIVITY_LEVELS, DIET_TYPES, DIET_LABELS,
  formatLabel, fadeIn,
} from './constants';

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
              <SelectContent>{GOAL_TYPES.map((g) => <SelectItem key={g} value={g}>{formatLabel(g)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Activity Level</Label>
            <Select value={goals.activityLevel} onValueChange={(v) => setGoals((g) => ({ ...g, activityLevel: v }))}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>{ACTIVITY_LEVELS.map((a) => <SelectItem key={a} value={a}>{formatLabel(a)}</SelectItem>)}</SelectContent>
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
              <SelectContent>{CUISINES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Diet Type</Label>
            <Select value={prefs.dietType} onValueChange={(v) => setPrefs((p) => ({ ...p, dietType: v }))}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>{DIET_TYPES.map((d) => <SelectItem key={d} value={d}>{DIET_LABELS[d]}</SelectItem>)}</SelectContent>
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
