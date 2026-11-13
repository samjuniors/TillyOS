// Gemini Live API Client with Dynamic Multilingual Audio Stream Detection & Scheduled Playback

import { getAudioContext, getGlobalAnalyser, pcmFloat32ToBase64, resamplePcm } from './audioUtils';
import { AussieSlangLevel, VoiceSkillTurnTrace } from '../types';
import { AcousticClassifier, SoundClassification } from './acousticClassifier';
import { detectLanguageFromTranscript, LANGUAGE_METADATA } from './languageDetector';

export interface LiveClientCallbacks {
  onStatusChange: (status: 'idle' | 'connecting' | 'connected' | 'listening' | 'speaking' | 'paused' | 'error', errorMsg?: string) => void;
  onAudioDataReceived?: (base64Audio: string) => void;
  onTextReceived?: (text: string) => void;
  onUserSpeechDetected?: (active: boolean) => void;
  onTillySpeechDetected?: (active: boolean) => void;
  onUserSpeechTranscript?: (transcript: string) => void;
  onPhysicalSoundDetected?: (classification: SoundClassification) => void;
  onLanguageDetected?: (language: string, isExplicit: boolean) => void;
  onSkillTurnTrace?: (trace: VoiceSkillTurnTrace) => void;
  onSkillFiller?: (fillerText: string, skillName: string) => void;
}

export class LiveSessionClient {
  private ws: WebSocket | null = null;
  private callbacks: LiveClientCallbacks;
  private inputAudioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private recognition: any = null;
  private classifier = new AcousticClassifier();

  // Dynamic Audio Stream Language Detection
  public explicitLanguage: string | null = null;
  public currentLanguage: string = 'English';
  public workspaceAccessToken: string | null = null;
  private speechAudioChunks: Float32Array[] = [];
  private speechSamplesCount: number = 0;
  private isAnalyzingAudioLanguage: boolean = false;
  private lastLanguageDetectionTime: number = 0;

  // Voice Turn Finalization & Deduplication
  private interimFinalizeTimer: any = null;
  private lastVoiceTurnText: string = '';
  private lastVoiceTurnTime: number = 0;

  // Time-scheduled audio playback
  private outputCtx: AudioContext | null = null;
  private nextPlaybackTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private isSpeaking = false;
  private finishSpeakingTimer: any = null;
  private echoCooldownUntil = 0;

  public isConnected = false;
  public isPaused = false;

  constructor(callbacks: LiveClientCallbacks) {
    this.callbacks = callbacks;
  }

