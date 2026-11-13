import {
  Message,
  MemoryItem,
  AussieSlangLevel,
  ExtractedMemory,
  UIAction,
  WebSearchResult,
  DecisionEngineResult,
  DecisionQuestionSpec,
  DecisionMultimodalBlock,
  RegisteredSkillMetadata,
  VoiceSkillTurnTrace,
  CustomPluginInstallSpec,
  OAuthProviderStatus,
} from '../types';

export interface ChatResponse {
  replyText: string;
  newMemories: ExtractedMemory[];
  adviceHighlight: string | null;
  emotion: string;
  feelingsDescription?: string;
  userMood?: string;
  detectedAcoustics?: string[];
  uiAction?: UIAction;
  webSearchResults?: WebSearchResult[];
  decisionTelemetry?: DecisionEngineResult;
  skillTurnTrace?: VoiceSkillTurnTrace;
}

export interface TranscribeResult {
  transcript: string;
  acousticCues?: string[];
  userMood?: string;
}

export interface DecisionEngineRequestParams {
  input: string | DecisionMultimodalBlock[];
  mode?: 'autonomous_routing' | 'dilemma_solver' | 'full_cognitive';
  options?: string[];
  questions?: Record<string, DecisionQuestionSpec>;
  confidenceThreshold?: number;
  context?: {
    userMood?: string;
    activeLanguage?: string;
    detectedAcoustics?: string[];
    memorySummary?: string;
    slangLevel?: AussieSlangLevel;
  };
}

export interface DecisionEngineStatusResponse {
  engine: 'gemini-decision-1';
  apiVersion: 'v1beta';
  sdkMethod: 'client.decisions.create';
  status: 'online' | 'degraded';
  version: string;
  confidenceThreshold: number;
  capabilities: string[];
  totalDecisionsEvaluated: number;
  recentDecisions: DecisionEngineResult[];
}

export interface SkillsStatusResponse {
  routerModel: 'gemini-decision-1';
  apiVersion: 'v1beta';
  confidenceThreshold: number;
  skills: RegisteredSkillMetadata[];
  decisionCriteriaMap: Record<string, string>;
  recentTraces: VoiceSkillTurnTrace[];
}

export async function fetchRegisteredSkills(): Promise<SkillsStatusResponse> {
  const res = await fetch('/api/skills');
  if (!res.ok) {
    throw new Error(`Failed to fetch registered skills (${res.status})`);
  }
  return res.json();
}

export async function executeSkillRoute(params: {
  input: string;
  confidenceThreshold?: number;
  toolOverride?: { skillName: string; toolName: string; args: Record<string, any> };
  activeLanguage?: string;
  workspaceAccessToken?: string | null;
  confirmedAction?: boolean;
}): Promise<VoiceSkillTurnTrace> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (params.workspaceAccessToken) {
    headers['Authorization'] = `Bearer ${params.workspaceAccessToken}`;
  }
  const { workspaceAccessToken: _omit, ...bodyPayload } = params;
  const res = await fetch('/api/skills/route-and-execute', {
    method: 'POST',
    headers,
    body: JSON.stringify(bodyPayload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Skill Router returned ${res.status}`);
  }
  return res.json();
}

export async function installCustomPlugin(spec: CustomPluginInstallSpec): Promise<{
  success: boolean;
  filePath: string;
  skills: RegisteredSkillMetadata[];
}> {
  const res = await fetch('/api/skills/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spec),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to install custom plugin (${res.status})`);
  }
  return res.json();
}

export async function uninstallCustomPlugin(name: string): Promise<{
  success: boolean;
  skills: RegisteredSkillMetadata[];
}> {
  const res = await fetch(`/api/skills/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to uninstall plugin (${res.status})`);
  }
  return res.json();
}

export async function fetchOAuthProviders(): Promise<{
  providers: OAuthProviderStatus[];
}> {
  const res = await fetch('/api/oauth/providers');
  if (!res.ok) {
    throw new Error(`Failed to fetch OAuth providers (${res.status})`);
  }
  return res.json();
}

export async function getOAuthStartUrl(provider: 'spotify' | 'github'): Promise<{
  url: string;
  callbackUrl: string;
}> {
  const res = await fetch(`/api/oauth/${provider}/url`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to build OAuth URL (${res.status})`);
  }
  return res.json();
}

export async function disconnectOAuthProvider(provider: 'spotify' | 'github'): Promise<void> {
  await fetch(`/api/oauth/${provider}/disconnect`, { method: 'POST' });
}

export async function evaluateWithDecisionEngine(
  params: DecisionEngineRequestParams
): Promise<DecisionEngineResult> {
  const res = await fetch('/api/decision-engine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Decision Engine returned ${res.status}`);
  }

  return res.json();
}

export async function fetchDecisionEngineStatus(): Promise<DecisionEngineStatusResponse> {
  const res = await fetch('/api/decision-engine/status');
  if (!res.ok) {
    throw new Error(`Failed to fetch Decision 1 status (${res.status})`);
  }
  return res.json();
}

export async function sendMessageToChat(
  currentMessage: string,
  history: Message[],
  memorySummary: string,
  slangLevel: AussieSlangLevel,
  languagePreference: string = 'auto'
): Promise<ChatResponse> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      currentMessage,
      messages: history.slice(-10).map((m) => ({
        role: m.role,
        text: m.text,
      })),
      memorySummary,
      slangLevel,
      languagePreference,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server returned ${res.status}`);
  }

  return res.json();
}

export async function fetchTTSAudio(text: string, slangLevel: AussieSlangLevel): Promise<string> {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, slangLevel }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `TTS failed with ${res.status}`);
  }

  const data = await res.json();
  return data.audio; // base64 linear PCM 24000Hz
}

export async function transcribeAudioBlob(blob: Blob): Promise<TranscribeResult> {
  const reader = new FileReader();
  const base64Promise = new Promise<string>((resolve, reject) => {
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
  });
  reader.readAsDataURL(blob);

  const base64Audio = await base64Promise;

  const res = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audio: base64Audio,
      mimeType: blob.type || 'audio/webm',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to transcribe audio');
  }

  const data = await res.json();
  return {
    transcript: data.transcript || '',
    acousticCues: data.acousticCues || [],
    userMood: data.userMood || '',
  };
}

export async function synthesizeMemorySummary(memories: MemoryItem[]): Promise<string> {
  if (memories.length === 0) return '';
  const res = await fetch('/api/memories/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memories }),
  });

  if (!res.ok) return '';
  const data = await res.json();
  return data.summary || '';
}

export async function checkServerHealth(): Promise<{ status: string; hasApiKey: boolean }> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return { status: 'error', hasApiKey: false };
    return res.json();
  } catch (e) {
    return { status: 'offline', hasApiKey: false };
  }
}
