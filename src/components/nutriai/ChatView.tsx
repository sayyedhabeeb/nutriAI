'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, Utensils, TrendingUp, Lightbulb, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { apiFetch } from './api';
import { fadeIn } from './constants';
import type { ViewType, NutritionData } from './types';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
}

interface SuggestedMeal {
  id: string;
  name: string;
  cuisine: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  baseServingGms: number;
  mealType: string;
  isVeg: boolean;
  isVegan: boolean;
}

const QUICK_ACTIONS = [
  { label: 'Suggest a meal', icon: Utensils, message: 'Suggest a healthy meal I can eat right now based on my current nutrition intake.', isSuggestMeal: true },
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

  // Suggested meals state
  const [suggestedMeals, setSuggestedMeals] = useState<SuggestedMeal[]>([]);

  // Log dialog state
  const [logDialog, setLogDialog] = useState<{
    open: boolean;
    meal: SuggestedMeal;
  } | { open: false }>({ open: false });
  const [logServingGms, setLogServingGms] = useState(100);
  const [logSlot, setLogSlot] = useState('lunch');
  const [logging, setLogging] = useState(false);

  const hasUserMessages = messages.some(m => m.role === 'user');

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
  }, [messages, loading, suggestedMeals]);

  const addAiMessage = (content: string) => {
    const aiMsg: Message = {
      id: `ai-${Date.now()}`,
      role: 'ai',
      content,
    };
    setMessages((prev) => [...prev, aiMsg]);
  };

  const sendMessage = async (text: string, isSuggestMeal = false) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = { id: `user-${Date.now()}`, role: 'user', content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setSuggestedMeals([]);

    try {
      // If this is a suggest meal action, also fetch meal suggestions
      let mealSuggestions: SuggestedMeal[] = [];
      if (isSuggestMeal) {
        try {
          const mealRes = await apiFetch('/api/chat/suggest-meals');
          mealSuggestions = (mealRes.meals || []) as SuggestedMeal[];
        } catch {
          // Silent fail for meal suggestions
        }
      }

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

      // Show suggested meals after AI responds
      if (isSuggestMeal && mealSuggestions.length > 0) {
        setSuggestedMeals(mealSuggestions);
      }
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

  const handleLogMeal = async () => {
    if (!logDialog.open) return;
    setLogging(true);
    try {
      await apiFetch('/api/food-logs', {
        method: 'POST',
        body: JSON.stringify({
          mealId: logDialog.meal.id,
          servingGms: logServingGms,
          mealSlot: logSlot,
        }),
      });
      toast.success(`Logged ${logDialog.meal.name}!`);
      setLogDialog({ open: false });
      // Add AI confirmation message
      addAiMessage(`Great! I've logged ${logDialog.meal.name} for you. Keep going!`);
      // Clear suggested meals after logging
      setSuggestedMeals([]);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLogging(false);
    }
  };

  const openLogDialog = (meal: SuggestedMeal) => {
    setLogServingGms(meal.baseServingGms || 100);
    // Default slot based on time of day
    const hour = new Date().getHours();
    let defaultSlot = 'lunch';
    if (hour < 11) defaultSlot = 'breakfast';
    else if (hour >= 16) defaultSlot = 'dinner';
    else if (hour >= 14) defaultSlot = 'snack';
    setLogSlot(defaultSlot);
    setLogDialog({ open: true, meal });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const lastAiMessage = [...messages].reverse().find(m => m.role === 'ai');

  return (
    <motion.div {...fadeIn} className="flex flex-col h-[calc(100vh-5rem)] max-w-lg mx-auto bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-gray-950">
      {/* Header */}
      <div className="p-4 pb-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-sm">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">NutriAI Chat</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Your personal nutrition assistant</p>
        </div>
      </div>

      {/* Messages / Empty State */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-2">
        {!hasUserMessages && !loading ? (
          /* Warm centered empty state */
          <div className="flex flex-col items-center justify-center h-full -mt-8">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4 animate-pulse">
              <Sparkles className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Hi, I&apos;m NutriAI!</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 text-center max-w-xs">Ask me about your diet, meal suggestions, or nutrition tips</p>
            <div className="flex flex-wrap gap-2 mt-6 justify-center">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  onClick={() => sendMessage(action.message, action.isSuggestMeal)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 font-medium hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 dark:hover:bg-emerald-900/30 dark:hover:border-emerald-800 dark:hover:text-emerald-400 transition-colors"
                >
                  <action.icon className="h-3.5 w-3.5" />
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3 pt-2">
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
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-md'
                    }`}
                  >
                    {msg.content}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Suggested meal cards after last AI message */}
            {suggestedMeals.length > 0 && lastAiMessage && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="max-w-[90%] space-y-2">
                  <p className="text-xs text-gray-400 dark:text-gray-500 pl-1 font-medium">Suggested meals you can log:</p>
                  {suggestedMeals.map((meal) => (
                    <div
                      key={meal.id}
                      className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{meal.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-medium border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400">
                            {meal.cuisine}
                          </Badge>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {Math.round(meal.caloriesPer100g)} kcal/100g
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold min-h-[32px] rounded-lg px-3 shrink-0"
                        onClick={() => openLogDialog(meal)}
                      >
                        Log
                      </Button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Typing indicator */}
            {loading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="bg-gray-100 dark:bg-gray-800 px-4 py-3 rounded-2xl rounded-bl-md">
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* Quick actions (shown after first user message, before scrolling starts) */}
      {hasUserMessages && messages.length <= 3 && !loading && (
        <div className="px-4 pb-2">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                onClick={() => sendMessage(action.message, action.isSuggestMeal)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 font-medium whitespace-nowrap hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 dark:hover:bg-emerald-900/30 dark:hover:border-emerald-800 dark:hover:text-emerald-400 transition-colors shrink-0"
              >
                <action.icon className="h-3.5 w-3.5" />
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="p-4 pt-2 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about nutrition..."
            disabled={loading}
            className="flex-1 h-11 rounded-xl bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 text-sm"
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

      {/* Log Meal Dialog */}
      <Dialog open={logDialog.open} onOpenChange={(open) => !open && setLogDialog({ open: false })}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Log Meal</DialogTitle>
          </DialogHeader>
          {logDialog.open && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{logDialog.meal.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400">
                    {logDialog.meal.cuisine}
                  </Badge>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {Math.round(logDialog.meal.caloriesPer100g)} kcal / 100g
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Meal Slot</Label>
                <Select value={logSlot} onValueChange={setLogSlot}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="breakfast">Breakfast</SelectItem>
                    <SelectItem value="lunch">Lunch</SelectItem>
                    <SelectItem value="dinner">Dinner</SelectItem>
                    <SelectItem value="snack">Snack</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Serving Size (grams)</Label>
                <Input
                  type="number"
                  value={logServingGms}
                  onChange={(e) => setLogServingGms(Number(e.target.value))}
                  min={10}
                  max={1000}
                  className="h-11 rounded-xl"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Estimated: {Math.round(logDialog.meal.caloriesPer100g * logServingGms / 100)} kcal
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setLogDialog({ open: false })}
            >
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
              onClick={handleLogMeal}
              disabled={logging}
            >
              {logging ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Log Meal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
