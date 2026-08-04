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
          <div className="flex gap-3 mb-4">
            <Button variant="outline" className="flex-1 h-11 rounded-xl border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium" onClick={() => toast.info('Google Sign-In coming soon!')}>
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25L12.25 2.67c-1.06-.55-2.2-.83-3.38-.83-3.03 0-5.78 1.14-7.81 3.01C.56 7.21.09 9.1.09 11.25c0 3.66-2.09 6.84-5.15 8.41-1.08.56-2.2.83-3.38.83-1.88 0-3.6-.66-5.01-1.76l-.08-.07c-.03-.03-.06-.04-.1-.06l-4.2-3.68c-.73-.65-1.78-.95-2.79-.75-1.01.2-2.05.77-2.94 1.62-.89 1.85-.89 3.27.39 4.69 1.19l.08.07c.03.03.06.04.1.06 2.08 1.84 3.6 3.6 5.15 3.6 1.74 0 3.36-.68 4.59-1.91l2.6-2.6z" fill="currentColor"/></svg>
              Google
            </Button>
            <Button variant="outline" className="flex-1 h-11 rounded-xl border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium" onClick={() => toast.info('Apple Sign-In coming soon!')}>
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24"><path d="M17.05 20.28c-.98.95-2.05-1.83-3.16-2.48l-.01-.01a9.98 9.98 0 0 0-2.59-.67c-3.16 0-6.04 1.19-8.21 3.15" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round"/><path d="M9 12h.01M15 12h.01" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round"/></svg>
              Apple
            </Button>
          </div>
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200 dark:border-gray-700" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-white dark:bg-gray-900 px-3 text-gray-400 dark:text-gray-500">or sign in with email</span></div>
          </div>
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
