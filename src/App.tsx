/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Terminal as TerminalIcon,
  Music,
  Settings,
  VolumeX,
  ExternalLink,
  Search,
  Pause,
  Play,
  Send,
  MessageCircle,
  Radio,
  Sparkles,
  Cpu,
  Puzzle,
  AlertTriangle,
  ShieldCheck,
  X,
  Monitor,
  Square,
} from 'lucide-react';
import {
  Message,
  PersonaSettings,
  LiveState,
  WebSearchResult,
  UIAction,
  DecisionEngineResult,
  RegisteredSkillMetadata,
  VoiceSkillTurnTrace,
  CustomPluginInstallSpec,
  OAuthProviderStatus,
  ComputerUsePublicState,
} from './types';
import { useMemory } from './hooks/useMemory';
import {
  sendMessageToChat,
  fetchTTSAudio,
  evaluateWithDecisionEngine,
  fetchRegisteredSkills,
  executeSkillRoute,
  installCustomPlugin,
  uninstallCustomPlugin,
  fetchOAuthProviders,
  getOAuthStartUrl,
  disconnectOAuthProvider,
  discoverOAuthWebsite,
  configureOAuthConnector,
  deleteOAuthConnector,
  fetchComputerUseState,
  confirmComputerAction,
  stopComputerTask,
} from './services/api';
import {
  initWorkspaceAuth,
  signInGoogleWorkspace,
  signOutGoogleWorkspace,
  getWorkspaceAccessToken,
} from './services/workspaceAuth';
import { playPcmAudio, stopCurrentAudio } from './services/audioUtils';
import { LiveSessionClient } from './services/liveClient';
import { ambientMusic } from './services/ambientMusic';
import { AcousticDetector } from './services/acousticDetector';
import { BootScreen } from './components/BootScreen';
import { VoiceVisualizer } from './components/VoiceVisualizer';
import { TerminalHUD } from './components/TerminalHUD';
import { PersonaSettingsModal } from './components/PersonaSettingsModal';
import { AdviceJournalModal } from './components/AdviceJournalModal';
import { DecisionEngineModal } from './components/DecisionEngineModal';
import { AgentSkillsPanel } from './components/AgentSkillsPanel';
import { ComputerUseStudio } from './components/ComputerUseStudio';

const DEFAULT_SETTINGS: PersonaSettings = {
  slangLevel: 'everyday',
  autoSpeakResponse: true,
  handsFreeVad: true,
  voiceVolume: 1.0,
  userName: '',
};

