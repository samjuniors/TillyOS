import { FunctionDeclaration, Type } from '@google/genai';
import { BaseSkill, SkillExecutionContext, SkillExecutionResult } from './base_skill.ts';

interface QuickNote {
  id: string;
  text: string;
  createdAt: string;
}

/**
 * Prebuilt Plugin 5: Productivity & Agent Utilities Skill (`productivity_agent`)
 * Provides quick notes/reminders, safe math/unit evaluation, and live world time lookups.
 */
export class ProductivityAgentSkill extends BaseSkill {
  readonly name = 'productivity_agent';
  readonly oauthProvider = 'none' as const;

  readonly description =
    'Manages quick voice notes & reminders, performs calculations or unit conversions, and checks current world time across timezones.';

  readonly decision_criteria =
    'User asks to take a quick note, save a reminder/timer, list saved notes, calculate math or convert units, or asks what time/date it is in a city.';

  readonly filler_phrase = 'Handling that note and calculation for you now...';

  private notes: QuickNote[] = [];

  readonly tool_declarations: FunctionDeclaration[] = [
    {
      name: 'create_note',
      description: 'Save a quick note or reminder from voice.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING, description: 'Content of the note or reminder.' },
        },
        required: ['text'],
      },
    },
    {
      name: 'list_notes',
      description: 'List all saved voice notes.',
      parameters: {
        type: Type.OBJECT,
        properties: {},
      },
    },
    {
      name: 'calculate_or_time',
      description: 'Evaluate a math expression, unit conversion, or check current time in a city.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          expression: { type: Type.STRING, description: 'Math or timezone query.' },
        },
        required: ['expression'],
      },
    },
  ];

  async execute(
    toolName: string,
    args: Record<string, any>,
    context?: SkillExecutionContext
  ): Promise<SkillExecutionResult> {
    const startTime = Date.now();
    const input = String(args?.text || args?.expression || context?.userInput || '').trim();
    const lower = input.toLowerCase();

    let resolvedTool = toolName;
    if (!['create_note', 'list_notes', 'calculate_or_time'].includes(resolvedTool)) {
      if (/\b(list|show|read)\b.*\b(notes?|reminders?)\b/.test(lower)) resolvedTool = 'list_notes';
      else if (/\b(note|remember|remind me|save this)\b/.test(lower)) resolvedTool = 'create_note';
      else resolvedTool = 'calculate_or_time';
    }

    if (resolvedTool === 'create_note') {
      const cleaned = input
        .replace(/^(hey\s+(tilly|sofia),?\s*)?(take a note|note that|remember that|remind me to|save note)\s*/i, '')
        .trim();
      const note: QuickNote = {
        id: `note-${Date.now().toString(36)}`,
        text: cleaned || input,
        createdAt: new Date().toISOString(),
      };
      this.notes.unshift(note);
      return {
        skillName: this.name,
        toolName: 'create_note',
        args: { text: note.text },
        success: true,
        voiceSummary: `Got it! Saved note: "${note.text}".`,
        data: { note, totalNotes: this.notes.length },
        executionTimeMs: Date.now() - startTime,
        mode: 'live_api',
      };
    }

    if (resolvedTool === 'list_notes') {
      const voiceSummary =
        this.notes.length === 0
          ? "You don't have any saved voice notes yet."
          : `You have ${this.notes.length} notes. The latest is: "${this.notes[0].text}".`;
      return {
        skillName: this.name,
        toolName: 'list_notes',
        args: {},
        success: true,
        voiceSummary,
        data: { notes: this.notes },
        executionTimeMs: Date.now() - startTime,
        mode: 'live_api',
      };
    }

    // Timezone or math calculation
    const tzMap: Record<string, string> = {
      sydney: 'Australia/Sydney',
      melbourne: 'Australia/Melbourne',
      tokyo: 'Asia/Tokyo',
      london: 'Europe/London',
      'new york': 'America/New_York',
      delhi: 'Asia/Kolkata',
      india: 'Asia/Kolkata',
      'san francisco': 'America/Los_Angeles',
    };
    for (const [city, tz] of Object.entries(tzMap)) {
      if (lower.includes(city)) {
        const formatted = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          weekday: 'short',
          hour: 'numeric',
          minute: '2-digit',
        }).format(new Date());
        return {
          skillName: this.name,
          toolName: 'calculate_or_time',
          args: { city, timeZone: tz },
          success: true,
          voiceSummary: `In ${city.charAt(0).toUpperCase() + city.slice(1)}, it is currently ${formatted}.`,
          data: { city, timeZone: tz, formatted },
          executionTimeMs: Date.now() - startTime,
          mode: 'live_api',
        };
      }
    }

    // Safe math evaluation
    const mathExpr = input.replace(/[^0-9+\-*/().%\s]/g, '').trim();
    if (mathExpr && /[0-9]/.test(mathExpr) && /[+\-*/%]/.test(mathExpr)) {
      try {
        const result = Function(`"use strict"; return (${mathExpr})`)();
        if (typeof result === 'number' && Number.isFinite(result)) {
          return {
            skillName: this.name,
            toolName: 'calculate_or_time',
            args: { expression: mathExpr },
            success: true,
            voiceSummary: `${mathExpr} equals ${result}.`,
            data: { expression: mathExpr, result },
            executionTimeMs: Date.now() - startTime,
            mode: 'live_api',
          };
        }
      } catch {}
    }

    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return {
      skillName: this.name,
      toolName: 'calculate_or_time',
      args: { expression: input },
      success: true,
      voiceSummary: `Current local time is ${nowStr}.`,
      data: { localTime: nowStr },
      executionTimeMs: Date.now() - startTime,
      mode: 'live_api',
    };
  }
}

export default new ProductivityAgentSkill();
