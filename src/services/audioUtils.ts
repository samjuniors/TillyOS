// Web Audio & PCM Utilities for Gemini Live & Gemini TTS

let globalAudioCtx: AudioContext | null = null;
let globalAnalyser: AnalyserNode | null = null;
let currentSourceNode: AudioBufferSourceNode | null = null;

export function getAudioContext(): AudioContext {
  if (!globalAudioCtx || globalAudioCtx.state === 'closed') {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    try {
      globalAudioCtx = new AudioContextClass();
    } catch (e) {
      try {
        globalAudioCtx = new AudioContextClass({ sampleRate: 24000 });
      } catch (err) {
        globalAudioCtx = new AudioContextClass();
      }
    }
  }
  if (globalAudioCtx.state === 'suspended') {
    globalAudioCtx.resume().catch(() => {});
  }
  return globalAudioCtx;
}

export function getGlobalAnalyser(): AnalyserNode {
  const ctx = getAudioContext();
  if (!globalAnalyser) {
    globalAnalyser = ctx.createAnalyser();
    globalAnalyser.fftSize = 128;
    globalAnalyser.smoothingTimeConstant = 0.8;
  }
  return globalAnalyser;
}

/**
 * Decode Base64 linear 16-bit PCM into an AudioBuffer and play it with analyzer connection
 */
export function playPcmAudio(
  base64Pcm: string,
  sampleRate = 24000,
  onEnded?: () => void
): { stop: () => void } {
  try {
    const ctx = getAudioContext();
    const analyser = getGlobalAnalyser();

    // Stop any previous speech source
    if (currentSourceNode) {
      try {
        currentSourceNode.stop();
        currentSourceNode.disconnect();
      } catch (e) {
        // ignore
      }
      currentSourceNode = null;
    }

    const binaryString = atob(base64Pcm);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 16-bit signed PCM
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }

    const audioBuffer = ctx.createBuffer(1, float32.length, sampleRate);
    audioBuffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;

    // Connect source -> analyser -> destination
    source.connect(analyser);
    analyser.connect(ctx.destination);

    currentSourceNode = source;

    source.onended = () => {
      if (currentSourceNode === source) {
        currentSourceNode = null;
      }
      if (onEnded) onEnded();
    };

    source.start(0);

    return {
      stop: () => {
        try {
          source.stop();
          source.disconnect();
          if (currentSourceNode === source) {
            currentSourceNode = null;
          }
          if (onEnded) onEnded();
        } catch (e) {
          // ignore
        }
      },
    };
  } catch (err) {
    console.error('Error playing PCM audio:', err);
    if (onEnded) onEnded();
    return { stop: () => {} };
  }
}

export function stopCurrentAudio() {
  if (currentSourceNode) {
    try {
      currentSourceNode.stop();
      currentSourceNode.disconnect();
    } catch (e) {
      // ignore
    }
    currentSourceNode = null;
  }
}

/**
 * Converts Float32Array PCM samples (e.g. from ScriptProcessor or AudioWorklet)
 * into Base64 16-bit linear PCM at 16000Hz for Gemini Live API
 */
export function resamplePcm(
  float32Array: Float32Array,
  sourceSampleRate: number,
  targetSampleRate = 16000
): Float32Array {
  if (sourceSampleRate === targetSampleRate) {
    return float32Array;
  }
  const ratio = sourceSampleRate / targetSampleRate;
  const newLength = Math.round(float32Array.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const originIdx = i * ratio;
    const indexFloor = Math.floor(originIdx);
    const indexNext = Math.min(indexFloor + 1, float32Array.length - 1);
    const interp = originIdx - indexFloor;
    result[i] = float32Array[indexFloor] * (1 - interp) + float32Array[indexNext] * interp;
  }
  return result;
}

export function pcmFloat32ToBase64(float32Data: Float32Array): string {
  const int16Array = new Int16Array(float32Data.length);
  for (let i = 0; i < float32Data.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Data[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16Array.buffer, int16Array.byteOffset, int16Array.byteLength);
  let binary = '';
  const chunkSize = 0x4000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunkSize) as unknown as number[]
    );
  }
  return btoa(binary);
}

/**
 * Microphone audio recorder for discrete spoken turns (Gemini 3.5 Transcribe)
 */
export class VoiceRecorder {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private onDataAvailableCallback: ((blob: Blob) => void) | null = null;
  public isRecording = false;

  async start(): Promise<void> {
    this.chunks = [];
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const options = { mimeType: 'audio/webm' };
    if (!MediaRecorder.isTypeSupported('audio/webm')) {
      // Fallback
      this.mediaRecorder = new MediaRecorder(this.mediaStream);
    } else {
      this.mediaRecorder = new MediaRecorder(this.mediaStream, options);
    }

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.mediaRecorder.start(100);
    this.isRecording = true;
  }

  async stop(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || !this.isRecording) {
        resolve(new Blob());
        return;
      }

      this.mediaRecorder.onstop = () => {
        const fullBlob = new Blob(this.chunks, {
          type: this.mediaRecorder?.mimeType || 'audio/webm',
        });
        this.chunks = [];
        this.cleanup();
        resolve(fullBlob);
      };

      this.mediaRecorder.stop();
      this.isRecording = false;
    });
  }

  cancel(): void {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.isRecording = false;
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    this.mediaRecorder = null;
  }
}
