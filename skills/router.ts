import { FunctionDeclaration, GoogleGenAI } from '@google/genai';
import { skillRegistry } from './registry.ts';
import { SkillExecutionContext, SkillExecutionResult } from './base_skill.ts';

export const SKILL_ROUTER_CONFIDENCE_THRESHOLD = 0.75;

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
  attachedTools: FunctionDeclaration[];
  fillerPhrase: string | null;
  outputTokens: 0;
  inputTokens: number;
  latencyMs: number;
  reason: string;
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

const recentSkillTraces: VoiceSkillTurnTrace[] = [];

export function recordSkillTurnTrace(trace: VoiceSkillTurnTrace) {
  recentSkillTraces.unshift(trace);
  if (recentSkillTraces.length > 30) {
    recentSkillTraces.pop();
  }
}

export function getRecentSkillTurnTraces(): VoiceSkillTurnTrace[] {
  return recentSkillTraces;
}

function getDecisionClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || '',
    apiVersion: 'v1beta',
    httpOptions: {
      apiVersion: 'v1beta',
      headers: { 'User-Agent': 'aistudio-build' },
    },
  });
}

/**
 * Infers structured tool name + arguments from natural voice utterance
 * for all built-in, prebuilt, and user-installed custom plugins.
 */
export function inferToolCallFromUtterance(
  skillName: string,
  utterance: string
): { toolName: string; args: Record<string, any> } {
  const clean = (utterance || '').trim();
  const lower = clean.toLowerCase();

  if (skillName === 'web_search') {
    const stripped = clean
      .replace(/^(hey\s+(tilly|matilda|sofia|shofia)[,\s]*)/i, '')
      .replace(/^(search\s+(on\s+the\s+web|the\s+web|google|for)|look\s+up|google|find\s+out)\s+/i, '')
      .trim();
    const category = lower.includes('weather')
      ? 'weather'
      : lower.includes('news')
      ? 'news'
      : 'general';
    return {
      toolName: 'web_search',
      args: {
        query: stripped || clean || 'latest news in Australia',
        category,
      },
    };
  }

  if (skillName === 'spotify_control') {
    if (/\b(pause|stop|mute|halt)\b/i.test(lower)) {
      return { toolName: 'pause_playback', args: {} };
    }
    if (/\b(next|skip)\b/i.test(lower)) {
      return { toolName: 'next_track', args: {} };
    }
    const volMatch = lower.match(/(\d{1,3})\s*%?/);
    if (lower.includes('volume') || lower.includes('louder') || lower.includes('quieter')) {
      const percent = volMatch
        ? Math.min(100, Math.max(0, parseInt(volMatch[1], 10)))
        : lower.includes('louder')
        ? 85
        : 40;
      return { toolName: 'set_volume', args: { percent } };
    }

    const queryMatch = clean
      .replace(/^(hey\s+(tilly|matilda|sofia|shofia)[,\s]*)/i, '')
      .replace(/^(play|put\s+on|start|listen\s+to)\s+(some\s+)?/i, '')
      .replace(/\s+(on\s+spotify|music|song|track|please)$/i, '')
      .trim();

    const type = lower.includes('playlist')
      ? 'playlist'
      : lower.includes('album')
      ? 'album'
      : lower.includes('artist')
      ? 'artist'
      : 'track';

    return {
      toolName: 'play_music',
      args: {
        query: queryMatch || 'Byron Bay Sunset',
        type,
      },
    };
  }

  if (skillName === 'google_workspace') {
    if (/\b(send|write|compose)\b/i.test(lower) && /\b(email|gmail|mail)\b/i.test(lower)) {
      const emailMatch = clean.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      return {
        toolName: 'send_email',
        args: {
          to: emailMatch?.[1] || 'user@example.com',
          subject: 'Voice message from Sofia',
          body: clean,
        },
      };
    }
    if (/\b(email|gmail|inbox|messages?)\b/i.test(lower)) {
      return { toolName: 'list_recent_emails', args: {} };
    }
    if (/\b(create|add|schedule|book)\b/i.test(lower) && /\b(calendar|meeting|event)\b/i.test(lower)) {
      const summary = clean
        .replace(/^(hey\s+(tilly|matilda|sofia|shofia)[,\s]*)/i, '')
        .replace(/^(add|create|schedule|book)\s+(a\s+)?(calendar\s+event|meeting|event)\s*(called|named|for)?\s*/i, '')
        .trim();
      return {
        toolName: 'create_calendar_event',
        args: { summary: summary || 'New Meeting' },
      };
    }
    if (/\b(add|create)\b/i.test(lower) && /\b(task|to-?do|reminder)\b/i.test(lower)) {
      const title = clean
        .replace(/^(hey\s+(tilly|matilda|sofia|shofia)[,\s]*)/i, '')
        .replace(/^(add|create)\s+(a\s+)?(task|to-?do|reminder)\s*(to)?\s*/i, '')
        .trim();
      return { toolName: 'create_task', args: { title: title || 'Follow up' } };
    }
    if (/\b(tasks?|to-?do)\b/i.test(lower)) {
      return { toolName: 'list_tasks', args: {} };
    }
    if (/\b(drive|files?|docs?|sheets?)\b/i.test(lower)) {
      const q = clean
        .replace(/^(search|find|list|check)\s+(my\s+)?(google\s+drive|drive|files?)\s*(for)?\s*/i, '')
        .trim();
      return { toolName: 'search_drive_files', args: { query: q } };
    }
    return { toolName: 'list_calendar_events', args: { maxResults: 5 } };
  }

  if (skillName === 'github_ops') {
    if (/\bmy\s+repo/i.test(lower)) {
      return { toolName: 'github_list_my_repos', args: {} };
    }
    const q = clean
      .replace(/\b(?:search|find|check)\s+(?:on\s+)?github\s*(?:repositories|repos?)?\s*(?:for)?\b/i, '')
      .replace(/\b(?:repositories|repos?)\s+for\b/i, '')
      .trim();
    return { toolName: 'github_search_repos', args: { query: q || 'gemini mcp agent' } };
  }

  if (skillName === 'productivity_agent') {
    if (/\b(list|show|read)\b.*\b(notes?|reminders?)\b/i.test(lower)) {
      return { toolName: 'list_notes', args: {} };
    }
    if (/\b(note|remember|remind me|save)\b/i.test(lower)) {
      return { toolName: 'create_note', args: { text: clean } };
    }
    return { toolName: 'calculate_or_time', args: { expression: clean } };
  }

  if (skillName === 'computer_use') {
    if (/\b(stop|halt|abort|cancel)\b.*\b(computer|screen|clicking|task|automation)\b/i.test(lower)) {
      return { toolName: 'stop_computer_task', args: {} };
    }
    if (/\b(what(?:'s| is)\s+on\s+my\s+screen|look\s+at\s+my\s+screen|capture\s+(?:the\s+)?screen|take\s+a\s+screenshot|inspect\s+screen)\b/i.test(lower)) {
      return { toolName: 'inspect_current_screen', args: { question: clean } };
    }
    const urlMatch = clean.match(/https?:\/\/[^\s]+/i);
    return {
      toolName: 'execute_computer_task',
      args: {
        goal: clean,
        ...(urlMatch ? { startUrl: urlMatch[0] } : {}),
      },
    };
  }

  // Custom plugin parameter binding
  const skill = skillRegistry.getSkill(skillName);
  const firstTool = skill?.tool_declarations?.[0];
  const toolName = firstTool?.name || skillName;
  const props = (firstTool?.parameters as any)?.properties || {};
  const firstParam = Object.keys(props)[0] || 'input';
  return {
    toolName,
    args: { [firstParam]: clean },
  };
}

/**
 * Splits compound voice commands ("search weather in Tokyo AND play jazz on Spotify")
 * so Sofia/Matilda acts agentically across multiple tools in one turn.
 */
function extractAgenticSubCommands(utterance: string): string[] {
  const parts = utterance
    .split(
      /\s+(?:and\s+then|and\s+also|then|and\s+(?=(?:play|pause|skip|next|set|search|find|check|list|create|add|send|remind|note|calculate|tell|open|run|get|what(?:'s| is)\s+(?:the\s+)?(?:weather|time|news))))\s*/i
    )
    .map((p) => p.trim())
    .filter((p) => p.length > 3);
  return parts.length > 1 ? parts.slice(0, 3) : [utterance.trim()];
}

/**
 * Front-Door Intent Router powered by `gemini-decision-1` (`v1beta`).
 */
export async function routeVoiceTurnWithDecision1(
  utterance: string,
  threshold: number = SKILL_ROUTER_CONFIDENCE_THRESHOLD
): Promise<SkillRoutingDecision> {
  await skillRegistry.autoDiscoverSkills();
  const startTime = Date.now();
  const cleanInput = (utterance || '').trim();
  const criteriaMap = skillRegistry.getDecisionCriteriaMap();

  let selectedChoice = 'general_chat';
  let confidence = 0.92;
  let probabilities: Record<string, number> = { general_chat: 0.92 };
  let inputTokens = Math.max(32, Math.round(cleanInput.length / 3.5));

  try {
    const ai = getDecisionClient();
    const response = await ai.decisions.create({
      model: 'gemini-decision-1',
      input: cleanInput || 'Silence',
      questions: {
        skill_route: {
          type: 'choice',
          instructions:
            'Select the single best registered voice assistant skill plugin (or general_chat / ignore_noise) to handle this user voice command.',
          criteria: criteriaMap,
        },
      },
    });

    const routeAns = response.answers?.skill_route;
    if (routeAns && routeAns.type === 'choice') {
      selectedChoice = routeAns.choice || 'general_chat';
      confidence = typeof routeAns.confidence === 'number' ? Number(routeAns.confidence.toFixed(4)) : 0.85;
      probabilities = (routeAns.probabilities as Record<string, number>) || { [selectedChoice]: confidence };
    }
    if (response.usage?.total_input_tokens) {
      inputTokens = response.usage.total_input_tokens;
    }
  } catch (err: any) {
    console.warn('[SkillRouter] gemini-decision-1 fallback heuristic used:', err?.message);
    const lower = cleanInput.toLowerCase();
    if (!cleanInput || cleanInput.length < 2) {
      selectedChoice = 'ignore_noise';
      confidence = 0.96;
      probabilities = { ignore_noise: 0.96, general_chat: 0.04 };
    } else if (/(calendar|gmail|email|inbox|tasks|google drive|meeting|schedule)/i.test(lower) && skillRegistry.getSkill('google_workspace')) {
      selectedChoice = 'google_workspace';
      confidence = 0.94;
      probabilities = { google_workspace: 0.94, general_chat: 0.06 };
    } else if (/(github|repo|pull request|open source)/i.test(lower) && skillRegistry.getSkill('github_ops')) {
      selectedChoice = 'github_ops';
      confidence = 0.94;
      probabilities = { github_ops: 0.94, general_chat: 0.06 };
    } else if (/(spotify|play music|play song|play track|pause music|pause playback|stop music|next track|skip track|set volume|volume)/i.test(lower)) {
      selectedChoice = 'spotify_control';
      confidence = 0.95;
      probabilities = { spotify_control: 0.95, general_chat: 0.05 };
    } else if (/(weather|forecast|news|search|look up|google|who won|stock price|score|what is)/i.test(lower)) {
      selectedChoice = 'web_search';
      confidence = 0.94;
      probabilities = { web_search: 0.94, general_chat: 0.06 };
    } else if (/(note|remind me|calculate|what time is it)/i.test(lower) && skillRegistry.getSkill('productivity_agent')) {
      selectedChoice = 'productivity_agent';
      confidence = 0.92;
      probabilities = { productivity_agent: 0.92, general_chat: 0.08 };
    } else if (
      /(screenshot|screen share|on my screen|capture screen|click\s|double click|right click|drag\s|scroll\s|open app|launch\s|open calculator|open notepad|open chrome|open terminal|open vs\s?code|open finder|browser sandbox|control my computer)/i.test(
        lower
      ) &&
      skillRegistry.getSkill('computer_use')
    ) {
      selectedChoice = 'computer_use';
      confidence = 0.94;
      probabilities = { computer_use: 0.94, general_chat: 0.06 };
    } else {
      selectedChoice = 'general_chat';
      confidence = 0.91;
      probabilities = { general_chat: 0.91, web_search: 0.05, spotify_control: 0.04 };
    }
  }

  const isPluginSelected =
    selectedChoice !== 'general_chat' &&
    selectedChoice !== 'ignore_noise' &&
    Boolean(skillRegistry.getSkill(selectedChoice));

  const meetsConfidenceThreshold = confidence >= threshold;
  const skillLoaded = isPluginSelected && meetsConfidenceThreshold ? selectedChoice : null;
  const matchedSkill = skillLoaded ? skillRegistry.getSkill(skillLoaded) : undefined;
  const attachedTools = skillLoaded ? skillRegistry.getToolsForSkill(skillLoaded) : [];

  let reason = '';
  if (skillLoaded) {
    reason = `gemini-decision-1 selected "${skillLoaded}" with ${(confidence * 100).toFixed(1)}% confidence (>= ${(threshold * 100).toFixed(0)}% threshold). Bound ${attachedTools.length} tool declaration(s).`;
  } else if (isPluginSelected && !meetsConfidenceThreshold) {
    reason = `gemini-decision-1 top choice "${selectedChoice}" had ${(confidence * 100).toFixed(1)}% confidence (< ${(threshold * 100).toFixed(0)}% threshold). Tools withheld to prevent hallucination.`;
  } else {
    reason = `gemini-decision-1 routed to "${selectedChoice}" (${(confidence * 100).toFixed(1)}% confidence). Zero heavy tool declarations attached.`;
  }

  return {
    decisionId: `route-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    model: 'gemini-decision-1',
    apiVersion: 'v1beta',
    input: cleanInput,
    selectedChoice,
    confidence,
    threshold,
    probabilities,
    skillLoaded,
    attachedTools,
    fillerPhrase: matchedSkill?.filler_phrase || null,
    outputTokens: 0,
    inputTokens,
    latencyMs: Math.max(12, Date.now() - startTime),
    reason,
  };
}

/**
 * Full Agentic Execution Loop for Sofia/Matilda:
 * Routes single or multi-step voice commands through `gemini-decision-1`,
 * chains tool calls asynchronously via `SkillRegistry`, and returns a combined trace.
 */
export async function executeAgenticVoiceTurn(
  utterance: string,
  options: {
    threshold?: number;
    toolOverride?: { skillName: string; toolName: string; args: Record<string, any> };
    context: Omit<SkillExecutionContext, 'userInput'>;
  }
): Promise<VoiceSkillTurnTrace> {
  const threshold = options.threshold ?? SKILL_ROUTER_CONFIDENCE_THRESHOLD;
  const subCommands = options.toolOverride ? [utterance] : extractAgenticSubCommands(utterance);

  // Route primary command (or first clause)
  const primaryDecision = await routeVoiceTurnWithDecision1(subCommands[0], threshold);
  const agentSteps: AgentStepTrace[] = [];

  if (options.toolOverride) {
    const res = await skillRegistry.executeTool(
      options.toolOverride.toolName,
      options.toolOverride.args,
      {
        ...options.context,
        userInput: utterance,
      }
    );
    agentSteps.push({
      stepNumber: 1,
      skillName: options.toolOverride.skillName,
      toolName: options.toolOverride.toolName,
      args: options.toolOverride.args,
      result: res,
    });
  } else {
    // Execute step 1 if primary decision loaded a skill
    if (primaryDecision.skillLoaded) {
      const inferred1 = inferToolCallFromUtterance(primaryDecision.skillLoaded, subCommands[0]);
      const res1 = await skillRegistry.executeTool(inferred1.toolName, inferred1.args, {
        ...options.context,
        userInput: subCommands[0],
      });
      agentSteps.push({
        stepNumber: 1,
        skillName: primaryDecision.skillLoaded,
        toolName: inferred1.toolName,
        args: inferred1.args,
        result: res1,
      });
    }

    // Agentic multi-step chaining for compound commands ("search X and then play Y")
    for (let i = 1; i < subCommands.length; i++) {
      const subDecision = await routeVoiceTurnWithDecision1(subCommands[i], threshold);
      if (subDecision.skillLoaded) {
        const inferredN = inferToolCallFromUtterance(subDecision.skillLoaded, subCommands[i]);
        const resN = await skillRegistry.executeTool(inferredN.toolName, inferredN.args, {
          ...options.context,
          userInput: subCommands[i],
        });
        agentSteps.push({
          stepNumber: agentSteps.length + 1,
          skillName: subDecision.skillLoaded,
          toolName: inferredN.toolName,
          args: inferredN.args,
          result: resN,
        });
      }
    }
  }

  const lastStep = agentSteps[agentSteps.length - 1];
  const combinedVoiceSummary =
    agentSteps.length > 1
      ? agentSteps.map((s) => s.result.voiceSummary).join(' ')
      : lastStep?.result.voiceSummary;

  if (lastStep && combinedVoiceSummary) {
    lastStep.result = {
      ...lastStep.result,
      voiceSummary: combinedVoiceSummary,
    };
  }

  const trace: VoiceSkillTurnTrace = {
    traceId: `agent-trace-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    userInput: utterance,
    routingDecision: primaryDecision,
    spokenFiller:
      agentSteps.length > 0 ? skillRegistry.getSkill(agentSteps[0].skillName)?.filler_phrase || null : null,
    toolCall: lastStep
      ? {
          skillName: lastStep.skillName,
          toolName: lastStep.toolName,
          args: lastStep.args,
        }
      : null,
    toolResult: lastStep?.result || null,
    agentSteps: agentSteps.length > 0 ? agentSteps : undefined,
    finalVoiceSynthesis: combinedVoiceSummary,
  };

  recordSkillTurnTrace(trace);
  return trace;
}
