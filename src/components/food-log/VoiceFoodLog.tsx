'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, RotateCcw, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Recognition = { continuous: boolean; interimResults: boolean; lang: string; start: () => void; stop: () => void; onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onstart: (() => void) | null; onspeechstart: (() => void) | null; onnomatch: (() => void) | null; onerror: ((event: { error: string }) => void) | null };
declare global { interface Window { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition } }

const MAX_LISTENING_MS = 10_000;
const SILENCE_GRACE_MS = 5_000;

export function VoiceFoodLog({ onTranscript }: { onTranscript: (text: string) => void }) {
  const recognition = useRef<Recognition | null>(null);
  const transcriptRef = useRef('');
  const keepListening = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSpeechTime = useRef(0);
  const startedAt = useRef(0);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [message, setMessage] = useState('Tap the microphone and describe what you ate.');
  const [microphoneChecked, setMicrophoneChecked] = useState(false);
  const [speechDetected, setSpeechDetected] = useState(false);
  const [graceActive, setGraceActive] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const clearTimers = () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (graceTimer.current) clearTimeout(graceTimer.current);
    if (maxTimer.current) clearTimeout(maxTimer.current);
    if (countdownInterval.current) clearInterval(countdownInterval.current);
    retryTimer.current = null;
    graceTimer.current = null;
    maxTimer.current = null;
    countdownInterval.current = null;
  };

  useEffect(() => () => {
    keepListening.current = false;
    clearTimers();
    try { recognition.current?.stop(); } catch { /* noop */ }
  }, []);

  // Single exit path. Idempotent — only the first caller wins.
  function finish(reason: 'grace' | 'max' | 'manual' = 'manual') {
    if (!keepListening.current) return;
    keepListening.current = false;
    clearTimers();
    setListening(false);
    setGraceActive(false);
    setCountdown(null);
    try { recognition.current?.stop(); } catch { /* noop */ }
    const text = transcriptRef.current.trim();
    if (text) {
      setMessage(reason === 'max'
        ? 'Maximum listening time reached — parsing meal...'
        : reason === 'grace'
          ? 'Listening complete — parsing meal...'
          : 'Recording stopped — parsing meal...');
      onTranscript(text);
    } else {
      setMessage('No speech was captured. Tap Start to try again.');
    }
  }

  // Restart the 5s silence window from the latest speech. If it fires, finish.
  const resetGrace = () => {
    if (graceTimer.current) clearTimeout(graceTimer.current);
    lastSpeechTime.current = Date.now();
    graceTimer.current = setTimeout(() => finish('grace'), SILENCE_GRACE_MS);
    setGraceActive(true);
    if (countdownInterval.current) clearInterval(countdownInterval.current);
    countdownInterval.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((lastSpeechTime.current + SILENCE_GRACE_MS - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0 && countdownInterval.current) clearInterval(countdownInterval.current);
    }, 500);
  };

  const makeRecognition = () => {
    const Constructor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Constructor) return null;
    const speech = new Constructor();
    recognition.current = speech;
    speech.continuous = true; speech.interimResults = true; speech.lang = 'en-IN';
    speech.onstart = () => { if (keepListening.current) { setListening(true); setMessage('Listening...'); } };
    speech.onspeechstart = () => { setSpeechDetected(true); setMessage('Speech detected — converting to text...'); resetGrace(); };
    speech.onresult = (event) => {
      let value = '';
      for (let i = 0; i < event.results.length; i += 1) value += event.results[i][0].transcript;
      const text = value.trim();
      transcriptRef.current = text;
      setTranscript(text);
      if (text) {
        setSpeechDetected(true);
        setMessage('Speech detected — text receiving...');
        resetGrace();
      }
    };
    speech.onerror = (event) => {
      const fatal = ['not-allowed', 'service-not-allowed', 'network', 'audio-capture'].includes(event.error);
      if (fatal) {
        keepListening.current = false;
        clearTimers();
        setListening(false);
        setGraceActive(false);
        setCountdown(null);
      }
      const errors: Record<string, string> = { 'not-allowed': 'Speech recognition permission was denied. Allow Microphone access and retry.', 'no-speech': 'No speech detected yet — still listening...', network: 'Browser speech recognition is unavailable. Check your internet connection or try Chrome.', 'audio-capture': 'The browser could not capture audio. Check that another app is not using the microphone.' };
      setMessage(errors[event.error] || `Speech recognition paused (${event.error}).`);
    };
    speech.onnomatch = () => setMessage('Speech was heard but not understood. Keep listening or try a quieter place.');
    speech.onend = () => {
      if (!keepListening.current) { setListening(false); return; }
      // A browser ending a session is NOT the user finishing. Only finish when
      // our own grace/max timers say so; otherwise recreate and keep listening.
      if (Date.now() - startedAt.current >= MAX_LISTENING_MS) { finish('max'); return; }
      setMessage('Waiting for speech...');
      retryTimer.current = setTimeout(() => { if (keepListening.current) { const next = makeRecognition(); try { next?.start(); } catch { /* next end will retry */ } } }, 250);
    };
    return speech;
  };

  const start = async () => {
    if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) { setMessage('Speech recognition is not supported here. Try the latest Chrome or use text log.'); return; }
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicrophoneChecked(true);
    } catch (cause) {
      setMicrophoneChecked(false);
      setMessage(cause instanceof DOMException && cause.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow Microphone access in your browser site settings, then retry.' : 'The microphone could not be opened. Check your microphone, permission, and that you are using HTTPS or localhost.');
      return;
    }
    clearTimers();
    transcriptRef.current = '';
    setTranscript('');
    setSpeechDetected(false);
    setGraceActive(false);
    setCountdown(null);
    keepListening.current = true;
    setListening(true);
    startedAt.current = Date.now();
    maxTimer.current = setTimeout(() => finish('max'), MAX_LISTENING_MS);
    setMessage('Listening...');
    try { makeRecognition()?.start(); } catch { setMessage('Could not start speech recognition. Please retry.'); keepListening.current = false; setListening(false); }
  };

  const reset = () => {
    keepListening.current = false;
    clearTimers();
    setListening(false);
    setGraceActive(false);
    setCountdown(null);
    try { recognition.current?.stop(); } catch { /* noop */ }
    transcriptRef.current = '';
    setTranscript('');
    setSpeechDetected(false);
    setMicrophoneChecked(false);
    setMessage('Tap the microphone and describe what you ate.');
  };

  const chip = (ok: boolean) => `rounded-full px-2 py-1 ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`;

  const displayMessage = graceActive && listening && countdown !== null
    ? `Speech detected. Waiting for more... ${countdown}s`
    : message;

  return (
    <div className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900 dark:text-gray-100">Voice Meal Log</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{displayMessage}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-full ${listening ? 'bg-red-500 text-white animate-pulse' : 'bg-emerald-600 text-white'}`}>
          <Mic className="h-5 w-5" />
        </div>
      </div>
      <div className="min-h-14 rounded-xl border border-emerald-100 bg-white p-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
        {transcript || 'Your recognized words will appear here before they are processed.'}
      </div>
      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className={chip(microphoneChecked)}>Mic access: {microphoneChecked ? 'confirmed' : 'not checked'}</span>
        <span className={chip(speechDetected)}>Speech: {speechDetected ? 'detected' : 'waiting'}</span>
        <span className={chip(!!transcript)}>Text: {transcript ? 'received' : 'waiting'}</span>
      </div>
      <div className="flex gap-2">
        {listening
          ? <Button type="button" onClick={() => finish('manual')} className="flex-1 bg-red-500 hover:bg-red-600"><Square className="mr-2 h-4 w-4" />Stop</Button>
          : <Button type="button" onClick={start} className="flex-1 bg-emerald-600 hover:bg-emerald-700"><Mic className="mr-2 h-4 w-4" />Start listening</Button>}
        <Button type="button" variant="outline" onClick={reset} aria-label="Retry voice log"><RotateCcw className="h-4 w-4" /></Button>
        <Button type="button" disabled={!transcript.trim() || listening} onClick={() => onTranscript(transcript.trim())}>Done</Button>
      </div>
    </div>
  );
}