import React, { useState, useEffect } from 'react';
import { Sparkles, Mic, ShieldCheck } from 'lucide-react';

interface BootScreenProps {
  isMicReady: boolean;
  onInitiateMic: () => void;
  onWakeSuccess: (trigger: 'clap' | 'wake_word') => void;
  audioLevel: number;
}

export const BootScreen: React.FC<BootScreenProps> = ({
  isMicReady,
  onInitiateMic,
  onWakeSuccess,
  audioLevel,
}) => {
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [detectedTrigger, setDetectedTrigger] = useState<string | null>(null);

  // Attempt auto-activation of mic on mount
  useEffect(() => {
    onInitiateMic();
  }, [onInitiateMic]);

  const triggerWake = (type: 'clap' | 'wake_word') => {
    if (isWakingUp) return;
    setIsWakingUp(true);
    setDetectedTrigger(type === 'clap' ? '👏 CLAP DETECTED!' : '🗣️ "HEY TILLY" DETECTED!');
    setTimeout(() => {
      onWakeSuccess(type);
    }, 700);
  };

  return (
    <div
      onClick={() => {
        // Tapping anywhere on the screen initiates mic and wakes immediately
        if (!isMicReady) {
          onInitiateMic();
        }
      }}
      className="fixed inset-0 z-50 bg-stone-950 text-stone-100 flex flex-col items-center justify-center p-6 select-none overflow-hidden font-sans cursor-pointer"
    >
      {/* Ambient background glow */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_45%,rgba(245,158,11,0.18),transparent_70%)]" />

      {/* Main Container */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-lg w-full">
        {/* Australian Companion Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-950/60 border border-amber-800/60 text-amber-300 text-xs font-semibold mb-6 shadow-md backdrop-blur-md">
          <span>🦘</span>
          <span>MATILDA // ACOUSTIC NEURAL ENTITY</span>
        </div>

        {/* Central Awakening Orb */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            // Direct click to awaken Matilda instantly!
            triggerWake('wake_word');
          }}
          className={`relative w-60 h-60 sm:w-72 sm:h-72 rounded-full flex items-center justify-center cursor-pointer transition-all duration-500 ${
            isWakingUp
              ? 'scale-110 ring-8 ring-amber-400 shadow-[0_0_100px_rgba(245,158,11,0.9)]'
              : 'ring-4 ring-amber-500/50 hover:ring-amber-400 hover:scale-105 shadow-[0_0_60px_rgba(234,112,60,0.4)]'
          }`}
          title="Click to Awaken Matilda Directly"
        >
          {/* Animated pulsing core */}
          <div
            className={`w-44 h-44 sm:w-52 sm:h-52 rounded-full transition-all duration-500 flex flex-col items-center justify-center ${
              isWakingUp
                ? 'bg-gradient-to-tr from-amber-400 via-orange-400 to-yellow-200 animate-pulse'
                : 'bg-gradient-to-tr from-amber-600 via-orange-500 to-rose-500 animate-pulse'
            }`}
          >
            {isWakingUp ? (
              <Sparkles className="w-16 h-16 text-stone-950 animate-spin" />
            ) : (
              <div className="flex flex-col items-center text-stone-950 font-bold">
                <span className="text-4xl animate-bounce mb-1">👏</span>
                <span className="text-xs uppercase tracking-wider text-stone-950 font-extrabold px-3 py-1 bg-white/70 rounded-full shadow-xs">
                  Say "Hey Tilly" or Clap
                </span>
                <span className="text-[10px] text-stone-900 mt-1 font-semibold">
                  (Or tap orb to enter)
                </span>
              </div>
            )}
          </div>

          {/* Sound reactive ripples */}
          <div
            className="absolute inset-0 rounded-full border-2 border-amber-400/60 pointer-events-none transition-transform duration-75"
            style={{
              transform: `scale(${1 + audioLevel * 0.45})`,
              opacity: 0.3 + audioLevel * 0.7,
            }}
          />
        </div>

        {/* Action / Trigger Banner */}
        <div className="mt-8 space-y-3 w-full">
          {isWakingUp ? (
            <div className="space-y-1 animate-in zoom-in-95 duration-200">
              <h2 className="text-xl font-bold text-amber-400 flex items-center justify-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                {detectedTrigger || 'AWAKENING MATILDA...'}
              </h2>
              <p className="text-xs text-amber-200">
                Live audio channel active • Connecting Australian female voice...
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-800/60 shadow-inner">
                <h2 className="text-lg font-bold text-amber-300 flex items-center justify-center gap-2">
                  <span>👏 CLAP OR SAY "HEY TILLY" / "HEY TILI"</span>
                </h2>
                <p className="text-xs text-stone-300 mt-1">
                  Listening for your voice or clap • Or click anywhere to awaken
                </p>
              </div>

              {/* Instant awaken button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  triggerWake('wake_word');
                }}
                className="w-full sm:w-auto px-8 py-3 rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-stone-950 font-extrabold text-sm tracking-wide shadow-xl shadow-orange-500/25 transition-all flex items-center justify-center gap-2 mx-auto cursor-pointer"
              >
                <Sparkles className="w-4 h-4 fill-current" />
                <span>Wake Up Matilda & Enter Live Chat</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="mt-6 text-[11px] text-stone-400 flex items-center gap-3">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Always-On Live Duplex Mic
          </span>
          <span>•</span>
          <span>Australian Accent</span>
          <span>•</span>
          <span>Clap & Voice Detection</span>
        </div>
      </div>
    </div>
  );
};
