export type Role = 'user' | 'assistant';

export interface Message {
  id: string;
  role: Role;
  text: string;
  timestamp: number;
  audioBase64?: string;
  isAudioPlaying?: boolean;
  emotion?: string;
  feelingsDescription?: string;
  userMood?: string;
  detectedAcoustics?: string[];
  adviceHighlight?: string | null;
  newMemories?: ExtractedMemory[];
}

export interface ExtractedMemory {
  category: 'personal' | 'relationship' | 'goal' | 'preference' | 'struggle' | 'inside_joke' | 'advice';
  fact: string;
  importance?: 'high' | 'medium' | 'low';
}

export interface MemoryItem extends ExtractedMemory {
  id: string;
  createdAt: number;
  sourceContext?: string;
}

export type AussieSlangLevel = 'gentle' | 'everyday' | 'true_blue';

export interface PersonaSettings {
  slangLevel: AussieSlangLevel;
  autoSpeakResponse: boolean;
  handsFreeVad: boolean;
  voiceVolume: number;
  userName: string;
  languagePreference?: string; // 'auto' | 'en' | 'es' | 'fr' | 'de' | 'hi' | 'it' | 'ja' | 'zh' | 'ar' | etc.
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet?: string;
}

export type ActionType =
  | 'play_music'
  | 'pause_music'
  | 'resume_music'
  | 'web_search'
  | 'open_terminal'
  | 'close_terminal'
  | 'open_memories'
  | 'open_advice'
  | 'open_decision_engine'
  | 'toggle_theme';

export interface UIAction {
  type: ActionType;
  param?: string;
  results?: WebSearchResult[];
}

export type WakeStatus = 'asleep' | 'waking' | 'awake_listening' | 'awake_processing' | 'awake_speaking';

export interface HeartToHeartState {
  tillyEmotion: string;
  tillyFeelings: string;
  userMood: string;
  recentAcousticCue: string | null;
}

export type LiveState = 'idle' | 'connecting' | 'connected' | 'listening' | 'speaking' | 'paused' | 'error';

export type DecisionIntentType =
  | 'emotional_support'
  | 'health_check'
  | 'action_execution'
  | 'life_decision_matrix'
  | 'knowledge_grounding'
  | 'language_switch'
  | 'casual_yarn';

export type DecisionRouteType =
  | 'live_empathy_response'
  | 'ui_command_dispatch'
  | 'web_search_grounding'
  | 'multi_option_decision_tree'
  | 'acoustic_care_intervention'
  | 'escalated_fallback';

// ============================================================================
// Official Gemini Decision 1 (gemini-decision-1) Primitives (v1beta)
// ============================================================================

export interface NoulQuestionSpec {
  type: 'noul';
  instructions: string;
  criteria?: {
    true_description: string;
    false_description: string;
  };
}

export interface ChoiceQuestionSpec {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string>;
}

export interface ScoreQuestionSpec {
  type: 'score';
  instructions: string;
  criteria: string[];
}

export type DecisionQuestionSpec = NoulQuestionSpec | ChoiceQuestionSpec | ScoreQuestionSpec;

export interface NoulAnswerSpec {
  type: 'noul';
  noul: number; // 0.01 to 0.99
  confidence: number; // max(noul, 1 - noul)
}

