import React, { useEffect, useRef } from 'react';
import { Heart, Sparkles, Radio, Globe } from 'lucide-react';
import * as d3 from 'd3';
import { getGlobalAnalyser } from '../services/audioUtils';

interface VoiceVisualizerProps {
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  isLiveActive?: boolean;
  isWakeFocused?: boolean;
  isSleeping?: boolean;
  emotion?: string;
  feelingsDescription?: string;
  userMood?: string;
  detectedAcoustics?: string[];
  subtitleText?: string;
  userLastUtterance?: string;
  activeLanguage?: string;
  isExplicitLanguage?: boolean;
  onClickOrb?: () => void;
}

interface LiquidParticle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseRadiusRatio: number;
  radius: number;
  angle: number;
  angularSpeed: number;
  targetDistance: number;
  currentDistance: number;
  opacity: number;
  size: number;
  colorMix: number;
  type: 'droplet' | 'bubble' | 'orbit';
  breatheOffset: number;
}

interface EmotionColors {
  primary: string;
  secondary: string;
  tertiary: string;
  core: string;
  glow: string;
  viscosity: number;
  turbulence: number;
  speed: number;
  pulseSpeed: number;
}

export const VoiceVisualizer: React.FC<VoiceVisualizerProps> = ({
  isListening,
  isSpeaking,
  isProcessing,
  isLiveActive,
  isWakeFocused,
  isSleeping,
  emotion = 'warm & caring',
  feelingsDescription,
  userMood,
  detectedAcoustics,
  subtitleText,
  userLastUtterance,
  activeLanguage = 'English',
  isExplicitLanguage = false,
  onClickOrb,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const clickRipplesRef = useRef<Array<{ x: number; y: number; r: number; maxR: number; opacity: number }>>([]);
  const smoothedAvgVolumeRef = useRef<number>(0);

  // Keep latest values in ref to avoid re-initializing D3 particle simulation on every minor prop change
  const stateRef = useRef({
    isListening,
    isSpeaking,
    isProcessing,
    isWakeFocused,
    isSleeping,
    emotion,
    detectedAcoustics,
  });

  useEffect(() => {
    stateRef.current = {
      isListening,
      isSpeaking,
      isProcessing,
      isWakeFocused,
      isSleeping,
      emotion,
      detectedAcoustics,
    };
  }, [
    isListening,
    isSpeaking,
    isProcessing,
    isWakeFocused,
    isSleeping,
    emotion,
    detectedAcoustics,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let analyser: AnalyserNode | null = null;
    try {
      analyser = getGlobalAnalyser();
    } catch (e) {}

    const bufferLength = analyser ? analyser.frequencyBinCount : 64;
    const frequencyData = new Uint8Array(bufferLength);

    // D3 Radial Spline Path Generator for Organic Liquid Membranes
    const radialSpline = d3
      .radialLine<[number, number]>()
      .angle((d) => d[0])
      .radius((d) => d[1])
      .curve(d3.curveBasisClosed)
      .context(ctx);

    // Initialize Liquid Particle Swarm
    // All particles and membranes pulse and deform strictly according to the audio agent (Matilda)'s voice!
    const numParticles = 64;
    const particles: LiquidParticle[] = [];
    for (let i = 0; i < numParticles; i++) {
      const angle = (i / numParticles) * Math.PI * 2 + Math.random() * 0.2;
      const typeRand = Math.random();
      const type: 'droplet' | 'bubble' | 'orbit' =
        typeRand < 0.6 ? 'droplet' : typeRand < 0.85 ? 'bubble' : 'orbit';

      particles.push({
        id: i,
        x: 0,
        y: 0,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        baseRadiusRatio: 0.85 + Math.random() * 0.55,
        radius: 1.5 + Math.random() * 3.5,
        angle,
        angularSpeed: (Math.random() * 0.012 + 0.005) * (Math.random() > 0.5 ? 1 : -1),
        targetDistance: 70 + Math.random() * 40,
        currentDistance: 70 + Math.random() * 40,
        opacity: 0.35 + Math.random() * 0.6,
        size: 1.8 + Math.random() * 3.0,
        colorMix: Math.random(),
        type,
        breatheOffset: Math.random() * Math.PI * 2,
      });
    }

    // Color Interpolation References for smooth transitions between emotions
    let currentPrimary = '#EA580C';
    let currentSecondary = '#F59E0B';
    let currentTertiary = '#FBBF24';
    let currentCore = '#FFFBEB';
    let currentGlow = 'rgba(245, 158, 11, 0.45)';

    let phase = 0;
    let lastTime = performance.now();

    // Emotion Resolver function returns color palette and fluid physical parameters
    const getEmotionConfig = (emotionStr: string, hasCough: boolean): EmotionColors => {
      const e = (emotionStr || '').toLowerCase();

      if (hasCough || e.includes('concern') || e.includes('unwell') || e.includes('crook') || e.includes('caring')) {
        return {
          primary: '#059669', // Healing eucalyptus emerald
          secondary: '#10B981',
          tertiary: '#34D399',
          core: '#D1FAE5',
          glow: 'rgba(16, 185, 129, 0.55)',
          viscosity: 0.92,
          turbulence: 0.85,
          speed: 0.85,
          pulseSpeed: 1.1,
        };
      }
      if (e.includes('sigh') || e.includes('gentle') || e.includes('empath') || e.includes('weary') || e.includes('calm')) {
        return {
          primary: '#7C3AED', // Twilight violet and deep empathetic teal
          secondary: '#0D9488',
          tertiary: '#818CF8',
          core: '#EDE9FE',
          glow: 'rgba(124, 58, 237, 0.5)',
          viscosity: 0.94,
          turbulence: 0.75,
          speed: 0.75,
          pulseSpeed: 0.9,
        };
      }
      if (e.includes('joy') || e.includes('laugh') || e.includes('playful') || e.includes('happy') || e.includes('chuckle')) {
        return {
          primary: '#EA580C', // Effervescent golden sun and bright champagne
          secondary: '#F59E0B',
          tertiary: '#FBBF24',
          core: '#FEF9C3',
          glow: 'rgba(251, 191, 36, 0.65)',
          viscosity: 0.82,
          turbulence: 1.45,
          speed: 1.5,
          pulseSpeed: 1.6,
        };
      }
      if (e.includes('tender') || e.includes('love') || e.includes('heart') || e.includes('touch') || e.includes('mate')) {
        return {
          primary: '#E11D48', // Warm coral rose & heartbeat glow
          secondary: '#FB7185',
          tertiary: '#F43F5E',
          core: '#FFE4E6',
          glow: 'rgba(244, 63, 94, 0.55)',
          viscosity: 0.88,
          turbulence: 0.95,
          speed: 1.1,
          pulseSpeed: 1.25,
        };
      }
      if (e.includes('think') || e.includes('curious') || e.includes('reflect')) {
        return {
          primary: '#9333EA', // Curious cosmic amethyst
          secondary: '#A855F7',
          tertiary: '#C084FC',
          core: '#F3E8FF',
          glow: 'rgba(147, 51, 234, 0.5)',
          viscosity: 0.9,
          turbulence: 1.1,
          speed: 1.0,
          pulseSpeed: 1.0,
        };
      }

      // Default: Matilda's signature warm Aussie sunshine
      return {
        primary: '#EA580C',
        secondary: '#F59E0B',
        tertiary: '#FBBF24',
        core: '#FEF3C7',
        glow: 'rgba(245, 158, 11, 0.5)',
        viscosity: 0.88,
        turbulence: 1.0,
        speed: 1.0,
        pulseSpeed: 1.0,
      };
    };

    const render = (time: number) => {
      const dt = Math.min(0.05, (time - lastTime) / 1000);
      lastTime = time;

      const {
        isListening: listening,
        isSpeaking: speaking,
        isProcessing: processing,
        isWakeFocused: wakeFocused,
        isSleeping: sleeping,
        emotion: currentEmotionName,
        detectedAcoustics: acoustics,
      } = stateRef.current;

      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;

      // Matilda (audio agent) speech volume from Web Audio FFT
      // The visualizer reactions and particle motion are governed EXCLUSIVELY by Matilda's voice and emotion!
      let instantVolume = 0;
      if (analyser && speaking) {
        analyser.getByteFrequencyData(frequencyData);
        let sum = 0;
        const binsToRead = Math.min(bufferLength, 32);
        for (let i = 0; i < binsToRead; i++) {
          sum += frequencyData[i];
        }
        instantVolume = sum / binsToRead / 255;
      }
      smoothedAvgVolumeRef.current +=
        (instantVolume - smoothedAvgVolumeRef.current) * (instantVolume > smoothedAvgVolumeRef.current ? 0.45 : 0.12);
      const tillyVolume = smoothedAvgVolumeRef.current;

      const hasCough = (acoustics || []).some((c) => c.toLowerCase().includes('cough'));
      const emotionCfg = getEmotionConfig(currentEmotionName, hasCough);

      // Smoothly morph color palette using D3 RGB interpolator
      const colorLerp = 0.06;
      currentPrimary = d3.interpolateRgb(currentPrimary, emotionCfg.primary)(colorLerp);
      currentSecondary = d3.interpolateRgb(currentSecondary, emotionCfg.secondary)(colorLerp);
      currentTertiary = d3.interpolateRgb(currentTertiary, emotionCfg.tertiary)(colorLerp);
      currentCore = d3.interpolateRgb(currentCore, emotionCfg.core)(colorLerp);

      // Phase progression modulated by Matilda's speech and emotion
      const speedMultiplier = sleeping
        ? 0.3
        : (speaking ? 1.4 + tillyVolume * 2.5 : 1.0) * emotionCfg.speed;
      phase += dt * 2.2 * speedMultiplier;

      // Clear canvas with subtle radial depth
      ctx.clearRect(0, 0, width, height);

      // Base radius calculation reacting to Matilda's voice and status
      let baseRadius = 66;
      if (speaking) {
        baseRadius = 66 + tillyVolume * 45;
      } else if (wakeFocused) {
        baseRadius = 72 + Math.sin(phase * 3.0) * 5;
      } else if (listening) {
        baseRadius = 66 + Math.sin(phase * 2.0) * 3;
      } else if (processing) {
        baseRadius = 64 + Math.sin(phase * 4.0) * 4;
      } else if (sleeping) {
        baseRadius = 54 + Math.sin(phase * 1.2) * 3;
      } else {
        baseRadius = 64 + Math.sin(phase * 1.8) * 3;
      }

      // -------------------------------------------------------------
      // 1. D3 AMBIENT OUTER LIQUID GLOW & CORONA
      // -------------------------------------------------------------
      const outerGlowRadius = baseRadius * (1.85 + (speaking ? tillyVolume * 0.5 : 0));
      const corona = ctx.createRadialGradient(
        centerX,
        centerY,
        baseRadius * 0.25,
        centerX,
        centerY,
        outerGlowRadius
      );

      corona.addColorStop(0, emotionCfg.glow);
      corona.addColorStop(0.6, d3.interpolateRgb(currentSecondary, 'rgba(0,0,0,0)')(0.6));
      corona.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.save();
      ctx.fillStyle = corona;
      ctx.beginPath();
      ctx.arc(centerX, centerY, outerGlowRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // -------------------------------------------------------------
      // 2. D3 MULTI-LAYERED LIQUID MEMBRANES (Radial Splines)
      // -------------------------------------------------------------
      const numPoints = 36;
      const numMembranes = 3;

      // Concentric fluid gelatinous membranes that deform dynamically when Matilda speaks!
      for (let m = numMembranes - 1; m >= 0; m--) {
        const membraneOffset = m * 6;
        const membraneRadius = baseRadius - membraneOffset;
        const radialPoints: [number, number][] = [];

        for (let i = 0; i < numPoints; i++) {
          const angle = (i / numPoints) * Math.PI * 2;

          // Multi-harmonic fluid wave mathematics
          const wave1 = Math.sin(angle * 3 + phase * 1.1 + m * 0.8);
          const wave2 = Math.cos(angle * 5 - phase * 0.9 + m * 0.5);
          const wave3 = Math.sin(angle * 7 + phase * 2.2);

          // Liquid distortion responds to Matilda's voice FFT volume and emotion turbulence:
          const voiceDeform = speaking ? (12 + tillyVolume * 32) : 0;
          const baseTurbulence = wakeFocused ? 6 : listening ? 4 : sleeping ? 1.5 : 3;
          const totalDeform = (baseTurbulence + voiceDeform) * emotionCfg.turbulence;

          const r =
            membraneRadius +
            wave1 * (totalDeform * 0.55) +
            wave2 * (totalDeform * 0.3) +
            wave3 * (totalDeform * 0.15);

          radialPoints.push([angle, Math.max(10, r)]);
        }

        ctx.save();
        ctx.translate(centerX, centerY);

        ctx.beginPath();
        radialSpline(radialPoints);
        ctx.closePath();

        // Membrane chromatic gradient
        const membraneGrad = ctx.createLinearGradient(
          -membraneRadius,
          -membraneRadius,
          membraneRadius,
          membraneRadius
        );

        if (m === 0) {
          // Inner core body
          membraneGrad.addColorStop(0, currentPrimary);
          membraneGrad.addColorStop(0.5, currentSecondary);
          membraneGrad.addColorStop(1, currentTertiary);
          ctx.fillStyle = membraneGrad;
          ctx.globalAlpha = 0.92;
        } else if (m === 1) {
          // Middle viscous sheath
          membraneGrad.addColorStop(0, currentSecondary);
          membraneGrad.addColorStop(1, currentTertiary);
          ctx.fillStyle = membraneGrad;
          ctx.globalAlpha = 0.45;
        } else {
          // Outer fluid sheen
          membraneGrad.addColorStop(0, currentTertiary);
          membraneGrad.addColorStop(1, currentPrimary);
          ctx.fillStyle = membraneGrad;
          ctx.globalAlpha = 0.25;
        }

        ctx.fill();

        // Fluid membrane contour stroke
        ctx.strokeStyle = m === 0 ? currentSecondary : currentTertiary;
        ctx.lineWidth = m === 0 ? 2.2 : 1.2;
        ctx.globalAlpha = m === 0 ? 0.85 : 0.4;
        ctx.stroke();

        ctx.restore();
      }

      // -------------------------------------------------------------
      // 3. INNER CHROMATIC LIQUID NUCLEUS & LIGHT CAUSTIC
      // -------------------------------------------------------------
      const nucleusRadius = baseRadius * 0.68;
      const nucleusGrad = ctx.createRadialGradient(
        centerX - nucleusRadius * 0.35,
        centerY - nucleusRadius * 0.35,
        nucleusRadius * 0.05,
        centerX,
        centerY,
        nucleusRadius
      );
      nucleusGrad.addColorStop(0, currentCore);
      nucleusGrad.addColorStop(0.35, currentSecondary);
      nucleusGrad.addColorStop(0.85, currentPrimary);
      nucleusGrad.addColorStop(1, d3.interpolateRgb(currentPrimary, '#000000')(0.25));

      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, nucleusRadius, 0, Math.PI * 2);
      ctx.fillStyle = nucleusGrad;
      ctx.shadowColor = currentSecondary;
      ctx.shadowBlur = wakeFocused ? 28 : 18;
      ctx.fill();
      ctx.restore();

      // Liquid Specular Highlight (Viscous Gloss Reflection)
      ctx.save();
      ctx.beginPath();
      const highlightX = centerX - nucleusRadius * 0.32;
      const highlightY = centerY - nucleusRadius * 0.38;
      ctx.ellipse(highlightX, highlightY, nucleusRadius * 0.28, nucleusRadius * 0.14, -Math.PI / 4, 0, Math.PI * 2);
      const specGrad = ctx.createLinearGradient(
        highlightX - 10,
        highlightY - 10,
        highlightX + 10,
        highlightY + 10
      );
      specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
      specGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = specGrad;
      ctx.fill();
      ctx.restore();

      // -------------------------------------------------------------
      // 4. D3 DYNAMIC LIQUID PARTICLE SIMULATION (Droplets & Bubbles)
      // -------------------------------------------------------------
      // Particles swirl, orbit, pulse and expand exclusively based on Matilda's voice
      ctx.save();

      const filamentMaxDist = 26 + (speaking ? tillyVolume * 22 : 0);

      particles.forEach((p, idx) => {
        // Swirl around center modulated by Matilda's speech intensity
        p.angle += p.angularSpeed * emotionCfg.speed * (speaking ? 1.6 + tillyVolume * 2.0 : 1.0);

        // Target orbital distance fluctuates with fluid surface tension and Matilda's voice
        const breathe = Math.sin(phase * 1.5 + p.breatheOffset) * 6;
        const voiceExpansion = speaking ? tillyVolume * 28 * p.baseRadiusRatio : 0;
        const targetD = baseRadius * p.baseRadiusRatio + breathe + voiceExpansion;

        // Radial spring force pulling toward fluid equilibrium
        const springForce = (targetD - p.currentDistance) * 0.08;
        p.currentDistance += springForce;

        // Cartesian coordinates
        const px = centerX + Math.cos(p.angle) * p.currentDistance + p.vx;
        const py = centerY + Math.sin(p.angle) * p.currentDistance + p.vy;
        p.x = px;
        p.y = py;

        // Viscosity drag
        p.vx *= emotionCfg.viscosity;
        p.vy *= emotionCfg.viscosity;

        // Particle size reacts to Matilda's voice
        const dynamicSize = p.size * (1 + (speaking ? tillyVolume * 1.2 : 0));

        // Particle color: blend between secondary and tertiary colors
        const pColor = d3.interpolateRgb(currentSecondary, currentTertiary)(p.colorMix);

        // Render droplet / bubble
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.8, dynamicSize), 0, Math.PI * 2);
        ctx.fillStyle = pColor;
        ctx.globalAlpha = Math.min(1.0, p.opacity * (speaking ? 1.2 : 1.0));
        ctx.fill();

        // Effervescent bubble rim
        if (p.type === 'bubble') {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }

        // Liquid Filaments (Viscous bridges between close neighboring droplets)
        for (let j = idx + 1; j < Math.min(idx + 5, particles.length); j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.hypot(dx, dy);

          if (dist < filamentMaxDist) {
            const bridgeAlpha = (1 - dist / filamentMaxDist) * 0.35;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = pColor;
            ctx.globalAlpha = bridgeAlpha;
            ctx.lineWidth = Math.max(0.5, 2.0 * (1 - dist / filamentMaxDist));
            ctx.stroke();
          }
        }
      });

      ctx.restore();

      // -------------------------------------------------------------
      // 5. CLICK / TAP INTERACTIVE LIQUID SPLASH RIPPLES
      // -------------------------------------------------------------
      if (clickRipplesRef.current.length > 0) {
        ctx.save();
        clickRipplesRef.current.forEach((ripple) => {
          ripple.r += dt * 140;
          ripple.opacity -= dt * 1.2;

          ctx.beginPath();
          ctx.arc(ripple.x, ripple.y, ripple.r, 0, Math.PI * 2);
          ctx.strokeStyle = currentTertiary;
          ctx.lineWidth = 2.2 * (ripple.opacity / 1.0);
          ctx.globalAlpha = Math.max(0, ripple.opacity);
          ctx.stroke();
        });
        clickRipplesRef.current = clickRipplesRef.current.filter((r) => r.opacity > 0);
        ctx.restore();
      }

      // -------------------------------------------------------------
      // 6. WAKE FOCUSED REACTION RING
      // -------------------------------------------------------------
      if (wakeFocused) {
        ctx.save();
        const focusRing = baseRadius * 1.22 + ((phase * 42) % 65);
        ctx.beginPath();
        ctx.arc(centerX, centerY, focusRing, 0, Math.PI * 2);
        ctx.strokeStyle = currentTertiary;
        ctx.lineWidth = 2.0;
        ctx.globalAlpha = Math.max(0, 0.7 - ((phase * 42) % 65) / 65);
        ctx.stroke();
        ctx.restore();
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (canvas.height / rect.height);
      clickRipplesRef.current.push({
        x,
        y,
        r: 10,
        maxR: 90,
        opacity: 0.9,
      });
    }
    onClickOrb?.();
  };

  const hasCough = (detectedAcoustics || []).some((c) => c.toLowerCase().includes('cough'));
  const hasSigh = (detectedAcoustics || []).some((c) => c.toLowerCase().includes('sigh'));
  const hasLaugh = (detectedAcoustics || []).some((c) => c.toLowerCase().includes('laugh') || c.toLowerCase().includes('chuckle'));
  const hasThroatClear = (detectedAcoustics || []).some((c) => c.toLowerCase().includes('throat'));

  return (
    <div className="flex flex-col items-center justify-center select-none w-full max-w-2xl mx-auto px-4">
      {/* Animated Organic Liquid Shape */}
      <div
        onClick={handleCanvasClick}
        className={`relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center cursor-pointer transition-all duration-500 hover:scale-105 active:scale-95 rounded-full ${
          isWakeFocused
            ? 'ring-8 ring-amber-400/40 shadow-2xl shadow-amber-500/30'
            : isSpeaking
            ? 'ring-6 ring-amber-400/30 shadow-xl'
            : isListening
            ? 'ring-6 ring-teal-400/30 shadow-xl'
            : ''
        }`}
        title="Matilda Liquid Entity - Click to interact or wake"
      >
        <canvas
          ref={canvasRef}
          width={320}
          height={320}
          className="w-full h-full drop-shadow-2xl"
        />

        {/* Live / Status Pill in Center or Corner */}
        {isLiveActive && (
          <div className="absolute top-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-500/90 text-white shadow-md backdrop-blur-xs flex items-center gap-1">
            <Radio className="w-3 h-3 animate-pulse" />
            <span>LIVE API</span>
          </div>
        )}
      </div>

      {/* Focus & State Banner Directly Below Shape */}
      <div className="mt-4 text-center w-full">
        {isWakeFocused ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-400/60 text-amber-300 font-semibold text-xs animate-pulse shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Awake & Focused on you • Listening, mate...</span>
          </div>
        ) : isListening ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/20 border border-teal-400/60 text-teal-300 font-semibold text-xs shadow-sm">
            <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping"></span>
            <span>Listening to your voice & sounds...</span>
          </div>
        ) : isSpeaking ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/60 text-amber-300 font-semibold text-xs shadow-sm">
            <span>Matilda speaking with Aussie warmth...</span>
          </div>
        ) : isProcessing ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/60 text-purple-300 font-semibold text-xs shadow-sm">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce"></span>
            <span>Thinking & tuning into your feelings...</span>
          </div>
        ) : isSleeping ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-stone-800/80 border border-stone-700 text-stone-400 text-xs">
            <span>Ambient Standby • Say "Hey Tilly" to wake</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-stone-800/80 border border-stone-700 text-stone-300 text-xs">
            <span>Ready • Say "Hey Tilly" or tap to talk</span>
          </div>
        )}
      </div>

      {/* Subtitles & Spoken Dialogue Display */}
      <div className="mt-5 w-full min-h-[110px] flex flex-col items-center justify-center text-center px-4">
        {userLastUtterance && (
          <p className="text-xs text-stone-400 font-medium italic mb-1.5 max-w-lg line-clamp-1">
            You: "{userLastUtterance}"
          </p>
        )}

        <div className="text-base sm:text-lg font-medium text-stone-100 max-w-xl leading-relaxed tracking-wide transition-all duration-300 animate-in fade-in">
          {subtitleText ? (
            <span>"{subtitleText}"</span>
          ) : (
            <span className="text-stone-500 italic text-sm">
              "G'day mate! I'm listening. Ask me anything, tell me to play music, search the web, or just talk..."
            </span>
          )}
        </div>

        {/* Heart & Feeling Indicator */}
        {feelingsDescription && (
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-rose-950/40 border border-rose-900/50 text-[11px] text-rose-300">
            <Heart className="w-3 h-3 text-rose-400 fill-rose-400" />
            <span className="font-semibold text-rose-400">Tilly's Heart:</span>
            <span className="italic truncate max-w-xs sm:max-w-md">{feelingsDescription}</span>
          </div>
        )}

        {/* Live Conversation Language Indicator */}
        {activeLanguage && (
          <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-stone-800/80 border border-stone-700 text-[11px] text-stone-300 shadow-xs animate-in fade-in">
            <Globe className="w-3 h-3 text-amber-400" />
            <span className="font-semibold text-amber-300">{activeLanguage}</span>
            <span className="text-[10px] text-stone-400 font-normal">
              {isExplicitLanguage ? '• Explicitly Set' : '• Auto-tracking your speech'}
            </span>
          </div>
        )}

        {/* Acoustic Badges (Auto-dismissed so they don't linger) */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
          {hasCough && (
            <span className="px-2 py-0.5 rounded-md bg-emerald-950/80 text-emerald-300 border border-emerald-800 text-[10px] font-semibold flex items-center gap-1 animate-in fade-in">
              <span>😷</span> Cough Heard • Checking on you
            </span>
          )}
          {hasSigh && (
            <span className="px-2 py-0.5 rounded-md bg-sky-950/80 text-sky-300 border border-sky-800 text-[10px] font-semibold flex items-center gap-1 animate-in fade-in">
              <span>😮‍💨</span> Deep Sigh Heard
            </span>
          )}
          {hasLaugh && (
            <span className="px-2 py-0.5 rounded-md bg-amber-950/80 text-amber-300 border border-amber-800 text-[10px] font-semibold flex items-center gap-1 animate-in fade-in">
              <span>😂</span> Laughter Shared
            </span>
          )}
          {hasThroatClear && (
            <span className="px-2 py-0.5 rounded-md bg-amber-950/80 text-amber-300 border border-amber-800 text-[10px] font-semibold flex items-center gap-1 animate-in fade-in">
              <span>🫁</span> Throat Cleared
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
