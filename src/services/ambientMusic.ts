// Procedural Web Audio Ambient Music Synthesizer for Matilda

import { getAudioContext } from './audioUtils';

class AmbientMusicEngine {
  private isRunning = false;
  private currentTrackName = 'Byron Bay Sunset Chords';
  private gainNode: GainNode | null = null;
  private intervalId: any = null;
  private noiseNode: AudioNode | null = null;
  private currentVolume = 0.35;

  init() {
    if (this.gainNode) return;
    const ctx = getAudioContext();
    this.gainNode = ctx.createGain();
    this.gainNode.gain.setValueAtTime(this.currentVolume, ctx.currentTime);
    this.gainNode.connect(ctx.destination);
  }

  play(trackName = 'Byron Bay Sunset Chords') {
    this.init();
    this.stop();

    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    this.currentTrackName = trackName;
    this.isRunning = true;

    if (trackName.toLowerCase().includes('ocean') || trackName.toLowerCase().includes('coastal') || trackName.toLowerCase().includes('wave')) {
      this.startOceanSoundscape();
    } else {
      this.startAcousticChords();
    }
  }

  private startAcousticChords() {
    const ctx = getAudioContext();
    if (!this.gainNode) return;

    // Warm pentatonic chord frequencies for relaxed Aussie acoustic vibe
    // E major / C#m / A / B chord voicings
    const chords = [
      [164.81, 207.65, 246.94, 329.63], // E
      [220.00, 277.18, 329.63, 440.00], // A
      [138.59, 164.81, 207.65, 277.18], // C#m
      [123.47, 185.00, 246.94, 369.99], // B
    ];

    let chordIndex = 0;

    const playChord = () => {
      if (!this.isRunning || !this.gainNode) return;
      const notes = chords[chordIndex % chords.length];
      chordIndex++;

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const noteGain = ctx.createGain();

        // Warm soft triangle/sine mix
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);

        // Stagger note arpeggiation slightly
        const startTime = ctx.currentTime + idx * 0.12;
        const duration = 4.2;

        noteGain.gain.setValueAtTime(0.0001, startTime);
        noteGain.gain.exponentialRampToValueAtTime(0.12, startTime + 0.3);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        osc.connect(noteGain);
        noteGain.connect(this.gainNode!);

        osc.start(startTime);
        osc.stop(startTime + duration + 0.5);
      });
    };

    playChord();
    this.intervalId = setInterval(playChord, 3800);
  }

  private startOceanSoundscape() {
    const ctx = getAudioContext();
    if (!this.gainNode) return;

    // Pink/white noise filtered for coastal ocean surf
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      output[i] = (b0 + b1 + b2) * 0.12;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, ctx.currentTime);

    // LFO for wave swelling
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.setValueAtTime(0.1, ctx.currentTime); // ~10 second ocean swell
    lfoGain.gain.setValueAtTime(280, ctx.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    whiteNoise.connect(filter);
    filter.connect(this.gainNode);

    lfo.start();
    whiteNoise.start();

    this.noiseNode = whiteNoise;
  }

  pause() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.noiseNode) {
      try {
        (this.noiseNode as any).stop();
      } catch (e) {}
      this.noiseNode = null;
    }
  }

  resume() {
    if (!this.isRunning) {
      this.play(this.currentTrackName);
    }
  }

  stop() {
    this.pause();
  }

  setVolume(vol: number) {
    this.currentVolume = Math.max(0, Math.min(1, vol));
    if (this.gainNode) {
      const ctx = getAudioContext();
      this.gainNode.gain.setValueAtTime(this.currentVolume, ctx.currentTime);
    }
  }

  getIsPlaying(): boolean {
    return this.isRunning;
  }

  getTrackName(): string {
    return this.currentTrackName;
  }
}

export const ambientMusic = new AmbientMusicEngine();
