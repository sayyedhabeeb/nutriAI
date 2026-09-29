'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, RotateCcw, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { transcribeBlob, type WhisperProgress } from '@/lib/voice/local-whisper';

const MAX_LISTENING_MS = 10_000;
const SILENCE_GRACE_MS = 5_000;
const LOCAL_SPEECH_RMS = 0.02;

export function VoiceFoodLog({ onTranscript }: { onTranscript: (text: string) => void }) {
  const transcriptRef = useRef('');
  const keepListening = useRef(false);
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSpeechTime = useRef(0);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const audioStream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const analyserTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const localSpeechStarted = useRef(false);

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [message, setMessage] = useState('Tap the microphone and describe what you ate.');
  const [microphoneChecked, setMicrophoneChecked] = useState(false);
  const [speechDetected, setSpeechDetected] = useState(false);
  const [graceActive, setGraceActive] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [transcribing, setTranscribing] = useState(false);

  const clearTimers = () => {
    if (graceTimer.current) clearTimeout(graceTimer.current);
    if (maxTimer.current) clearTimeout(maxTimer.current);
    if (countdownInterval.current) clearInterval(countdownInterval.current);
    graceTimer.current = null;
    maxTimer.current = null;
    countdownInterval.current = null;
  };

  // Releases every local-capture resource. Audio lives only in memory.
  function teardownLocalAudio() {
    if (analyserTimer.current) { clearInterval(analyserTimer.current); analyserTimer.current = null; }
    const stream = audioStream.current;
    audioStream.current = null;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    const context = audioContext.current;
    audioContext.current = null;
    if (context) { try { void context.close(); } catch { /* noop */ } }
    mediaRecorder.current = null;
    recordedChunks.current = [];
  }

  function stopRecorderAndGetBlob(): Promise<Blob | null> {
    const recorder = mediaRecorder.current;
    if (!recorder || recorder.state === 'inactive') return Promise.resolve(null);
    return new Promise((resolve) => {
      recorder.addEventListener('stop', () => {
        const chunks = recordedChunks.current;
        resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }) : null);
      }, { once: true });
      try { recorder.stop(); } catch { resolve(null); }
    });
  }

  async function finishLocal(reason: 'grace' | 'max' | 'manual') {
    if (analyserTimer.current) { clearInterval(analyserTimer.current); analyserTimer.current = null; }
    const blob = await stopRecorderAndGetBlob();
    teardownLocalAudio();
    if (!blob || blob.size === 0) {
      setMessage('No speech was captured. Tap Start to try again.');
      return;
    }
    setTranscribing(true);
    setMessage('Transcribing on-device…');
    try {
      const text = (await transcribeBlob(blob, (info: WhisperProgress) => {
        if (info.status === 'progress' && typeof info.progress === 'number') {
          setMessage(`Preparing on-device speech model… ${Math.round(info.progress * 100)}%`);
        } else if (info.status === 'initiate' || info.status === 'download') {
          setMessage('Preparing on-device speech model…');
        }
      })).trim();
      if (text) {
        transcriptRef.current = text;
        setTranscript(text);
        setMessage(reason === 'max'
          ? 'Maximum listening time reached — parsing meal...'
          : reason === 'grace'
            ? 'Listening complete — parsing meal...'
            : 'Recording stopped — parsing meal...');
        onTranscript(text);
      } else {
        setMessage('No speech was captured. Tap Start to try again.');
      }
    } catch (cause) {
      console.error('[VOICE] on-device transcription failed', cause);
      setMessage('On-device transcription failed. Please retry.');
    } finally {
      setTranscribing(false);
    }
  }

  useEffect(() => {
    console.info('[VOICE] mounted');
    return () => {
      console.info('[VOICE] unmounting — keepListening=false, stopping capture');
      keepListening.current = false;
      clearTimers();
      teardownLocalAudio();
    };
  }, []);

  // Single exit path. Idempotent — only the first caller wins.
  function finish(reason: 'grace' | 'max' | 'manual' = 'manual') {
    if (!keepListening.current) return;
    keepListening.current = false;
    clearTimers();
    setListening(false);
    setGraceActive(false);
    setCountdown(null);
    void finishLocal(reason);
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

  const start = async () => {
    if (transcribing) return;
    clearTimers();
    teardownLocalAudio();
    transcriptRef.current = '';
    setTranscript('');
    setSpeechDetected(false);
    setGraceActive(false);
    setCountdown(null);
    localSpeechStarted.current = false;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (cause) {
      setMicrophoneChecked(false);
      setListening(false);
      setMessage(cause instanceof DOMException && cause.name === 'NotAllowedError'
        ? 'Microphone permission was denied. Allow Microphone access in your browser site settings, then retry.'
        : 'The microphone could not be opened for on-device transcription.');
      return;
    }
    audioStream.current = stream;
    const tracks = stream.getAudioTracks();
    console.info('[VOICE] local mic track:', tracks.length
      ? tracks.map((track) => `"${track.label}" (enabled=${track.enabled}, state=${track.readyState})`).join(', ')
      : '(none)');
    setMicrophoneChecked(true);

    const chunks: Blob[] = [];
    recordedChunks.current = chunks;
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => { if (event.data && event.data.size > 0) chunks.push(event.data); };
    recorder.start();
    mediaRecorder.current = recorder;

    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) {
      try {
        const context = new Ctor();
        audioContext.current = context;
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        analyserTimer.current = setInterval(() => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i += 1) { const v = (data[i] - 128) / 128; sum += v * v; }
          const rms = Math.sqrt(sum / data.length);
          if (rms > LOCAL_SPEECH_RMS) {
            if (!localSpeechStarted.current) { localSpeechStarted.current = true; setSpeechDetected(true); }
            resetGrace();
          }
        }, 100);
      } catch (cause) {
        console.warn('[VOICE] analyser unavailable; using max-time capture only', cause);
      }
    }

    keepListening.current = true;
    setListening(true);
    maxTimer.current = setTimeout(() => finish('max'), MAX_LISTENING_MS);
    setMessage('Listening with on-device Whisper...');
  };

  const reset = () => {
    keepListening.current = false;
    clearTimers();
    teardownLocalAudio();
    setListening(false);
    setGraceActive(false);
    setCountdown(null);
    setTranscribing(false);
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
        <span className="rounded-full px-2 py-1 bg-emerald-100 text-emerald-700">Engine: on-device Whisper</span>
      </div>
      <div className="flex gap-2">
        {listening
          ? <Button type="button" onClick={() => finish('manual')} className="flex-1 bg-red-500 hover:bg-red-600"><Square className="mr-2 h-4 w-4" />Stop</Button>
          : <Button type="button" disabled={transcribing} onClick={start} className="flex-1 bg-emerald-600 hover:bg-emerald-700"><Mic className="mr-2 h-4 w-4" />{transcribing ? 'Transcribing…' : 'Start listening'}</Button>}
        <Button type="button" variant="outline" disabled={transcribing} onClick={reset} aria-label="Retry voice log"><RotateCcw className="h-4 w-4" /></Button>
        <Button type="button" disabled={!transcript.trim() || listening || transcribing} onClick={() => onTranscript(transcript.trim())}>Done</Button>
      </div>
    </div>
  );
}