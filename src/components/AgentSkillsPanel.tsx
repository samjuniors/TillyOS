import React, { useState } from 'react';
import {
  Cpu,
  Puzzle,
  Terminal,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  CheckCircle2,
  ShieldAlert,
  Search,
  Music,
  Play,
  Zap,
  Clock,
  Volume1,
  Layers,
  Send,
  RefreshCw,
  PlusCircle,
  KeyRound,
  Calendar,
  Github,
  StickyNote,
  Trash2,
  ExternalLink,
  LogOut,
  AlertTriangle,
} from 'lucide-react';
import {
  RegisteredSkillMetadata,
  VoiceSkillTurnTrace,
  CustomPluginInstallSpec,
  OAuthProviderStatus,
} from '../types';

interface AgentSkillsPanelProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  skills: RegisteredSkillMetadata[];
  confidenceThreshold: number;
  traces: VoiceSkillTurnTrace[];
  activeFiller: { skillName: string; toolName: string; fillerPhrase: string } | null;
  isRouting: boolean;
  onTestSkillUtterance: (utterance: string) => void;
  workspaceUser: { email: string | null; displayName: string | null } | null;
  isWorkspaceSigningIn?: boolean;
  onSignInWorkspace: () => Promise<void>;
  onSignOutWorkspace: () => Promise<void>;
  oauthProviders: OAuthProviderStatus[];
  onConnectOAuth: (provider: 'spotify' | 'github') => Promise<void>;
  onDisconnectOAuth: (provider: 'spotify' | 'github') => Promise<void>;
  onInstallPlugin: (spec: CustomPluginInstallSpec) => Promise<void>;
  onUninstallPlugin: (name: string) => Promise<void>;
  onTriggerConfirmTrace?: (trace: VoiceSkillTurnTrace) => void;
}

const QUICK_SKILL_TESTS = [
  {
    label: 'Sydney Weather',
    icon: Search,
    utterance: 'Search the web for current weather in Sydney Australia today',
    badge: 'web_search',
  },
  {
    label: 'Agentic Multi-Step',
    icon: Sparkles,
    utterance: 'Search the weather in Sydney and play Tame Impala on Spotify',
    badge: 'multi_step',
  },
  {
    label: 'Play Spotify',
    icon: Play,
    utterance: 'Play Tame Impala The Less I Know The Better on Spotify',
    badge: 'spotify',
  },
  {
    label: 'My Calendar',
    icon: Calendar,
    utterance: 'Check my Google Calendar events for today',
    badge: 'workspace',
  },
  {
    label: 'GitHub Search',
    icon: Github,
    utterance: 'Search GitHub repositories for model context protocol',
    badge: 'github',
  },
  {
    label: 'Time & Notes',
    icon: StickyNote,
    utterance: 'What time is it right now and calculate 128 * 16?',
    badge: 'productivity',
  },
];

function GoogleGIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

function getSkillIcon(name: string) {
  switch (name) {
    case 'spotify_control':
      return <Music className="w-4 h-4 text-emerald-400" />;
    case 'google_workspace':
      return <Calendar className="w-4 h-4 text-sky-400" />;
    case 'github_ops':
      return <Github className="w-4 h-4 text-purple-400" />;
    case 'productivity_agent':
      return <StickyNote className="w-4 h-4 text-amber-300" />;
    case 'web_search':
      return <Search className="w-4 h-4 text-amber-400" />;
    default:
      return <Puzzle className="w-4 h-4 text-emerald-300" />;
  }
}

