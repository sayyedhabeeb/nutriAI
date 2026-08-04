'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Home, List, Camera, MessageSquare, BarChart3, Settings } from 'lucide-react';
import { getToken, clearToken, apiFetch } from '@/components/nutriai/api';
import type { ViewType, TabType } from '@/components/nutriai/types';
import { AuthView } from '@/components/nutriai/AuthView';
import { OnboardingView } from '@/components/nutriai/OnboardingView';
import { DashboardView } from '@/components/nutriai/DashboardView';
import { FoodLogView } from '@/components/nutriai/FoodLogView';
import { UploadView } from '@/components/nutriai/UploadView';
import { ProgressView } from '@/components/nutriai/ProgressView';
import { SettingsView } from '@/components/nutriai/SettingsView';
import { ChatView } from '@/components/nutriai/ChatView';
import { ThemeToggle } from '@/components/nutriai/ThemeToggle';

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
    <div className="min-h-screen flex flex-col bg-gray-50/50 dark:bg-gray-950">
      <main className="flex-1 pb-24">
        <AnimatePresence mode="wait">
          {view === 'auth' && <AuthView key="auth" onAuth={(v: ViewType) => { setView(v); if (v === 'dashboard') setActiveTab('dashboard'); }} />}
          {view === 'onboarding' && <OnboardingView key="onboarding" onComplete={() => { setView('dashboard'); setActiveTab('dashboard'); }} />}
          {view === 'dashboard' && <DashboardView key="dashboard" onNavigate={setView} />}
          {view === 'foodlog' && <FoodLogView key="foodlog" />}
          {view === 'upload' && <UploadView key="upload" />}
          {view === 'chat' && <ChatView key="chat" onNavigate={setView} />}
          {view === 'progress' && <ProgressView key="progress" />}
          {view === 'settings' && <SettingsView key="settings" onLogout={handleLogout} />}
        </AnimatePresence>
      </main>

      {view !== 'auth' && view !== 'onboarding' && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-gray-200/60 dark:border-gray-800 safe-area-bottom shadow-[0_-4px_20px_rgba(0,0,0,0.05)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
          <div className="max-w-lg mx-auto flex items-center h-[68px] px-1">
            {([
              { tab: 'dashboard' as TabType, icon: Home, label: 'Home' },
              { tab: 'foodlog' as TabType, icon: List, label: 'Log' },
              { tab: 'upload' as TabType, icon: Camera, label: 'Scan' },
              { tab: 'chat' as TabType, icon: MessageSquare, label: 'Chat' },
              { tab: 'progress' as TabType, icon: BarChart3, label: 'Progress' },
              { tab: 'settings' as TabType, icon: Settings, label: 'Settings' },
            ]).map(({ tab, icon: Icon, label }) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full min-h-[44px] transition-colors ${
                  activeTab === tab
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                <div className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-2xl transition-all duration-200 ${
                  activeTab === tab
                    ? 'bg-emerald-50 dark:bg-emerald-900/30 shadow-sm'
                    : ''
                }`}>
                  <Icon className={`h-5 w-5 transition-transform duration-200 ${activeTab === tab ? 'scale-110' : ''}`} strokeWidth={activeTab === tab ? 2.5 : 1.8} />
                  <span className={`text-[10px] ${activeTab === tab ? 'font-semibold' : 'font-medium'}`}>{label}</span>
                </div>
              </button>
            ))}
            <div className="ml-1 flex items-center">
              <ThemeToggle aria-label="Toggle theme" />
            </div>
          </div>
        </nav>
      )}
    </div>
  );
}
