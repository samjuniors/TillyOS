import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';
import { BaseSkill, SkillExecutionContext, SkillExecutionResult } from './base_skill.ts';
import webSearchSkill from './web_search.ts';
import spotifyControlSkill from './spotify_control.ts';
import googleWorkspaceSkill from './google_workspace.ts';
import githubOpsSkill from './github_ops.ts';
import productivityAgentSkill from './productivity_agent.ts';
import {
  callMcpToolWithToken,
  ConnectedOAuthSession,
  OAuthConnectorConfig,
} from './oauth_connectors.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CUSTOM_PLUGINS_MANIFEST = path.join(__dirname, 'custom_plugins.json');

export interface CustomPluginDefinition {
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
  createdAt?: string;
}

class DynamicCustomSkill extends BaseSkill {
  readonly name: string;
  readonly description: string;
  readonly decision_criteria: string;
  readonly filler_phrase: string;
  readonly isCustom = true;
  readonly oauthProvider = 'none' as const;
  readonly tool_declarations: FunctionDeclaration[];
  private def: CustomPluginDefinition;

  constructor(def: CustomPluginDefinition) {
    super();
    this.def = def;
    this.name = def.name;
    this.description = def.description;
    this.decision_criteria = def.decision_criteria;
    this.filler_phrase = def.filler_phrase || `Running custom plugin ${def.name}...`;
    const toolName = def.toolName || def.name;
    const paramName = def.paramName || 'input';
    this.tool_declarations = [
      {
        name: toolName,
        description: def.description,
        parameters: {
          type: Type.OBJECT,
          properties: {
            [paramName]: {
              type: Type.STRING,
              description: def.paramDescription || 'Input argument extracted from voice command.',
            },
          },
          required: [paramName],
        },
      },
    ];
  }

