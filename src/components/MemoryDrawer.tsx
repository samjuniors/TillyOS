import React, { useState } from 'react';
import { X, Brain, Trash2, Plus, Sparkles, Search, RefreshCw, RotateCcw } from 'lucide-react';
import { MemoryItem } from '../types';

interface MemoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  memories: MemoryItem[];
  memorySummary: string;
  isSynthesizing: boolean;
  onRefreshSummary: () => void;
  onAddMemory: (fact: string, category: MemoryItem['category'], importance?: MemoryItem['importance']) => void;
  onDeleteMemory: (id: string) => void;
  onClearAll: () => void;
  onResetStarter: () => void;
}

const CATEGORIES: { key: string; label: string; icon: string }[] = [
  { key: 'all', label: 'All Memories', icon: '🧠' },
  { key: 'personal', label: 'Personal', icon: '👤' },
  { key: 'relationship', label: 'People & Friends', icon: '👥' },
  { key: 'goal', label: 'Goals & Dreams', icon: '🎯' },
  { key: 'preference', label: 'Preferences', icon: '⭐' },
  { key: 'struggle', label: 'Challenges', icon: '🌱' },
  { key: 'advice', label: 'Advice Recalls', icon: '💡' },
];

export const MemoryDrawer: React.FC<MemoryDrawerProps> = ({
  isOpen,
  onClose,
  memories,
  memorySummary,
  isSynthesizing,
  onRefreshSummary,
  onAddMemory,
  onDeleteMemory,
  onClearAll,
  onResetStarter,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [newFact, setNewFact] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryItem['category']>('personal');
  const [activeTab, setActiveTab] = useState<'memories' | 'synthesis'>('memories');

  if (!isOpen) return null;

  const filteredMemories = memories.filter((m) => {
    const matchesCat = selectedCategory === 'all' || m.category === selectedCategory;
    const matchesSearch =
      m.fact.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFact.trim()) return;
    onAddMemory(newFact.trim(), newCategory);
    setNewFact('');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative w-full max-w-md bg-white dark:bg-stone-900 h-full shadow-2xl flex flex-col z-10 border-l border-stone-200 dark:border-stone-800 animate-in slide-in-from-right duration-300">
        {/* Drawer Header */}
        <div className="p-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between bg-stone-50 dark:bg-stone-900">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 flex items-center justify-center text-amber-700 dark:text-amber-300">
              <Brain className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-stone-900 dark:text-white text-sm">
                Tilly's Memory Bank
              </h2>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                Natural Language Processing Memory Graph ({memories.length} facts)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex border-b border-stone-200 dark:border-stone-800 px-4 pt-2 bg-stone-50/50 dark:bg-stone-900/50">
          <button
            onClick={() => setActiveTab('memories')}
            className={`flex-1 pb-2 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'memories'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
            }`}
          >
            Stored Memories ({memories.length})
          </button>
          <button
            onClick={() => {
              setActiveTab('synthesis');
              if (!memorySummary) onRefreshSummary();
            }}
            className={`flex-1 pb-2 text-xs font-semibold border-b-2 transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'synthesis'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Synthesis</span>
          </button>
        </div>

        {activeTab === 'memories' ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search & Categories Bar */}
            <div className="p-3 border-b border-stone-100 dark:border-stone-800 space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-stone-400" />
                <input
                  type="text"
                  placeholder="Search memories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-stone-100 dark:bg-stone-800 border-none focus:ring-2 focus:ring-amber-500 text-stone-900 dark:text-white"
                />
              </div>

              {/* Category Pills */}
              <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    onClick={() => setSelectedCategory(cat.key)}
                    className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                      selectedCategory === cat.key
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700'
                    }`}
                  >
                    <span>{cat.icon} </span>
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Memories List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {filteredMemories.length === 0 ? (
                <div className="text-center py-12 text-stone-400 text-xs">
                  <Brain className="w-8 h-8 mx-auto mb-2 opacity-40 text-amber-500" />
                  <p>No memories match this category.</p>
                  <p className="mt-1">Chat with Tilly or add a memory manually below!</p>
                </div>
              ) : (
                filteredMemories.map((mem) => (
                  <div
                    key={mem.id}
                    className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/80 border border-stone-200/80 dark:border-stone-700/70 hover:border-amber-400/50 transition-all flex items-start justify-between gap-2 group shadow-2xs"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300">
                          {mem.category}
                        </span>
                        <span className="text-[10px] text-stone-400">
                          {new Date(mem.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-stone-800 dark:text-stone-200 leading-snug font-medium">
                        {mem.fact}
                      </p>
                    </div>

                    <button
                      onClick={() => onDeleteMemory(mem.id)}
                      className="opacity-40 group-hover:opacity-100 p-1 text-stone-400 hover:text-red-500 transition-all rounded-md"
                      title="Forget this memory"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Quick Add Form */}
            <form onSubmit={handleAdd} className="p-3 bg-stone-50 dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 space-y-2">
              <span className="text-[11px] font-semibold text-stone-600 dark:text-stone-400 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5 text-amber-500" />
                Tell Tilly something to remember:
              </span>
              <div className="flex gap-2">
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as any)}
                  className="px-2 py-1.5 text-xs rounded-xl bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-white"
                >
                  <option value="personal">Personal</option>
                  <option value="relationship">Relationship</option>
                  <option value="goal">Goal</option>
                  <option value="preference">Preference</option>
                  <option value="struggle">Challenge</option>
                </select>
                <input
                  type="text"
                  placeholder="e.g. My brother lives in Melbourne..."
                  value={newFact}
                  onChange={(e) => setNewFact(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-white focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="submit"
                  disabled={!newFact.trim()}
                  className="px-3 py-1.5 bg-amber-600 disabled:opacity-50 text-white rounded-xl text-xs font-medium hover:bg-amber-700 transition-colors shrink-0 shadow-xs"
                >
                  Save
                </button>
              </div>

              {/* Utility reset buttons */}
              <div className="flex justify-between items-center pt-1 text-[11px]">
                <button
                  type="button"
                  onClick={onResetStarter}
                  className="text-stone-500 hover:text-amber-600 dark:hover:text-amber-400 flex items-center gap-1 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset Starter Memories
                </button>
                <button
                  type="button"
                  onClick={onClearAll}
                  className="text-stone-500 hover:text-red-500 transition-colors"
                >
                  Clear All
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* AI Synthesis View */
          <div className="flex-1 p-4 overflow-y-auto flex flex-col justify-between">
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                <p className="font-semibold mb-1 flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                  <Sparkles className="w-3.5 h-3.5" />
                  How Tilly's Memory Graph Works
                </p>
                As you chat, Tilly uses Natural Language Processing to extract key life context, relationships, struggles, and wisdom. This synthesis is injected into every conversation turn so she speaks like an authentic, loyal friend who knows your story.
              </div>

              <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 shadow-inner">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                    Friendship Synthesis
                  </h3>
                  <button
                    onClick={onRefreshSummary}
                    disabled={isSynthesizing}
                    className="p-1 text-amber-600 dark:text-amber-400 hover:text-amber-700 disabled:opacity-50"
                    title="Re-synthesize with Gemini 3.8 Flash"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSynthesizing ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {isSynthesizing ? (
                  <div className="py-8 text-center text-xs text-stone-400 space-y-2">
                    <RefreshCw className="w-5 h-5 mx-auto animate-spin text-amber-500" />
                    <p>Synthesizing your past conversations & memories...</p>
                  </div>
                ) : (
                  <p className="text-xs text-stone-700 dark:text-stone-200 whitespace-pre-wrap leading-relaxed">
                    {memorySummary || "Click below to generate Tilly's synthesis of everything she knows about you."}
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={onRefreshSummary}
              disabled={isSynthesizing}
              className="w-full mt-4 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-md transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSynthesizing ? 'animate-spin' : ''}`} />
              <span>{isSynthesizing ? 'Synthesizing...' : 'Re-synthesize Memories'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
