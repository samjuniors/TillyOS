import React, { useState, useEffect } from 'react';
import {
  X,
  Cpu,
  GitBranch,
  Zap,
  CheckCircle2,
  ShieldCheck,
  Code2,
  Volume2,
  Sparkles,
  Plus,
  Trash2,
  Activity,
  Scale,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  Layers,
  Sliders,
} from 'lucide-react';
import {
  DecisionEngineResult,
  DecisionOptionItem,
  DecisionReasoningStep,
  DecisionAnswerSpec,
  UIAction,
} from '../types';
import { evaluateWithDecisionEngine, fetchDecisionEngineStatus } from '../services/api';

interface DecisionEngineModalProps {
  isOpen: boolean;
  onClose: () => void;
  latestDecision: DecisionEngineResult | null;
  decisionHistory: DecisionEngineResult[];
  activeLanguage: string;
  currentEmotion: string;
  userMood: string;
  detectedAcoustics: string[];
  memoryContext: string;
  onNewDecision: (decision: DecisionEngineResult) => void;
  onApplyDecision: (decision: DecisionEngineResult) => void;
  onSpeakDirective: (text: string) => void;
  onExecuteAction: (action: UIAction) => void;
}

const PRESET_SCENARIOS = [
  {
    label: '⚖️ Career Dilemma (Choice + Score)',
    mode: 'dilemma_solver' as const,
    input: 'Should I take the remote AI startup offer with higher equity or stay at my stable enterprise software role?',
    options: ['Accept the AI Startup Offer', 'Stay at Stable Enterprise Role', 'Negotiate Hybrid Part-Time Transition'],
    threshold: 0.8,
  },
  {
    label: '😷 Acoustic Cough Triage (Noul + Score)',
    mode: 'full_cognitive' as const,
    input: '[coughs] Hey Tilly, my throat feels scratchy and I have a late presentation tonight.',
    options: ['Rest voice & prep warm honey tea now', 'Push through rehearsal nonstop', 'Reschedule non-urgent calls'],
    threshold: 0.8,
  },
  {
    label: '🎵 Tool Routing (Choice Dispatch)',
    mode: 'autonomous_routing' as const,
    input: 'Feeling super overwhelmed and exhausted, put on some soothing coastal music to calm my nerves.',
    options: [],
    threshold: 0.8,
  },
  {
    label: '🚨 Low-Confidence Escalation (< 0.96 Gate)',
    mode: 'full_cognitive' as const,
    input: 'Hmm maybe sort of not sure what I want to do next...',
    options: [],
    threshold: 0.96,
  },
];

