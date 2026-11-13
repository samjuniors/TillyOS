// Advanced Acoustic & Speech Detector: Clap Detection + Hands-free Speech Recognition

import { getAudioContext } from './audioUtils';
import { AcousticClassifier, SoundClassification } from './acousticClassifier';

export interface AcousticCallbacks {
  onClap: () => void;
  onWakeWord: (phrase: string, command?: string) => void;
  onSpeechFinal: (text: string) => void;
  onAudioLevel?: (level: number) => void;
  onPhysicalSound?: (sound: SoundClassification) => void;
  onError?: (err: string) => void;
}

export class AcousticDetector {
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private recognition: any = null;
  private isRunning = false;
  private callbacks: AcousticCallbacks;
  private classifier = new AcousticClassifier();

  constructor(callbacks: AcousticCallbacks) {
    this.callbacks = callbacks;
  }

  async start(): Promise<boolean> {
    try {
      this.isRunning = true;
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false, // keep false so sharp claps are not suppressed
          autoGainControl: true,
        },
      });

      // Hook up clap impulse analyzer via ScriptProcessor
      const source = ctx.createMediaStreamSource(this.mediaStream);
      this.processor = ctx.createScriptProcessor(2048, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.isRunning) return;
        const inputData = e.inputBuffer.getChannelData(0);

        let sumSquares = 0;
        for (let i = 0; i < inputData.length; i++) {
          sumSquares += inputData[i] * inputData[i];
        }

        const rms = Math.sqrt(sumSquares / inputData.length);
        this.callbacks.onAudioLevel?.(Math.min(1, rms * 10));

        // Real-time acoustic classification for physical sounds
        const sound = this.classifier.processFrame(inputData, ctx.sampleRate || 16000);
        if (sound) {
          if (sound.event === 'clap') {
            this.callbacks.onClap();
          } else {
            this.callbacks.onPhysicalSound?.(sound);
          }
        }
      };

      source.connect(this.processor);
      this.processor.connect(ctx.destination);

      // Start continuous speech recognition
      this.startSpeechRecognition();

      return true;
    } catch (err: any) {
      console.error('Failed to start acoustic detector:', err);
      this.callbacks.onError?.(err?.message || 'Microphone access denied');
      return false;
    }
  }

  private startSpeechRecognition() {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      console.warn('SpeechRecognition not supported in this browser.');
      return;
    }

    try {
      this.recognition = new SpeechRec();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-AU';

      this.recognition.onresult = (event: any) => {
        if (!this.isRunning) return;
        const results = event.results;
        const lastResult = results[results.length - 1];
        const transcript = lastResult[0].transcript.trim();
        const lower = transcript.toLowerCase();
        const isFinal = lastResult.isFinal;

        // Broad phonetic matching for Matilda / Tilly ("tili", "till i", "hey till", "tilly", "matilda")
        const wakePhrases = [
          'hey tilly',
          'hey tili',
          'hey till i',
          'hey till',
          'hey matilda',
          'tilly',
          'tili',
          'till i',
          'matilda',
          'g\'day tilly',
          'gday tilly',
          'g\'day tili',
          'gday tili',
          'g\'day matilda',
          'gday matilda',
          'wake up',
          'wake',
          'hello',
          'hey',
        ];

        for (const wp of wakePhrases) {
          const idx = lower.indexOf(wp);
          if (idx !== -1) {
            const command = transcript.slice(idx + wp.length).replace(/^[,\s.!?-]+/, '').trim();
            this.callbacks.onWakeWord(wp, command || undefined);
            return;
          }
        }

        // On boot screen or general speech, any spoken turn triggers
        if (transcript.length > 0) {
          this.callbacks.onWakeWord('speech', transcript);
        }

        // Final speech turn for regular conversation
        if (isFinal && transcript.length > 1) {
          this.callbacks.onSpeechFinal(transcript);
        }
      };

      this.recognition.onend = () => {
        if (this.isRunning) {
          try {
            this.recognition.start();
          } catch (e) {
            setTimeout(() => {
              if (this.isRunning) {
                try {
                  this.recognition.start();
                } catch (e2) {}
              }
            }, 300);
          }
        }
      };

      this.recognition.onerror = (e: any) => {
        if (e.error === 'not-allowed') {
          this.callbacks.onError?.('Microphone permission blocked');
        }
      };

      this.recognition.start();
    } catch (e) {
      console.warn('Failed to start SpeechRecognition:', e);
    }
  }

  stop() {
    this.isRunning = false;
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch (e) {}
      this.recognition = null;
    }
  }
}
