import React, { useRef, useEffect } from 'react';
import { Volume2, VolumeX, Sparkles, Brain, Lightbulb, Heart, Activity } from 'lucide-react';
import { Message } from '../types';

interface ConversationViewProps {
  messages: Message[];
  playingMessageId: string | null;
  onPlayAudio: (message: Message) => void;
  onStopAudio: () => void;
  onSelectStarter: (text: string) => void;
  isProcessing: boolean;
}

const STARTER_PROMPTS = [
  { text: "G'day Tilly! [coughs] feeling a bit crook today...", label: "😷 Cough & Unwell", desc: "Hear Tilly react with genuine concern & care" },
  { text: "[sighs deeply] Just having one of those exhausting days...", label: "😮‍💨 Heavy Sigh", desc: "Hear Tilly notice your deep sigh & hold space" },
  { text: "[laughs] You won't believe what happened today, Tilly!", label: "😂 Share a Laugh", desc: "Hear Tilly light up & chuckle with you" },
  { text: "I need some honest advice on a tricky situation.", label: "💡 Grounded Advice", desc: "Hear thoughtful Australian wisdom" },
];

export const ConversationView: React.FC<ConversationViewProps> = ({
  messages,
  playingMessageId,
  onPlayAudio,
  onStopAudio,
  onSelectStarter,
  isProcessing,
}) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800/60 flex items-center justify-center text-3xl mb-4 shadow-inner">
          ☕
        </div>
        <h2 className="text-xl font-bold text-stone-900 dark:text-white mb-2">
          "Pull up a chair, mate. Good to see you."
        </h2>
        <p className="text-sm text-stone-600 dark:text-stone-300 mb-6 leading-relaxed">
          I'm Matilda—your warm, thoughtful Aussie confidante. Talk to me like you would an old friend.
          I don't just hear your words—I feel your emotions, hear coughs or sighs, and always have an honest, comforting ear ready.
        </p>

        <div className="w-full space-y-2">
          <p className="text-xs uppercase tracking-wider font-semibold text-stone-600 dark:text-stone-400 mb-1">
            Tap a quick topic or test non-speech emotional reactions:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {STARTER_PROMPTS.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => onSelectStarter(prompt.text)}
                className="text-left p-3 rounded-xl bg-white dark:bg-stone-800/90 border border-stone-200 dark:border-stone-700/80 hover:border-amber-400 dark:hover:border-amber-600/80 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 text-xs text-stone-700 dark:text-stone-200 transition-all shadow-xs group"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    {prompt.label}
                  </span>
                  <span className="text-[11px] text-stone-500 dark:text-stone-400 line-clamp-1">{prompt.desc}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-3xl mx-auto w-full">
      {messages.map((msg) => {
        const isUser = msg.role === 'user';
        const isCurrentlyPlaying = playingMessageId === msg.id;

        // Check for acoustic markers in text
        const hasCough = msg.text.toLowerCase().includes('[cough') || (msg.detectedAcoustics || []).some(a => a.includes('cough'));
        const hasSigh = msg.text.toLowerCase().includes('[sigh') || (msg.detectedAcoustics || []).some(a => a.includes('sigh'));
        const hasLaugh = msg.text.toLowerCase().includes('[laugh') || (msg.detectedAcoustics || []).some(a => a.includes('laugh') || a.includes('chuckle'));
        const hasYawn = msg.text.toLowerCase().includes('[yawn') || (msg.detectedAcoustics || []).some(a => a.includes('yawn'));
        const hasSniffle = msg.text.toLowerCase().includes('[sniff') || (msg.detectedAcoustics || []).some(a => a.includes('sniff'));

        return (
          <div
            key={msg.id}
            className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} transition-all`}
          >
            {/* Sender tag & emotional badges */}
            <div className="flex items-center space-x-1.5 mb-1 px-1">
              <span className="text-[11px] font-semibold text-stone-600 dark:text-stone-300">
                {isUser ? 'You' : 'Matilda (Tilly)'}
              </span>
              {!isUser && msg.emotion && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 font-medium flex items-center gap-1">
                  <Heart className="w-2.5 h-2.5 text-rose-500 fill-rose-500" />
                  {msg.emotion}
                </span>
              )}
              {isUser && hasCough && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 font-medium">
                  😷 Cough Heard
                </span>
              )}
              {isUser && hasSigh && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-sky-100 dark:bg-sky-950/70 text-sky-800 dark:text-sky-300 font-medium">
                  😮‍💨 Sigh Heard
                </span>
              )}
              {isUser && hasLaugh && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 font-medium">
                  😂 Laughter Heard
                </span>
              )}
            </div>

            {/* Bubble */}
            <div
              className={`relative max-w-[88%] sm:max-w-[78%] rounded-2xl p-4 shadow-xs text-sm leading-relaxed ${
                isUser
                  ? 'bg-amber-600 text-white rounded-br-xs'
                  : 'bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 border border-stone-200/80 dark:border-stone-700/80 rounded-bl-xs'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.text}</p>

              {/* Heart-to-Heart Feeling Card for Tilly's Turns */}
              {!isUser && msg.feelingsDescription && (
                <div className="mt-3 p-2.5 rounded-xl bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/40 flex items-start gap-2 text-xs text-rose-900 dark:text-rose-200">
                  <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500 shrink-0 mt-0.5 animate-pulse" />
                  <div>
                    <span className="font-semibold block text-[10px] uppercase tracking-wider text-rose-700 dark:text-rose-400">
                      Tilly's Feelings In This Moment
                    </span>
                    <span className="italic leading-snug">"{msg.feelingsDescription}"</span>
                  </div>
                </div>
              )}

              {/* Advice Highlight Card */}
              {!isUser && msg.adviceHighlight && (
                <div className="mt-2.5 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
                  <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block text-[11px] uppercase tracking-wider text-amber-700 dark:text-amber-300">
                      Tilly's Thoughtful Advice
                    </span>
                    <span>"{msg.adviceHighlight}"</span>
                  </div>
                </div>
              )}

              {/* Newly Learned Memory Pills */}
              {!isUser && msg.newMemories && msg.newMemories.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-stone-100 dark:border-stone-700/60 flex flex-wrap gap-1.5 items-center">
                  <span className="text-[10px] text-stone-600 dark:text-stone-300 flex items-center gap-1 font-medium">
                    <Brain className="w-3 h-3 text-amber-500" />
                    Remembered:
                  </span>
                  {msg.newMemories.map((mem, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
                    >
                      {mem.fact}
                    </span>
                  ))}
                </div>
              )}

              {/* Audio replay button for Matilda's turns */}
              {!isUser && (
                <div className="mt-2 flex items-center justify-end pt-1">
                  <button
                    onClick={() => (isCurrentlyPlaying ? onStopAudio() : onPlayAudio(msg))}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      isCurrentlyPlaying
                        ? 'bg-amber-500 text-white shadow-xs animate-pulse'
                        : 'text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700/60'
                    }`}
                    title={isCurrentlyPlaying ? 'Stop playback' : 'Listen in Australian voice'}
                  >
                    {isCurrentlyPlaying ? (
                      <>
                        <VolumeX className="w-3.5 h-3.5" />
                        <span>Speaking...</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Replay Voice</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Typing / Thinking indicator */}
      {isProcessing && (
        <div className="flex flex-col items-start">
          <div className="flex items-center space-x-1.5 mb-1 px-1">
            <span className="text-[11px] font-semibold text-stone-600 dark:text-stone-300">
              Matilda (Tilly)
            </span>
          </div>
          <div className="rounded-2xl rounded-bl-xs p-3.5 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 shadow-xs flex items-center space-x-2">
            <div className="flex space-x-1">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs text-stone-500 dark:text-stone-400 italic">
              Listening to your feelings & voice...
            </span>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
