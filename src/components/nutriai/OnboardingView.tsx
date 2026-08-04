'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Leaf, Loader2, Check } from 'lucide-react';
import { FadeInDiv, ALLERGENS, CUISINES, GOAL_TYPES, ACTIVITY_LEVELS, DIET_TYPES, DIET_LABELS, formatLabel } from './constants';
import { apiFetch } from './api';

export function OnboardingView({ onComplete }: { onComplete: () => void }) {
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
    <FadeInDiv className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-emerald-50 via-green-50/30 to-teal-50 dark:from-gray-950 dark:to-gray-900 relative overflow-hidden">
      {/* Decorative blurred circles */}
      <div className="absolute -top-20 -right-20 w-60 h-60 bg-emerald-300/20 dark:bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-teal-300/20 dark:bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
      <Card className="w-full max-w-md shadow-xl border-0 dark:border dark:border-gray-800 rounded-2xl overflow-hidden bg-white dark:bg-gray-900 relative z-10">
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 pt-6 pb-5 text-center">
          <div className="mx-auto w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center mb-2">
            <Leaf className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-white text-lg">Let&apos;s Get Started</CardTitle>
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
                <div className="space-y-1.5"><Label className="text-sm font-medium text-gray-700 dark:text-gray-300">First Name</Label><Input placeholder="John" value={profile.firstName} onChange={(e) => setProfile((p) => ({ ...p, firstName: e.target.value }))} className="h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100" /></div>
                <div className="space-y-1.5"><Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Last Name</Label><Input placeholder="Doe" value={profile.lastName} onChange={(e) => setProfile((p) => ({ ...p, lastName: e.target.value }))} className="h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100" /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Age</Label><Input type="number" placeholder="25" value={profile.age} onChange={(e) => setProfile((p) => ({ ...p, age: e.target.value }))} className="h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100" /></div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Gender</Label>
                <RadioGroup value={profile.gender} onValueChange={(v) => setProfile((p) => ({ ...p, gender: v }))} className="flex gap-4">
                  {['male', 'female', 'other'].map((g) => (
                    <div key={g} className="flex items-center gap-2">
                      <RadioGroupItem value={g} id={`o-${g}`} />
                      <Label htmlFor={`o-${g}`} className="font-normal text-sm capitalize text-gray-700 dark:text-gray-300">{g}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Height (cm)</Label><Input type="number" placeholder="170" value={profile.heightCm} onChange={(e) => setProfile((p) => ({ ...p, heightCm: e.target.value }))} className="h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100" /></div>
                <div className="space-y-1.5"><Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Weight (kg)</Label><Input type="number" placeholder="70" value={profile.weightKg} onChange={(e) => setProfile((p) => ({ ...p, weightKg: e.target.value }))} className="h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100" /></div>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Goal</Label>
                <Select value={goals.goalType} onValueChange={(v) => setGoals((g) => ({ ...g, goalType: v }))}>
                  <SelectTrigger className="h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"><SelectValue /></SelectTrigger>
                  <SelectContent>{GOAL_TYPES.map((g) => <SelectItem key={g} value={g}>{formatLabel(g)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Activity Level</Label>
                <Select value={goals.activityLevel} onValueChange={(v) => setGoals((g) => ({ ...g, activityLevel: v }))}>
                  <SelectTrigger className="h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"><SelectValue /></SelectTrigger>
                  <SelectContent>{ACTIVITY_LEVELS.map((a) => <SelectItem key={a} value={a}>{formatLabel(a)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Target Weight (kg)</Label><Input type="number" placeholder="70" value={goals.targetWeightKg} onChange={(e) => setGoals((g) => ({ ...g, targetWeightKg: e.target.value }))} className="h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100" /></div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Cuisine Preference</Label>
                <Select value={prefs.cuisinePreference} onValueChange={(v) => setPrefs((p) => ({ ...p, cuisinePreference: v }))}>
                  <SelectTrigger className="h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"><SelectValue /></SelectTrigger>
                  <SelectContent>{CUISINES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Diet Type</Label>
                <Select value={prefs.dietType} onValueChange={(v) => setPrefs((p) => ({ ...p, dietType: v }))}>
                  <SelectTrigger className="h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"><SelectValue /></SelectTrigger>
                  <SelectContent>{DIET_TYPES.map((d) => <SelectItem key={d} value={d}>{DIET_LABELS[d]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Allergies</Label>
                <div className="grid grid-cols-2 gap-2">
                  {ALLERGENS.map((a) => (
                    <label key={a} className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-emerald-50/50 hover:border-emerald-200 dark:hover:bg-emerald-900/20 dark:hover:border-emerald-800 transition-colors min-h-[44px] bg-white dark:bg-gray-800">
                      <Checkbox checked={prefs.allergies.includes(a)} onCheckedChange={() => toggleAllergy(a)} />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{a}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            {step > 1 && <Button variant="outline" onClick={() => setStep(step - 1)} className="min-h-[44px] rounded-xl border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">Back</Button>}
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px] rounded-xl font-semibold" disabled={loading} onClick={step === 3 ? handleComplete : handleNext}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {step === 3 ? 'Complete Setup' : 'Next'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </FadeInDiv>
  );
}
