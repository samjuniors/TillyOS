import React from 'react';
import { Brain, Sparkles, BookOpen, Settings, Radio } from 'lucide-react';
import { AussieSlangLevel } from '../types';

interface HeaderProps {
  memoryCount: number;
  isLiveMode: boolean;
  onToggleLiveMode: () => void;
  onOpenMemoryDrawer: () => void;
  onOpenAdviceJournal: () => void;
  onOpenSettings: () => void;
  slangLevel: AussieSlangLevel;
}

export const Header: React.FC<HeaderProps> = ({
  memoryCount,
  isLiveMode,
  onToggleLiveMode,
  onOpenMemoryDrawer,
  onOpenAdviceJournal,
  onOpenSettings,
  slangLevel,
}) => {
  return (
    <header className="w-full bg-white/80 dark:bg-stone-900/80 backdrop-blur-md border-b border-stone-200/80 dark:border-stone-800/80 sticky top-0 z-30 transition-colors">
      <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand / Companion Info */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 via-orange-400 to-rose-400 flex items-center justify-center text-white shadow-md shadow-orange-500/20 font-semibold text-lg">
            <span>🦘</span>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-bold text-stone-900 dark:text-white text-base tracking-tight flex items-center gap-1.5">
                Matilda <span className="text-xs font-normal text-amber-600 dark:text-amber-400 font-serif italic">"Tilly"</span>
              </h1>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
                Australian Friend
              </span>
            </div>
            <p className="text-[11px] text-stone-500 dark:text-stone-400 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              {isLiveMode ? 'Gemini 3.8 Live API Active' : 'Thoughtful Voice Agent & NLP Memory'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2">
          {/* Live API Mode Toggle */}
          <button
            onClick={onToggleLiveMode}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all shadow-xs ${
              isLiveMode
                ? 'bg-emerald-600 text-white shadow-emerald-500/20 ring-2 ring-emerald-400/50'
                : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 border border-stone-200 dark:border-stone-700'
            }`}
            title="Toggle between Real-time Gemini Live API and Voice Chat mode"
          >
            <Radio className={`w-3.5 h-3.5 ${isLiveMode ? 'animate-pulse text-white' : 'text-stone-500'}`} />
            <span className="hidden sm:inline">{isLiveMode ? 'Live API Active' : 'Switch to Live API'}</span>
            <span className="sm:hidden">{isLiveMode ? 'Live' : 'Live'}</span>
          </button>

          {/* Memory Bank Button */}
          <button
            onClick={onOpenMemoryDrawer}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800/50 transition-colors shadow-xs"
            title="View what Matilda remembers about you"
          >
            <Brain className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span className="hidden sm:inline">Memory Bank</span>
            <span className="bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
              {memoryCount}
            </span>
          </button>

          {/* Advice Journal Button */}
          <button
            onClick={onOpenAdviceJournal}
            className="p-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-700 transition-colors"
            title="Thoughtful Advice Journal"
          >
            <BookOpen className="w-4 h-4 text-orange-500" />
          </button>

          {/* Settings Button */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-700 transition-colors"
            title="Voice & Accent Settings"
          >
            <Settings className="w-4 h-4 text-stone-500" />
          </button>
        </div>
      </div>
    </header>
  );
};
