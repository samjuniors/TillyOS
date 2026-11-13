import React, { useState } from 'react';
import { X, Settings, Volume2, User, Sparkles, Check, Globe } from 'lucide-react';
import { PersonaSettings, AussieSlangLevel } from '../types';
import { fetchTTSAudio } from '../services/api';
import { playPcmAudio } from '../services/audioUtils';

interface PersonaSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: PersonaSettings;
  onUpdateSettings: (newSettings: Partial<PersonaSettings>) => void;
}

const LANGUAGE_OPTIONS = [
  { id: 'auto', label: '🌐 Auto-Detect (Match whatever language I speak)' },
  { id: 'English', label: '🇦🇺 English (Australian)' },
  { id: 'Spanish', label: '🇪🇸 Spanish (Español)' },
  { id: 'French', label: '🇫🇷 French (Français)' },
  { id: 'German', label: '🇩🇪 German (Deutsch)' },
  { id: 'Hindi', label: '🇮🇳 Hindi (हिन्दी)' },
  { id: 'Italian', label: '🇮🇹 Italian (Italiano)' },
  { id: 'Japanese', label: '🇯🇵 Japanese (日本語)' },
  { id: 'Mandarin Chinese', label: '🇨🇳 Mandarin (中文)' },
  { id: 'Portuguese', label: '🇧🇷 Portuguese (Português)' },
  { id: 'Arabic', label: '🇸🇦 Arabic (العربية)' },
];

const SLANG_OPTIONS: { id: AussieSlangLevel; title: string; desc: string; sample: string }[] = [
  {
    id: 'gentle',
    title: 'Gentle Aussie',
    desc: 'Soft, melodic Australian warmth with gentle idioms and deep care.',
    sample: '"G\'day, lovely to catch up. How are you holding up today?"',
  },
  {
    id: 'everyday',
    title: 'Everyday Mate (Recommended)',
    desc: 'Down-to-earth, natural Australian female banter with relaxed warmth.',
    sample: '"G\'day mate! No worries at all, I reckon we can figure this out together."',
  },
  {
    id: 'true_blue',
    title: 'True Blue',
    desc: 'Spirited, colloquial Aussie phrases with hearty and genuine affection.',
    sample: '"Fair dinkum mate! Too right, no dramas at all, I\'ve got your back."',
  },
];

export const PersonaSettingsModal: React.FC<PersonaSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  const [isPlayingSample, setIsPlayingSample] = useState(false);

  if (!isOpen) return null;

  const handleTestVoice = async () => {
    try {
      setIsPlayingSample(true);
      const sampleText =
        settings.slangLevel === 'gentle'
          ? "G'day! I'm Matilda. It's lovely to chat with you today, mate. I'm right here whenever you need a friendly ear."
          : settings.slangLevel === 'true_blue'
          ? "G'day mate! Matilda here. No dramas at all, fair dinkum, it's great to have a yarn with you!"
          : "G'day mate! I'm Matilda, but you can call me Tilly. No worries at all, I'm always here to listen and have a good chat.";

      const audioBase64 = await fetchTTSAudio(sampleText, settings.slangLevel);
      playPcmAudio(audioBase64, 24000, () => {
        setIsPlayingSample(false);
      });
    } catch (e) {
      console.error('Error playing voice sample:', e);
      setIsPlayingSample(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-white dark:bg-stone-900 rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-2xl bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 flex items-center justify-center text-amber-700 dark:text-amber-300">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-white">
                Matilda Voice & Persona
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Australian female accent & personality preferences
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

        <div className="py-4 space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          {/* User Name input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-amber-500" />
              What should Matilda call you?
            </label>
            <input
              type="text"
              placeholder="e.g. Alex, Sam, Mate..."
              value={settings.userName}
              onChange={(e) => onUpdateSettings({ userName: e.target.value })}
              className="w-full px-3 py-2 text-xs rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-white focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Conversation Language Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-amber-500" />
              Conversation Language:
            </label>
            <select
              value={settings.languagePreference || 'auto'}
              onChange={(e) => onUpdateSettings({ languagePreference: e.target.value })}
              className="w-full px-3 py-2 text-xs rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-white focus:ring-2 focus:ring-amber-500"
            >
              {LANGUAGE_OPTIONS.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.label}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-stone-500 dark:text-stone-400">
              When set to Auto, Matilda speaks whichever language you speak to her in real time, or any language you ask for!
            </p>
          </div>

          {/* Australian Style & Slang Level */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Australian Accent & Slang Flavor:
            </label>
            <div className="space-y-2">
              {SLANG_OPTIONS.map((opt) => {
                const isSelected = settings.slangLevel === opt.id;
                return (
                  <div
                    key={opt.id}
                    onClick={() => onUpdateSettings({ slangLevel: opt.id })}
                    className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500 ring-2 ring-amber-400/20'
                        : 'bg-stone-50 dark:bg-stone-800/60 border-stone-200 dark:border-stone-700 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-stone-900 dark:text-white">
                        {opt.title}
                      </span>
                      {isSelected && <Check className="w-4 h-4 text-amber-600" />}
                    </div>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                      {opt.desc}
                    </p>
                    <p className="text-[10px] text-amber-700 dark:text-amber-300 italic mt-1 bg-white/70 dark:bg-stone-900/50 p-1.5 rounded-lg border border-amber-100 dark:border-stone-700/50">
                      {opt.sample}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Voice Preview Button */}
          <div className="pt-2">
            <button
              onClick={handleTestVoice}
              disabled={isPlayingSample}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-xs transition-all disabled:opacity-50"
            >
              <Volume2 className={`w-4 h-4 ${isPlayingSample ? 'animate-pulse' : ''}`} />
              <span>{isPlayingSample ? 'Playing Australian Voice Sample...' : 'Hear Matilda Speak'}</span>
            </button>
          </div>

          {/* Auto-Speak Toggle */}
          <div className="pt-2 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-stone-800 dark:text-stone-200 block">
                Automatic Voice Responses
              </span>
              <span className="text-[11px] text-stone-500 dark:text-stone-400">
                Play Matilda's voice automatically after every message
              </span>
            </div>
            <input
              type="checkbox"
              checked={settings.autoSpeakResponse}
              onChange={(e) => onUpdateSettings({ autoSpeakResponse: e.target.checked })}
              className="w-4 h-4 accent-amber-600 rounded"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-stone-200 dark:border-stone-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-medium hover:bg-stone-800 dark:hover:bg-white transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
