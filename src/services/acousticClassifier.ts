// High-Specificity Acoustic & Physical Sound Event Classifier
// Detects: Physical Cough, Heavy Sigh, Throat Clearing, Laughter, and Claps
// Designed to prevent false-positives during normal conversational speech.

export type PhysicalSoundEvent = 'cough' | 'sigh' | 'throat_clear' | 'laughter' | 'clap';

export interface SoundClassification {
  event: PhysicalSoundEvent;
  confidence: number;
  durationMs: number;
  description: string;
}

interface FrameStats {
  timestamp: number;
  rms: number;
  peak: number;
  zcr: number; // Zero Crossing Rate (0.0 to 1.0)
  roughness: number;
  isVoiced: boolean; // Continuous speech vowel indicator
}

export class AcousticClassifier {
  private history: FrameStats[] = [];
  private maxHistoryFrames = 35; // ~4.5 seconds of audio frames
  private baselineRMS = 0.005;
  private lastSpeechTimestamp = 0;

  // Event cooldown timers to avoid rapid spamming
  private lastEventTimes: Record<PhysicalSoundEvent, number> = {
    cough: 0,
    sigh: 0,
    throat_clear: 0,
    laughter: 0,
    clap: 0,
  };

  // Burst tracking for transient cough events
  private burstStart: number | null = null;
  private burstPeakRMS = 0;
  private burstMaxPeak = 0;
  private burstAvgZCR = 0;
  private burstFramesCount = 0;

  /**
   * Process a single audio frame of Float32 PCM samples (typically 2048 samples at 16kHz).
   * Returns a SoundClassification if a distinct physical acoustic sound is detected.
   */
  processFrame(samples: Float32Array, sampleRate = 16000): SoundClassification | null {
    const len = samples.length;
    if (len === 0) return null;

    let sumSquares = 0;
    let peak = 0;
    let zeroCrossings = 0;
    let diffSum = 0;

    let prevSample = samples[0];
    for (let i = 0; i < len; i++) {
      const s = samples[i];
      const abs = Math.abs(s);
      if (abs > peak) peak = abs;
      sumSquares += s * s;

      // Zero-crossing check
      if ((s >= 0 && prevSample < 0) || (s < 0 && prevSample >= 0)) {
        zeroCrossings++;
      }

      diffSum += Math.abs(s - prevSample);
      prevSample = s;
    }

    const rms = Math.sqrt(sumSquares / len);
    const zcr = zeroCrossings / len;
    const roughness = sumSquares > 0 ? diffSum / (sumSquares * 200 + 1) : 0;

    // Voiced speech detection (normal human vowel speech has moderate RMS and low ZCR)
    const isVoiced = rms > 0.015 && zcr < 0.22;

    // Slowly adapt background noise baseline
    if (rms < this.baselineRMS * 2) {
      this.baselineRMS = this.baselineRMS * 0.95 + rms * 0.05;
    }

    const now = Date.now();
    if (isVoiced) {
      this.lastSpeechTimestamp = now;
    }

    const frame: FrameStats = {
      timestamp: now,
      rms,
      peak,
      zcr,
      roughness,
      isVoiced,
    };

    this.history.push(frame);
    if (this.history.length > this.maxHistoryFrames) {
      this.history.shift();
    }

    // Check for acoustic physical sounds:
    return (
      this.detectClap(frame, now) ||
      this.detectCoughOrThroatClear(frame, now) ||
      this.detectSigh(now) ||
      this.detectLaughter(now)
    );
  }

  /**
   * 1. Physical Clap Detection:
   * Requires sharp, loud physical hand clap transient (peak > 0.45, crest factor > 5.0)
   */
  private detectClap(frame: FrameStats, now: number): SoundClassification | null {
    if (now - this.lastEventTimes.clap < 2000) return null;

    const isLoudPeak = frame.peak > 0.45;
    const crestFactor = frame.peak / (this.baselineRMS + 0.002);
    const isImpulsive = crestFactor > 5.2 && frame.rms < frame.peak * 0.3;

    if (isLoudPeak && isImpulsive) {
      this.lastEventTimes.clap = now;
      return {
        event: 'clap',
        confidence: 0.98,
        durationMs: 40,
        description: 'Physical hand clap detected',
      };
    }
    return null;
  }