export const AgentSkillsPanel: React.FC<AgentSkillsPanelProps> = ({
  isOpen,
  onToggleOpen,
  skills,
  confidenceThreshold,
  traces,
  activeFiller,
  isRouting,
  onTestSkillUtterance,
  workspaceUser,
  isWorkspaceSigningIn,
  onSignInWorkspace,
  onSignOutWorkspace,
  oauthProviders,
  onConnectOAuth,
  onDisconnectOAuth,
  onInstallPlugin,
  onUninstallPlugin,
  onTriggerConfirmTrace,
}) => {
  const [selectedTraceIdx, setSelectedTraceIdx] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'live_log' | 'registry' | 'install' | 'oauth'>('live_log');
  const [customUtterance, setCustomUtterance] = useState('');

  // Custom Plugin Installer state
  const [pluginName, setPluginName] = useState('');
  const [pluginDescription, setPluginDescription] = useState('');
  const [pluginCriteria, setPluginCriteria] = useState('');
  const [pluginFiller, setPluginFiller] = useState('Running your custom plugin...');
  const [handlerType, setHandlerType] = useState<'prompt' | 'webhook' | 'script'>('prompt');
  const [promptTemplate, setPromptTemplate] = useState(
    'Respond to this voice request concisely in 2 short sentences: {{input}}'
  );
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookMethod, setWebhookMethod] = useState<'GET' | 'POST'>('POST');
  const [scriptBody, setScriptBody] = useState(
    'return { summary: "Custom plugin ran with input: " + args.input };'
  );
  const [installStatus, setInstallStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);

  const [oauthError, setOauthError] = useState<string | null>(null);

  const activeTrace: VoiceSkillTurnTrace | null =
    traces.length > 0 ? traces[Math.min(selectedTraceIdx, traces.length - 1)] : null;

  const rd = activeTrace?.routingDecision;
  const thresholdPassed = rd ? rd.confidence >= rd.threshold : false;
  const totalLatencyMs =
    (rd?.latencyMs || 0) + (activeTrace?.toolResult?.executionTimeMs || 0);

  const handleCustomInstallSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInstallStatus(null);
    setIsInstalling(true);
    try {
      await onInstallPlugin({
        name: pluginName.trim(),
        description: pluginDescription.trim(),
        decision_criteria: pluginCriteria.trim(),
        filler_phrase: pluginFiller.trim() || undefined,
        handlerType,
        promptTemplate: handlerType === 'prompt' ? promptTemplate : undefined,
        webhookUrl: handlerType === 'webhook' ? webhookUrl : undefined,
        webhookMethod: handlerType === 'webhook' ? webhookMethod : undefined,
        scriptBody: handlerType === 'script' ? scriptBody : undefined,
      });
      setInstallStatus({
        type: 'ok',
        msg: `Installed custom plugin "${pluginName.trim()}"! Now voice-routable via gemini-decision-1.`,
      });
      setPluginName('');
      setPluginDescription('');
      setPluginCriteria('');
    } catch (err: any) {
      setInstallStatus({
        type: 'err',
        msg: err?.message || 'Failed to install plugin',
      });
    } finally {
      setIsInstalling(false);
    }
  };

  // Collapsed Pill View next to the Voice Orb
  if (!isOpen) {
    return (
      <button
        onClick={onToggleOpen}
        className="group flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-stone-900/90 hover:bg-stone-800/95 border border-stone-800 hover:border-amber-500/50 text-stone-200 shadow-xl backdrop-blur-md transition-all cursor-pointer"
        title="Expand Agent Skills & Decision Log"
      >
        <div className="w-7 h-7 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
          <Puzzle className="w-4 h-4" />
        </div>
        <div className="text-left">
          <div className="text-[11px] font-bold tracking-tight text-white flex items-center gap-1.5">
            <span>Agent Plugins & OAuth</span>
            <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-mono text-[9px]">
              {skills.length} ACTIVE
            </span>
          </div>
          <div className="text-[10px] text-stone-400 font-mono">
            {rd
              ? `Last: ${rd.selectedChoice} (${Math.round(rd.confidence * 100)}%)`
              : `gemini-decision-1 • ≥${Math.round(confidenceThreshold * 100)}% gate`}
          </div>
        </div>
        <ChevronLeft className="w-4 h-4 text-stone-400 group-hover:text-amber-400 transition-colors" />
      </button>
    );
  }

  return (
    <aside className="w-full lg:w-[420px] xl:w-[450px] shrink-0 rounded-2xl bg-stone-900/90 border border-stone-800/90 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden transition-all">
      {/* Header */}
      <div className="px-4 py-3 bg-stone-950/80 border-b border-stone-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Puzzle className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-bold tracking-tight text-white">
                Agent Plugins & Decision Log
              </h2>
              <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 font-mono text-[9px] font-semibold">
                v1beta
              </span>
            </div>
            <p className="text-[10px] text-stone-400 font-mono">
              gemini-decision-1 • {skills.length} Plugins • {workspaceUser ? 'Google Linked' : 'OAuth Ready'}
            </p>
          </div>
        </div>

        <button
          onClick={onToggleOpen}
          className="p-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-stone-200 border border-stone-800 transition-colors cursor-pointer"
          title="Collapse panel"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Mode Switch Tabs */}
      <div className="px-3 pt-2.5 pb-2 bg-stone-950/40 border-b border-stone-800/80 flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1 bg-stone-950 p-1 rounded-xl border border-stone-800 overflow-x-auto">
          <button
            onClick={() => setActiveTab('live_log')}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer shrink-0 ${
              activeTab === 'live_log'
                ? 'bg-amber-500 text-stone-950 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <Cpu className="w-3 h-3" />
            <span>Trace</span>
          </button>
          <button
            onClick={() => setActiveTab('registry')}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer shrink-0 ${
              activeTab === 'registry'
                ? 'bg-amber-500 text-stone-950 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>Plugins ({skills.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('install')}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer shrink-0 ${
              activeTab === 'install'
                ? 'bg-amber-500 text-stone-950 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <PlusCircle className="w-3 h-3" />
            <span>Install</span>
          </button>
          <button
            onClick={() => setActiveTab('oauth')}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer shrink-0 ${
              activeTab === 'oauth'
                ? 'bg-amber-500 text-stone-950 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <KeyRound className="w-3 h-3" />
            <span>OAuth</span>
            {workspaceUser && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-1 text-[9px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-1.5 py-1 rounded-lg shrink-0">
          <Zap className="w-2.5 h-2.5" />
          <span>0 tok</span>
        </div>
      </div>

      {/* Spoken Filler Banner */}
      {(activeFiller || isRouting) && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-xl bg-amber-950/70 border border-amber-600/60 text-amber-200 text-xs flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-2">
            <Volume1 className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <span className="font-semibold">
                {activeFiller
                  ? `Agent Tool (${activeFiller.skillName}): `
                  : 'Agentic routing via gemini-decision-1...'}
              </span>
              {activeFiller && (
                <span className="italic text-amber-100">"{activeFiller.fillerPhrase}"</span>
              )}
            </div>
          </div>
          <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
        </div>
      )}

      {/* TAB 1: LIVE DECISION & AGENTIC TOOL TRACE */}
      {activeTab === 'live_log' && (
        <div className="p-4 space-y-3.5 max-h-[550px] overflow-y-auto">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-stone-400">
                Test Agentic Voice Commands
              </span>
              <span className="text-[10px] font-mono text-stone-500">
                Gate: ≥{Math.round(confidenceThreshold * 100)}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_SKILL_TESTS.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <button
                    key={idx}
                    disabled={isRouting}
                    onClick={() => {
                      setSelectedTraceIdx(0);
                      onTestSkillUtterance(item.utterance);
                    }}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-stone-950/80 hover:bg-stone-800 border border-stone-800 hover:border-amber-500/40 text-left transition-all group disabled:opacity-50 cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Icon className="w-3 h-3 text-amber-400 shrink-0" />
                      <span className="text-[11px] font-medium text-stone-200 truncate">
                        {item.label}
                      </span>
                    </div>
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-stone-900 text-stone-400 group-hover:text-amber-300 shrink-0">
                      {item.badge}
                    </span>
                  </button>
                );
              })}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (customUtterance.trim() && !isRouting) {
                  setSelectedTraceIdx(0);
                  onTestSkillUtterance(customUtterance.trim());
                  setCustomUtterance('');
                }
              }}
              className="mt-2 flex items-center gap-1.5"
            >
              <input
                type="text"
                value={customUtterance}
                onChange={(e) => setCustomUtterance(e.target.value)}
                placeholder="Try compound command (e.g. 'Check Sydney weather & play chill music')..."
                className="flex-1 px-3 py-1.5 rounded-xl bg-stone-950 border border-stone-800 text-[11px] text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                disabled={!customUtterance.trim() || isRouting}
                className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-[11px] flex items-center gap-1 disabled:opacity-40 cursor-pointer"
              >
                <Send className="w-3 h-3" />
                <span>Run</span>
              </button>
            </form>
          </div>

          {activeTrace && rd ? (
            <>
              <div className="p-2.5 rounded-xl bg-stone-950/90 border border-stone-800/90">
                <div className="flex items-center justify-between text-[10px] text-stone-400 font-mono mb-1">
                  <span>VOICE TURN INPUT</span>
                  <span className="flex items-center gap-1 text-stone-300">
                    <Clock className="w-3 h-3 text-amber-400" />
                    {totalLatencyMs}ms total
                  </span>
                </div>
                <p className="text-xs font-medium text-white">"{activeTrace.userInput}"</p>
              </div>

              {/* STAGE 1: gemini-decision-1 */}
              <div className="p-3 rounded-xl bg-stone-950/90 border border-stone-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-300 text-[10px] font-mono font-bold flex items-center justify-center">
                      1
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-stone-200">
                      gemini-decision-1 Front-Door Router
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-950/90 border border-emerald-700/70 text-emerald-300 font-mono text-[10px] font-bold">
                    {rd.outputTokens} output tokens
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-lg bg-stone-900/90 border border-stone-800">
                    <div className="text-[9px] font-mono uppercase text-stone-400">
                      Selected Choice
                    </div>
                    <div className="text-xs font-mono font-bold text-amber-300 mt-0.5 truncate">
                      {rd.selectedChoice}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-stone-900/90 border border-stone-800">
                    <div className="text-[9px] font-mono uppercase text-stone-400">
                      Confidence (≥{Math.round(rd.threshold * 100)}%)
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className={`text-xs font-mono font-bold ${
                          thresholdPassed ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {(rd.confidence * 100).toFixed(1)}%
                      </span>
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.2 rounded ${
                          thresholdPassed
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                            : 'bg-stone-800 text-stone-300'
                        }`}
                      >
                        {thresholdPassed ? 'PASS' : 'BELOW GATE'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1 pt-1">
                  {Object.entries(rd.probabilities || {})
                    .sort((a, b) => Number(b[1]) - Number(a[1]))
                    .slice(0, 5)
                    .map(([optKey, prob]) => {
                      const pct = Math.round(Number(prob) * 100);
                      const isWinner = optKey === rd.selectedChoice;
                      return (
                        <div key={optKey} className="space-y-0.5">
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className={isWinner ? 'text-amber-300 font-bold' : 'text-stone-400'}>
                              {optKey}
                            </span>
                            <span className={isWinner ? 'text-amber-300 font-bold' : 'text-stone-400'}>
                              {pct}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-stone-900 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                isWinner ? 'bg-amber-400' : 'bg-stone-700'
                              }`}
                              style={{ width: `${Math.max(3, pct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* STAGE 2 & 3: Agentic Steps + Tool Execution */}
              <div className="p-3 rounded-xl bg-stone-950/90 border border-stone-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-300 text-[10px] font-mono font-bold flex items-center justify-center">
                      2
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-stone-200">
                      Agentic Plugin Execution
                    </span>
                  </div>
                  {activeTrace.toolResult ? (
                    <span
                      className={`px-2 py-0.5 rounded font-mono text-[10px] border ${
                        activeTrace.toolResult.mode === 'dry_run_mock'
                          ? 'bg-amber-950/80 border-amber-700/60 text-amber-300'
                          : 'bg-emerald-950/80 border-emerald-700/60 text-emerald-300'
                      }`}
                    >
                      {activeTrace.toolResult.mode?.toUpperCase() || 'LIVE'} •{' '}
                      {activeTrace.toolResult.executionTimeMs}ms
                    </span>
                  ) : rd.skillLoaded ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700/70 text-emerald-300 font-mono text-[10px] flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      ATTACHED
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-stone-900 border border-stone-700 text-stone-400 font-mono text-[10px] flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3 text-stone-400" />
                      DETACHED
                    </span>
                  )}
                </div>

                {/* Auth or Confirmation inline CTA if triggered */}
                {activeTrace.toolResult?.requiresAuth?.provider === 'google_workspace' && !workspaceUser && (
                  <div className="p-2.5 rounded-lg bg-sky-950/50 border border-sky-700/60 space-y-2">
                    <p className="text-[11px] text-sky-200">
                      Google Workspace OAuth is required for this command.
                    </p>
                    <button
                      onClick={() => onSignInWorkspace()}
                      disabled={isWorkspaceSigningIn}
                      className="w-full py-2 px-3 rounded-lg bg-white hover:bg-stone-100 text-[#1F1F1F] font-semibold text-xs flex items-center justify-center gap-2 shadow cursor-pointer"
                    >
                      <GoogleGIcon />
                      <span>{isWorkspaceSigningIn ? 'Connecting...' : 'Sign in with Google'}</span>
                    </button>
                  </div>
                )}

                {activeTrace.toolResult?.requiresConfirmation && onTriggerConfirmTrace && (
                  <div className="p-2.5 rounded-lg bg-amber-950/50 border border-amber-600/70 space-y-2">
                    <div className="flex items-center gap-1.5 text-amber-300 text-xs font-bold">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>{activeTrace.toolResult.requiresConfirmation.title}</span>
                    </div>
                    <p className="text-[11px] text-amber-100">
                      {activeTrace.toolResult.requiresConfirmation.description}
                    </p>
                    <button
                      onClick={() => onTriggerConfirmTrace(activeTrace)}
                      className="w-full py-1.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs cursor-pointer"
                    >
                      Review & Confirm Action
                    </button>
                  </div>
                )}

                {/* Multi-Step Agent Execution Chain */}
                {activeTrace.agentSteps && activeTrace.agentSteps.length > 0 ? (
                  <div className="space-y-2">
                    {activeTrace.agentSteps.map((step) => (
                      <div
                        key={step.stepNumber}
                        className="p-2.5 rounded-lg bg-stone-900/90 border border-stone-800 space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-amber-300 font-bold flex items-center gap-1">
                            <Terminal className="w-3 h-3" />
                            Step {step.stepNumber}: {step.skillName}.{step.toolName}()
                          </span>
                          <span className="text-emerald-400">{step.result.executionTimeMs}ms</span>
                        </div>
                        <pre className="p-2 rounded bg-stone-950 text-[10px] font-mono text-stone-300 overflow-x-auto">
                          {JSON.stringify(step.args)}
                        </pre>
                        <p className="text-xs text-stone-100 leading-relaxed">
                          "{step.result.voiceSummary}"
                        </p>
                      </div>
                    ))}
                  </div>
                ) : activeTrace.toolCall && activeTrace.toolResult ? (
                  <div className="space-y-2">
                    <div className="text-[10px] font-mono text-stone-400 flex items-center gap-1">
                      <Terminal className="w-3 h-3 text-amber-400" />
                      <span>
                        TOOL CALL:{' '}
                        <strong className="text-stone-200">{activeTrace.toolCall.toolName}</strong>
                      </span>
                    </div>
                    <pre className="p-2 rounded-lg bg-stone-900 border border-stone-800 text-[10px] font-mono text-amber-300 overflow-x-auto">
                      {JSON.stringify(activeTrace.toolCall.args, null, 2)}
                    </pre>
                    <div className="p-2.5 rounded-lg bg-stone-900/90 border border-stone-800">
                      <div className="text-[10px] font-mono text-emerald-400 uppercase mb-1">
                        Voice Response Summary
                      </div>
                      <p className="text-xs text-stone-100 leading-relaxed">
                        "{activeTrace.toolResult.voiceSummary}"
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-stone-500 font-mono">
                    No heavy plugin attached (Direct conversational response).
                  </p>
                )}
              </div>

              {traces.length > 1 && (
                <div className="pt-1">
                  <div className="text-[10px] font-mono uppercase text-stone-400 mb-1.5">
                    Recent Agentic Turns ({traces.length})
                  </div>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {traces.slice(0, 6).map((t, i) => (
                      <button
                        key={t.traceId}
                        onClick={() => setSelectedTraceIdx(i)}
                        className={`w-full px-2.5 py-1.5 rounded-lg border text-left flex items-center justify-between text-[11px] transition-colors cursor-pointer ${
                          i === selectedTraceIdx
                            ? 'bg-amber-500/15 border-amber-500/50 text-white'
                            : 'bg-stone-950/60 border-stone-800/80 text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        <span className="truncate pr-2">"{t.userInput}"</span>
                        <span className="font-mono text-[10px] text-amber-300 shrink-0">
                          {t.agentSteps && t.agentSteps.length > 1
                            ? `${t.agentSteps.length} steps`
                            : t.routingDecision.selectedChoice}{' '}
                          ({Math.round(t.routingDecision.confidence * 100)}%)
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-6 rounded-xl bg-stone-950/60 border border-stone-800/80 text-center space-y-2">
              <Cpu className="w-6 h-6 text-amber-400 mx-auto" />
              <div className="text-xs font-semibold text-stone-200">
                Agentic Voice Router Ready
              </div>
              <p className="text-[11px] text-stone-400 leading-relaxed">
                Speak any command or click a test trigger above. Compound commands automatically
                chain multiple prebuilt or custom plugins.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PREBUILT + CUSTOM PLUGINS REGISTRY */}
      {activeTab === 'registry' && (
        <div className="p-4 space-y-3 max-h-[550px] overflow-y-auto">
          <div className="p-2.5 rounded-xl bg-stone-950/80 border border-stone-800 text-[11px] text-stone-300 leading-relaxed">
            Prebuilt essential plugins (<code className="text-amber-300 font-mono">web_search</code>,{' '}
            <code className="text-emerald-300 font-mono">spotify_control</code>,{' '}
            <code className="text-sky-300 font-mono">google_workspace</code>,{' '}
            <code className="text-purple-300 font-mono">github_ops</code>,{' '}
            <code className="text-amber-200 font-mono">productivity_agent</code>) plus any custom plugins you install.
          </div>

          {skills.map((skill) => (
            <div
              key={skill.name}
              className="p-3 rounded-xl bg-stone-950 border border-stone-800 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {getSkillIcon(skill.name)}
                  <span className="text-xs font-mono font-bold text-white truncate">
                    skills/{skill.name}.ts
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {skill.oauthProvider && skill.oauthProvider !== 'none' && (
                    <span className="px-1.5 py-0.5 rounded bg-sky-950 border border-sky-700/60 text-[9px] font-mono text-sky-300">
                      OAuth
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded bg-stone-900 border border-stone-700 text-[10px] font-mono text-amber-300">
                    {skill.tool_declarations.length} tool(s)
                  </span>
                  {skill.isCustom && (
                    <button
                      onClick={() => onUninstallPlugin(skill.name)}
                      className="p-1 rounded bg-rose-950/70 hover:bg-rose-900 border border-rose-800/60 text-rose-300 cursor-pointer"
                      title="Uninstall custom plugin"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-stone-300">{skill.description}</p>

              <div className="p-2 rounded-lg bg-stone-900/90 border border-stone-800/90">
                <div className="text-[9px] font-mono uppercase text-amber-400 mb-0.5">
                  gemini-decision-1 Choice Criteria:
                </div>
                <p className="text-[10px] text-stone-300 leading-relaxed">
                  {skill.decision_criteria}
                </p>
              </div>

              <div className="space-y-1">
                {skill.tool_declarations.map((td) => (
                  <div
                    key={td.name}
                    className="p-2 rounded-lg bg-stone-900 border border-stone-800 text-[10px] font-mono"
                  >
                    <span className="text-emerald-300 font-bold">{td.name}()</span>
                    <span className="text-stone-400 ml-1.5">{td.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: CUSTOM PLUGIN INSTALLER */}
      {activeTab === 'install' && (
        <div className="p-4 space-y-3 max-h-[550px] overflow-y-auto">
          <div className="p-2.5 rounded-xl bg-stone-950/80 border border-stone-800 space-y-2">
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <PlusCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>Install Custom Voice Plugin</span>
            </div>
            <p className="text-[11px] text-stone-400">
              Drop a new live capability directly into <code className="text-amber-300">/skills/</code>.
              Matilda &amp; <code className="text-amber-300">gemini-decision-1</code> will immediately
              route voice commands to it.
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setPluginName('crypto_brief');
                  setPluginDescription('Checks live Bitcoin or Ethereum price using CoinGecko API.');
                  setPluginCriteria('User asks for Bitcoin, Ethereum, or crypto price.');
                  setPluginFiller('Checking live crypto prices...');
                  setHandlerType('webhook');
                  setWebhookMethod('GET');
                  setWebhookUrl(
                    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd'
                  );
                }}
                className="px-2 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-700 text-[10px] text-amber-300 cursor-pointer"
              >
                Preset: Live Crypto Price Webhook
              </button>
              <button
                type="button"
                onClick={() => {
                  setPluginName('daily_coach');
                  setPluginDescription('Gives focused daily standup coaching & priority breakdown.');
                  setPluginCriteria('User asks for daily standup help, focus plan, or coaching.');
                  setPluginFiller('Preparing your daily focus plan...');
                  setHandlerType('prompt');
                  setPromptTemplate(
                    'Act as a decisive executive coach. Turn this voice input into 3 crisp priorities in 2 sentences max: {{input}}'
                  );
                }}
                className="px-2 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-700 text-[10px] text-emerald-300 cursor-pointer"
              >
                Preset: Executive Coach Prompt
              </button>
            </div>
          </div>

          <form onSubmit={handleCustomInstallSubmit} className="space-y-2.5">
            <div>
              <label className="block text-[10px] font-mono text-stone-400 mb-1">
                Plugin ID (snake_case)
              </label>
              <input
                type="text"
                required
                value={pluginName}
                onChange={(e) => setPluginName(e.target.value)}
                placeholder="e.g. crypto_brief"
                className="w-full px-3 py-1.5 rounded-xl bg-stone-950 border border-stone-800 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono text-stone-400 mb-1">
                Description
              </label>
              <input
                type="text"
                required
                value={pluginDescription}
                onChange={(e) => setPluginDescription(e.target.value)}
                placeholder="What this plugin does..."
                className="w-full px-3 py-1.5 rounded-xl bg-stone-950 border border-stone-800 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono text-stone-400 mb-1">
                Voice Routing Criteria (for gemini-decision-1)
              </label>
              <textarea
                rows={2}
                required
                value={pluginCriteria}
                onChange={(e) => setPluginCriteria(e.target.value)}
                placeholder="When should Matilda route voice turns here?"
                className="w-full px-3 py-1.5 rounded-xl bg-stone-950 border border-stone-800 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {(['prompt', 'webhook', 'script'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setHandlerType(t)}
                  className={`py-1.5 rounded-lg border text-[11px] font-mono uppercase cursor-pointer ${
                    handlerType === t
                      ? 'bg-amber-500 text-stone-950 border-amber-400 font-bold'
                      : 'bg-stone-950 text-stone-400 border-stone-800 hover:text-stone-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {handlerType === 'prompt' && (
              <div>
                <label className="block text-[10px] font-mono text-stone-400 mb-1">
                  Prompt Template (use {'{{input}}'})
                </label>
                <textarea
                  rows={3}
                  value={promptTemplate}
                  onChange={(e) => setPromptTemplate(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-stone-950 border border-stone-800 text-xs text-amber-200 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>
            )}

            {handlerType === 'webhook' && (
              <div className="space-y-2">
                <div className="flex gap-1.5">
                  <select
                    value={webhookMethod}
                    onChange={(e) => setWebhookMethod(e.target.value as 'GET' | 'POST')}
                    className="px-2 py-1.5 rounded-xl bg-stone-950 border border-stone-800 text-xs text-white font-mono"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>
                  <input
                    type="url"
                    required
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://api.example.com/endpoint"
                    className="flex-1 px-3 py-1.5 rounded-xl bg-stone-950 border border-stone-800 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            )}

            {handlerType === 'script' && (
              <div>
                <label className="block text-[10px] font-mono text-stone-400 mb-1">
                  JS Handler Body (receives args.input)
                </label>
                <textarea
                  rows={3}
                  value={scriptBody}
                  onChange={(e) => setScriptBody(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-stone-950 border border-stone-800 text-xs text-emerald-300 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>
            )}

            {installStatus && (
              <div
                className={`p-2 rounded-xl text-[11px] border ${
                  installStatus.type === 'ok'
                    ? 'bg-emerald-950/70 border-emerald-700 text-emerald-200'
                    : 'bg-rose-950/70 border-rose-700 text-rose-200'
                }`}
              >
                {installStatus.msg}
              </div>
            )}

            <button
              type="submit"
              disabled={isInstalling}
              className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>{isInstalling ? 'Installing Plugin...' : 'Install & Register Plugin'}</span>
            </button>
          </form>
        </div>
      )}

      {/* TAB 4: OAUTH SETUP (1P GOOGLE WORKSPACE + 3P SPOTIFY / GITHUB) */}
      {activeTab === 'oauth' && (
        <div className="p-4 space-y-3 max-h-[550px] overflow-y-auto">
          {/* 1P Google Workspace OAuth Card */}
          <div className="p-3 rounded-xl bg-stone-950 border border-stone-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-sky-400" />
                <span className="text-xs font-bold text-white">Google Workspace OAuth</span>
              </div>
              <span
                className={`px-2 py-0.5 rounded font-mono text-[9px] border ${
                  workspaceUser
                    ? 'bg-emerald-950 border-emerald-700/70 text-emerald-300'
                    : 'bg-stone-900 border-stone-700 text-stone-400'
                }`}
              >
                {workspaceUser ? 'CONNECTED' : 'NOT LINKED'}
              </span>
            </div>
            <p className="text-[11px] text-stone-400 leading-relaxed">
              Authorize Matilda to read &amp; act across Google Calendar, Gmail, Tasks, and Drive
              using your Google account (in-memory OAuth token only).
            </p>

            {workspaceUser ? (
              <div className="flex items-center justify-between p-2 rounded-lg bg-stone-900 border border-stone-800">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">
                    {workspaceUser.displayName || 'Google User'}
                  </div>
                  <div className="text-[10px] font-mono text-stone-400 truncate">
                    {workspaceUser.email}
                  </div>
                </div>
                <button
                  onClick={() => onSignOutWorkspace()}
                  className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-[11px] flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <LogOut className="w-3 h-3" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <button
                onClick={async () => {
                  setOauthError(null);
                  try {
                    await onSignInWorkspace();
                  } catch (err: any) {
                    setOauthError(err?.message || 'Google Sign-In cancelled or failed.');
                  }
                }}
                disabled={isWorkspaceSigningIn}
                className="w-full py-2 px-4 rounded-lg bg-white hover:bg-stone-100 text-[#1F1F1F] border border-[#747775] font-medium text-xs flex items-center justify-center gap-2.5 shadow-sm transition-colors cursor-pointer"
              >
                <GoogleGIcon />
                <span>{isWorkspaceSigningIn ? 'Signing in...' : 'Sign in with Google'}</span>
              </button>
            )}
          </div>

          {/* 3P OAuth Providers (Spotify & GitHub) */}
          {oauthProviders.map((prov) => (
            <div
              key={prov.provider}
              className="p-3 rounded-xl bg-stone-950 border border-stone-800 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {prov.provider === 'spotify' ? (
                    <Music className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Github className="w-4 h-4 text-purple-400" />
                  )}
                  <span className="text-xs font-bold text-white">{prov.name}</span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded font-mono text-[9px] border ${
                    prov.connected
                      ? 'bg-emerald-950 border-emerald-700/70 text-emerald-300'
                      : prov.configured
                      ? 'bg-amber-950 border-amber-700/60 text-amber-300'
                      : 'bg-stone-900 border-stone-700 text-stone-400'
                  }`}
                >
                  {prov.connected
                    ? `LINKED (${prov.accountLabel || 'OK'})`
                    : prov.configured
                    ? 'READY TO LINK'
                    : 'DRY-RUN / PUBLIC'}
                </span>
              </div>

              <div className="p-2 rounded-lg bg-stone-900/90 border border-stone-800 text-[10px] font-mono text-stone-400 break-all">
                <span className="text-stone-500">Callback URI: </span>
                <span className="text-amber-300">{prov.callbackUrl}</span>
              </div>

              <div className="flex items-center gap-2">
                {prov.connected ? (
                  <button
                    onClick={() => onDisconnectOAuth(prov.provider)}
                    className="flex-1 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-300 text-[11px] font-medium cursor-pointer"
                  >
                    Disconnect {prov.provider}
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      setOauthError(null);
                      try {
                        await onConnectOAuth(prov.provider);
                      } catch (err: any) {
                        setOauthError(err?.message || `Could not start ${prov.provider} OAuth.`);
                      }
                    }}
                    className="flex-1 py-1.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Connect {prov.provider === 'spotify' ? 'Spotify' : 'GitHub'} via OAuth</span>
                  </button>
                )}
              </div>
            </div>
          ))}

          {oauthError && (
            <div className="p-2.5 rounded-xl bg-amber-950/70 border border-amber-700/70 text-[11px] text-amber-200 leading-relaxed">
              {oauthError}
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
