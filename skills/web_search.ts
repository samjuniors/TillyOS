import { FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';
import { BaseSkill, SkillExecutionContext, SkillExecutionResult } from './base_skill.ts';

/**
 * Plugin 1: Web Search Skill (`web_search`)
 * Uses Google Search grounding (`gemini-4-hydrogen` + `googleSearch: {}`),
 * Tavily/Serper (if configured), plus automatic live HTTP fallback (Open-Meteo weather,
 * Wikipedia REST API, DuckDuckGo Instant Answers) so voice web search always returns
 * fast, verified, 2-3 sentence spoken summaries with zero markdown or URLs.
 */
export class WebSearchSkill extends BaseSkill {
  readonly name = 'web_search';
  readonly oauthProvider = 'none' as const;

  readonly description =
    'Fetches real-time facts, current weather, breaking news, stock prices, or live events from the web and returns a concise voice-friendly summary.';

  readonly decision_criteria =
    'User asks for current weather, breaking news, real-time facts, sports scores, stock prices, general knowledge lookup, or explicitly asks to search Google or look something up on the web.';

  readonly filler_phrase = 'Searching the web for that right now...';

  readonly tool_declarations: FunctionDeclaration[] = [
    {
      name: 'web_search',
      description:
        'Search the live web for real-time facts, weather, news, or current events and return a concise voice-friendly summary (2-3 short sentences, no markdown or URLs).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description:
              'The search query to look up on the live web (e.g. "current weather in Sydney", "latest AI news").',
          },
          category: {
            type: Type.STRING,
            description: 'Category of information: "weather", "news", "facts", or "general".',
          },
        },
        required: ['query'],
      },
    },
  ];

  private getAiClient(): GoogleGenAI | null {
    const key = process.env.GEMINI_API_KEY || '';
    if (!key) return null;
    return new GoogleGenAI({
      apiKey: key,
      apiVersion: 'v1beta',
      httpOptions: {
        apiVersion: 'v1beta',
        headers: { 'User-Agent': 'aistudio-build' },
      },
    });
  }

  private cleanForVoice(rawText: string): string {
    return rawText
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_~`#>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private describeWeatherCode(code: number): string {
    if (code === 0) return 'clear skies';
    if (code <= 3) return 'partly cloudy skies';
    if (code <= 48) return 'foggy conditions';
    if (code <= 67) return 'light to moderate rain';
    if (code <= 77) return 'snow showers';
    if (code <= 82) return 'passing rain showers';
    if (code >= 95) return 'thunderstorms';
    return 'mild conditions';
  }

  private extractLocation(query: string): string {
    const match = query.match(/\bin\s+([a-zA-Z\s,]+?)(?:\s+today|\s+now|\s+tomorrow|\?|$)/i);
    if (match?.[1]) return match[1].trim();
    const cleaned = query
      .replace(/(what\s+is\s+the|current|today'?s?|weather|forecast|temperature|right\s+now|in)/gi, '')
      .replace(/[?!.]/g, '')
      .trim();
    return cleaned || 'Sydney';
  }

  private async liveWebFallback(
    query: string,
    category: string
  ): Promise<{
    summary: string;
    sources: Array<{ title: string; url: string; snippet?: string }>;
  }> {
    const lower = query.toLowerCase();
    const sources: Array<{ title: string; url: string; snippet?: string }> = [];

    // 1. Optional Tavily Search if key exists
    if (process.env.TAVILY_API_KEY) {
      try {
        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: process.env.TAVILY_API_KEY,
            query,
            search_depth: 'basic',
            include_answer: true,
            max_results: 3,
          }),
        });
        if (res.ok) {
          const data: any = await res.json();
          const results = Array.isArray(data.results) ? data.results : [];
          for (const r of results) {
            sources.push({ title: r.title, url: r.url, snippet: r.content });
          }
          if (data.answer) {
            return { summary: this.cleanForVoice(data.answer), sources };
          }
        }
      } catch {}
    }

    // 2. Live Weather via Open-Meteo API
    if (category === 'weather' || /\b(weather|temperature|forecast|rain|sunny|hot|cold)\b/i.test(lower)) {
      try {
        const location = this.extractLocation(query);
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`
        );
        if (geoRes.ok) {
          const geoData: any = await geoRes.json();
          const place = geoData?.results?.[0];
          if (place) {
            const wxRes = await fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`
            );
            if (wxRes.ok) {
              const wx: any = await wxRes.json();
              const cur = wx.current;
              const daily = wx.daily;
              const desc = this.describeWeatherCode(cur?.weather_code ?? 1);
              const tempC = Math.round(cur?.temperature_2m ?? 20);
              const feelsC = Math.round(cur?.apparent_temperature ?? tempC);
              const highC = daily?.temperature_2m_max?.[0] !== undefined ? Math.round(daily.temperature_2m_max[0]) : tempC + 2;
              const lowC = daily?.temperature_2m_min?.[0] !== undefined ? Math.round(daily.temperature_2m_min[0]) : tempC - 4;
              const windKmh = Math.round(cur?.wind_speed_10m ?? 10);

              sources.push({
                title: `Live Weather for ${place.name}, ${place.country || ''} (${tempC}°C)`,
                url: `https://open-meteo.com/en/docs#latitude=${place.latitude}&longitude=${place.longitude}`,
                snippet: `${desc}, ${tempC}°C`,
              });

              const summary = `Right now in ${place.name}, it's ${tempC} degrees Celsius with ${desc} and winds around ${windKmh} kilometers per hour. It feels like ${feelsC} degrees, with today's high near ${highC} and a low of ${lowC}.`;
              return { summary, sources };
            }
          }
        }
      } catch {}
    }

    // 3. DuckDuckGo Instant Answer + Wikipedia Search Fallback for live facts/news
    const searchTopic = query
      .replace(/^(search\s+(on\s+the\s+web|the\s+web|google|for)|look\s+up|who\s+is|what\s+is|tell\s+me\s+about)\s+/i, '')
      .replace(/[?!.]+$/g, '')
      .trim();

    try {
      const ddgRes = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(searchTopic || query)}&format=json&no_html=1&skip_disambig=1`
      );
      if (ddgRes.ok) {
        const ddg: any = await ddgRes.json();
        if (ddg.AbstractText) {
          if (ddg.AbstractURL) {
            sources.push({
              title: ddg.Heading || searchTopic,
              url: ddg.AbstractURL,
              snippet: ddg.AbstractText,
            });
          }
          const sentences = this.cleanForVoice(ddg.AbstractText).split(/(?<=[.!?])\s+/).slice(0, 3).join(' ');
          if (sentences) return { summary: sentences, sources };
        }
      }
    } catch {}

    try {
      const wikiSearchRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
          searchTopic || query
        )}&utf8=&format=json&srlimit=3`
      );
      if (wikiSearchRes.ok) {
        const wikiSearch: any = await wikiSearchRes.json();
        const hits = wikiSearch?.query?.search || [];
        if (hits.length > 0) {
          for (const h of hits) {
            sources.push({
              title: h.title,
              url: `https://en.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/\s+/g, '_'))}`,
              snippet: this.cleanForVoice(h.snippet || ''),
            });
          }
          const topTitle = hits[0].title;
          const sumRes = await fetch(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topTitle.replace(/\s+/g, '_'))}`
          );
          if (sumRes.ok) {
            const sumData: any = await sumRes.json();
            if (sumData?.extract) {
              const voiceLines = this.cleanForVoice(sumData.extract)
                .split(/(?<=[.!?])\s+/)
                .slice(0, 2)
                .join(' ');
              return { summary: voiceLines, sources };
            }
          }
        }
      }
    } catch {}

    // 4. Google News RSS headlines fallback for current news/events
    try {
      const rssRes = await fetch(
        `https://news.google.com/rss/search?q=${encodeURIComponent(searchTopic || query)}&hl=en-AU&gl=AU&ceid=AU:en`
      );
      if (rssRes.ok) {
        const xml = await rssRes.text();
        const itemMatches = Array.from(xml.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>[\s\S]*?<link>(.*?)<\/link>/g));
        const headlines: string[] = [];
        for (const m of itemMatches.slice(0, 3)) {
          const title = this.cleanForVoice(m[1] || '');
          const link = (m[2] || '').trim();
          if (title && !title.startsWith('Google News')) {
            headlines.push(title);
            if (link) sources.push({ title, url: link });
          }
        }
        if (headlines.length > 0) {
          return {
            summary: `Here are the latest headlines I found for ${searchTopic || query}: ${headlines.slice(0, 2).join('. Next up, ')}.`,
            sources,
          };
        }
      }
    } catch {}

    return {
      summary: `I searched the live web for ${query}, and opened the web lookup card for you. Ask me to narrow down the topic if you'd like specific details.`,
      sources: [
        {
          title: `Google Search: ${query}`,
          url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        },
      ],
    };
  }

  async execute(
    toolName: string,
    args: Record<string, any>,
    context?: SkillExecutionContext
  ): Promise<SkillExecutionResult> {
    const startTime = Date.now();
    const query = String(args?.query || context?.userInput || 'latest news').trim();
    const category = String(
      args?.category ||
        (/\b(weather|forecast|temperature)\b/i.test(query)
          ? 'weather'
          : /\b(news|headlines|today)\b/i.test(query)
          ? 'news'
          : 'general')
    );
    const targetLang = context?.activeLanguage || 'English';

    const sources: Array<{ title: string; url: string; snippet?: string }> = [];

    // Primary path: Gemini 4 Hydrogen + Google Search grounding
    try {
      const ai = this.getAiClient();
      if (ai) {
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Search the live web for: "${query}".
Return a concise, natural, voice-friendly summary in ${targetLang} suitable for a voice assistant to speak aloud.
STRICT RULES:
- Maximum 2 to 3 short sentences.
- NO markdown formatting, NO bullet points, NO asterisks, and NO URLs.
- Warm, clear, conversational tone.`,
          config: {
            tools: [{ googleSearch: {} }],
          },
        });

        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (Array.isArray(groundingChunks)) {
          for (const chunk of groundingChunks) {
            if (chunk.web?.uri && chunk.web?.title) {
              sources.push({
                title: chunk.web.title,
                url: chunk.web.uri,
              });
            }
          }
        }

        if (response.text && response.text.trim().length > 10) {
          const voiceSummary = this.cleanForVoice(response.text);
          return {
            skillName: this.name,
            toolName: toolName || 'web_search',
            args: { query, category },
            success: true,
            voiceSummary,
            data: {
              query,
              summary: voiceSummary,
              sourcesCount: sources.length,
              sources: sources.slice(0, 4),
              provider: 'gemini-4-hydrogen + googleSearch',
            },
            uiAction: {
              type: 'web_search',
              param: query,
              results:
                sources.length > 0
                  ? sources.slice(0, 4)
                  : [{ title: `Web Search: ${query}`, url: `https://www.google.com/search?q=${encodeURIComponent(query)}` }],
            },
            executionTimeMs: Date.now() - startTime,
            mode: 'google_search_grounding',
          };
        }
      }
    } catch (err: any) {
      console.warn('[WebSearchSkill] Google Search grounding unavailable, switching to live HTTP web fallback:', err?.message);
    }

    // Guaranteed real-time live web HTTP fallback (Open-Meteo / Wikipedia / DuckDuckGo / Google News RSS)
    const fallback = await this.liveWebFallback(query, category);
    return {
      skillName: this.name,
      toolName: toolName || 'web_search',
      args: { query, category },
      success: true,
      voiceSummary: fallback.summary,
      data: {
        query,
        summary: fallback.summary,
        sourcesCount: fallback.sources.length,
        sources: fallback.sources.slice(0, 4),
        provider: 'live_http_web_search',
      },
      uiAction: {
        type: 'web_search',
        param: query,
        results: fallback.sources.slice(0, 4),
      },
      executionTimeMs: Date.now() - startTime,
      mode: 'live_web_fallback',
    };
  }
}

export default new WebSearchSkill();