export interface ChoiceAnswerSpec {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface ScoreAnswerSpec {
  type: 'score';
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
}

export type DecisionAnswerSpec = NoulAnswerSpec | ChoiceAnswerSpec | ScoreAnswerSpec;

export interface DecisionMultimodalBlock {
  type: 'text' | 'image' | 'audio' | 'video' | 'document';
  text?: string;
  data?: string;
  uri?: string;
  mime_type?: string;
  resolution?: 'low' | 'medium' | 'high' | 'ultra_high';
}

export interface DecisionUsageStats {
  total_input_tokens: number;
  total_output_tokens: number; // Always 0 for gemini-decision-1
  total_tokens: number;
  input_tokens_by_modality?: Array<{
    modality: string;
    tokens: number;
  }>;
}

export interface DecisionConfidenceGate {
  threshold: number; // e.g., 0.80
  overallConfidence: number;
  passed: boolean;
  escalated: boolean;
  escalationTarget: 'none' | 'gemini-4-argon' | 'human_review';
  reason: string;
}

export interface DecisionReasoningStep {
  step: number;
  module: string;
  evaluation: string;
  weight: number;
  primitiveType?: 'noul' | 'choice' | 'score';
  questionKey?: string;
  confidence?: number;
}

export interface DecisionOptionItem {
  id: string;
  label: string;
  utilityScore: number; // 0 to 100 derived from calibrated choice/score probabilities
  choiceProbability?: number;
  rubricScore?: number;
  confidence?: number;
  pros: string[];
  cons: string[];
  riskLevel: 'low' | 'moderate' | 'high';
  recommended: boolean;
}

export interface DecisionEngineResult {
  engine: 'gemini-decision-1';
  apiVersion: 'v1beta';
  decisionId: string;
  timestamp: string;
  latencyMs: number;
  inputSummary: string;
  intentClassification: DecisionIntentType;
  confidenceScore: number;
  urgencyLevel: 'low' | 'medium' | 'high' | 'critical';
  selectedRoute: DecisionRouteType;
  questionsEvaluated: Record<string, DecisionQuestionSpec>;
  answers: Record<string, DecisionAnswerSpec>;
  usage: DecisionUsageStats;
  confidenceGate: DecisionConfidenceGate;
  reasoningChain: DecisionReasoningStep[];
  decisionOptions: DecisionOptionItem[];
  recommendedAction: {
    uiAction?: UIAction | null;
    targetEmotion: string;
    targetLanguage: string;
    spokenDirective: string;
  };
  policyGuardrails: {
    safetyPassed: boolean;
    safetyProbability: number;
    empathyAlignment: number;
    toneCalibration: string;
  };
}

// ============================================================================
// Modular Skill & Plugin Architecture Types (Gemini Live + gemini-decision-1)
// ============================================================================

export interface SkillToolDeclarationMeta {
  name: string;
  description?: string;
  parameters?: Record<string, any>;
}

export interface RegisteredSkillMetadata {
  name: string;
  description: string;
  decision_criteria: string;
  filler_phrase: string;
  isCustom?: boolean;
  oauthProvider?: 'google_workspace' | 'spotify' | 'github' | 'none';
  tool_declarations: SkillToolDeclarationMeta[];
}

export interface SkillRoutingDecision {
  decisionId: string;
  timestamp: string;
  model: 'gemini-decision-1';
  apiVersion: 'v1beta';
  input: string;
  selectedChoice: string;
  confidence: number;
  threshold: number;
  probabilities: Record<string, number>;
  skillLoaded: string | null;
  attachedTools: SkillToolDeclarationMeta[];
  fillerPhrase: string | null;
  outputTokens: 0;
  inputTokens: number;
  latencyMs: number;
  reason: string;
}

export interface SkillExecutionResult {
  skillName: string;
  toolName: string;
  args: Record<string, any>;
  success: boolean;
  voiceSummary: string;
  data?: Record<string, any>;
  uiAction?: UIAction;
  requiresConfirmation?: {
    actionId: string;
    provider: 'google_workspace' | 'github' | 'spotify' | 'custom';
    title: string;
    description: string;
    toolName: string;
    args: Record<string, any>;
  };
  requiresAuth?: {
    provider: 'google_workspace' | 'spotify' | 'github';
    reason: string;
  };
  executionTimeMs: number;
  mode?: 'live_api' | 'dry_run_mock' | 'google_search_grounding' | 'oauth_api' | 'custom_plugin' | 'live_web_fallback';
}

export interface AgentStepTrace {
  stepNumber: number;
  skillName: string;
  toolName: string;
  args: Record<string, any>;
  result: SkillExecutionResult;
}

export interface VoiceSkillTurnTrace {
  traceId: string;
  timestamp: string;
  userInput: string;
  routingDecision: SkillRoutingDecision;
  spokenFiller?: string | null;
  toolCall?: {
    skillName: string;
    toolName: string;
    args: Record<string, any>;
  } | null;
  toolResult?: SkillExecutionResult | null;
  agentSteps?: AgentStepTrace[];
  finalVoiceSynthesis?: string;
}

export interface CustomPluginInstallSpec {
  name: string;
  description: string;
  decision_criteria: string;
  filler_phrase?: string;
  handlerType: 'webhook' | 'prompt' | 'script';
  webhookUrl?: string;
  webhookMethod?: 'GET' | 'POST';
  promptTemplate?: string;
  scriptBody?: string;
  toolName?: string;
  paramName?: string;
  paramDescription?: string;
}

export interface OAuthProviderStatus {
  provider: string;
  name: string;
  description?: string;
  connected: boolean;
  configured: boolean;
  hasCustomCredentials?: boolean;
  callbackUrl: string;
  sharedCallbackUrl?: string;
  accountLabel?: string;
  authUrl?: string;
  tokenUrl?: string;
  scopes?: string;
  mcpUrl?: string;
  mcpTools?: Array<{ name: string; description?: string }>;
  supportsDcr?: boolean;
  portalUrl?: string;
  portalHint?: string;
  isCustom?: boolean;
}