  /**
   * 2. Physical Cough & Throat Clear Detection:
   * A genuine cough is an explosive expulsive blast with:
   * - Very loud acoustic peak (peak > 0.42)
   * - High burst RMS (rms > 0.07)
   * - Strong glottal plosive crest factor (peak / rms > 3.6)
   * - Unvoiced broadband friction (ZCR > 0.22)
   * - Duration strictly 90ms - 380ms
   * Normal words ('cat', 'six', 'laugh') do NOT have this explosive pressure wave.
   */
  private detectCoughOrThroatClear(frame: FrameStats, now: number): SoundClassification | null {
    const isHighEnergy = frame.rms > 0.06 || frame.peak > 0.35;

    if (isHighEnergy) {
      if (this.burstStart === null) {
        this.burstStart = now;
        this.burstPeakRMS = frame.rms;
        this.burstMaxPeak = frame.peak;
        this.burstAvgZCR = frame.zcr;
        this.burstFramesCount = 1;
      } else {
        this.burstFramesCount++;
        if (frame.rms > this.burstPeakRMS) this.burstPeakRMS = frame.rms;
        if (frame.peak > this.burstMaxPeak) this.burstMaxPeak = frame.peak;
        this.burstAvgZCR =
          (this.burstAvgZCR * (this.burstFramesCount - 1) + frame.zcr) / this.burstFramesCount;
      }
      return null;
    }

    // Burst just ended and dropped into silence:
    if (this.burstStart !== null) {
      const duration = now - this.burstStart;
      const peakRMS = this.burstPeakRMS;
      const maxPeak = this.burstMaxPeak;
      const avgZCR = this.burstAvgZCR;

      this.burstStart = null;
      this.burstFramesCount = 0;

      // Strict Physical Cough criteria:
      // High peak amplitude (> 0.42), strong RMS (> 0.07), high friction ZCR (> 0.22), duration 90ms to 380ms
      const isExplosiveCough =
        duration >= 90 &&
        duration <= 380 &&
        maxPeak >= 0.42 &&
        peakRMS >= 0.07 &&
        avgZCR >= 0.22 &&
        maxPeak / (peakRMS + 0.001) >= 3.6;

      if (isExplosiveCough) {
        if (now - this.lastEventTimes.cough > 6000) {
          this.lastEventTimes.cough = now;
          return {
            event: 'cough',
            confidence: 0.96,
            durationMs: duration,
            description: `Physical cough detected (${duration}ms blast, peak ${maxPeak.toFixed(2)})`,
          };
        }
      }

      // Throat Clear criteria (scratchy glottal friction lasting 200-600ms):
      const isThroatClear =
        duration >= 200 &&
        duration <= 600 &&
        maxPeak >= 0.32 &&
        avgZCR >= 0.28 &&
        now - this.lastSpeechTimestamp > 600;

      if (isThroatClear) {
        if (now - this.lastEventTimes.throat_clear > 8000) {
          this.lastEventTimes.throat_clear = now;
          return {
            event: 'throat_clear',
            confidence: 0.9,
            durationMs: duration,
            description: `Throat clearing detected (${duration}ms)`,
          };
        }
      }
    }

    return null;
  }

  /**
   * 3. Physical Sigh Detection:
   * A sigh must NEVER be triggered by ordinary sentence volume decay.
   * Requires:
   * - No voiced speech in the last 1200ms
   * - Continuous soft exhalation lasting at least 1.0s to 2.4s
   * - Pure unvoiced white noise breath (RMS 0.015 - 0.045, peak < 0.12)
   */
  private detectSigh(now: number): SoundClassification | null {
    if (now - this.lastEventTimes.sigh < 8000) return null;
    if (now - this.lastSpeechTimestamp < 1500) return null; // Must not be immediately after speaking
    if (this.history.length < 12) return null;

    // Check last 10 frames (~1.3s)
    const recent = this.history.slice(-10);
    const allSoft = recent.every((f) => f.rms >= 0.012 && f.rms <= 0.048 && f.peak < 0.14);
    const allUnvoiced = recent.every((f) => !f.isVoiced && f.zcr >= 0.04 && f.zcr <= 0.18);

    if (allSoft && allUnvoiced) {
      const duration = recent[recent.length - 1].timestamp - recent[0].timestamp;
      if (duration >= 900) {
        this.lastEventTimes.sigh = now;
        return {
          event: 'sigh',
          confidence: 0.92,
          durationMs: duration,
          description: `Deep weary sigh detected (${duration}ms breath)`,
        };
      }
    }

    return null;
  }

  /**
   * 4. Physical Laughter / Chuckle Detection:
   * Must have AT LEAST 3 distinct staccato pulses ("ha ha ha")
   * with genuine inter-burst silence gaps (< 0.008 RMS) between each pulse!
   * Continuous speech without silent gaps will NEVER trigger this.
   */
  private detectLaughter(now: number): SoundClassification | null {
    if (now - this.lastEventTimes.laughter < 7000) return null;
    if (this.history.length < 14) return null;

    const recent = this.history.slice(-14);

    let burstCount = 0;
    let inBurst = false;
    let hasSilenceBetween = false;

    for (let i = 0; i < recent.length; i++) {
      const f = recent[i];
      if (f.rms > 0.038 && f.peak > 0.14) {
        if (!inBurst) {
          burstCount++;
          inBurst = true;
        }
      } else if (f.rms < 0.009) {
        if (inBurst) {
          hasSilenceBetween = true;
        }
        inBurst = false;
      }
    }

    // Must have at least 3 distinct staccato bursts AND clear dips into silence
    if (burstCount >= 3 && hasSilenceBetween) {
      this.lastEventTimes.laughter = now;
      return {
        event: 'laughter',
        confidence: 0.94,
        durationMs: 1200,
        description: 'Physical laughter / chuckle detected (staccato bursts)',
      };
    }

    return null;
  }

  reset() {
    this.history = [];
    this.burstStart = null;
    this.burstFramesCount = 0;
    this.lastSpeechTimestamp = 0;
  }
}
