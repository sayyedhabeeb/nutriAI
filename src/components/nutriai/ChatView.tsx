'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, Utensils, TrendingUp, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiFetch } from './api';
import { fadeIn } from './constants';
import type { ViewType, NutritionData } from './types';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
}

const QUICK_ACTIONS = [
  { label: 'Suggest a meal', icon: Utensils, message: 'Suggest a healthy meal I can eat right now based on my current nutrition intake.' },
  { label: 'Am I on track?', icon: TrendingUp, message: 'Am I on track to hit my daily nutrition goals today?' },
  { label: 'Nutrition tips', icon: Lightbulb, message: 'Give me a quick nutrition tip that can help me improve my diet.' },
];

export function ChatView({ onNavigate }: { onNavigate?: (v: ViewType) => void }) {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'ai', content: "Hi! I'm your nutrition assistant. Ask me about your diet, meal suggestions, or nutrition tips!" },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [nutrition, setNutrition] = useState<NutritionData | null>(null);
  const [recentMeals, setRecentMeals] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchContext = useCallback(async () => {
    try {
      const [nut, log] = await Promise.all([
        apiFetch('/api/nutrition/daily'),
        apiFetch('/api/food-logs').catch(() => ({ itemsBySlot: {} })),
      ]);
      setNutrition(nut);

      // Extract recent meal names
      const slotItems = (log as Record<string, Record<string, { meal: { name: string } }[]>>).itemsBySlot || {};
      const mealNames: string[] = [];
      for (const slot of Object.values(slotItems)) {
        for (const item of slot) {
          if (item.meal?.name) mealNames.push(item.meal.name);
        }
      }
      setRecentMeals(mealNames.slice(-5));
    } catch {
      // Silent fail - chat still works without context
    }
  }, []);

  useEffect(() => { fetchContext(); }, [fetchContext]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = { id: `user-${Date.now()}`, role: 'user', content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const reply = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: text.trim(),
          context: nutrition
            ? {
                todayCalories: nutrition.consumed.calories,
                todayProtein: nutrition.consumed.proteinG,
                todayCarbs: nutrition.consumed.carbsG,
                todayFat: nutrition.consumed.fatG,
                targetCalories: nutrition.targets.calories,
                targetProtein: nutrition.targets.proteinG,
                targetCarbs: nutrition.targets.carbsG,
                targetFat: nutrition.targets.fatG,
                recentMeals,
              }
            : undefined,
        }),
      });

      const aiMsg: Message = {
        id: `ai-${Date.now()}`,
        role: 'ai',
        content: (reply as { reply: string }).reply || 'Sorry, I could not generate a response.',
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      const errMsg: Message = {
        id: `err-${Date.now()}`,
        role: 'ai',
        content: 'Sorry, something went wrong. Please try again.',
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <motion.div {...fadeIn} className="flex flex-col h-[calc(100vh-5rem)] max-w-lg mx-auto">
      {/* Header */}
      <div className="p-4 pb-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-sm">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">NutriAI Chat</h1>
          <p className="text-xs text-gray-500">Your personal nutrition assistant</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-2">
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-emerald-600 text-white rounded-br-md'
                      : 'bg-gray-100 text-gray-800 rounded-bl-md'
                  }`}
                >
                  {msg.content}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Typing indicator */}
          {loading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-bl-md">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      {messages.length <= 1 && !loading && (
        <div className="px-4 pb-2">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                onClick={() => sendMessage(action.message)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-gray-200 text-xs text-gray-700 font-medium whitespace-nowrap hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-colors shrink-0"
              >
                <action.icon className="h-3.5 w-3.5" />
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="p-4 pt-2 border-t border-gray-100 bg-white">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about nutrition..."
            disabled={loading}
            className="flex-1 h-11 rounded-xl bg-gray-50 border-gray-200 text-sm"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || loading}
            className="h-11 w-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </motion.div>
  );
}