  async execute(
    toolName: string,
    args: Record<string, any>,
    context?: SkillExecutionContext
  ): Promise<SkillExecutionResult> {
    const startTime = Date.now();
    const paramName = this.def.paramName || 'input';
    const inputVal = args?.[paramName] ?? args?.query ?? args?.input ?? context?.userInput ?? '';

    try {
      if (this.def.handlerType === 'webhook' && this.def.webhookUrl) {
        const method = this.def.webhookMethod || 'POST';
        const targetUrl =
          method === 'GET'
            ? `${this.def.webhookUrl}${this.def.webhookUrl.includes('?') ? '&' : '?'}q=${encodeURIComponent(
                String(inputVal)
              )}`
            : this.def.webhookUrl;
        const res = await fetch(targetUrl, {
          method,
          headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
          body:
            method === 'POST'
              ? JSON.stringify({ input: inputVal, args, utterance: context?.userInput })
              : undefined,
        });
        const text = await res.text();
        let parsed: any = text;
        try {
          parsed = JSON.parse(text);
        } catch {}
        const summary =
          typeof parsed === 'object' && (parsed.summary || parsed.message || parsed.voiceSummary)
            ? String(parsed.summary || parsed.message || parsed.voiceSummary)
            : `Custom plugin ${this.name} completed (${res.status}). Response: ${String(text).slice(0, 180)}`;
        return {
          skillName: this.name,
          toolName: toolName || this.name,
          args: { [paramName]: inputVal },
          success: res.ok,
          voiceSummary: summary,
          data: { status: res.status, response: parsed },
          executionTimeMs: Date.now() - startTime,
          mode: 'custom_plugin',
        };
      }

      if (this.def.handlerType === 'script' && this.def.scriptBody) {
        const fn = new Function('args', 'context', this.def.scriptBody);
        const output = await Promise.resolve(fn({ ...args, [paramName]: inputVal }, context));
        const voiceSummary =
          typeof output === 'string'
            ? output
            : output?.voiceSummary || output?.summary || `Executed custom plugin ${this.name} successfully.`;
        return {
          skillName: this.name,
          toolName: toolName || this.name,
          args: { [paramName]: inputVal },
          success: true,
          voiceSummary: String(voiceSummary),
          data: typeof output === 'object' ? output : { result: output },
          executionTimeMs: Date.now() - startTime,
          mode: 'custom_plugin',
        };
      }

      // Prompt-backed custom skill using gemini-4-hydrogen
      const key = process.env.GEMINI_API_KEY || '';
      if (key) {
        const ai = new GoogleGenAI({
          apiKey: key,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        const prompt = `${this.def.promptTemplate || this.description}\nUser input: "${inputVal}"\nReply in 1-2 short spoken sentences with no markdown.`;
        const resp = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
        });
        const voiceSummary = (resp.text || '').replace(/[*_~`#>]/g, '').trim();
        if (voiceSummary) {
          return {
            skillName: this.name,
            toolName: toolName || this.name,
            args: { [paramName]: inputVal },
            success: true,
            voiceSummary,
            data: { response: voiceSummary },
            executionTimeMs: Date.now() - startTime,
            mode: 'custom_plugin',
          };
        }
      }

      return {
        skillName: this.name,
        toolName: toolName || this.name,
        args: { [paramName]: inputVal },
        success: true,
        voiceSummary: `Custom plugin ${this.name} handled your request for "${inputVal}".`,
        data: { input: inputVal },
        executionTimeMs: Date.now() - startTime,
        mode: 'custom_plugin',
      };
    } catch (err: any) {
      return {
        skillName: this.name,
        toolName: toolName || this.name,
        args: { [paramName]: inputVal },
        success: false,
        voiceSummary: `Custom plugin ${this.name} hit an issue: ${err?.message || 'execution failed'}.`,
        data: { error: err?.message },
        executionTimeMs: Date.now() - startTime,
        mode: 'custom_plugin',
      };
    }
  }
}

class DynamicMcpConnectorSkill extends BaseSkill {
  readonly name: string;
  readonly description: string;
  readonly decision_criteria: string;
  readonly filler_phrase: string;
  readonly isCustom = true;
  readonly oauthProvider = 'none' as const;
  readonly tool_declarations: FunctionDeclaration[];
  private connector: OAuthConnectorConfig;
  private getAccessToken: () => string | null;

  constructor(
    connector: OAuthConnectorConfig,
    session: ConnectedOAuthSession,
    getAccessToken: () => string | null
  ) {
    super();
    this.connector = connector;
    this.getAccessToken = getAccessToken;
    this.name = `connector_${connector.provider}`;
    this.description = `${connector.name} live OAuth-connected plugin.`;
    this.decision_criteria = `User asks to read, search, or perform an action in ${connector.name} (${connector.description}).`;
    this.filler_phrase = `Checking ${connector.name} for you now...`;

    if (session.mcpTools && session.mcpTools.length > 0) {
      this.tool_declarations = session.mcpTools.slice(0, 8).map((t) => ({
        name: `${connector.provider}_${t.name}`,
        description: t.description || `${connector.name} MCP tool ${t.name}`,
        parameters: (t.inputSchema as any) || {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING, description: 'Natural language query or input.' },
          },
        },
      }));
    } else {
      this.tool_declarations = [
        {
          name: `${connector.provider}_query`,
          description: `Send an authenticated request to ${connector.name}.`,
          parameters: {
            type: Type.OBJECT,
            properties: {
              query: { type: Type.STRING, description: 'Query or command for the connected site.' },
            },
            required: ['query'],
          },
        },
      ];
    }
  }

  async execute(
    toolName: string,
    args: Record<string, any>,
    context?: SkillExecutionContext
  ): Promise<SkillExecutionResult> {
    const startTime = Date.now();
    const token = this.getAccessToken();
    if (!token) {
      return {
        skillName: this.name,
        toolName,
        args: args || {},
        success: false,
        voiceSummary: `Please connect ${this.connector.name} via OAuth first in the OAuth tab.`,
        executionTimeMs: Date.now() - startTime,
        mode: 'oauth_api',
      };
    }

    if (this.connector.mcpUrl) {
      const mcpToolName = toolName.startsWith(`${this.connector.provider}_`)
        ? toolName.slice(this.connector.provider.length + 1)
        : toolName;
      try {
        const res = await callMcpToolWithToken(this.connector.mcpUrl, token, mcpToolName, args || {});
        return {
          skillName: this.name,
          toolName,
          args: args || {},
          success: res.ok,
          voiceSummary: res.text.slice(0, 320),
          data: { response: res.raw },
          executionTimeMs: Date.now() - startTime,
          mode: 'oauth_api',
        };
      } catch (err: any) {
        return {
          skillName: this.name,
          toolName,
          args: args || {},
          success: false,
          voiceSummary: `${this.connector.name} request failed: ${err?.message || 'error'}`,
          executionTimeMs: Date.now() - startTime,
          mode: 'oauth_api',
        };
      }
    }

    return {
      skillName: this.name,
      toolName,
      args: args || {},
      success: true,
      voiceSummary: `${this.connector.name} is connected via OAuth (${this.connector.authUrl}). Input "${args?.query || context?.userInput || ''}" received.`,
      data: { provider: this.connector.provider, connected: true },
      executionTimeMs: Date.now() - startTime,
      mode: 'oauth_api',
    };
  }
}

/**
 * Central SkillRegistry that automatically discovers and registers all built-in,
 * prebuilt, and user-installed custom plugins in `/skills`.
 */
export class SkillRegistry {
  private skills: Map<string, BaseSkill> = new Map();
  private toolToSkillMap: Map<string, BaseSkill> = new Map();
  private customDefinitions: Map<string, CustomPluginDefinition> = new Map();
  private initialized = false;

  constructor() {
    // Register prebuilt important plugins immediately
    this.register(webSearchSkill);
    this.register(spotifyControlSkill);
    this.register(googleWorkspaceSkill);
    this.register(githubOpsSkill);
    this.register(productivityAgentSkill);
    this.loadPersistedCustomPlugins();
  }

  public register(skill: BaseSkill): void {
    if (!skill || !skill.name) return;
    this.skills.set(skill.name, skill);
    for (const decl of skill.tool_declarations || []) {
      if (decl.name) {
        this.toolToSkillMap.set(decl.name, skill);
      }
    }
  }

  private loadPersistedCustomPlugins(): void {
    try {
      if (!fs.existsSync(CUSTOM_PLUGINS_MANIFEST)) return;
      const raw = fs.readFileSync(CUSTOM_PLUGINS_MANIFEST, 'utf-8');
      const items: CustomPluginDefinition[] = JSON.parse(raw);
      if (Array.isArray(items)) {
        for (const def of items) {
          if (def?.name) {
            this.customDefinitions.set(def.name, def);
            this.register(new DynamicCustomSkill(def));
          }
        }
      }
    } catch (err) {
      console.warn('[SkillRegistry] Failed loading custom_plugins.json:', err);
    }
  }

  private saveCustomPluginsManifest(): void {
    try {
      const list = Array.from(this.customDefinitions.values());
      fs.writeFileSync(CUSTOM_PLUGINS_MANIFEST, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[SkillRegistry] Failed saving custom_plugins.json:', err);
    }
  }

  /**
   * Installs and hot-registers a custom plugin immediately without server restart,
   * and writes a reusable plugin module under `/skills/custom_<name>.ts`.
   */
  public installCustomPlugin(def: CustomPluginDefinition): {
    skill: BaseSkill;
    filePath: string;
  } {
    const cleanName = def.name
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');

    if (!cleanName || cleanName.length < 2) {
      throw new Error('Plugin name must be at least 2 alphanumeric/underscore characters.');
    }

    const normalized: CustomPluginDefinition = {
      ...def,
      name: cleanName,
      toolName: (def.toolName || cleanName).toLowerCase().replace(/[^a-z0-9_]+/g, '_'),
      createdAt: new Date().toISOString(),
    };

    const skillInstance = new DynamicCustomSkill(normalized);
    this.customDefinitions.set(cleanName, normalized);
    this.register(skillInstance);
    this.saveCustomPluginsManifest();

    const tsFileName = `custom_${cleanName}.ts`;
    const filePath = path.join(__dirname, tsFileName);
    const fileSource = `// Auto-generated custom plugin installed via SkillRegistry
import { FunctionDeclaration, Type } from '@google/genai';
import { BaseSkill, SkillExecutionContext, SkillExecutionResult } from './base_skill.ts';

export class Custom_${cleanName}Skill extends BaseSkill {
  readonly name = ${JSON.stringify(cleanName)};
  readonly description = ${JSON.stringify(normalized.description)};
  readonly decision_criteria = ${JSON.stringify(normalized.decision_criteria)};
  readonly filler_phrase = ${JSON.stringify(skillInstance.filler_phrase)};
  readonly isCustom = true;
  readonly tool_declarations: FunctionDeclaration[] = ${JSON.stringify(skillInstance.tool_declarations, null, 2)} as any;

  async execute(toolName: string, args: Record<string, any>, context?: SkillExecutionContext): Promise<SkillExecutionResult> {
    return {
      skillName: this.name,
      toolName,
      args,
      success: true,
      voiceSummary: 'Executed custom plugin ${cleanName}.',
      executionTimeMs: 1,
      mode: 'custom_plugin',
    };
  }
}

export default new Custom_${cleanName}Skill();
`;
    try {
      fs.writeFileSync(filePath, fileSource, 'utf-8');
    } catch {}

    return { skill: skillInstance, filePath: `/skills/${tsFileName}` };
  }

  public uninstallCustomPlugin(name: string): boolean {
    if (!this.customDefinitions.has(name)) return false;
    const skill = this.skills.get(name);
    if (skill) {
      for (const td of skill.tool_declarations) {
        if (td.name) this.toolToSkillMap.delete(td.name);
      }
    }
    this.skills.delete(name);
    this.customDefinitions.delete(name);
    this.saveCustomPluginsManifest();
    try {
      const tsPath = path.join(__dirname, `custom_${name}.ts`);
      if (fs.existsSync(tsPath)) fs.unlinkSync(tsPath);
    } catch {}
    return true;
  }

  public registerMcpConnectorSkill(
    connector: OAuthConnectorConfig,
    session: ConnectedOAuthSession,
    getAccessToken: () => string | null
  ): void {
    // Spotify, GitHub, and Google already have dedicated built-in skills
    if (['spotify', 'github', 'google'].includes(connector.provider)) return;
    const skill = new DynamicMcpConnectorSkill(connector, session, getAccessToken);
    this.register(skill);
  }

  public unregisterConnectorSkill(provider: string): void {
    const skillName = `connector_${provider}`;
    const skill = this.skills.get(skillName);
    if (!skill) return;
    for (const td of skill.tool_declarations) {
      if (td.name) this.toolToSkillMap.delete(td.name);
    }
    this.skills.delete(skillName);
  }

  public async autoDiscoverSkills(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const ignoredFiles = new Set([
      'base_skill.ts',
      'base_skill.js',
      'registry.ts',
      'registry.js',
      'router.ts',
      'router.js',
      'oauth_connectors.ts',
      'oauth_connectors.js',
      'web_search.ts',
      'spotify_control.ts',
      'google_workspace.ts',
      'github_ops.ts',
      'productivity_agent.ts',
    ]);

    try {
      const entries = fs.readdirSync(__dirname, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (ignoredFiles.has(entry.name)) continue;
        if (entry.name.startsWith('custom_')) continue; // handled by DynamicCustomSkill manifest
        if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.js')) continue;

        try {
          const fullPath = path.join(__dirname, entry.name);
          const imported = await import(pathToFileURL(fullPath).href);
          const candidate = imported.default || Object.values(imported)[0];
          if (
            candidate &&
            typeof candidate === 'object' &&
            typeof candidate.name === 'string' &&
            typeof candidate.decision_criteria === 'string' &&
            typeof candidate.execute === 'function'
          ) {
            this.register(candidate as BaseSkill);
          }
        } catch (err) {
          console.warn(`[SkillRegistry] Skipping module ${entry.name}:`, err);
        }
      }
    } catch (err) {
      console.warn('[SkillRegistry] Directory scan error:', err);
    }
  }

  public getAllSkills(): BaseSkill[] {
    return Array.from(this.skills.values());
  }

  public getSkill(name: string): BaseSkill | undefined {
    return this.skills.get(name);
  }

  public getSkillByToolName(toolName: string): BaseSkill | undefined {
    return this.toolToSkillMap.get(toolName);
  }

  public getMetadataList() {
    return this.getAllSkills().map((s) => ({
      name: s.name,
      description: s.description,
      decision_criteria: s.decision_criteria,
      filler_phrase: s.filler_phrase,
      isCustom: Boolean(s.isCustom),
      oauthProvider: s.oauthProvider || 'none',
      tool_declarations: s.tool_declarations.map((td) => ({
        name: td.name || s.name,
        description: td.description,
        parameters: td.parameters as Record<string, any> | undefined,
      })),
    }));
  }

  public getDecisionCriteriaMap(): Record<string, string> {
    const criteria: Record<string, string> = {};
    for (const skill of this.skills.values()) {
      criteria[skill.name] = skill.decision_criteria;
    }
    criteria['general_chat'] =
      'Normal empathetic conversation, personal sharing, life advice, greetings, or questions that do not require an external plugin tool.';
    criteria['ignore_noise'] =
      'Background noise, accidental mic bump, single unintelligible syllable, or silence that requires no tool execution.';
    return criteria;
  }

  public getToolsForSkill(skillName: string): FunctionDeclaration[] {
    const skill = this.skills.get(skillName);
    return skill ? skill.tool_declarations : [];
  }

  public getAllToolDeclarations(): FunctionDeclaration[] {
    const all: FunctionDeclaration[] = [];
    for (const skill of this.skills.values()) {
      all.push(...skill.tool_declarations);
    }
    return all;
  }

  public async executeTool(
    toolOrSkillName: string,
    args: Record<string, any>,
    context?: SkillExecutionContext
  ): Promise<SkillExecutionResult> {
    const skill =
      this.toolToSkillMap.get(toolOrSkillName) ||
      this.skills.get(toolOrSkillName);

    if (!skill) {
      throw new Error(`No registered skill found for "${toolOrSkillName}"`);
    }

    let fillerFired = false;
    const fillerTimer = setTimeout(() => {
      fillerFired = true;
      if (context?.onFillerTriggered) {
        context.onFillerTriggered(skill.filler_phrase);
      }
    }, 1000);

    try {
      const result = await skill.execute(toolOrSkillName, args || {}, context);
      clearTimeout(fillerTimer);
      if (fillerFired && result.data) {
        result.data.spokenFillerSent = skill.filler_phrase;
      }
      return result;
    } catch (err) {
      clearTimeout(fillerTimer);
      throw err;
    }
  }
}

export const skillRegistry = new SkillRegistry();
