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
    <FadeInDiv className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-emerald-50 via-green-50/30 to-white">
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
    </FadeInDiv>
  );
}
