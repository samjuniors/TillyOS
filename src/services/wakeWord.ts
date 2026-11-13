// Hands-free Wake Word Detection for "Hey Tilly" and "Hey Matilda"

import { getAudioContext } from './audioUtils';

export interface WakeWordCallbacks {
  onWake: (detectedWakeWord: string, commandText?: string) => void;
  onSleep?: () => void;
  onSpeechRecognized?: (transcript: string) => void;
  onError?: (err: any) => void;
  onListeningStateChange?: (isListening: boolean) => void;
}

export class WakeWordManager {
  private recognition: any = null;
  private isEnabled = false;
  private callbacks: WakeWordCallbacks;
  private isAwake = false;

  constructor(callbacks: WakeWordCallbacks) {
    this.callbacks = callbacks;
  }

  isSupported(): boolean {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  start() {
    if (!this.isSupported()) {
      console.warn('SpeechRecognition not supported in this browser.');
      return;
    }

    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch (e) {}
    }

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new SpeechRec();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-AU';

    this.isEnabled = true;

    this.recognition.onstart = () => {
      this.callbacks.onListeningStateChange?.(true);
    };

    this.recognition.onend = () => {
      // Auto-restart if hands-free is enabled
      if (this.isEnabled) {
        try {
          this.recognition.start();
        } catch (e) {
          // Restart after short delay
          setTimeout(() => {
            if (this.isEnabled) {
              try {
                this.recognition.start();
              } catch (e2) {}
            }
          }, 300);
        }
      } else {
        this.callbacks.onListeningStateChange?.(false);
      }
    };

    this.recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        this.isEnabled = false;
        this.callbacks.onError?.('Microphone access not allowed for handsfree wake word.');
      }
    };

    this.recognition.onresult = (event: any) => {
      const results = event.results;
      const lastResult = results[results.length - 1];
      const transcript = lastResult[0].transcript.trim().toLowerCase();
      const isFinal = lastResult.isFinal;

      // Check for wake words
      const wakeMatches = [
        'hey tilly',
        'hey matilda',
        'g\'day tilly',
        'gday tilly',
        'g\'day matilda',
        'gday matilda',
        'tilly',
        'matilda',
      ];

      // Check for sleep commands
      const sleepMatches = ['go to sleep', 'sleep tilly', 'thanks tilly', 'rest now tilly', 'goodbye tilly'];
      for (const sm of sleepMatches) {
        if (transcript.includes(sm)) {
          this.isAwake = false;
          this.callbacks.onSleep?.();
          return;
        }
      }

      let matchedWake: string | null = null;
      let matchedIndex = -1;

      for (const w of wakeMatches) {
        const idx = transcript.indexOf(w);
        if (idx !== -1) {
          matchedWake = w;
          matchedIndex = idx;
          break;
        }
      }

      if (matchedWake && (!this.isAwake || isFinal)) {
        this.isAwake = true;
        this.playWakeChime();

        // Extract whatever was said after the wake word
        const afterWake = transcript.slice(matchedIndex + matchedWake.length).replace(/^[,\s.!?-]+/, '').trim();
        this.callbacks.onWake(matchedWake, afterWake || undefined);
        return;
      }

      // If already awake and user spoke a command
      if (this.isAwake && isFinal && transcript) {
        this.callbacks.onSpeechRecognized?.(transcript);
      }
    };

    try {
      this.recognition.start();
    } catch (e) {
      console.warn('Failed to start speech recognition:', e);
    }
  }

  stop() {
    this.isEnabled = false;
    this.isAwake = false;
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch (e) {}
      this.recognition = null;
    }
    this.callbacks.onListeningStateChange?.(false);
  }

  setAwakeState(awake: boolean) {
    this.isAwake = awake;
  }

  playWakeChime() {
    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      // Gentle, melodic two-tone Aussie chime (G5 -> C6)
      osc1.frequency.setValueAtTime(783.99, now); // G5
      osc2.frequency.setValueAtTime(1046.50, now + 0.12); // C6

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.14);

      osc2.start(now + 0.12);
      osc2.stop(now + 0.48);
    } catch (e) {
      // ignore
    }
  }
}