export const DecisionEngineModal: React.FC<DecisionEngineModalProps> = ({
  isOpen,
  onClose,
  latestDecision,
  decisionHistory,
  activeLanguage,
  userMood,
  detectedAcoustics,
  memoryContext,
  onNewDecision,
  onApplyDecision,
  onSpeakDirective,
  onExecuteAction,
}) => {
  const [inputPrompt, setInputPrompt] = useState(
    'Should I take the remote AI startup offer with higher equity or stay at my stable enterprise role?'
  );
  const [mode, setMode] = useState<'full_cognitive' | 'dilemma_solver' | 'autonomous_routing'>('dilemma_solver');
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.8);
  const [customOptions, setCustomOptions] = useState<string[]>([
    'Accept the AI Startup Offer',
    'Stay at Stable Enterprise Role',
    'Negotiate a 4-Day Transition Plan',
  ]);
  const [newOptionText, setNewOptionText] = useState('');
  const [customNoulQuestion, setCustomNoulQuestion] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [selectedDecision, setSelectedDecision] = useState<DecisionEngineResult | null>(latestDecision);
  const [activeTab, setActiveTab] = useState<'overview' | 'primitives' | 'raw_json'>('overview');
  const [engineStats, setEngineStats] = useState<{
    engine: string;
    version: string;
    status: string;
    totalDecisionsEvaluated: number;
  } | null>(null);

  useEffect(() => {
    if (latestDecision) {
      setSelectedDecision(latestDecision);
    }
  }, [latestDecision]);

  useEffect(() => {
    if (isOpen) {
      fetchDecisionEngineStatus()
        .then((statusData) => {
          setEngineStats({
            engine: statusData.engine,
            version: statusData.version,
            status: statusData.status,
            totalDecisionsEvaluated: statusData.totalDecisionsEvaluated,
          });
          if (!selectedDecision && statusData.recentDecisions && statusData.recentDecisions.length > 0) {
            setSelectedDecision(statusData.recentDecisions[0]);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, selectedDecision]);

  if (!isOpen) return null;

  const handleRunEngine = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputPrompt.trim() || isEvaluating) return;

    setIsEvaluating(true);
    try {
      const filteredOptions = customOptions.map((o) => o.trim()).filter(Boolean);
      const customQuestions = customNoulQuestion.trim()
        ? {
            custom_user_check: {
              type: 'noul' as const,
              instructions: customNoulQuestion.trim(),
            },
          }
        : undefined;

      const result = await evaluateWithDecisionEngine({
        input: inputPrompt.trim(),
        mode,
        options: filteredOptions.length > 0 ? filteredOptions : undefined,
        questions: customQuestions,
        confidenceThreshold,
        context: {
          detectedAcoustics,
          userMood,
          activeLanguage,
          memorySummary: memoryContext,
        },
      });

      setSelectedDecision(result);
      onNewDecision(result);
      setEngineStats((prev) =>
        prev
          ? {
              ...prev,
              totalDecisionsEvaluated: prev.totalDecisionsEvaluated + 1,
            }
          : null
      );
    } catch (err) {
      console.error('Decision 1 API execution error:', err);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleAddOption = () => {
    const trimmed = newOptionText.trim();
    if (!trimmed) return;
    setCustomOptions((prev) => [...prev, trimmed]);
    setNewOptionText('');
  };

  const handleRemoveOption = (idx: number) => {
    setCustomOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSelectPreset = (preset: (typeof PRESET_SCENARIOS)[0]) => {
    setInputPrompt(preset.input);
    setMode(preset.mode);
    setCustomOptions(preset.options);
    setConfidenceThreshold(preset.threshold);
  };

  const activeResult = selectedDecision || latestDecision;
  const answerEntries = activeResult?.answers ? Object.entries(activeResult.answers) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-6xl max-h-[92vh] bg-stone-950 border border-stone-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-stone-100">
        {/* TOP HEADER */}
        <div className="px-6 py-4 border-b border-stone-800 bg-stone-900/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold tracking-tight text-white">
                  Gemini Decision 1 Engine (Decisions API)
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-emerald-950/90 border border-emerald-700/70 text-emerald-300 text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  model="gemini-decision-1"
                </span>
                <span className="px-2 py-0.5 rounded-md bg-amber-950/80 border border-amber-700/60 text-amber-300 text-[10px] font-mono">
                  apiVersion="v1beta" • client.decisions.create()
                </span>
                <span className="px-2 py-0.5 rounded-md bg-stone-800 border border-stone-700 text-stone-300 text-[10px] font-mono">
                  0 Output Tokens
                </span>
              </div>
              <p className="text-xs text-stone-400 mt-0.5">
                Batched single-pass evaluation over <code className="text-amber-300">noul</code> (yes/no),{' '}
                <code className="text-amber-300">choice</code> (routing/tools), and{' '}
                <code className="text-amber-300">score</code> (ordered rubrics) with deterministic confidence thresholding
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {engineStats && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-stone-900 border border-stone-800 text-[11px] font-mono text-stone-300">
                <Activity className="w-3.5 h-3.5 text-amber-400" />
                <span>Batches Run: {engineStats.totalDecisionsEvaluated}</span>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-white border border-stone-800 transition-colors"
              title="Close Decision Engine"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* MAIN BODY: 2 COLUMNS */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-stone-800">
          {/* LEFT COLUMN: INPUT & BATCHED QUESTIONS SIMULATOR (5 cols) */}
          <div className="lg:col-span-5 p-5 flex flex-col gap-4 bg-stone-950/60">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  1. Shared Input &amp; Question Batching
                </span>
                <span className="text-[11px] text-stone-500 font-mono">Lang: {activeLanguage}</span>
              </div>

              {/* Preset Scenarios */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {PRESET_SCENARIOS.map((preset, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className="px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 text-[11px] text-stone-300 transition-colors cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleRunEngine} className="space-y-3">
                {/* Engine Mode Selector */}
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-stone-900 border border-stone-800 text-[11px]">
                  {(
                    [
                      { id: 'dilemma_solver', label: 'Dilemma Solver' },
                      { id: 'full_cognitive', label: 'Full Cognitive' },
                      { id: 'autonomous_routing', label: 'Auto Routing' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMode(m.id)}
                      className={`py-1.5 px-2 rounded-lg font-semibold transition-all cursor-pointer ${
                        mode === m.id
                          ? 'bg-amber-500 text-stone-950 shadow-sm'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {/* Shared Input Text */}
                <div>
                  <label className="block text-[11px] font-medium text-stone-400 mb-1">
                    Shared <code className="text-amber-300">input</code> Context (Evaluated in 1 Forward Pass)
                  </label>
                  <textarea
                    rows={2}
                    value={inputPrompt}
                    onChange={(e) => setInputPrompt(e.target.value)}
                    placeholder="Enter shared context, user utterance, or dilemma..."
                    className="w-full px-3 py-2 rounded-xl bg-stone-900 border border-stone-800 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                  />
                </div>

                {/* Deterministic Confidence Threshold Slider */}
                <div className="p-2.5 rounded-xl bg-stone-900/90 border border-stone-800">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-semibold text-stone-300 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-amber-400" />
                      Confidence Threshold Gate (<code className="text-amber-300">confidence &gt;= {confidenceThreshold.toFixed(2)}</code>)
                    </span>
                    <span className="font-mono text-amber-400 font-bold">
                      {Math.round(confidenceThreshold * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.50"
                    max="0.98"
                    step="0.02"
                    value={confidenceThreshold}
                    onChange={(e) => setConfidenceThreshold( parseFloat(e.target.value) )}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-stone-500 font-mono">
                    <span>0.50 (Lenient)</span>
                    <span>0.80 (Recommended)</span>
                    <span>0.98 (Strict Escalation)</span>
                  </div>
                </div>

                {/* Custom NOUL Question Input */}
                <div>
                  <label className="block text-[11px] font-medium text-stone-400 mb-1">
                    Optional Custom <code className="text-emerald-400">noul</code> Question in Batch
                  </label>
                  <input
                    type="text"
                    value={customNoulQuestion}
                    onChange={(e) => setCustomNoulQuestion(e.target.value)}
                    placeholder="e.g., Does the user sound stressed about a deadline?"
                    className="w-full px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-800 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Candidate Options for Choice & Score Batch */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-medium text-stone-400">
                      Candidate Options (<code className="text-amber-300">choice</code> + <code className="text-amber-300">score</code> batch)
                    </label>
                    <span className="text-[10px] text-stone-500">{customOptions.length} options</span>
                  </div>

                  <div className="space-y-1.5 mb-2 max-h-24 overflow-y-auto pr-1">
                    {customOptions.map((opt, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-stone-900/90 border border-stone-800 text-xs text-stone-200"
                      >
                        <span className="truncate pr-2">
                          <span className="text-amber-400 font-mono mr-1.5">option_{idx}</span>
                          {opt}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(idx)}
                          className="text-stone-500 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newOptionText}
                      onChange={(e) => setNewOptionText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddOption();
                        }
                      }}
                      placeholder="Add option key to choice/score batch..."
                      className="flex-1 px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-800 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddOption}
                      className="px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs flex items-center gap-1 border border-stone-700"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add
                    </button>
                  </div>
                </div>

                {/* Execute Button */}
                <button
                  type="submit"
                  disabled={isEvaluating || !inputPrompt.trim()}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-stone-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {isEvaluating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Calling client.decisions.create(gemini-decision-1)...</span>
                    </>
                  ) : (
                    <>
                      <Cpu className="w-4 h-4" />
                      <span>Run client.decisions.create (gemini-decision-1)</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Recent Telemetry History */}
            <div className="flex-1 flex flex-col min-h-0 border-t border-stone-800 pt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5 text-amber-400" />
                  Recent Decisions History
                </span>
                <span className="text-[10px] text-stone-500 font-mono">
                  {decisionHistory.length} recorded
                </span>
              </div>

              {decisionHistory.length === 0 ? (
                <div className="p-3 rounded-xl bg-stone-900/50 border border-stone-800/80 text-center text-xs text-stone-500">
                  No decisions evaluated yet. Click &ldquo;Run client.decisions.create&rdquo; above!
                </div>
              ) : (
                <div className="space-y-1.5 overflow-y-auto max-h-40 pr-1">
                  {decisionHistory.map((item) => {
                    const isSelected = activeResult?.decisionId === item.decisionId;
                    return (
                      <button
                        key={item.decisionId}
                        type="button"
                        onClick={() => setSelectedDecision(item)}
                        className={`w-full text-left p-2 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/15 border-amber-500/50 text-stone-100'
                            : 'bg-stone-900/70 border-stone-800/90 text-stone-300 hover:bg-stone-900'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono mb-0.5">
                          <span className="text-amber-400 font-bold">{item.intentClassification}</span>
                          <span
                            className={
                              item.confidenceGate?.passed !== false ? 'text-emerald-400' : 'text-rose-400'
                            }
                          >
                            {Math.round(item.confidenceScore * 100)}% conf •{' '}
                            {item.confidenceGate?.passed !== false ? 'GATE PASS' : 'ESCALATED'}
                          </span>
                        </div>
                        <p className="text-xs font-medium truncate text-stone-200">
                          {item.inputSummary}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: CALIBRATED PROBABILITIES, CONFIDENCE GATE & PRIMITIVES (7 cols) */}
          <div className="lg:col-span-7 p-5 flex flex-col gap-4 bg-stone-950 overflow-y-auto">
            {!activeResult ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <Cpu className="w-12 h-12 text-amber-400/50 mb-3" />
                <h3 className="text-sm font-bold text-stone-200">
                  Gemini Decision 1 (`gemini-decision-1`) Ready
                </h3>
                <p className="text-xs text-stone-400 max-w-md mt-1">
                  Run a batched evaluation on the left to inspect calibrated <code className="text-amber-300">noul</code>,{' '}
                  <code className="text-amber-300">choice</code>, and <code className="text-amber-300">score</code>{' '}
                  answers and deterministic confidence thresholding.
                </p>
              </div>
            ) : (
              <>
                {/* Top Telemetry Badges & Tab Switcher */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-800">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[11px] font-bold font-mono">
                      INTENT: {activeResult.intentClassification.toUpperCase()}
                    </span>
                    <span className="px-2 py-1 rounded-lg bg-emerald-950 border border-emerald-700/60 text-emerald-300 text-[11px] font-mono font-semibold">
                      CONF: {(activeResult.confidenceScore * 100).toFixed(1)}%
                    </span>
                    <span className="px-2 py-1 rounded-lg bg-stone-900 border border-stone-800 text-stone-300 text-[11px] font-mono">
                      {Object.keys(activeResult.answers || {}).length} Questions Batched
                    </span>
                    <span className="px-2 py-1 rounded-lg bg-stone-900 border border-stone-800 text-stone-400 text-[11px] font-mono">
                      In: {activeResult.usage?.total_input_tokens ?? 0} tok • Out: {activeResult.usage?.total_output_tokens ?? 0} tok
                    </span>
                  </div>

                  {/* View Mode Tabs */}
                  <div className="flex items-center gap-1 bg-stone-900 p-1 rounded-xl border border-stone-800 text-[11px] font-mono">
                    <button
                      type="button"
                      onClick={() => setActiveTab('overview')}
                      className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        activeTab === 'overview'
                          ? 'bg-amber-500 text-stone-950 font-bold'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      Matrix &amp; Gate
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('primitives')}
                      className={`px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer ${
                        activeTab === 'primitives'
                          ? 'bg-amber-500 text-stone-950 font-bold'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      <Layers className="w-3 h-3" />
                      noul/choice/score ({answerEntries.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('raw_json')}
                      className={`px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer ${
                        activeTab === 'raw_json'
                          ? 'bg-amber-500 text-stone-950 font-bold'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      <Code2 className="w-3 h-3" />
                      Raw JSON
                    </button>
                  </div>
                </div>

                {/* Deterministic Confidence Threshold Gate Banner */}
                {activeResult.confidenceGate && (
                  <div
                    className={`p-3 rounded-xl border flex items-start justify-between gap-3 ${
                      activeResult.confidenceGate.passed
                        ? 'bg-emerald-950/30 border-emerald-700/60 text-emerald-200'
                        : 'bg-rose-950/40 border-rose-600/70 text-rose-200'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {activeResult.confidenceGate.passed ? (
                        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="text-xs font-bold flex items-center gap-2">
                          <span>
                            Deterministic Confidence Gate:{' '}
                            {activeResult.confidenceGate.passed
                              ? 'PASSED (Autonomous Execution)'
                              : `ESCALATED → ${activeResult.confidenceGate.escalationTarget.toUpperCase()}`}
                          </span>
                        </div>
                        <p className="text-[11px] opacity-90 mt-0.5">{activeResult.confidenceGate.reason}</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-black/40 font-mono text-[10px] shrink-0">
                      Gate &gt;= {Math.round(activeResult.confidenceGate.threshold * 100)}%
                    </span>
                  </div>
                )}

                {activeTab === 'raw_json' ? (
                  <div className="flex-1 bg-stone-900/90 border border-stone-800 rounded-xl p-4 overflow-x-auto">
                    <div className="flex items-center justify-between mb-2 text-[11px] font-mono text-stone-400">
                      <span>
                        MODEL: {activeResult.engine} (apiVersion: {activeResult.apiVersion || 'v1beta'})
                      </span>
                      <span>ID: {activeResult.decisionId}</span>
                    </div>
                    <pre className="text-[11px] font-mono text-emerald-300 whitespace-pre-wrap leading-relaxed">
                      {JSON.stringify(activeResult, null, 2)}
                    </pre>
                  </div>
                ) : activeTab === 'primitives' ? (
                  /* DETAILED NOUL / CHOICE / SCORE PRIMITIVES INSPECTOR */
                  <div className="space-y-3 overflow-y-auto pr-1">
                    {answerEntries.map(([qKey, ans]: [string, DecisionAnswerSpec]) => {
                      const questionSpec = activeResult.questionsEvaluated?.[qKey];
                      return (
                        <div
                          key={qKey}
                          className="p-3.5 rounded-xl bg-stone-900/80 border border-stone-800 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                                  ans.type === 'noul'
                                    ? 'bg-cyan-950 text-cyan-300 border border-cyan-700/60'
                                    : ans.type === 'choice'
                                    ? 'bg-amber-950 text-amber-300 border border-amber-700/60'
                                    : 'bg-purple-950 text-purple-300 border border-purple-700/60'
                                }`}
                              >
                                {ans.type}
                              </span>
                              <span className="font-mono text-xs font-bold text-white">{qKey}</span>
                            </div>
                            <span className="text-xs font-mono text-emerald-400">
                              confidence: {(ans.confidence * 100).toFixed(1)}%
                            </span>
                          </div>

                          {questionSpec?.instructions && (
                            <p className="text-[11px] text-stone-400 italic">
                              &ldquo;{questionSpec.instructions}&rdquo;
                            </p>
                          )}

                          {ans.type === 'noul' && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-[11px] font-mono">
                                <span className="text-cyan-300 font-bold">
                                  P(yes / noul) = {ans.noul.toFixed(3)} ({(ans.noul * 100).toFixed(1)}%)
                                </span>
                                <span className="text-stone-400">
                                  P(no) = {(1 - ans.noul).toFixed(3)} ({((1 - ans.noul) * 100).toFixed(1)}%)
                                </span>
                              </div>
                              <div className="w-full h-2 rounded-full bg-stone-800 overflow-hidden">
                                <div
                                  className="h-full bg-cyan-400 rounded-full"
                                  style={{ width: `${Math.round(ans.noul * 100)}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {ans.type === 'choice' && (
                            <div className="space-y-1.5 pt-1">
                              <div className="text-xs text-amber-300 font-mono">
                                Top Choice: <strong className="text-white">{ans.choice}</strong>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                {Object.entries(ans.probabilities || {})
                                  .sort((a, b) => Number(b[1]) - Number(a[1]))
                                  .map(([optId, prob]) => (
                                    <div
                                      key={optId}
                                      className="px-2.5 py-1 rounded-lg bg-stone-950/80 border border-stone-800/80 flex items-center justify-between text-[11px] font-mono"
                                    >
                                      <span className="truncate pr-2 text-stone-300">{optId}</span>
                                      <span className="text-amber-400 font-bold">
                                        {(Number(prob) * 100).toFixed(1)}%
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}

                          {ans.type === 'score' && (
                            <div className="space-y-1.5 pt-1">
                              <div className="text-xs text-purple-300 font-mono">
                                Expected Rubric Score: <strong className="text-white">{ans.score.toFixed(2)}</strong>
                              </div>
                              <div className="space-y-1">
                                {Object.entries(ans.legend || {}).map(([lvlIdx, desc]) => {
                                  const p = Number(ans.probabilities?.[lvlIdx] ?? 0);
                                  return (
                                    <div
                                      key={lvlIdx}
                                      className="px-2.5 py-1 rounded bg-stone-950/80 border border-stone-800/70 flex items-center justify-between text-[11px]"
                                    >
                                      <span className="text-stone-300 truncate pr-2">
                                        <strong className="font-mono text-purple-400">[{lvlIdx}]</strong> {desc}
                                      </span>
                                      <span className="font-mono text-purple-300 shrink-0">
                                        {(p * 100).toFixed(1)}%
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* OVERVIEW TAB: DIRECTIVE, OPTION MATRIX & REASONING STEPS */
                  <>
                    {/* Executive Summary & Matilda Spoken Directive */}
                    <div className="p-4 rounded-xl bg-gradient-to-br from-stone-900 via-stone-900 to-amber-950/25 border border-amber-500/30 shadow-md">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" />
                          Routing &amp; Spoken Directive ({activeResult.recommendedAction.targetLanguage})
                        </span>
                        <span className="text-[11px] font-mono text-stone-400">
                          Route: <strong className="text-stone-200">{activeResult.selectedRoute}</strong>
                        </span>
                      </div>

                      <div className="p-3 rounded-lg bg-stone-950/80 border border-stone-800 text-xs text-amber-100 italic font-serif leading-relaxed">
                        &ldquo;{activeResult.recommendedAction.spokenDirective}&rdquo;
                      </div>

                      {/* Action Buttons for Matilda */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSpeakDirective(activeResult.recommendedAction.spokenDirective)}
                          className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Have Matilda Speak Decision</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onApplyDecision(activeResult)}
                          className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-100 border border-stone-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Sync Emotion &amp; State to Orb</span>
                        </button>

                        {activeResult.recommendedAction.uiAction && (
                          <button
                            type="button"
                            onClick={() => onExecuteAction(activeResult.recommendedAction.uiAction!)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/70 text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                            <span>
                              Execute Action: {activeResult.recommendedAction.uiAction.type}
                              {activeResult.recommendedAction.uiAction.param
                                ? ` (${activeResult.recommendedAction.uiAction.param})`
                                : ''}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Weighted Option Utility Matrix */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                          <Scale className="w-3.5 h-3.5 text-amber-400" />
                          Calibrated Choice &amp; Rubric Score Matrix
                        </span>
                        <span className="text-[11px] text-stone-400">
                          Tone: <strong className="text-amber-300">{activeResult.recommendedAction.targetEmotion}</strong>
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {activeResult.decisionOptions.map((opt: DecisionOptionItem) => (
                          <div
                            key={opt.id}
                            className={`p-3 rounded-xl border transition-all ${
                              opt.recommended
                                ? 'bg-amber-950/20 border-amber-500/50 shadow-sm'
                                : 'bg-stone-900/60 border-stone-800'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-white">{opt.label}</span>
                                {opt.recommended && (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-500 text-stone-950 text-[10px] font-bold uppercase">
                                    Top Calibrated Choice
                                  </span>
                                )}
                              </div>
                              <span className="text-xs font-mono font-bold text-amber-400">
                                Utility: {opt.utilityScore}/100
                              </span>
                            </div>

                            {/* Utility Progress Bar */}
                            <div className="w-full h-1.5 rounded-full bg-stone-800 overflow-hidden mb-2">
                              <div
                                className={`h-full rounded-full ${
                                  opt.recommended
                                    ? 'bg-gradient-to-r from-amber-500 to-emerald-400'
                                    : 'bg-stone-500'
                                }`}
                                style={{ width: `${Math.min(100, Math.max(5, opt.utilityScore))}%` }}
                              />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                              <div className="space-y-0.5">
                                {opt.pros.slice(0, 2).map((pro: string, idx: number) => (
                                  <div key={idx} className="text-emerald-300/90 flex items-start gap-1">
                                    <span>+</span>
                                    <span>{pro}</span>
                                  </div>
                                ))}
                              </div>
                              <div className="space-y-0.5">
                                {opt.cons.slice(0, 2).map((con: string, idx: number) => (
                                  <div key={idx} className="text-rose-300/80 flex items-start gap-1">
                                    <span>-</span>
                                    <span>{con}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 3-Step Primitive Reasoning Chain (noul, choice, score) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                      {activeResult.reasoningChain.map((step: DecisionReasoningStep) => (
                        <div
                          key={step.step}
                          className="p-3 rounded-xl bg-stone-900/70 border border-stone-800 flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between text-[10px] font-mono text-amber-400 mb-1">
                              <span>
                                {step.primitiveType ? `[${step.primitiveType.toUpperCase()}] ` : ''}
                                STEP 0{step.step}
                              </span>
                              <span>W: {Math.round(step.weight * 100)}%</span>
                            </div>
                            <div className="text-[11px] font-bold text-stone-200 mb-1">{step.module}</div>
                            <p className="text-[11px] text-stone-300 leading-snug font-mono">
                              {step.evaluation}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Policy Guardrails Footer */}
                    <div className="pt-2 flex flex-wrap items-center gap-2 text-[11px] text-stone-400">
                      <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Guardrails (`is_safe_and_in_scope`):
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-stone-900 border border-stone-800 text-[10px] text-stone-300 font-mono">
                        P(safe)={(activeResult.policyGuardrails.safetyProbability ?? 0.98).toFixed(2)} (
                        {activeResult.policyGuardrails.safetyPassed ? 'PASSED' : 'BLOCKED'})
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-stone-900 border border-stone-800 text-[10px] text-stone-300 font-mono">
                        Empathy Rubric: {Math.round(activeResult.policyGuardrails.empathyAlignment * 100)}%
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-stone-900 border border-stone-800 text-[10px] text-stone-300">
                        {activeResult.policyGuardrails.toneCalibration}
                      </span>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
