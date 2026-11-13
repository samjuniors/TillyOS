import { FunctionDeclaration } from '@google/genai';

export interface SkillExecutionContext {
  userInput: string;
  activeLanguage?: string;
  userMood?: string;
  slangLevel?: string;
  workspaceAccessToken?: string | null;
  oauthTokens?: {
    spotify?: string | null;
    github?: string | null;
    [provider: string]: string | null | undefined;
  };
  confirmedAction?: boolean;
  onFillerTriggered?: (fillerText: string) => void;
}

export interface SkillExecutionResult {
  skillName: string;
  toolName: string;
  args: Record<string, any>;
  success: boolean;
  voiceSummary: string;
  data?: Record<string, any>;
  uiAction?: {
    type: string;
    param?: string;
    results?: Array<{ title: string; url: string; snippet?: string }>;
  };
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

/**
 * BaseSkill interface & abstract class for modular Gemini Live voice assistant plugins.
 * Every skill dropped into `/skills` implements this contract and is automatically
 * discovered and registered by `SkillRegistry`.
 */
export abstract class BaseSkill {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly decision_criteria: string;
  abstract readonly tool_declarations: FunctionDeclaration[];
  abstract readonly filler_phrase: string;
  readonly isCustom?: boolean;
  readonly oauthProvider?: 'google_workspace' | 'spotify' | 'github' | 'none';

  /**
   * Executes a tool declaration belonging to this skill plugin.
   */
  abstract execute(
    toolName: string,
    args: Record<string, any>,
    context?: SkillExecutionContext
  ): Promise<SkillExecutionResult>;
}