export default function App() {
  // Boot Sequence State
  const [isBooted, setIsBooted] = useState(false);
  const [isMicReady, setIsMicReady] = useState(false);
  const [liveAudioLevel, setLiveAudioLevel] = useState(0);

  const [messages, setMessages] = useState<Message[]>([]);
  const [systemLogs, setSystemLogs] = useState<string[]>([
    'MATILDA SYSTEM INITIALIZED [v3.8]',
    'ALWAYS-ACTIVE GEMINI LIVE API ENGINE READY',
  ]);

  // Subtitles & speech state
  const [currentSubtitle, setCurrentSubtitle] = useState<string>(
    "G'day mate! I'm Matilda. Live audio connection is active—just speak freely, no clicking needed."
  );
  const [userLastUtterance, setUserLastUtterance] = useState<string>('');

  // Wake & Focus State
  const [isWakeFocused, setIsWakeFocused] = useState(false);
  const [isSleeping, setIsSleeping] = useState(false);

  // Audio / Speech State
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);

  // Emotional & Acoustic State
  const [currentEmotion, setCurrentEmotion] = useState('warm & caring');
  const [feelingsDescription, setFeelingsDescription] = useState(
    'Connected via live duplex audio, feeling attentive and warmly welcoming.'
  );
  const [userMood, setUserMood] = useState('relaxed');
  const [detectedAcoustics, setDetectedAcoustics] = useState<string[]>([]);
  const [acousticToast, setAcousticToast] = useState<{ icon: string; text: string } | null>(null);

  // Music State
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [currentTrackName, setCurrentTrackName] = useState('Byron Bay Sunset');

  // Web Search Grounding Card State
  const [activeSearchResults, setActiveSearchResults] = useState<WebSearchResult[] | null>(null);
  const [activeSearchQuery, setActiveSearchQuery] = useState<string | null>(null);

  // UI Modals & Terminal
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAdviceOpen, setIsAdviceOpen] = useState(false);
  const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);
  const [latestDecision, setLatestDecision] = useState<DecisionEngineResult | null>(null);
  const [decisionHistory, setDecisionHistory] = useState<DecisionEngineResult[]>([]);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInputValue, setTextInputValue] = useState('');

  // Modular Skill & Plugin Architecture State
  const [isSkillsPanelOpen, setIsSkillsPanelOpen] = useState(true);
  const [registeredSkills, setRegisteredSkills] = useState<RegisteredSkillMetadata[]>([]);
  const [skillConfidenceThreshold, setSkillConfidenceThreshold] = useState<number>(0.75);
  const [skillTraces, setSkillTraces] = useState<VoiceSkillTurnTrace[]>([]);
  const [activeSkillFiller, setActiveSkillFiller] = useState<{
    skillName: string;
    toolName: string;
    fillerPhrase: string;
  } | null>(null);
  const [isSkillRouting, setIsSkillRouting] = useState(false);

  // OAuth & In-App Confirmation Modal State
  const [workspaceUser, setWorkspaceUser] = useState<{ email: string | null; displayName: string | null } | null>(null);
  const [workspaceToken, setWorkspaceToken] = useState<string | null>(null);
  const [isWorkspaceSigningIn, setIsWorkspaceSigningIn] = useState(false);
  const [oauthProviders, setOauthProviders] = useState<OAuthProviderStatus[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<VoiceSkillTurnTrace | null>(null);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);

  // Hybrid Computer Use Studio State
  const [isComputerUseOpen, setIsComputerUseOpen] = useState(false);
  const [isConfirmingComputerAction, setIsConfirmingComputerAction] = useState(false);
  const [computerState, setComputerState] = useState<ComputerUsePublicState>({
    targetMode: 'hybrid',
    bridge: { connected: false },
    sandbox: {
      ready: false,
      launching: false,
      currentUrl: 'about:blank',
      pageTitle: 'Cloud Browser Sandbox',
      viewportWidth: 1280,
      viewportHeight: 720,
      error: null,
    },
    latestFrame: null,
    session: {
      sessionId: 'cu-idle',
      goal: '',
      targetMode: 'hybrid',
      status: 'idle',
      maxSteps: 8,
      currentStep: 0,
      summary: 'Ready for Desktop Bridge or Browser Sandbox commands.',
      error: null,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [],
      pendingConfirmation: null,
      lastCoords: null,
    },
  });

  // Settings
  const [settings, setSettings] = useState<PersonaSettings>(() => {
    try {
      const saved = localStorage.getItem('matilda_persona_settings');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEFAULT_SETTINGS;
  });

  // Memories Hook
  const {
    memories,
    memorySummary,
    addExtractedMemories,
    getMemoryPromptString,
  } = useMemory();

  // Gemini Live API State (ALWAYS ACTIVE by default)
  const [isLiveMode, setIsLiveMode] = useState(true);
  const [liveState, setLiveState] = useState<LiveState>('idle');
  const [activeLanguage, setActiveLanguage] = useState<string>(
    settings.languagePreference && settings.languagePreference !== 'auto' ? settings.languagePreference : 'English'
  );
  const [isExplicitLanguage, setIsExplicitLanguage] = useState<boolean>(
    !!(settings.languagePreference && settings.languagePreference !== 'auto')
  );
  const liveClientRef = useRef<LiveSessionClient | null>(null);

  // Detector ref for boot screen clap/wake
  const detectorRef = useRef<AcousticDetector | null>(null);
  const audioStopFnRef = useRef<(() => void) | null>(null);
  const isBootingRef = useRef(false);

  const addLog = useCallback((text: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setSystemLogs((prev) => [...prev.slice(-70), `[${timestamp}] ${text}`]);
  }, []);

  // Stop active Matilda voice playback
  const handleStopAudio = useCallback(() => {
    if (audioStopFnRef.current) {
      audioStopFnRef.current();
      audioStopFnRef.current = null;
    }
    stopCurrentAudio();
    setIsSpeaking(false);
    setPlayingMessageId(null);
  }, []);

  // Execute UI actions triggered by voice or response
  const handleExecuteUIAction = useCallback((action: UIAction, searchResults?: WebSearchResult[]) => {
    addLog(`ACTION TRIGGERED: ${action.type} ${action.param || ''}`);

    switch (action.type) {
      case 'play_music':
        ambientMusic.play(action.param || 'Byron Bay Sunset');
        setIsMusicPlaying(true);
        setCurrentTrackName(action.param || 'Byron Bay Sunset');
        addLog(`MUSIC: Started track "${action.param || 'Byron Bay Sunset'}"`);
        break;

      case 'pause_music':
        ambientMusic.pause();
        setIsMusicPlaying(false);
        addLog('MUSIC: Paused');
        break;

      case 'resume_music':
        ambientMusic.resume();
        setIsMusicPlaying(true);
        addLog('MUSIC: Resumed');
        break;

      case 'open_terminal':
        setIsTerminalOpen(true);
        break;

      case 'close_terminal':
        setIsTerminalOpen(false);
        break;

      case 'open_advice':
        setIsAdviceOpen(true);
        break;

      case 'open_decision_engine':
        setIsDecisionModalOpen(true);
        break;

      case 'open_computer_use':
        setIsComputerUseOpen(true);
        break;

      case 'web_search':
        if (searchResults && searchResults.length > 0) {
          setActiveSearchResults(searchResults);
          setActiveSearchQuery(action.param || 'Live Web Information');
        }
        break;

      default:
        break;
    }
  }, [addLog]);

  const recordDecisionResult = useCallback((decision: DecisionEngineResult) => {
    setLatestDecision(decision);
    setDecisionHistory((prev) => [decision, ...prev.filter((d) => d.decisionId !== decision.decisionId)].slice(0, 20));
    const gateLabel = decision.confidenceGate?.passed === false
      ? `ESCALATED (${decision.confidenceGate.escalationTarget})`
      : 'GATE PASSED';
    addLog(
      `[GEMINI DECISION 1]: Intent=${decision.intentClassification} (${Math.round(decision.confidenceScore * 100)}% • ${gateLabel}) → Route=${decision.selectedRoute}`
    );
  }, [addLog]);

  // Apply a VoiceSkillTurnTrace from either Live WebSocket or REST skill test
  const handleApplySkillTurnTrace = useCallback(
    (trace: VoiceSkillTurnTrace) => {
      setActiveSkillFiller(null);
      setSkillTraces((prev) => [trace, ...prev.filter((t) => t.traceId !== trace.traceId)].slice(0, 25));

      const confPct = Math.round(trace.routingDecision.confidence * 100);
      addLog(
        `[SKILL ROUTER gemini-decision-1]: choice=${trace.routingDecision.selectedChoice} (${confPct}% • 0 out tokens) → Plugin=${
          trace.routingDecision.skillLoaded || 'NONE (Detached)'
        }`
      );

      if (trace.agentSteps && trace.agentSteps.length > 0) {
        for (const step of trace.agentSteps) {
          addLog(
            `[AGENT STEP ${step.stepNumber}]: ${step.skillName}.${step.toolName}(${JSON.stringify(
              step.args
            )}) → ${step.result.voiceSummary}`
          );
          if (step.result.uiAction) {
            const sources = Array.isArray(step.result.data?.sources)
              ? step.result.data.sources
              : undefined;
            handleExecuteUIAction(step.result.uiAction, sources);
          }
          if (
            step.toolName === 'set_volume' &&
            typeof step.args?.percent === 'number'
          ) {
            ambientMusic.setVolume(step.args.percent / 100);
          }
        }
        if (trace.toolResult?.voiceSummary) {
          setCurrentSubtitle(trace.toolResult.voiceSummary);
        }
        if (trace.toolResult?.requiresConfirmation) {
          setPendingConfirmation(trace);
        }
      } else if (trace.toolCall && trace.toolResult) {
        addLog(
          `[SKILL EXECUTED]: ${trace.toolCall.skillName}.${trace.toolCall.toolName}(${JSON.stringify(
            trace.toolCall.args
          )}) → ${trace.toolResult.voiceSummary}`
        );
        setCurrentSubtitle(trace.toolResult.voiceSummary);

        if (trace.toolResult.uiAction) {
          const sources = Array.isArray(trace.toolResult.data?.sources)
            ? trace.toolResult.data.sources
            : undefined;
          handleExecuteUIAction(trace.toolResult.uiAction, sources);
        }

        if (
          trace.toolCall.toolName === 'set_volume' &&
          typeof trace.toolCall.args?.percent === 'number'
        ) {
          ambientMusic.setVolume(trace.toolCall.args.percent / 100);
        }

        if (trace.toolResult.requiresConfirmation) {
          setPendingConfirmation(trace);
        }
      }
    },
    [addLog, handleExecuteUIAction]
  );

  // Load registered skills + OAuth providers & initialize Workspace auth listener on mount
  useEffect(() => {
    fetchRegisteredSkills()
      .then((res) => {
        setRegisteredSkills(res.skills || []);
        if (typeof res.confidenceThreshold === 'number') {
          setSkillConfidenceThreshold(res.confidenceThreshold);
        }
        if (Array.isArray(res.recentTraces) && res.recentTraces.length > 0) {
          setSkillTraces(res.recentTraces);
        }
      })
      .catch((err) => {
        console.warn('Could not load skills registry metadata:', err);
      });

    fetchOAuthProviders()
      .then((res) => setOauthProviders(res.providers || []))
      .catch(() => {});

    const unsubscribeAuth = initWorkspaceAuth(
      (user, token) => {
        setWorkspaceUser({ email: user.email, displayName: user.displayName });
        setWorkspaceToken(token);
        liveClientRef.current?.setWorkspaceToken(token);
        addLog(`GOOGLE WORKSPACE OAUTH CONNECTED: ${user.email || 'Authorized'}`);
      },
      () => {
        setWorkspaceUser(null);
        setWorkspaceToken(null);
        liveClientRef.current?.setWorkspaceToken(null);
      }
    );

    const handleOAuthMessage = (event: MessageEvent) => {
      if (
        !event.origin.endsWith('.run.app') &&
        !event.origin.includes('localhost') &&
        event.origin !== window.location.origin
      ) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        addLog(`OAUTH CONNECTED: ${String(event.data.provider).toUpperCase()} (${event.data.accountLabel || 'Linked'})`);
        if (event.data.provider === 'google' && event.data.accessToken) {
          setWorkspaceUser({
            email: event.data.accountLabel || 'Google Account',
            displayName: event.data.accountLabel || 'Google Workspace Direct',
          });
          setWorkspaceToken(event.data.accessToken);
          liveClientRef.current?.setWorkspaceToken(event.data.accessToken);
        }
        fetchOAuthProviders()
          .then((res) => setOauthProviders(res.providers || []))
          .catch(() => {});
        fetchRegisteredSkills()
          .then((res) => setRegisteredSkills(res.skills || []))
          .catch(() => {});
      }
    };
    window.addEventListener('message', handleOAuthMessage);

    // Subscribe to real-time Computer Use Studio state (Desktop Bridge frames + Sandbox + Safety Gates)
    let cuWs: WebSocket | null = null;
    let cuClosed = false;
    fetchComputerUseState()
      .then((st) => setComputerState(st))
      .catch(() => {});

    const connectComputerWs = () => {
      if (cuClosed) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      cuWs = new WebSocket(`${proto}//${window.location.host}/api/computer-bridge-ws?role=ui`);
      cuWs.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data);
          if (payload.type === 'computer_state' && payload.state) {
            setComputerState(payload.state);
          }
        } catch {}
      };
      cuWs.onclose = () => {
        if (!cuClosed) {
          setTimeout(connectComputerWs, 3000);
        }
      };
    };
    connectComputerWs();

    return () => {
      cuClosed = true;
      cuWs?.close();
      unsubscribeAuth();
      window.removeEventListener('message', handleOAuthMessage);
    };
  }, [addLog]);

  // Start Gemini Live API Session (Always Active)
  const startLiveAPI = useCallback(() => {
    if (liveClientRef.current) {
      if (liveClientRef.current.isConnected) {
        if (liveClientRef.current.isPaused) {
          liveClientRef.current.resume();
          addLog('GEMINI LIVE API: Resumed live duplex audio stream');
        }
        return;
      }
      liveClientRef.current.disconnect();
      liveClientRef.current = null;
    }

    addLog('CONNECTING ALWAYS-ACTIVE GEMINI LIVE API (gemini-3.8-live)...');
    setIsLiveMode(true);
    handleStopAudio();

    const client = new LiveSessionClient({
      onStatusChange: (status, errorMsg) => {
        setLiveState(status);
        if (status === 'speaking') {
          setIsSpeaking(true);
        } else if (status === 'listening' || status === 'idle' || status === 'paused') {
          setIsSpeaking(false);
        }
        if (status === 'paused') {
          addLog('LIVE API PAUSED: Outgoing audio stream muted');
        } else if (status === 'listening') {
          addLog('LIVE API ACTIVE: Listening for voice & acoustic cues');
        }
        if (errorMsg) {
          addLog(`LIVE ERROR: ${errorMsg}`);
        }
      },
      onTextReceived: (text) => {
        setCurrentSubtitle((prev) => {
          // Accumulate or set text
          if (prev.endsWith('.') || prev.endsWith('?') || prev.endsWith('!')) {
            return text;
          }
          return `${prev} ${text}`;
        });
      },
      onUserSpeechDetected: (active) => {
        if (active) {
          setIsWakeFocused(true);
        }
      },
      onTillySpeechDetected: (active) => {
        setIsSpeaking(active);
        if (active) {
          setIsWakeFocused(false);
        }
      },
      onUserSpeechTranscript: (transcript) => {
        setUserLastUtterance(transcript);
        const lower = transcript.toLowerCase();

        // Check for UI Commands directly during Live speech
        if (lower.includes('pause music') || lower.includes('stop music')) {
          handleExecuteUIAction({ type: 'pause_music' });
        } else if (lower.includes('play music') || lower.includes('play tunes') || lower.includes('coastal music')) {
          handleExecuteUIAction({ type: 'play_music', param: 'Byron Bay Sunset' });
        } else if (lower.includes('open terminal') || lower.includes('show terminal') || lower.includes('show logs')) {
          handleExecuteUIAction({ type: 'open_terminal' });
        } else if (lower.includes('close terminal')) {
          handleExecuteUIAction({ type: 'close_terminal' });
        } else if (lower.includes('decision engine') || lower.includes('open decision')) {
          handleExecuteUIAction({ type: 'open_decision_engine' });
        }

        // Evaluate live utterance asynchronously through Gemini Decision 1.0 Engine API
        evaluateWithDecisionEngine({
          input: transcript,
          mode: 'autonomous_routing',
          context: {
            detectedAcoustics,
            userMood,
            activeLanguage,
            memorySummary: getMemoryPromptString(),
          },
        })
          .then((decision) => {
            recordDecisionResult(decision);
          })
          .catch(() => {});
      },
      onPhysicalSoundDetected: (sound) => {
        addLog(`ACOUSTIC DSP SENSOR: Physical [${sound.event.toUpperCase()}] detected! (${sound.description})`);
        setDetectedAcoustics([sound.event]);

        // Evaluate physical acoustic event via Gemini Decision 1.0 Engine
        evaluateWithDecisionEngine({
          input: `[Physical Acoustic Event: ${sound.event}] ${sound.description}`,
          mode: 'full_cognitive',
          context: {
            detectedAcoustics: [sound.event],
            userMood: sound.event === 'cough' ? 'crook / unwell' : sound.event === 'sigh' ? 'weary / heavy' : userMood,
            activeLanguage,
            memorySummary: getMemoryPromptString(),
          },
        })
          .then((decision) => {
            recordDecisionResult(decision);
          })
          .catch(() => {});

        // Auto-dismiss the acoustic badge after 4.5 seconds so it does not linger permanently
        setTimeout(() => {
          setDetectedAcoustics((prev) => (prev.includes(sound.event) ? [] : prev));
        }, 4500);

        if (sound.event === 'cough') {
          setAcousticToast({ icon: '😷', text: 'Physical Cough Detected • Matilda responding...' });
          setUserMood('crook / unwell');
          setCurrentEmotion('caring & concerned');
          setFeelingsDescription('Deeply concerned about your cough; offering warm, attentive support for your health.');
          setIsWakeFocused(true);

          // Prompt the AI live voice session so Matilda actually speaks and reacts to the sound!
          if (liveClientRef.current?.isConnected) {
            liveClientRef.current.sendTextMessage(
              '[ACOUSTIC SOUND DETECTED: The user just physically coughed into the mic. Stop immediately and check on them with genuine heartfelt concern for their health in whichever language you are speaking!]'
            );
          }
        } else if (sound.event === 'sigh') {
          setAcousticToast({ icon: '😮‍💨', text: 'Heavy Sigh Detected • Matilda offering empathy...' });
          setUserMood('weary / heavy');
          setCurrentEmotion('gentle & empathetic');
          setFeelingsDescription('Hearing that heavy sigh, wrapping you in warmth and gentle support.');
          setIsWakeFocused(true);

          if (liveClientRef.current?.isConnected) {
            liveClientRef.current.sendTextMessage(
              '[ACOUSTIC SOUND DETECTED: The user just let out a heavy, weary sigh. Respond immediately with gentle empathy, asking what is on their mind in the language being spoken.]'
            );
          }
        } else if (sound.event === 'throat_clear') {
          setAcousticToast({ icon: '🫁', text: 'Throat Clearing Detected • Matilda checking in...' });
          setUserMood('checking in');
          setCurrentEmotion('attentive');

          if (liveClientRef.current?.isConnected) {
            liveClientRef.current.sendTextMessage(
              '[ACOUSTIC SOUND DETECTED: The user just cleared their throat. Briefly check in to make sure they are comfortable or need water.]'
            );
          }
        } else if (sound.event === 'laughter') {
          setAcousticToast({ icon: '😄', text: 'Laughter Detected • Matilda sharing the smile...' });
          setUserMood('cheerful / amused');
          setCurrentEmotion('bright & happy');

          if (liveClientRef.current?.isConnected) {
            liveClientRef.current.sendTextMessage(
              '[ACOUSTIC SOUND DETECTED: The user is laughing warmly. Smile with them and share in their cheerfulness in the language being spoken!]'
            );
          }
        } else if (sound.event === 'clap') {
          setAcousticToast({ icon: '👏', text: 'Clap Detected!' });
        }

        setTimeout(() => {
          setAcousticToast(null);
        }, 5000);
      },
      onLanguageDetected: (language, isExplicit) => {
        setActiveLanguage(language);
        setIsExplicitLanguage(isExplicit);
        addLog(`[LANGUAGE DIRECTIVE]: Live conversation adapted to ${language} ${isExplicit ? '(Explicit Setting Prioritized)' : '(Auto-detected from speech stream)'}`);
        if (isExplicit) {
          setSettings((prev) => ({ ...prev, languagePreference: language }));
        }
      },
      onSkillFiller: (fillerText, skillName) => {
        setActiveSkillFiller({
          skillName,
          toolName: skillName,
          fillerPhrase: fillerText,
        });
        setCurrentSubtitle(fillerText);
        addLog(`[SKILL SPOKEN FILLER]: "${fillerText}" (${skillName})`);
      },
      onSkillTurnTrace: (trace) => {
        handleApplySkillTurnTrace(trace);
      },
    });

    liveClientRef.current = client;
    const token = workspaceToken || getWorkspaceAccessToken();
    if (token) {
      client.setWorkspaceToken(token);
    }
    client.connect(getMemoryPromptString(), settings.slangLevel, settings.languagePreference || 'auto');
  }, [handleStopAudio, getMemoryPromptString, settings.slangLevel, settings.languagePreference, handleExecuteUIAction, handleApplySkillTurnTrace, workspaceToken, addLog]);

  // Pause / Resume Live API
  const handleTogglePauseLive = useCallback(() => {
    if (!liveClientRef.current) {
      startLiveAPI();
      return;
    }

    if (liveClientRef.current.isPaused) {
      liveClientRef.current.resume();
      addLog('LIVE API: Resumed by user');
      setCurrentSubtitle("Live connection resumed! I'm listening, mate.");
    } else {
      liveClientRef.current.pause();
      addLog('LIVE API: Paused by user');
      setCurrentSubtitle("Live connection paused. Say 'Resume' or click to continue.");
    }
  }, [startLiveAPI, addLog]);

  // Play audio for a specific assistant message
  const handlePlayMessageAudio = useCallback(
    async (message: Message) => {
      handleStopAudio();
      try {
        setIsSpeaking(true);
        setPlayingMessageId(message.id);

        let audioBase64 = message.audioBase64;
        if (!audioBase64) {
          audioBase64 = await fetchTTSAudio(message.text, settings.slangLevel);
          setMessages((prev) =>
            prev.map((m) => (m.id === message.id ? { ...m, audioBase64 } : m))
          );
        }

        const playback = playPcmAudio(audioBase64, 24000, () => {
          setIsSpeaking(false);
          setPlayingMessageId(null);
        });

        audioStopFnRef.current = playback.stop;
      } catch (err) {
        console.error('Failed to play audio:', err);
        setIsSpeaking(false);
        setPlayingMessageId(null);
      }
    },
    [handleStopAudio, settings.slangLevel]
  );

  // Route & Execute a voice command through gemini-decision-1 + SkillRegistry
  const handleTestSkillUtterance = useCallback(
    async (utterance: string) => {
      if (!utterance.trim() || isSkillRouting) return;
      setUserLastUtterance(utterance);
      setIsSkillRouting(true);

      // Show filler cue if the tool takes >1 second
      const lower = utterance.toLowerCase();
      const expectedFiller =
        lower.includes('spotify') || lower.includes('play') || lower.includes('pause') || lower.includes('track') || lower.includes('volume')
          ? {
              skillName: 'spotify_control',
              toolName: 'play_music',
              fillerPhrase: 'Pulling that up on Spotify...',
            }
          : lower.includes('search') || lower.includes('weather') || lower.includes('news')
          ? {
              skillName: 'web_search',
              toolName: 'web_search',
              fillerPhrase: 'Searching for that...',
            }
          : null;

      const fillerTimer = expectedFiller
        ? setTimeout(() => {
            setActiveSkillFiller(expectedFiller);
            setCurrentSubtitle(expectedFiller.fillerPhrase);
          }, 850)
        : null;

      try {
        const token = workspaceToken || getWorkspaceAccessToken();
        const trace = await executeSkillRoute({
          input: utterance,
          activeLanguage,
          workspaceAccessToken: token,
        });
        if (fillerTimer) clearTimeout(fillerTimer);
        handleApplySkillTurnTrace(trace);

        // Speak the confirmation naturally via Gemini Live session or TTS
        if (trace.toolResult?.voiceSummary) {
          if (liveClientRef.current?.isConnected && !liveClientRef.current.isPaused) {
            liveClientRef.current.sendTextMessage(
              `[SKILL PLUGIN FUNCTION_RESPONSE (${trace.toolResult.skillName}.${trace.toolResult.toolName})]: ${trace.toolResult.voiceSummary}. Speak this confirmation naturally and warmly right now in ${activeLanguage}.`
            );
          } else if (settings.autoSpeakResponse) {
            const tempMsg: Message = {
              id: `skill-tts-${Date.now()}`,
              role: 'assistant',
              text: trace.toolResult.voiceSummary,
              timestamp: Date.now(),
            };
            handlePlayMessageAudio(tempMsg);
          }
        } else if (!trace.routingDecision.skillLoaded) {
          // General chat turn (no heavy tool loaded): let Matilda reply naturally
          if (liveClientRef.current?.isConnected && !liveClientRef.current.isPaused) {
            liveClientRef.current.sendTextMessage(utterance);
          }
        }
      } catch (err: any) {
        if (fillerTimer) clearTimeout(fillerTimer);
        setActiveSkillFiller(null);
        addLog(`SKILL ROUTER ERROR: ${err?.message || 'Failed to route skill'}`);
      } finally {
        setIsSkillRouting(false);
      }
    },
    [
      isSkillRouting,
      activeLanguage,
      workspaceToken,
      handleApplySkillTurnTrace,
      settings.autoSpeakResponse,
      handlePlayMessageAudio,
      addLog,
    ]
  );

  // OAuth + Custom Plugin Handlers
  const handleSignInWorkspace = useCallback(async () => {
    setIsWorkspaceSigningIn(true);
    try {
      const { user, accessToken } = await signInGoogleWorkspace();
      setWorkspaceUser({ email: user.email, displayName: user.displayName });
      setWorkspaceToken(accessToken);
      liveClientRef.current?.setWorkspaceToken(accessToken);
      addLog(`GOOGLE WORKSPACE OAUTH AUTHORIZED: ${user.email}`);
    } finally {
      setIsWorkspaceSigningIn(false);
    }
  }, [addLog]);

  const handleSignOutWorkspace = useCallback(async () => {
    await signOutGoogleWorkspace();
    setWorkspaceUser(null);
    setWorkspaceToken(null);
    liveClientRef.current?.setWorkspaceToken(null);
    addLog('GOOGLE WORKSPACE OAUTH SIGNED OUT');
  }, [addLog]);

  const handleConnectOAuth = useCallback(async (provider: string) => {
    const { url } = await getOAuthStartUrl(provider);
    window.open(url, `oauth_${provider}`, 'width=560,height=700,noopener=no');
  }, []);

  const handleDisconnectOAuth = useCallback(async (provider: string) => {
    await disconnectOAuthProvider(provider);
    const [provRes, skillRes] = await Promise.all([
      fetchOAuthProviders(),
      fetchRegisteredSkills(),
    ]);
    setOauthProviders(provRes.providers || []);
    setRegisteredSkills(skillRes.skills || []);
  }, []);

  const handleDiscoverWebsiteOAuth = useCallback(async (url: string, name?: string) => {
    const res = await discoverOAuthWebsite(url, name);
    const provRes = await fetchOAuthProviders();
    setOauthProviders(provRes.providers || []);
    return res;
  }, []);

  const handleConfigureOAuth = useCallback(
    async (payload: {
      provider: string;
      name?: string;
      authUrl?: string;
      tokenUrl?: string;
      scopes?: string;
      clientId?: string;
      clientSecret?: string;
      mcpUrl?: string;
    }) => {
      await configureOAuthConnector(payload);
      const provRes = await fetchOAuthProviders();
      setOauthProviders(provRes.providers || []);
    },
    []
  );

  const handleDeleteOAuthConnector = useCallback(async (provider: string) => {
    await deleteOAuthConnector(provider);
    const [provRes, skillRes] = await Promise.all([
      fetchOAuthProviders(),
      fetchRegisteredSkills(),
    ]);
    setOauthProviders(provRes.providers || []);
    setRegisteredSkills(skillRes.skills || []);
  }, []);

  const handleInstallPlugin = useCallback(
    async (spec: CustomPluginInstallSpec) => {
      const res = await installCustomPlugin(spec);
      setRegisteredSkills(res.skills || []);
      addLog(`CUSTOM PLUGIN INSTALLED: ${spec.name} (${res.filePath})`);
    },
    [addLog]
  );

  const handleUninstallPlugin = useCallback(
    async (name: string) => {
      const res = await uninstallCustomPlugin(name);
      setRegisteredSkills(res.skills || []);
      addLog(`CUSTOM PLUGIN UNINSTALLED: ${name}`);
    },
    [addLog]
  );

  const handleConfirmPendingAction = useCallback(async () => {
    if (!pendingConfirmation?.toolResult?.requiresConfirmation || isConfirmingAction) return;
    const reqConfirm = pendingConfirmation.toolResult.requiresConfirmation;
    setIsConfirmingAction(true);
    try {
      const token = workspaceToken || getWorkspaceAccessToken();
      const confirmedTrace = await executeSkillRoute({
        input: pendingConfirmation.userInput,
        activeLanguage,
        workspaceAccessToken: token,
        toolOverride: {
          skillName: pendingConfirmation.toolResult.skillName,
          toolName: reqConfirm.toolName,
          args: reqConfirm.args,
        },
        confirmedAction: true,
      });
      setPendingConfirmation(null);
      handleApplySkillTurnTrace(confirmedTrace);
      if (confirmedTrace.toolResult?.voiceSummary && liveClientRef.current?.isConnected && !liveClientRef.current.isPaused) {
        liveClientRef.current.sendTextMessage(
          `[CONFIRMED WORKSPACE ACTION RESULT]: ${confirmedTrace.toolResult.voiceSummary}. Confirm this briefly to the user.`
        );
      }
    } catch (err: any) {
      addLog(`CONFIRMATION ERROR: ${err?.message || 'Action failed'}`);
    } finally {
      setIsConfirmingAction(false);
    }
  }, [pendingConfirmation, isConfirmingAction, workspaceToken, activeLanguage, handleApplySkillTurnTrace, addLog]);

  // Send message to Matilda (used for text input or fallback)
  const handleSendMessage = useCallback(
    async (textToSend: string, predetectedAcoustics?: string[], predetectedMood?: string) => {
      const trimmed = textToSend.trim();
      if (!trimmed || isProcessing) return;

      handleStopAudio();
      setUserLastUtterance(trimmed);

      if (predetectedAcoustics && predetectedAcoustics.length > 0) {
        setDetectedAcoustics(predetectedAcoustics);
        addLog(`ACOUSTIC CUE DETECTED: [${predetectedAcoustics.join(', ')}]`);
      }
      if (predetectedMood) {
        setUserMood(predetectedMood);
      }

      // If Live API is connected, forward text to Live session and evaluate via Gemini Decision 1.0 Engine
      if (liveClientRef.current?.isConnected && !liveClientRef.current.isPaused) {
        liveClientRef.current.sendTextMessage(trimmed);
        addLog(`SENT TO LIVE API: "${trimmed}"`);
        evaluateWithDecisionEngine({
          input: trimmed,
          mode: 'full_cognitive',
          context: {
            detectedAcoustics: predetectedAcoustics || detectedAcoustics,
            userMood: predetectedMood || userMood,
            activeLanguage,
            memorySummary: getMemoryPromptString(),
          },
        })
          .then((decision) => {
            recordDecisionResult(decision);
            // Deterministic confidence thresholding: only auto-execute UI actions when confidence >= threshold
            if (decision.confidenceGate?.passed !== false && decision.recommendedAction.uiAction) {
              handleExecuteUIAction(decision.recommendedAction.uiAction);
            }
          })
          .catch(() => {});
        return;
      }

      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        text: trimmed,
        timestamp: Date.now(),
        detectedAcoustics: predetectedAcoustics,
        userMood: predetectedMood,
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsProcessing(true);
      setIsSleeping(false);

      try {
        addLog(`SPEECH PROCESSED: "${trimmed.slice(0, 45)}..."`);
        const memoryPrompt = getMemoryPromptString();
        const chatRes = await sendMessageToChat(
          trimmed,
          messages,
          memoryPrompt,
          settings.slangLevel,
          settings.languagePreference || 'auto'
        );

        setCurrentSubtitle(chatRes.replyText);
        setCurrentEmotion(chatRes.emotion || 'warm & caring');
        setFeelingsDescription(chatRes.feelingsDescription || '');
        setUserMood(chatRes.userMood || predetectedMood || 'open & reflective');
        setDetectedAcoustics(chatRes.detectedAcoustics || predetectedAcoustics || []);

        if (chatRes.detectedAcoustics && chatRes.detectedAcoustics.length > 0) {
          setTimeout(() => {
            setDetectedAcoustics([]);
          }, 4500);
        }

        addLog(`TILLY EMOTION: [${chatRes.emotion}] "${chatRes.feelingsDescription?.slice(0, 40) || ''}..."`);

        // Handle interface action if triggered
        if (chatRes.uiAction) {
          handleExecuteUIAction(chatRes.uiAction, chatRes.webSearchResults);
        } else if (chatRes.webSearchResults && chatRes.webSearchResults.length > 0) {
          setActiveSearchResults(chatRes.webSearchResults);
          setActiveSearchQuery(trimmed);
        }

        // Save new memories
        if (chatRes.newMemories && chatRes.newMemories.length > 0) {
          addExtractedMemories(chatRes.newMemories, trimmed);
          addLog(`NLP MEMORY SAVED: ${chatRes.newMemories.map(m => m.fact).join('; ')}`);
        }

        // Record Gemini Decision 1.0 telemetry returned by /api/chat
        if (chatRes.decisionTelemetry) {
          recordDecisionResult(chatRes.decisionTelemetry);
        }

        const assistantMsg: Message = {
          id: `tilly-${Date.now()}`,
          role: 'assistant',
          text: chatRes.replyText,
          timestamp: Date.now(),
          emotion: chatRes.emotion,
          feelingsDescription: chatRes.feelingsDescription,
          userMood: chatRes.userMood,
          detectedAcoustics: chatRes.detectedAcoustics,
          adviceHighlight: chatRes.adviceHighlight,
          newMemories: chatRes.newMemories,
        };

        setMessages((prev) => [...prev, assistantMsg]);
        setIsProcessing(false);

        // Auto-play voice response if not in live mode
        if (settings.autoSpeakResponse && !liveClientRef.current?.isConnected) {
          try {
            const audio = await fetchTTSAudio(chatRes.replyText, settings.slangLevel);
            assistantMsg.audioBase64 = audio;
            handlePlayMessageAudio(assistantMsg);
          } catch (ttsErr) {
            console.warn('TTS auto-play failed:', ttsErr);
          }
        }
      } catch (err: any) {
        console.error('Chat error:', err);
        setIsProcessing(false);
        const errorText = "Sorry mate, had a bit of a glitch on the wire. Give it another burl in a tick?";
        setCurrentSubtitle(errorText);
        addLog(`ERROR IN CHAT: ${err?.message || 'Unknown error'}`);
      }
    },
    [
      isProcessing,
      handleStopAudio,
      getMemoryPromptString,
      messages,
      settings.slangLevel,
      settings.autoSpeakResponse,
      handleExecuteUIAction,
      addExtractedMemories,
      handlePlayMessageAudio,
      addLog,
    ]
  );

  // Transition from Boot Screen to Main Screen upon Clap or Wake Word
  const handleWakeSuccess = useCallback(async (trigger: 'clap' | 'wake_word') => {
    if (isBootingRef.current || isBooted) return;
    isBootingRef.current = true;

    // Release boot detector microphone so Live API takes over mic smoothly
    if (detectorRef.current) {
      detectorRef.current.stop();
      detectorRef.current = null;
    }

    setIsBooted(true);
    setIsWakeFocused(true);
    handleStopAudio();
    addLog(`BOOT SEQUENCE COMPLETED VIA ${trigger.toUpperCase()}`);

    const greetingText =
      trigger === 'clap'
        ? "G'day mate! Heard that clap loud and clear. Matilda here, live audio is active—talk to me anytime!"
        : "G'day mate! I'm Matilda, wide awake and listening. How're you travelling today?";

    setCurrentSubtitle(greetingText);

    // Automatically launch Always-Active Live API
    setTimeout(() => {
      startLiveAPI();
    }, 350);

    setTimeout(() => {
      setIsWakeFocused(false);
    }, 4000);
  }, [isBooted, handleStopAudio, startLiveAPI, addLog]);

  // Initialize Microphone & Acoustic Detector on Boot Screen
  const handleInitiateMic = useCallback(async () => {
    addLog('INITIATING BOOT ACOUSTIC DETECTOR...');

    const detector = new AcousticDetector({
      onClap: () => {
        addLog('ACOUSTIC EVENT: 👏 SHARP CLAP DETECTED!');
        setIsWakeFocused(true);
        handleWakeSuccess('clap');
      },
      onWakeWord: (phrase) => {
        addLog(`WAKE-WORD DETECTED: "${phrase}"`);
        setIsWakeFocused(true);
        handleWakeSuccess('wake_word');
      },
      onPhysicalSound: (sound) => {
        addLog(`BOOT ACOUSTIC EVENT: Physical [${sound.event.toUpperCase()}] detected!`);
        setIsWakeFocused(true);
        if (sound.event === 'cough') {
          setDetectedAcoustics(['cough']);
          setUserMood('crook / unwell');
        }
        handleWakeSuccess('wake_word');
      },
      onSpeechFinal: (transcript) => {
        const lower = transcript.toLowerCase();
        if (
          lower.includes('hey tilly') ||
          lower.includes('tilly') ||
          lower.includes('hey matilda') ||
          lower.includes('matilda') ||
          lower.includes('wake up') ||
          lower.includes('hello')
        ) {
          handleWakeSuccess('wake_word');
        }
      },
      onAudioLevel: (level) => {
        setLiveAudioLevel(level);
      },
      onError: (err) => {
        addLog(`BOOT DETECTOR ERROR: ${err}`);
      },
    });

    const success = await detector.start();
    if (success) {
      detectorRef.current = detector;
      setIsMicReady(true);
      addLog('MICROPHONE ACTIVE: Waiting for Clap or "Hey Tilly" to wake Matilda');
    }
  }, [handleWakeSuccess, addLog]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      detectorRef.current?.stop();
      liveClientRef.current?.disconnect();
      ambientMusic.stop();
      handleStopAudio();
    };
  }, [handleStopAudio]);

  // If not booted yet, show the atmospheric Boot Screen
  if (!isBooted) {
    return (
      <BootScreen
        isMicReady={isMicReady}
        onInitiateMic={handleInitiateMic}
        onWakeSuccess={handleWakeSuccess}
        audioLevel={liveAudioLevel}
      />
    );
  }

  const isLivePaused = liveState === 'paused' || (liveClientRef.current?.isPaused ?? false);

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col font-sans select-none overflow-x-hidden relative">
      {/* Subtle Ambient Background Gradient */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_35%,rgba(234,112,60,0.12),transparent_70%)]" />

      {/* TOP MINIMAL STATUS & CONTROLS BAR */}
      <header className="w-full max-w-5xl mx-auto px-6 h-16 flex items-center justify-between z-20">
        {/* Left: Companion Identity & Always-Active Live Indicator */}
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-sm shadow-md">
            🦘
          </div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-sm tracking-tight text-white">
              Matilda <span className="text-amber-400 font-serif italic text-xs">"Tilly"</span>
            </span>

            {/* Always-Active Live API Indicator */}
            <div
              onClick={handleTogglePauseLive}
              className={`cursor-pointer px-2.5 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1.5 transition-all shadow-sm ${
                isLivePaused
                  ? 'bg-amber-950/80 text-amber-300 border border-amber-800/80'
                  : 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/80'
              }`}
              title="Click to pause or resume Live API"
            >
              <Radio className={`w-3 h-3 ${isLivePaused ? 'text-amber-400' : 'animate-pulse text-emerald-400'}`} />
              <span className="font-bold uppercase tracking-wider">
                {isLivePaused ? 'LIVE API: PAUSED' : 'LIVE API: ALWAYS ACTIVE'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Sleek Floating Action Icons */}
        <div className="flex items-center space-x-2">
          {/* Ambient Music Player Pill */}
          {isMusicPlaying && (
            <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-950/60 border border-amber-800/60 text-amber-300 text-xs shadow-md animate-in fade-in">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span className="text-[11px] font-medium truncate max-w-[120px]">
                {currentTrackName}
              </span>
              <button
                onClick={() => {
                  ambientMusic.pause();
                  setIsMusicPlaying(false);
                }}
                className="p-1 hover:text-white"
                title="Pause music"
              >
                <Pause className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Quick Music Toggle Button */}
          <button
            onClick={() => {
              if (isMusicPlaying) {
                ambientMusic.pause();
                setIsMusicPlaying(false);
              } else {
                ambientMusic.play('Byron Bay Sunset');
                setIsMusicPlaying(true);
                setCurrentTrackName('Byron Bay Sunset');
              }
            }}
            className={`p-2 rounded-xl border transition-all ${
              isMusicPlaying
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
            }`}
            title={isMusicPlaying ? 'Pause Ambient Music' : 'Play Aussie Ambient Music'}
          >
            <Music className="w-4 h-4" />
          </button>

          {/* Computer Use Studio Toggle + Emergency Stop Indicator */}
          <button
            onClick={() => setIsComputerUseOpen(true)}
            className={`px-2.5 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
              isComputerUseOpen || computerState.session.status === 'running'
                ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-md shadow-amber-500/20'
                : 'bg-stone-900 border-stone-800 text-stone-200 hover:bg-stone-800 hover:border-amber-500/50'
            }`}
            title="Open Hybrid Computer Use Studio (Desktop Bridge & Browser Sandbox)"
          >
            <Monitor className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline font-mono text-[11px]">COMPUTER</span>
            {computerState.bridge.connected && (
              <span className="px-1 py-0.2 rounded text-[9px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                BRIDGE
              </span>
            )}
          </button>

          {computerState.session.status === 'running' && (
            <button
              onClick={() => stopComputerTask('Emergency STOP pressed from header').then((r) => setComputerState(r.state)).catch(() => {})}
              className="px-2.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
              title="Emergency STOP Computer Automation"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>STOP</span>
            </button>
          )}

          {/* Agent Skills & Plugin Registry Toggle Button */}
          <button
            onClick={() => setIsSkillsPanelOpen(!isSkillsPanelOpen)}
            className={`px-2.5 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
              isSkillsPanelOpen
                ? 'bg-emerald-500 text-stone-950 border-emerald-400 shadow-md shadow-emerald-500/20'
                : 'bg-stone-900 border-stone-800 text-emerald-300 hover:bg-stone-800 hover:border-emerald-500/50'
            }`}
            title="Toggle Agent Skills & Decision Log Panel"
          >
            <Puzzle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline font-mono text-[11px]">SKILLS ({registeredSkills.length})</span>
          </button>

          {/* Gemini Decision 1 (gemini-decision-1) Button */}
          <button
            onClick={() => setIsDecisionModalOpen(true)}
            className={`px-2.5 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
              isDecisionModalOpen
                ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-md shadow-amber-500/20'
                : 'bg-stone-900 border-stone-800 text-amber-300 hover:bg-stone-800 hover:border-amber-500/50'
            }`}
            title="Open Gemini Decision 1 (gemini-decision-1) Decisions API Console"
          >
            <Cpu className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline font-mono text-[11px]">DECISION 1</span>
            {latestDecision && (
              <span
                className={`px-1.5 py-0.2 rounded text-[9px] font-mono border ${
                  latestDecision.confidenceGate?.passed === false
                    ? 'bg-rose-950 text-rose-300 border-rose-700/60'
                    : 'bg-emerald-950 text-emerald-300 border-emerald-700/60'
                }`}
              >
                {Math.round(latestDecision.confidenceScore * 100)}%
              </span>
            )}
          </button>

          {/* Small Icon Terminal Button (Directly requested by user) */}
          <button
            onClick={() => setIsTerminalOpen(!isTerminalOpen)}
            className={`p-2 rounded-xl border transition-all relative ${
              isTerminalOpen
                ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-md shadow-amber-500/20'
                : 'bg-stone-900 border-stone-800 text-stone-300 hover:bg-stone-800 hover:text-white'
            }`}
            title="Open Neural Terminal (Logs, Full Chat, Live Stream)"
          >
            <TerminalIcon className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 border border-stone-950" />
          </button>

          {/* Settings Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-xl bg-stone-900 border border-stone-800 text-stone-400 hover:text-stone-200 transition-colors"
            title="Settings & Accent"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* CENTER IMMERSIVE VIEWPORT: Voice Orb + Live Agent Skills & Decision Log Panel */}
      <main className="flex-1 flex flex-col lg:flex-row items-center lg:items-start justify-center gap-6 px-4 py-3 z-10 w-full max-w-7xl mx-auto my-auto relative">
        {/* Left/Center Column: Animated Voice Orb & Subtitles */}
        <div className="flex-1 flex flex-col items-center justify-center w-full max-w-2xl mx-auto">
          {/* Real-time Physical Acoustic Toast Banner */}
          {acousticToast && (
            <div className="mb-3 px-4 py-1.5 rounded-full bg-emerald-950/90 border border-emerald-500/80 text-emerald-200 text-xs font-bold shadow-lg shadow-emerald-900/30 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
              <span className="text-base">{acousticToast.icon}</span>
              <span>{acousticToast.text}</span>
            </div>
          )}

          {/* Animated Voice Orb with Wake & Subtitles */}
          <VoiceVisualizer
            isListening={!isLivePaused}
            isSpeaking={isSpeaking}
            isProcessing={isProcessing || isSkillRouting}
            isLiveActive={!isLivePaused}
            isWakeFocused={isWakeFocused}
            isSleeping={isLivePaused}
            emotion={currentEmotion}
            feelingsDescription={feelingsDescription}
            userMood={userMood}
            detectedAcoustics={detectedAcoustics}
            subtitleText={currentSubtitle}
            userLastUtterance={userLastUtterance}
            activeLanguage={activeLanguage}
            isExplicitLanguage={isExplicitLanguage}
            onClickOrb={handleTogglePauseLive}
          />

          {/* Web Search Grounding Card (if user asked to search the web) */}
          {activeSearchResults && activeSearchResults.length > 0 && (
            <div className="mt-4 w-full max-w-lg p-3.5 rounded-2xl bg-stone-900/90 border border-stone-800 backdrop-blur-md shadow-xl animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-800 text-xs">
                <span className="font-semibold text-amber-400 flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5" />
                  Web Search Results ({activeSearchQuery || 'Search'})
                </span>
                <button
                  onClick={() => setActiveSearchResults(null)}
                  className="text-stone-500 hover:text-stone-300 text-xs"
                >
                  Dismiss
                </button>
              </div>
              <div className="space-y-1.5">
                {activeSearchResults.slice(0, 3).map((res, i) => (
                  <a
                    key={i}
                    href={res.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-2 rounded-xl bg-stone-800/60 hover:bg-stone-800 text-xs text-stone-200 transition-colors group"
                  >
                    <span className="truncate pr-2 font-medium">{res.title}</span>
                    <ExternalLink className="w-3 h-3 text-stone-400 group-hover:text-amber-400 shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Minimal Voice Commands Quick Palette */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-stone-400 text-xs">
            <span className="text-[11px] text-stone-500 font-medium">Try voice or click:</span>
            <button
              onClick={() => handleTestSkillUtterance('Play Tame Impala The Less I Know The Better on Spotify')}
              className="px-2.5 py-1 rounded-full bg-stone-900/80 hover:bg-stone-800 text-emerald-300 border border-emerald-800/60 text-[11px] transition-colors cursor-pointer"
            >
              🎵 Spotify: Play Tame Impala
            </button>
            <button
              onClick={() => handleTestSkillUtterance('Search the web for what is the weather in Sydney today')}
              className="px-2.5 py-1 rounded-full bg-stone-900/80 hover:bg-stone-800 text-amber-300 border border-amber-800/60 text-[11px] transition-colors cursor-pointer"
            >
              🌐 Web Search: Sydney Weather
            </button>
            <button
              onClick={() => handleSendMessage("[coughs] Hey Tilly, feeling crook...", ["cough"], "unwell")}
              className="px-2.5 py-1 rounded-full bg-stone-900/80 hover:bg-stone-800 text-stone-300 border border-stone-800/80 text-[11px] transition-colors cursor-pointer"
            >
              😷 [Cough]
            </button>
            <button
              onClick={() => setIsDecisionModalOpen(true)}
              className="px-2.5 py-1 rounded-full bg-amber-950/70 hover:bg-amber-900/80 text-amber-300 border border-amber-700/60 text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Cpu className="w-3 h-3" />
              <span>Decision 1 Console</span>
            </button>
            <button
              onClick={() => setIsComputerUseOpen(true)}
              className="px-2.5 py-1 rounded-full bg-stone-900/90 hover:bg-stone-800 text-amber-200 border border-amber-500/40 text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Monitor className="w-3 h-3 text-amber-400" />
              <span>Computer Use Studio</span>
            </button>
          </div>
        </div>

        {/* Right Column: Collapsible Live Agent Skills & Decision Log Panel */}
        <AgentSkillsPanel
          isOpen={isSkillsPanelOpen}
          onToggleOpen={() => setIsSkillsPanelOpen((prev) => !prev)}
          skills={registeredSkills}
          confidenceThreshold={skillConfidenceThreshold}
          traces={skillTraces}
          activeFiller={activeSkillFiller}
          isRouting={isSkillRouting}
          onTestSkillUtterance={handleTestSkillUtterance}
          workspaceUser={workspaceUser}
          isWorkspaceSigningIn={isWorkspaceSigningIn}
          onSignInWorkspace={handleSignInWorkspace}
          onSignOutWorkspace={handleSignOutWorkspace}
          oauthProviders={oauthProviders}
          onConnectOAuth={handleConnectOAuth}
          onDisconnectOAuth={handleDisconnectOAuth}
          onDiscoverWebsiteOAuth={handleDiscoverWebsiteOAuth}
          onConfigureOAuth={handleConfigureOAuth}
          onDeleteOAuthConnector={handleDeleteOAuthConnector}
          onInstallPlugin={handleInstallPlugin}
          onUninstallPlugin={handleUninstallPlugin}
          onTriggerConfirmTrace={(trace) => setPendingConfirmation(trace)}
        />
      </main>

      {/* BOTTOM CONTROLS & PAUSE LIVE BAR */}
      <footer className="w-full p-4 flex flex-col items-center justify-center z-20">
        <div className="flex items-center gap-3">
          {/* Pause / Resume Live API Button (Dedicated per user request) */}
          <button
            onClick={handleTogglePauseLive}
            className={`px-5 py-2.5 rounded-full text-xs font-bold flex items-center gap-2 shadow-lg transition-all cursor-pointer ${
              isLivePaused
                ? 'bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-amber-500/20'
                : 'bg-stone-900 hover:bg-stone-800 text-stone-200 border border-stone-700'
            }`}
            title={isLivePaused ? 'Resume live duplex audio' : 'Pause live audio stream'}
          >
            {isLivePaused ? (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Resume Live Conversation</span>
              </>
            ) : (
              <>
                <Pause className="w-4 h-4" />
                <span>Pause Live Audio (Say "Pause")</span>
              </>
            )}
          </button>

          {/* Discreet text input toggle */}
          <button
            onClick={() => setShowTextInput(!showTextInput)}
            className="p-2.5 rounded-full bg-stone-900 border border-stone-800 text-stone-400 hover:text-white transition-colors"
            title="Type message if in quiet space"
          >
            <MessageCircle className="w-4 h-4" />
          </button>
        </div>

        {/* Text typing fallback bar */}
        {showTextInput && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (textInputValue.trim()) {
                handleSendMessage(textInputValue);
                setTextInputValue('');
              }
            }}
            className="w-full max-w-md mt-3 flex items-center gap-2 animate-in fade-in"
          >
            <input
              type="text"
              value={textInputValue}
              onChange={(e) => setTextInputValue(e.target.value)}
              placeholder="Type to Matilda..."
              className="flex-1 px-4 py-2 rounded-2xl bg-stone-900 border border-stone-800 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              type="submit"
              disabled={!textInputValue.trim() || isProcessing}
              className="p-2 rounded-xl bg-amber-500 text-stone-950 font-bold hover:bg-amber-400 disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        )}
      </footer>

      {/* SMALL ICON TERMINAL HUD (Contains chat, logs, live monitor & memories) */}
      <TerminalHUD
        isOpen={isTerminalOpen}
        onClose={() => setIsTerminalOpen(false)}
        messages={messages}
        playingMessageId={playingMessageId}
        onPlayAudio={handlePlayMessageAudio}
        onStopAudio={handleStopAudio}
        onSendMessage={handleSendMessage}
        isProcessing={isProcessing}
        isLiveMode={!isLivePaused}
        onToggleLiveMode={handleTogglePauseLive}
        systemLogs={systemLogs}
        memories={memories}
      />

      {/* Settings Modal */}
      <PersonaSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={(newOpts) => {
          setSettings((prev) => {
            const next = { ...prev, ...newOpts };
            if (newOpts.languagePreference !== undefined) {
              liveClientRef.current?.setExplicitLanguage(newOpts.languagePreference);
              if (newOpts.languagePreference && newOpts.languagePreference !== 'auto') {
                setActiveLanguage(newOpts.languagePreference);
                setIsExplicitLanguage(true);
              } else {
                setIsExplicitLanguage(false);
              }
            }
            return next;
          });
        }}
      />

      {/* Advice Journal Modal */}
      <AdviceJournalModal
        isOpen={isAdviceOpen}
        onClose={() => setIsAdviceOpen(false)}
        messages={messages}
      />

      {/* Gemini Decision 1.0 Model Engine Modal */}
      <DecisionEngineModal
        isOpen={isDecisionModalOpen}
        onClose={() => setIsDecisionModalOpen(false)}
        latestDecision={latestDecision}
        decisionHistory={decisionHistory}
        activeLanguage={activeLanguage}
        currentEmotion={currentEmotion}
        userMood={userMood}
        detectedAcoustics={detectedAcoustics}
        memoryContext={getMemoryPromptString()}
        onNewDecision={(decision) => {
          recordDecisionResult(decision);
        }}
        onApplyDecision={(decision) => {
          setCurrentEmotion(decision.recommendedAction.targetEmotion);
          setFeelingsDescription(decision.policyGuardrails.toneCalibration);
          setCurrentSubtitle(decision.recommendedAction.spokenDirective);
          if (decision.recommendedAction.targetLanguage) {
            setActiveLanguage(decision.recommendedAction.targetLanguage);
          }
          if (decision.recommendedAction.uiAction) {
            handleExecuteUIAction(decision.recommendedAction.uiAction);
          }
          setIsDecisionModalOpen(false);
        }}
        onSpeakDirective={async (directiveText) => {
          setCurrentSubtitle(directiveText);
          if (liveClientRef.current?.isConnected && !liveClientRef.current.isPaused) {
            liveClientRef.current.sendTextMessage(
              `[GEMINI DECISION 1.0 DIRECTIVE: Speak this recommendation warmly to the user in ${activeLanguage}]: "${directiveText}"`
            );
          } else {
            const tempMsg: Message = {
              id: `decision-tts-${Date.now()}`,
              role: 'assistant',
              text: directiveText,
              timestamp: Date.now(),
            };
            handlePlayMessageAudio(tempMsg);
          }
        }}
        onExecuteAction={(action) => {
          handleExecuteUIAction(action);
        }}
      />

      {/* Hybrid Computer Use Studio Drawer */}
      <ComputerUseStudio
        isOpen={isComputerUseOpen}
        onClose={() => setIsComputerUseOpen(false)}
        computerState={computerState}
        onStateChange={(next) => setComputerState(next)}
        onLog={addLog}
      />

      {/* Explicit Risky Computer Use Confirmation Modal (Always visible when paused for safety) */}
      {computerState.session.pendingConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl bg-[#1C1917] border border-amber-500/60 shadow-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
                    Confirm Computer Action
                  </h3>
                  <p className="text-[11px] font-mono text-amber-300">
                    {computerState.session.pendingConfirmation.action} ·{' '}
                    {computerState.session.pendingConfirmation.targetUsed}
                  </p>
                </div>
              </div>
              <button
                onClick={async () => {
                  const id = computerState.session.pendingConfirmation?.confirmationId || '';
                  setIsConfirmingComputerAction(true);
                  try {
                    const res = await confirmComputerAction(id, false);
                    setComputerState(res.state);
                  } finally {
                    setIsConfirmingComputerAction(false);
                  }
                }}
                className="p-1 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-stone-200 leading-relaxed">
              {computerState.session.pendingConfirmation.riskReason}
            </p>

            {computerState.session.pendingConfirmation.previewImageBase64 && (
              <div className="relative rounded-lg overflow-hidden border border-stone-800 bg-black aspect-video">
                <img
                  src={`data:${computerState.session.pendingConfirmation.previewMimeType || 'image/jpeg'};base64,${computerState.session.pendingConfirmation.previewImageBase64}`}
                  alt="Confirmation Screen Preview"
                  className="w-full h-full object-contain"
                />
                {computerState.session.pendingConfirmation.normalizedCoords?.x !== undefined && (
                  <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
                    <circle
                      cx={computerState.session.pendingConfirmation.normalizedCoords.x}
                      cy={computerState.session.pendingConfirmation.normalizedCoords.y}
                      r="24"
                      fill="rgba(245, 158, 11, 0.22)"
                      stroke="#F59E0B"
                      strokeWidth="4"
                    />
                  </svg>
                )}
              </div>
            )}

            <pre className="p-3 rounded-lg bg-[#0C0A09] border border-stone-800 text-[11px] font-mono text-amber-200 overflow-x-auto max-h-28">
              {JSON.stringify(computerState.session.pendingConfirmation.args, null, 2)}
            </pre>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={async () => {
                  const id = computerState.session.pendingConfirmation?.confirmationId || '';
                  setIsConfirmingComputerAction(true);
                  try {
                    const res = await confirmComputerAction(id, false);
                    setComputerState(res.state);
                    addLog('COMPUTER USE: Risky action cancelled by user');
                  } finally {
                    setIsConfirmingComputerAction(false);
                  }
                }}
                disabled={isConfirmingComputerAction}
                className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold cursor-pointer"
              >
                Cancel Task
              </button>
              <button
                onClick={async () => {
                  const id = computerState.session.pendingConfirmation?.confirmationId || '';
                  setIsConfirmingComputerAction(true);
                  try {
                    const res = await confirmComputerAction(id, true);
                    setComputerState(res.state);
                    addLog(`COMPUTER USE: Approved & executed ${computerState.session.pendingConfirmation?.action || 'action'}`);
                  } finally {
                    setIsConfirmingComputerAction(false);
                  }
                }}
                disabled={isConfirmingComputerAction}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{isConfirmingComputerAction ? 'Executing...' : 'Approve & Execute'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explicit In-App Confirmation Modal for Mutating Workspace Actions */}
      {pendingConfirmation?.toolResult?.requiresConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-stone-900 border border-amber-500/50 shadow-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {pendingConfirmation.toolResult.requiresConfirmation.title}
                  </h3>
                  <p className="text-[11px] font-mono text-amber-300">
                    {pendingConfirmation.toolResult.skillName}.
                    {pendingConfirmation.toolResult.requiresConfirmation.toolName}()
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPendingConfirmation(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-stone-300 leading-relaxed">
              {pendingConfirmation.toolResult.requiresConfirmation.description}
            </p>

            <pre className="p-3 rounded-xl bg-stone-950 border border-stone-800 text-[11px] font-mono text-amber-200 overflow-x-auto max-h-40">
              {JSON.stringify(pendingConfirmation.toolResult.requiresConfirmation.args, null, 2)}
            </pre>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setPendingConfirmation(null)}
                disabled={isConfirmingAction}
                className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPendingAction}
                disabled={isConfirmingAction}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{isConfirmingAction ? 'Executing...' : 'Approve & Execute'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