  setWorkspaceToken(token: string | null) {
    this.workspaceAccessToken = token;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'update_auth',
          workspaceAccessToken: token || null,
        })
      );
    }
  }

  connect(memorySummary = '', slangLevel: AussieSlangLevel = 'everyday', languagePreference = 'auto') {
    this.disconnect();
    this.callbacks.onStatusChange('connecting');

    // Initialize language settings: prioritize explicit setting if provided
    if (languagePreference && languagePreference !== 'auto') {
      this.explicitLanguage = languagePreference;
      this.currentLanguage = languagePreference;
    } else {
      this.explicitLanguage = null;
      this.currentLanguage = 'English';
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/live-ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        // Send initial config with persona, memories, language preference, and OAuth token
        this.ws?.send(
          JSON.stringify({
            type: 'init',
            memorySummary,
            slangLevel,
            languagePreference: this.explicitLanguage || 'auto',
            workspaceAccessToken: this.workspaceAccessToken || null,
          })
        );
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'ready') {
            this.isConnected = true;
            this.isPaused = false;
            this.callbacks.onStatusChange('connected');
            this.startMicCapture();
          } else if (msg.type === 'audio' && msg.audio) {
            if (!this.isPaused) {
              this.schedulePcmAudioChunk(msg.audio);
              this.callbacks.onAudioDataReceived?.(msg.audio);
            }
          } else if (msg.type === 'text' && msg.text) {
            this.callbacks.onTextReceived?.(msg.text);
          } else if (msg.type === 'language_updated' && msg.language) {
            this.currentLanguage = msg.language;
            if (msg.isExplicit) this.explicitLanguage = msg.language;
            this.callbacks.onLanguageDetected?.(msg.language, !!msg.isExplicit);
          } else if (msg.type === 'skill_filler' && msg.fillerText) {
            this.callbacks.onSkillFiller?.(msg.fillerText, msg.skillName || 'skill');
          } else if (msg.type === 'skill_turn_trace' && msg.trace) {
            this.callbacks.onSkillTurnTrace?.(msg.trace);
          } else if (msg.type === 'interrupted') {
            this.stopAllAudioOutput();
            this.callbacks.onStatusChange(this.isPaused ? 'paused' : 'listening');
          } else if (msg.type === 'error') {
            console.warn('Live API server error message:', msg.error);
            this.callbacks.onStatusChange('error', msg.error);
          }
        } catch (e) {
          console.error('Error handling WebSocket message:', e);
        }
      };

      this.ws.onerror = (err) => {
        console.error('Live API WebSocket error:', err);
        this.callbacks.onStatusChange('error', 'Live WebSocket connection failed');
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.stopMicCapture();
        this.stopAllAudioOutput();
        this.callbacks.onStatusChange('idle');
      };
    } catch (e: any) {
      console.error('Failed to create Live WebSocket:', e);
      this.callbacks.onStatusChange('error', e?.message || 'Connection error');
    }
  }

  /**
   * Prioritize or clear explicit language preference
   */
  setExplicitLanguage(language: string | null) {
    if (language && language !== 'auto') {
      this.explicitLanguage = language;
      this.updateSystemPromptLanguage(language, true);
    } else {
      this.explicitLanguage = null;
      console.log('[LiveSessionClient] Language set to auto-detect from audio stream');
    }
  }

  /**
   * Dynamically update system prompt context so Matilda replies consistently in the target language.
   * If user explicitly asks to speak a specific language, that setting is prioritized.
   */
  updateSystemPromptLanguage(language: string, isExplicit: boolean = false) {
    // If user explicitly locked a language and this detection is not an explicit change, prioritize the explicit setting!
    if (this.explicitLanguage && !isExplicit && language !== this.explicitLanguage) {
      return;
    }

    if (this.currentLanguage === language && !isExplicit) {
      return;
    }

    this.currentLanguage = language;
    if (isExplicit) {
      this.explicitLanguage = language;
    }

    console.log(`[LiveSessionClient] Updating system prompt context to: ${language} (explicit: ${isExplicit})`);

    // Notify UI callback
    this.callbacks.onLanguageDetected?.(language, isExplicit);

    // Update speech recognition language to match target language
    this.updateRecognitionLanguage(language);

    // Send context update directive to active Gemini Live session
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'update_language',
          language,
          isExplicit,
        })
      );
    }
  }

  private updateRecognitionLanguage(language: string) {
    if (!this.recognition) return;
    const bcp47 = LANGUAGE_METADATA[language]?.bcp47 || 'en-AU';
    if (this.recognition.lang !== bcp47) {
      this.recognition.lang = bcp47;
      try {
        this.recognition.abort();
        setTimeout(() => {
          if (this.isConnected && !this.isPaused && this.recognition) {
            try {
              this.recognition.start();
            } catch (e) {}
          }
        }, 120);
      } catch (e) {}
    }
  }

  pause() {
    this.isPaused = true;
    this.stopAllAudioOutput();
    this.callbacks.onStatusChange('paused');
  }

  resume() {
    this.isPaused = false;
    this.callbacks.onStatusChange('listening');
  }

  togglePause() {
    if (this.isPaused) {
      this.resume();
    } else {
      this.pause();
    }
  }

  private async startMicCapture() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.inputAudioCtx = new AudioCtx();
      if (this.inputAudioCtx.state === 'suspended') {
        await this.inputAudioCtx.resume();
      }

      const nativeSampleRate = this.inputAudioCtx.sampleRate || 16000;

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const source = this.inputAudioCtx.createMediaStreamSource(this.mediaStream);
      this.processor = this.inputAudioCtx.createScriptProcessor(2048, 1, 1);

      let silenceCounter = 0;

      this.processor.onaudioprocess = (e) => {
        if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        if (this.isPaused) return;

        const now = Date.now();
        const inputBuffer = e.inputBuffer.getChannelData(0);
        const sampleRate = e.inputBuffer.sampleRate || nativeSampleRate;

        // Calculate RMS energy
        let sumSquares = 0;
        for (let i = 0; i < inputBuffer.length; i++) {
          sumSquares += inputBuffer[i] * inputBuffer[i];
        }
        const rms = Math.sqrt(sumSquares / inputBuffer.length);

        // USER SPEECH INTERRUPT (BARGE-IN) LOGIC:
        // When Matilda is speaking and user speaks into the microphone (rms > 0.02):
        // Immediately halt local speech playback so user has full control over the conversation!
        if (this.isSpeaking && rms > 0.02 && now > this.echoCooldownUntil) {
          console.log('User voice barge-in detected! Halting AI playback.');
          this.stopAllAudioOutput();
        }

        // VAD activity callback
        if (rms > 0.008) {
          silenceCounter = 0;
          this.callbacks.onUserSpeechDetected?.(true);
        } else {
          silenceCounter++;
          if (silenceCounter > 5) {
            this.callbacks.onUserSpeechDetected?.(false);
          }
        }

        // Resample Float32 PCM to 16000Hz for Gemini Live API
        const pcm16k = resamplePcm(inputBuffer, sampleRate, 16000);

        // Buffer incoming user speech for dynamic language detection
        if (!this.isSpeaking && rms > 0.012) {
          this.speechAudioChunks.push(new Float32Array(pcm16k));
          this.speechSamplesCount += pcm16k.length;
        }

        // When user pauses speaking (silence after speech of >= 0.8s), analyze audio stream language:
        if (silenceCounter >= 6 && this.speechSamplesCount >= 16000 * 0.8) {
          this.triggerAudioStreamLanguageDetection();
        }

        // Passive non-intrusive sound classification for UI badges
        if (!this.isSpeaking && now > this.echoCooldownUntil) {
          const classification = this.classifier.processFrame(pcm16k, 16000);
          if (classification) {
            this.callbacks.onPhysicalSoundDetected?.(classification);
          }
        }

        // Stream user microphone audio to Gemini Live:
        if (!this.isSpeaking || rms > 0.015) {
          const base64Audio = pcmFloat32ToBase64(pcm16k);
          this.ws.send(
            JSON.stringify({
              type: 'audio',
              audio: base64Audio,
            })
          );
        }
      };

      source.connect(this.processor);
      this.processor.connect(this.inputAudioCtx.destination);

      this.startSpeechRecognitionForLive();
      this.callbacks.onStatusChange(this.isPaused ? 'paused' : 'listening');
    } catch (err: any) {
      console.error('Error starting mic capture for Live API:', err);
      this.callbacks.onStatusChange('error', 'Microphone permission denied or unavailable');
    }
  }

  /**
   * Analyzes the accumulated incoming audio stream to dynamically detect language and update context
   */
  private async triggerAudioStreamLanguageDetection() {
    if (this.isAnalyzingAudioLanguage || this.speechSamplesCount < 16000 * 0.8) return;

    const now = Date.now();
    if (now - this.lastLanguageDetectionTime < 3500) {
      this.speechAudioChunks = [];
      this.speechSamplesCount = 0;
      return;
    }

    this.isAnalyzingAudioLanguage = true;
    this.lastLanguageDetectionTime = now;

    const chunks = this.speechAudioChunks;
    const totalSamples = this.speechSamplesCount;
    this.speechAudioChunks = [];
    this.speechSamplesCount = 0;

    try {
      // Flatten chunks into a single Float32Array
      const fullAudio = new Float32Array(totalSamples);
      let offset = 0;
      for (const chunk of chunks) {
        fullAudio.set(chunk, offset);
        offset += chunk.length;
      }

      // Encode as Base64 16kHz PCM
      const base64Pcm = pcmFloat32ToBase64(fullAudio);

      const res = await fetch('/api/detect-language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio: base64Pcm,
          explicitLanguage: this.explicitLanguage,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.language && (data.confidence >= 0.85 || data.isExplicit)) {
          this.updateSystemPromptLanguage(data.language, data.isExplicit);
        }
      }
    } catch (e) {
      console.warn('[LiveSessionClient] Audio stream language detection error:', e);
    } finally {
      this.isAnalyzingAudioLanguage = false;
    }
  }

  private startSpeechRecognitionForLive() {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
      this.recognition = new SpeechRec();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = LANGUAGE_METADATA[this.currentLanguage]?.bcp47 || 'en-AU';

      this.recognition.onresult = (event: any) => {
        const results = event.results;
        const lastResult = results[results.length - 1];
        const transcript = lastResult[0].transcript.trim();
        const lower = transcript.toLowerCase();

        const dispatchVoiceTurn = (utteranceText: string) => {
          const cleaned = utteranceText.trim();
          if (!cleaned || cleaned.length < 3) return;
          const now = Date.now();
          if (
            cleaned.toLowerCase() === this.lastVoiceTurnText.toLowerCase() &&
            now - this.lastVoiceTurnTime < 2200
          ) {
            return;
          }
          this.lastVoiceTurnText = cleaned;
          this.lastVoiceTurnTime = now;

          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(
              JSON.stringify({
                type: 'voice_turn',
                transcript: cleaned,
                activeLanguage: this.currentLanguage,
                workspaceAccessToken: this.workspaceAccessToken || null,
              })
            );
          }
        };

        if (transcript.length > 0) {
          // ASR BARGE-IN: If user speaks while Matilda/Sofia is talking, stop playback immediately!
          if (this.isSpeaking) {
            console.log('ASR user transcript detected! Halting AI playback.');
            this.stopAllAudioOutput();
          }
          this.callbacks.onUserSpeechTranscript?.(transcript);

          if (this.interimFinalizeTimer) {
            clearTimeout(this.interimFinalizeTimer);
            this.interimFinalizeTimer = null;
          }

          if (lastResult.isFinal) {
            dispatchVoiceTurn(transcript);
          } else {
            // If continuous SpeechRecognition stalls in interim mode, finalize after 950ms pause
            this.interimFinalizeTimer = setTimeout(() => {
              dispatchVoiceTurn(transcript);
            }, 950);
          }

          // Dynamically detect language from spoken transcript:
          const detected = detectLanguageFromTranscript(transcript, this.explicitLanguage);
          if (detected.isExplicit) {
            this.updateSystemPromptLanguage(detected.language, true);
          } else if (!this.explicitLanguage && detected.confidence >= 0.85 && detected.language !== this.currentLanguage) {
            this.updateSystemPromptLanguage(detected.language, false);
          }
        }

        // Voice command shortcuts
        if (lower.includes('pause live') || lower.includes('pause tilly') || lower.includes('pause sofia') || lower === 'pause' || lower.includes('hold on tilly')) {
          this.pause();
        } else if (this.isPaused && (lower.includes('resume') || lower.includes('unpause') || lower.includes('hey tilly') || lower.includes('hey sofia') || lower.includes('tilly') || lower.includes('sofia'))) {
          this.resume();
        }
      };

      this.recognition.onend = () => {
        if (this.isConnected && this.recognition && !this.isPaused) {
          try {
            this.recognition.start();
          } catch (e) {
            setTimeout(() => {
              if (this.isConnected && this.recognition && !this.isPaused) {
                try {
                  this.recognition.start();
                } catch (e2) {}
              }
            }, 300);
          }
        }
      };

      this.recognition.start();
    } catch (e) {
      console.warn('SpeechRecognition for live subtitle error:', e);
    }
  }

  sendTextMessage(text: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Also inspect manually sent text message for explicit language directives
      const det = detectLanguageFromTranscript(text, this.explicitLanguage);
      if (det.isExplicit) {
        this.updateSystemPromptLanguage(det.language, true);
      }
      this.ws.send(JSON.stringify({ type: 'text', text }));
    }
  }

  /**
   * Schedule 24kHz PCM 16-bit audio chunk sequentially on audio timeline.
   * This guarantees seamless playback without overlapping or stutters!
   */
  private schedulePcmAudioChunk(base64Chunk: string) {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    try {
      const binaryString = atob(base64Chunk);
      const len = binaryString.length;
      const numSamples = Math.floor(len / 2);
      if (numSamples === 0) return;

      const float32 = new Float32Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        const byte1 = binaryString.charCodeAt(i * 2);
        const byte2 = binaryString.charCodeAt(i * 2 + 1);
        let sample = (byte2 << 8) | byte1;
        if (sample >= 32768) sample -= 65536;
        float32[i] = sample / 32768.0;
      }

      const audioBuffer = ctx.createBuffer(1, numSamples, 24000);
      audioBuffer.copyToChannel(float32, 0);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      // Connect to global analyser for UI visualizer and to destination for audio playback
      try {
        const analyser = getGlobalAnalyser();
        source.connect(analyser);
      } catch (e) {}
      source.connect(ctx.destination);

      const currentTime = ctx.currentTime;
      // Schedule chunk precisely after previous chunk
      if (this.nextPlaybackTime < currentTime) {
        this.nextPlaybackTime = currentTime + 0.02; // 20ms lead buffer
      }

      source.start(this.nextPlaybackTime);
      this.activeSources.push(source);

      // Track active speech status
      this.isSpeaking = true;
      this.callbacks.onTillySpeechDetected?.(true);
      this.callbacks.onStatusChange('speaking');

      const chunkDuration = audioBuffer.duration;
      this.nextPlaybackTime += chunkDuration;

      // Clean up finished source
      source.onended = () => {
        const idx = this.activeSources.indexOf(source);
        if (idx !== -1) {
          this.activeSources.splice(idx, 1);
        }
      };

      // Reset speaking state when last chunk finishes
      if (this.finishSpeakingTimer) {
        clearTimeout(this.finishSpeakingTimer);
      }

      const remainingTimeMs = Math.max(0, (this.nextPlaybackTime - ctx.currentTime) * 1000);
      this.finishSpeakingTimer = setTimeout(() => {
        this.isSpeaking = false;
        // Echo cooldown: do not let room reverberation trigger the mic for 400ms after Matilda speaks
        this.echoCooldownUntil = Date.now() + 400;
        this.callbacks.onTillySpeechDetected?.(false);
        this.callbacks.onStatusChange(this.isPaused ? 'paused' : 'listening');
      }, remainingTimeMs + 60);

    } catch (err) {
      console.error('Error decoding/scheduling PCM chunk:', err);
    }
  }

  private stopAllAudioOutput() {
    for (const src of this.activeSources) {
      try {
        src.stop();
        src.disconnect();
      } catch (e) {}
    }
    this.activeSources = [];
    this.nextPlaybackTime = 0;
    this.isSpeaking = false;
    this.echoCooldownUntil = Date.now() + 200;
    if (this.finishSpeakingTimer) {
      clearTimeout(this.finishSpeakingTimer);
      this.finishSpeakingTimer = null;
    }
    this.callbacks.onTillySpeechDetected?.(false);
  }

  private stopMicCapture() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.inputAudioCtx) {
      this.inputAudioCtx.close().catch(() => {});
      this.inputAudioCtx = null;
    }
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch (e) {}
      this.recognition = null;
    }
  }

  disconnect() {
    this.stopAllAudioOutput();
    this.stopMicCapture();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}
