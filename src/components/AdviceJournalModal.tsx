import React from 'react';
import { X, BookOpen, Lightbulb, Heart, Quote } from 'lucide-react';
import { Message } from '../types';

interface AdviceJournalModalProps {
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
}

export const AdviceJournalModal: React.FC<AdviceJournalModalProps> = ({
  isOpen,
  onClose,
  messages,
}) => {
  if (!isOpen) return null;

  // Extract all messages with adviceHighlight
  const adviceList = messages.filter((m) => m.role === 'assistant' && !!m.adviceHighlight);

  // If no advice in current session yet, provide some of Tilly's favorite grounded Australian wisdom
  const defaultWisdom = [
    {
      id: 'default-1',
      title: "Taking things one day at a time",
      advice: "Don't try to boil the entire ocean before morning tea, mate. Do the next right thing with care, take a deep breath, and let the dust settle.",
      context: "Aussie perspective on stressful times",
      timestamp: Date.now() - 86400000 * 2,
    },
    {
      id: 'default-2',
      title: "Setting gentle boundaries",
      advice: "Saying 'no worries' to someone else shouldn't mean creating worries for yourself. Protect your peace like your favorite quiet beach spot.",
      context: "On people-pleasing and burnout",
      timestamp: Date.now() - 86400000,
    },
    {
      id: 'default-3',
      title: "Backing yourself",
      advice: "Give yourself a fair go! You've navigated tough bends in the road before, and you've got way more resilience in your bones than you give yourself credit for.",
      context: "On self-doubt and imposter syndrome",
      timestamp: Date.now() - 3600000 * 4,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs">
      <div className="relative w-full max-w-lg bg-white dark:bg-stone-900 rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 flex items-center justify-center text-amber-700 dark:text-amber-300">
              <BookOpen className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-white">
                Tilly's Thoughtful Advice Journal
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Pearls of wisdom & grounded advice from your chats
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="py-4 space-y-3.5 max-h-[60vh] overflow-y-auto pr-1">
          {adviceList.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2.5 flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5" />
                From Today's Conversation
              </h3>
              <div className="space-y-3">
                {adviceList.map((msg) => (
                  <div
                    key={msg.id}
                    className="p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50/50 dark:from-stone-800 dark:to-stone-800/80 border border-amber-200/80 dark:border-amber-800/60 shadow-xs relative"
                  >
                    <Quote className="w-6 h-6 text-amber-300 dark:text-amber-700/50 absolute top-3 right-3" />
                    <p className="text-xs text-stone-800 dark:text-stone-100 font-medium leading-relaxed italic pr-6">
                      "{msg.adviceHighlight}"
                    </p>
                    <div className="mt-2.5 flex items-center justify-between text-[11px] text-stone-600 dark:text-stone-400">
                      <span>Shared by Matilda</span>
                      <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Core Grounded Wisdom Cards */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400 mb-2.5 mt-2 flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5 text-rose-500" />
              Tilly's Guiding Principles
            </h3>
            <div className="space-y-3">
              {defaultWisdom.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/70 border border-stone-200/80 dark:border-stone-700/70 shadow-2xs"
                >
                  <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 block mb-1">
                    {item.title}
                  </span>
                  <p className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed">
                    "{item.advice}"
                  </p>
                  <span className="mt-2 block text-[10px] text-stone-400 italic">
                    {item.context}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-stone-200 dark:border-stone-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors shadow-xs"
          >
            Close Journal
          </button>
        </div>
      </div>
    </div>
  );
};
