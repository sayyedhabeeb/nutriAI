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
          {view === 'chat' && <ChatView key="chat" onNavigate={setView} />}
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
              { tab: 'chat' as TabType, icon: MessageSquare, label: 'Chat' },
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
