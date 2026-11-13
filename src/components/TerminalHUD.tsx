import React, { useState, useRef, useEffect } from 'react';
import {
  Terminal,
  X,
  Minimize2,
  Maximize2,
  Trash2,
  Volume2,
  Radio,
  Brain,
  Lightbulb,
  Heart,
  Send,
  Sparkles,
} from 'lucide-react';
import { Message, MemoryItem } from '../types';

interface TerminalHUDProps {
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
  playingMessageId: string | null;
  onPlayAudio: (message: Message) => void;
  onStopAudio: () => void;
  onSendMessage: (text: string) => void;
  isProcessing: boolean;
  isLiveMode: boolean;
  onToggleLiveMode: () => void;
  systemLogs: string[];
  memories: MemoryItem[];
}

export const TerminalHUD: React.FC<TerminalHUDProps> = ({
  isOpen,
  onClose,
  messages,
  playingMessageId,
  onPlayAudio,
  onStopAudio,
  onSendMessage,
  isProcessing,
  isLiveMode,
  onToggleLiveMode,
  systemLogs,
  memories,
}) => {
  const [activeTab, setActiveTab] = useState<'console' | 'chat' | 'memories'>('console');
  const [commandInput, setCommandInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [systemLogs, messages, isOpen]);

  if (!isOpen) return null;

  const handleSubmitCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim() || isProcessing) return;
    onSendMessage(commandInput.trim());
    setCommandInput('');
  };

  return (
    <div
      className={`fixed z-50 transition-all duration-300 ${
        isExpanded
          ? 'inset-4 sm:inset-10'
          : 'bottom-4 right-4 w-full sm:w-[460px] h-[540px] max-h-[85vh]'
      } bg-stone-950/95 text-stone-100 rounded-3xl border border-stone-800 shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden font-mono text-xs`}
    >
      {/* Terminal Titlebar */}
      <div className="flex items-center justify-between px-4 py-3 bg-stone-900/90 border-b border-stone-800 select-none">
        <div className="flex items-center space-x-2">
          <div className="flex space-x-1.5 mr-2">
            <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
          </div>
          <Terminal className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-bold tracking-wider text-[11px] text-stone-300">
            TILLY_NEURAL_TERMINAL // v3.8
          </span>
        </div>

        <div className="flex items-center space-x-1.5 text-stone-400">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:text-white rounded hover:bg-stone-800 transition-colors"
            title={isExpanded ? 'Restore' : 'Maximize'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:text-white rounded hover:bg-stone-800 transition-colors"
            title="Close Terminal"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center justify-between px-3 border-b border-stone-800/80 bg-stone-900/40 text-[11px]">
        <div className="flex space-x-1">
          <button
            onClick={() => setActiveTab('console')}
            className={`px-3 py-1.5 border-b-2 font-medium transition-all ${
              activeTab === 'console'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            System Logs ({systemLogs.length})
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-3 py-1.5 border-b-2 font-medium transition-all ${
              activeTab === 'chat'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            Transcript ({messages.length})
          </button>
          <button
            onClick={() => setActiveTab('memories')}
            className={`px-3 py-1.5 border-b-2 font-medium transition-all ${
              activeTab === 'memories'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            Memories ({memories.length})
          </button>
        </div>

        {/* Live mode toggle button in terminal */}
        <button
          onClick={onToggleLiveMode}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
            isLiveMode
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
              : 'text-stone-400 hover:text-stone-200'
          }`}
          title="Toggle Gemini Live API"
        >
          <Radio className={`w-3 h-3 ${isLiveMode ? 'animate-pulse text-emerald-400' : ''}`} />
          <span>{isLiveMode ? 'LIVE: ACTIVE' : 'LIVE: OFF'}</span>
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 text-stone-300 font-mono text-[11px]">
        {activeTab === 'console' && (
          <div className="space-y-1">
            <div className="text-stone-500 text-[10px] pb-1 border-b border-stone-900">
              // Matilda Neural Acoustic & Wake-Word Event Stream
            </div>
            {systemLogs.map((log, index) => (
              <div key={index} className="leading-relaxed flex items-start gap-2">
                <span className="text-amber-500/70 select-none">&gt;</span>
                <span
                  className={
                    log.includes('COUGH')
                      ? 'text-emerald-400 font-bold'
                      : log.includes('SIGH')
                      ? 'text-sky-400 font-bold'
                      : log.includes('WAKE')
                      ? 'text-amber-300 font-bold'
                      : log.includes('ACTION')
                      ? 'text-purple-400 font-bold'
                      : 'text-stone-300'
                  }
                >
                  {log}
                </span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="space-y-3 font-sans text-xs">
            {messages.map((m) => {
              const isUser = m.role === 'user';
              return (
                <div
                  key={m.id}
                  className={`p-2.5 rounded-xl border ${
                    isUser
                      ? 'bg-amber-950/40 border-amber-800/60 ml-6 text-amber-100'
                      : 'bg-stone-900 border-stone-800 mr-6 text-stone-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] text-stone-400 mb-1">
                    <span className="font-semibold text-amber-400">
                      {isUser ? 'You' : 'Matilda'}
                    </span>
                    <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>

                  {!isUser && (
                    <div className="mt-2 flex items-center justify-between pt-1 border-t border-stone-800">
                      <span className="text-[10px] text-rose-400 flex items-center gap-1">
                        <Heart className="w-2.5 h-2.5 fill-rose-500" />
                        {m.emotion || 'warm & caring'}
                      </span>
                      <button
                        onClick={() => onPlayAudio(m)}
                        className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1"
                      >
                        <Volume2 className="w-3 h-3" />
                        Replay
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={logEndRef} />
          </div>
        )}

        {activeTab === 'memories' && (
          <div className="space-y-2">
            <div className="text-stone-500 text-[10px] pb-1 border-b border-stone-900">
              // Stored Long-Term Memories (NLP Extracted)
            </div>
            {memories.map((mem) => (
              <div
                key={mem.id}
                className="p-2 rounded-lg bg-stone-900/90 border border-stone-800 flex items-start gap-2"
              >
                <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800/60">
                  {mem.category}
                </span>
                <span className="text-[11px] text-stone-200 flex-1">{mem.fact}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Terminal Command Input */}
      <form
        onSubmit={handleSubmitCommand}
        className="p-2.5 bg-stone-900/90 border-t border-stone-800 flex items-center gap-2"
      >
        <span className="text-amber-400 font-bold select-none">&gt;</span>
        <input
          type="text"
          value={commandInput}
          onChange={(e) => setCommandInput(e.target.value)}
          placeholder="Command or chat (e.g. 'search on web for...', 'play music', 'how are you?')..."
          disabled={isProcessing}
          className="flex-1 bg-transparent border-none outline-none text-stone-100 placeholder-stone-500 text-xs font-mono"
        />
        <button
          type="submit"
          disabled={!commandInput.trim() || isProcessing}
          className="p-1.5 rounded-lg bg-amber-500 text-stone-950 hover:bg-amber-400 disabled:opacity-30 transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
