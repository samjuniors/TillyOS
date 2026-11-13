import { useState, useEffect, useCallback } from 'react';
import { MemoryItem, ExtractedMemory } from '../types';
import { synthesizeMemorySummary } from '../services/api';

const STORAGE_KEY = 'matilda_friendship_memories_v1';

const INITIAL_MEMORIES: MemoryItem[] = [
  {
    id: 'mem-1',
    category: 'preference',
    fact: 'Values honest, warm, and grounded heart-to-heart chats without pretense.',
    importance: 'high',
    createdAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'mem-2',
    category: 'goal',
    fact: 'Working hard towards balancing career ambitions with peace of mind.',
    importance: 'medium',
    createdAt: Date.now() - 86400000 * 1,
  },
  {
    id: 'mem-3',
    category: 'personal',
    fact: 'Enjoys good coffee and taking moments to breathe and reset.',
    importance: 'low',
    createdAt: Date.now() - 3600000 * 5,
  },
];

export function useMemory() {
  const [memories, setMemories] = useState<MemoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Failed to load memories:', e);
    }
    return INITIAL_MEMORIES;
  });

  const [memorySummary, setMemorySummary] = useState<string>('');
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [recentlyLearned, setRecentlyLearned] = useState<ExtractedMemory[]>([]);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
    } catch (e) {
      console.error('Failed to save memories:', e);
    }
  }, [memories]);

  // Compute a structured memory string for LLM system prompt injection
  const getMemoryPromptString = useCallback(() => {
    if (memories.length === 0) return 'No past memories recorded yet.';
    return memories
      .map((m) => `• [${m.category.toUpperCase()}]: ${m.fact} (importance: ${m.importance || 'medium'})`)
      .join('\n');
  }, [memories]);

  // Add newly extracted memories from NLP
  const addExtractedMemories = useCallback((extracted: ExtractedMemory[], sourceContext?: string) => {
    if (!extracted || extracted.length === 0) return;

    setMemories((prev) => {
      const updated = [...prev];
      const newItems: ExtractedMemory[] = [];

      for (const item of extracted) {
        // Prevent exact duplicates
        const exists = updated.some(
          (m) => m.fact.toLowerCase().trim() === item.fact.toLowerCase().trim()
        );
        if (!exists && item.fact.trim()) {
          updated.unshift({
            id: `mem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            category: item.category || 'personal',
            fact: item.fact.trim(),
            importance: item.importance || 'medium',
            createdAt: Date.now(),
            sourceContext,
          });
          newItems.push(item);
        }
      }

      if (newItems.length > 0) {
        setRecentlyLearned(newItems);
        setTimeout(() => setRecentlyLearned([]), 6000);
      }

      return updated;
    });
  }, []);

  // Manually add memory
  const addManualMemory = useCallback((fact: string, category: MemoryItem['category'], importance: MemoryItem['importance'] = 'medium') => {
    if (!fact.trim()) return;
    const newMem: MemoryItem = {
      id: `mem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      category,
      fact: fact.trim(),
      importance,
      createdAt: Date.now(),
      sourceContext: 'Added manually by user',
    };
    setMemories((prev) => [newMem, ...prev]);
  }, []);

  // Delete memory
  const deleteMemory = useCallback((id: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // Clear all memories
  const clearAllMemories = useCallback(() => {
    setMemories([]);
  }, []);

  // Reset to friendly starter memories
  const resetToStarterMemories = useCallback(() => {
    setMemories(INITIAL_MEMORIES);
  }, []);

  // Trigger deep synthesis via API
  const refreshSummary = useCallback(async () => {
    if (memories.length === 0) {
      setMemorySummary('No memories yet.');
      return;
    }
    setIsSynthesizing(true);
    try {
      const summary = await synthesizeMemorySummary(memories);
      setMemorySummary(summary);
    } catch (e) {
      console.error('Error generating summary:', e);
    } finally {
      setIsSynthesizing(false);
    }
  }, [memories]);

  return {
    memories,
    memorySummary,
    isSynthesizing,
    recentlyLearned,
    getMemoryPromptString,
    addExtractedMemories,
    addManualMemory,
    deleteMemory,
    clearAllMemories,
    resetToStarterMemories,
    refreshSummary,
  };
}
