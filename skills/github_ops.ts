import { FunctionDeclaration, Type } from '@google/genai';
import { BaseSkill, SkillExecutionContext, SkillExecutionResult } from './base_skill.ts';

/**
 * Prebuilt Plugin 4: GitHub Ops Skill (`github_ops`)
 * Searches GitHub repositories, inspects repo stats, or lists open issues via GitHub OAuth or public REST API.
 */
export class GitHubOpsSkill extends BaseSkill {
  readonly name = 'github_ops';
  readonly oauthProvider = 'github' as const;

  readonly description =
    'Searches GitHub repositories, checks stars/issues, and summarizes trending or personal repos via GitHub OAuth or public API.';

  readonly decision_criteria =
    'User asks about GitHub repositories, open-source projects, code repos, GitHub issues, pull requests, or trending repos.';

  readonly filler_phrase = 'Checking GitHub for you now...';

  readonly tool_declarations: FunctionDeclaration[] = [
    {
      name: 'github_search_repos',
      description: 'Search GitHub repositories by keyword or topic.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: 'Repository search keywords (e.g. "mcp server voice").' },
        },
        required: ['query'],
      },
    },
    {
      name: 'github_list_my_repos',
      description: 'List repositories belonging to the authenticated GitHub user.',
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
    const token = context?.oauthTokens?.github || null;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'sofia-voice-agent',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const resolvedTool =
      toolName === 'github_list_my_repos' || /\bmy\s+repo/i.test(context?.userInput || '')
        ? 'github_list_my_repos'
        : 'github_search_repos';

    try {
      if (resolvedTool === 'github_list_my_repos') {
        if (!token) {
          return {
            skillName: this.name,
            toolName: resolvedTool,
            args: {},
            success: false,
            voiceSummary: 'Connect your GitHub account with OAuth in the Agent Skills panel to list your private and personal repositories.',
            requiresAuth: { provider: 'github', reason: 'GitHub OAuth connection needed for user repos.' },
            executionTimeMs: Date.now() - startTime,
            mode: 'oauth_api',
          };
        }
        const res = await fetch('https://api.github.com/user/repos?sort=updated&per_page=5', { headers });
        const repos: any = await res.json();
        const list = Array.isArray(repos)
          ? repos.map((r: any) => ({ name: r.full_name, stars: r.stargazers_count, url: r.html_url }))
          : [];
        return {
          skillName: this.name,
          toolName: resolvedTool,
          args: {},
          success: true,
          voiceSummary:
            list.length > 0
              ? `Your most recently updated GitHub repository is ${list[0].name} with ${list[0].stars} stars.`
              : 'You have no repositories on this GitHub account yet.',
          data: { repos: list },
          executionTimeMs: Date.now() - startTime,
          mode: 'oauth_api',
        };
      }

      const rawQuery = String(args?.query || context?.userInput || 'mcp agent')
        .replace(
          /\b(?:search\s+(?:on\s+)?github\s*(?:repositories|repos?)?\s*(?:for)?|github\s+(?:repositories|repos?)\s*(?:for)?|find\s+on\s+github\s*(?:for)?|(?:repositories|repos?)\s+for)\b/gi,
          ''
        )
        .trim();
      const res = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(rawQuery || 'gemini')}&sort=stars&per_page=4`,
        { headers }
      );
      const data: any = await res.json();
      const items = (data?.items || []).map((r: any) => ({
        name: r.full_name,
        stars: r.stargazers_count,
        description: r.description,
        url: r.html_url,
      }));
      const top = items[0];
      return {
        skillName: this.name,
        toolName: 'github_search_repos',
        args: { query: rawQuery },
        success: true,
        voiceSummary: top
          ? `Top GitHub repo for ${rawQuery} is ${top.name} with ${top.stars.toLocaleString()} stars. ${top.description || ''}`.trim()
          : `No GitHub repositories matched ${rawQuery}.`,
        data: { repos: items },
        uiAction: {
          type: 'web_search',
          param: `GitHub: ${rawQuery}`,
          results: items.slice(0, 3).map((i: any) => ({
            title: `${i.name} (${i.stars}★)`,
            url: i.url,
          })),
        },
        executionTimeMs: Date.now() - startTime,
        mode: token ? 'oauth_api' : 'live_api',
      };
    } catch (err: any) {
      return {
        skillName: this.name,
        toolName: resolvedTool,
        args: args || {},
        success: false,
        voiceSummary: `Couldn't reach GitHub right now: ${err?.message || 'network error'}.`,
        executionTimeMs: Date.now() - startTime,
        mode: 'live_api',
      };
    }
  }
}

export default new GitHubOpsSkill();
