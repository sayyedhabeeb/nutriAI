'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Leaf, Loader2 } from 'lucide-react';
import { FadeInDiv } from './constants';
import { setToken, apiFetch } from './api';
import type { ViewType } from './types';

export function AuthView({ onAuth }: { onAuth: (v: ViewType) => void }) {
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
    <FadeInDiv className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-emerald-50 via-green-50/30 to-teal-50 dark:from-gray-950 dark:to-gray-900 relative overflow-hidden">
      {/* Decorative blurred circle */}
      <div className="absolute -top-24 -right-24 w-72 h-72 bg-emerald-300/30 dark:bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-teal-300/20 dark:bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
      <Card className="w-full max-w-md shadow-xl border-0 dark:border dark:border-gray-800 rounded-2xl overflow-hidden bg-white dark:bg-gray-900 relative z-10">
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 pt-8 pb-6 text-center">
          <div className="mx-auto w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-3">
            <Leaf className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-emerald-600 dark:text-white">NutriAI</h2>
          <p className="text-emerald-100 text-sm mt-1">AI-Powered Nutrition Tracker</p>
        </div>
        <CardContent className="pt-6 px-6 pb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium text-gray-700 dark:text-gray-300">Full Name</Label>
                <Input id="name" placeholder="John Doe" value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100" />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700 dark:text-gray-300">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700 dark:text-gray-300">Password</Label>
              <Input id="password" type="password" placeholder="Min 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100" />
            </div>
            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px] rounded-xl font-semibold" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLogin ? 'Sign In' : 'Create Account'}
            </Button>
          </form>
          <div className="mt-5 text-center text-sm text-gray-500 dark:text-gray-400">
            {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button onClick={() => setIsLogin(!isLogin)} className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline">
              {isLogin ? 'Sign Up' : 'Sign In'}
            </button>
          </div>
        </CardContent>
      </Card>
    </FadeInDiv>
  );
}
