import { FunctionDeclaration, Type } from '@google/genai';
import { BaseSkill, SkillExecutionContext, SkillExecutionResult } from './base_skill.ts';
import { computerUseCoordinator, ComputerTargetMode } from './computer_use_engine.ts';

/**
 * Modular Skill Plugin: Computer Use (Hybrid Local Desktop Bridge + Cloud Browser Sandbox)
 * Allows Matilda to capture screens, click, double-click, right-click, drag and drop,
 * scroll, type text, press hotkeys, browse URLs, and launch desktop apps.
 */
export class ComputerUseSkill extends BaseSkill {
  readonly name = 'computer_use';
  readonly description =
    'Capture screen, click, drag and drop, scroll, type, press hotkeys, browse websites, or open desktop apps across Windows, macOS, Linux, and the Cloud Browser Sandbox.';
  readonly decision_criteria =
    'User asks to capture or look at their screen, click or drag an element, scroll, type into an app or browser, open a desktop application (like Calculator, Notes, Chrome, Terminal, VS Code), navigate or interact visually inside a website or browser sandbox, or control their computer.';
  readonly filler_phrase = 'Taking a look at your screen and lining that up now...';
  readonly oauthProvider = 'none' as const;

  readonly tool_declarations: FunctionDeclaration[] = [
    {
      name: 'execute_computer_task',
      description:
        'Execute a visual computer use task such as opening an app, clicking, dragging, scrolling, typing, or navigating inside Desktop Bridge or Browser Sandbox.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          goal: {
            type: Type.STRING,
            description:
              'Full natural-language task to execute visually on screen (e.g. "Open Calculator", "Go to wikipedia.org and click English", "Drag window right").',
          },
          targetMode: {
            type: Type.STRING,
            description: 'Optional execution target: "hybrid", "desktop_bridge", or "browser_sandbox".',
          },
          startUrl: {
            type: Type.STRING,
            description: 'Optional starting URL when browsing in Browser Sandbox.',
          },
        },
        required: ['goal'],
      },
    },
    {
      name: 'inspect_current_screen',
      description:
        'Capture the current desktop, shared screen, or browser sandbox frame and describe or analyze what is visible.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          question: {
            type: Type.STRING,
            description: 'What to inspect or answer about the visible screen.',
          },
        },
        required: ['question'],
      },
    },
    {
      name: 'stop_computer_task',
      description: 'Immediately halt any active Computer Use automation loop via emergency kill switch.',
      parameters: {
        type: Type.OBJECT,
        properties: {},
      },
    },
  ];

  async execute(
    toolName: string,
    args: Record<string, any>,
    context?: SkillExecutionContext
  ): Promise<SkillExecutionResult> {
    const startTime = Date.now();

    if (toolName === 'stop_computer_task') {
      const session = computerUseCoordinator.abortSession('Stopped by voice command kill switch.');
      return {
        skillName: this.name,
        toolName,
        args: args || {},
        success: true,
        voiceSummary: 'Stopped computer control right away, mate.',
        data: { session },
        uiAction: { type: 'open_computer_use', param: 'stop' },
        executionTimeMs: Date.now() - startTime,
        mode: 'live_api',
      };
    }

    if (toolName === 'inspect_current_screen') {
      const question = String(args?.question || context?.userInput || 'Describe what is on my screen right now.');
      const session = await computerUseCoordinator.runTask({
        goal: question,
        maxSteps: 1,
      });
      return {
        skillName: this.name,
        toolName,
        args: { question },
        success: session.status !== 'error',
        voiceSummary: session.summary,
        data: { session },
        uiAction: { type: 'open_computer_use', param: 'inspect' },
        executionTimeMs: Date.now() - startTime,
        mode: 'live_api',
      };
    }

    const goal = String(args?.goal || context?.userInput || 'Inspect screen');
    const targetMode = (args?.targetMode as ComputerTargetMode | undefined) || undefined;
    const startUrl = args?.startUrl ? String(args.startUrl) : undefined;

    const session = await computerUseCoordinator.runTask({
      goal,
      targetMode,
      startUrl,
      maxSteps: 6,
    });

    const voiceSummary =
      session.status === 'awaiting_confirmation'
        ? `I'm ready to run that step, mate—please approve it in the Computer Use confirmation popup.`
        : session.summary;

    return {
      skillName: this.name,
      toolName: toolName || 'execute_computer_task',
      args: { goal, targetMode, startUrl },
      success: session.status !== 'error',
      voiceSummary,
      data: { session },
      uiAction: { type: 'open_computer_use', param: goal },
      executionTimeMs: Date.now() - startTime,
      mode: 'live_api',
    };
  }
}

export default new ComputerUseSkill();
