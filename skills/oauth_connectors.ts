import crypto from 'crypto';

export interface OAuthConnectorConfig {
  provider: string;
  name: string;
  description: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string;
  clientId?: string;
  clientSecret?: string;
  mcpUrl?: string;
  portalUrl?: string;
  portalHint?: string;
  usePkce?: boolean;
  isBuiltIn?: boolean;
  supportsDcr?: boolean;
  registrationEndpoint?: string;
}

export interface ConnectedOAuthSession {
  provider: string;
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  expiresAt?: number;
  accountLabel?: string;
  connectedAt: string;
  mcpTools?: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, any>;
  }>;
}

interface PendingPkceState {
  provider: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
}

const pendingStates = new Map<string, PendingPkceState>();

// Pre-seeded real website & MCP OAuth templates (like Google Antigravity / Claude Code)
const connectors = new Map<string, OAuthConnectorConfig>([
  [
    'spotify',
    {
      provider: 'spotify',
      name: 'Spotify',
      description: 'Control real Spotify playback, tracks, and volume on your active device.',
      authUrl: 'https://accounts.spotify.com/authorize',
      tokenUrl: 'https://accounts.spotify.com/api/token',
      scopes: 'user-modify-playback-state user-read-playback-state user-read-currently-playing',
      portalUrl: 'https://developer.spotify.com/dashboard',
      portalHint: 'Create App → Add Redirect URI below → Copy Client ID & Secret',
      usePkce: true,
      isBuiltIn: true,
    },
  ],
  [
    'github',
    {
      provider: 'github',
      name: 'GitHub',
      description: 'Access your private repos, issues, pull requests, and gists via real GitHub OAuth.',
      authUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      scopes: 'repo read:user',
      portalUrl: 'https://github.com/settings/developers',
      portalHint: 'OAuth Apps → New OAuth App → Paste Authorization callback URL below',
      usePkce: false,
      isBuiltIn: true,
    },
  ],
  [
    'notion',
    {
      provider: 'notion',
      name: 'Notion (MCP)',
      description: 'Connect your Notion workspace & MCP tools via Notion OAuth 2.1.',
      authUrl: 'https://api.notion.com/v1/oauth/authorize',
      tokenUrl: 'https://api.notion.com/v1/oauth/token',
      scopes: '',
      mcpUrl: 'https://mcp.notion.com/mcp',
      portalUrl: 'https://www.notion.so/profile/integrations',
      portalHint: 'Supports MCP OAuth Auto-Discovery (DCR) or Public Integration Client ID',
      usePkce: true,
      supportsDcr: true,
      isBuiltIn: true,
    },
  ],
  [
    'linear',
    {
      provider: 'linear',
      name: 'Linear (MCP)',
      description: 'Connect Linear issues, cycles, and MCP actions via Linear OAuth 2.1.',
      authUrl: 'https://linear.app/oauth/authorize',
      tokenUrl: 'https://api.linear.app/oauth/token',
      scopes: 'read write',
      mcpUrl: 'https://mcp.linear.app/mcp',
      portalUrl: 'https://linear.app/settings/api',
      portalHint: 'Supports MCP OAuth Auto-Discovery (DCR) or OAuth2 Application Client ID',
      usePkce: true,
      supportsDcr: true,
      isBuiltIn: true,
    },
  ],
  [
    'google',
    {
      provider: 'google',
      name: 'Google Workspace (Direct GCP)',
      description: 'Connect directly to accounts.google.com using your own Google Cloud OAuth Client ID (no Firebase needed).',
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/tasks',
        'https://www.googleapis.com/auth/drive.readonly',
      ].join(' '),
      portalUrl: 'https://console.cloud.google.com/apis/credentials',
      portalHint: 'Create OAuth 2.0 Web Application Client → Add Redirect URI below',
      usePkce: true,
      isBuiltIn: true,
    },
  ],
]);

// Active user access tokens stored strictly in server memory per session
const activeSessions = new Map<string, ConnectedOAuthSession>();

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function getConnector(provider: string): OAuthConnectorConfig | undefined {
  return connectors.get(provider);
}

export function getAllConnectors(): OAuthConnectorConfig[] {
  return Array.from(connectors.values());
}

export function getSession(provider: string): ConnectedOAuthSession | undefined {
  return activeSessions.get(provider);
}

export function setSession(session: ConnectedOAuthSession): void {
  activeSessions.set(session.provider, session);
}

export function clearSession(provider: string): void {
  activeSessions.delete(provider);
}

export function getAllAccessTokensMap(): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const [provider, sess] of activeSessions.entries()) {
    result[provider] = sess.accessToken;
  }
  return result;
}

export function resolveEnvOrConfiguredCredentials(provider: string): {
  clientId?: string;
  clientSecret?: string;
} {
  const cfg = connectors.get(provider);
  if (cfg?.clientId && !cfg.clientId.startsWith('YOUR_')) {
    return { clientId: cfg.clientId, clientSecret: cfg.clientSecret };
  }
  if (provider === 'spotify') {
    const id = process.env.SPOTIFY_CLIENT_ID;
    const sec = process.env.SPOTIFY_CLIENT_SECRET;
    if (id && !id.startsWith('YOUR_')) return { clientId: id, clientSecret: sec };
  }
  if (provider === 'github') {
    const id = process.env.GITHUB_CLIENT_ID;
    const sec = process.env.GITHUB_CLIENT_SECRET;
    if (id && !id.startsWith('YOUR_')) return { clientId: id, clientSecret: sec };
  }
  if (provider === 'google') {
    const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const sec = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (id && !id.startsWith('YOUR_')) return { clientId: id, clientSecret: sec };
  }
  return {};
}

export function upsertConnector(input: {
  provider: string;
  name?: string;
  description?: string;
  authUrl?: string;
  tokenUrl?: string;
  scopes?: string;
  clientId?: string;
  clientSecret?: string;
  mcpUrl?: string;
  portalUrl?: string;
  usePkce?: boolean;
  registrationEndpoint?: string;
}): OAuthConnectorConfig {
  const cleanId = input.provider
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!cleanId) {
    throw new Error('Provider ID is required.');
  }

  const existing = connectors.get(cleanId);
  const next: OAuthConnectorConfig = {
    provider: cleanId,
    name: input.name || existing?.name || cleanId.toUpperCase(),
    description:
      input.description ||
      existing?.description ||
      `Direct OAuth 2.1 connection to ${input.name || cleanId}.`,
    authUrl: input.authUrl || existing?.authUrl || '',
    tokenUrl: input.tokenUrl || existing?.tokenUrl || '',
    scopes: input.scopes ?? existing?.scopes ?? '',
    clientId: input.clientId !== undefined ? input.clientId.trim() : existing?.clientId,
    clientSecret: input.clientSecret !== undefined ? input.clientSecret.trim() : existing?.clientSecret,
    mcpUrl: input.mcpUrl !== undefined ? input.mcpUrl.trim() : existing?.mcpUrl,
    portalUrl: input.portalUrl || existing?.portalUrl,
    portalHint: existing?.portalHint,
    usePkce: input.usePkce !== undefined ? input.usePkce : existing?.usePkce ?? true,
    isBuiltIn: existing?.isBuiltIn ?? false,
    supportsDcr: existing?.supportsDcr || Boolean(input.registrationEndpoint),
    registrationEndpoint: input.registrationEndpoint || existing?.registrationEndpoint,
  };

  connectors.set(cleanId, next);
  return next;
}

export function deleteCustomConnector(provider: string): boolean {
  const existing = connectors.get(provider);
  if (!existing || existing.isBuiltIn) return false;
  connectors.delete(provider);
  activeSessions.delete(provider);
  return true;
}

/**
 * Antigravity / Claude Code Style RFC 9728 + RFC 8414 OAuth Discovery & RFC 7591 Dynamic Client Registration
 * Given any remote MCP or website URL, discovers authorization metadata and attempts Dynamic Client Registration.
 */
export async function discoverAndRegisterRemoteOAuth(
  targetUrl: string,
  redirectUri: string,
  preferredName?: string
): Promise<{
  connector: OAuthConnectorConfig;
  discovered: {
    issuer?: string;
    authorizationEndpoint?: string;
    tokenEndpoint?: string;
    registrationEndpoint?: string;
    dcrSucceeded: boolean;
    dcrMessage?: string;
  };
}> {
  const parsed = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
  const origin = parsed.origin;
  const hostSlug = parsed.hostname.replace(/^mcp\.|^api\.|^www\./i, '').split('.')[0] || 'custom_site';
  const providerId = (preferredName || hostSlug)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');

  let authorizationEndpoint = '';
  let tokenEndpoint = '';
  let registrationEndpoint = '';
  let issuer = origin;
  let scopesSupported = '';

  // Step 1: Probe RFC 9728 Protected Resource Metadata first
  let authServerOrigin = origin;
  try {
    const prRes = await fetch(`${origin}/.well-known/oauth-protected-resource`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4500),
    });
    if (prRes.ok) {
      const prJson: any = await prRes.json();
      if (Array.isArray(prJson.authorization_servers) && prJson.authorization_servers[0]) {
        authServerOrigin = String(prJson.authorization_servers[0]).replace(/\/+$/, '');
      }
      if (Array.isArray(prJson.scopes_supported)) {
        scopesSupported = prJson.scopes_supported.join(' ');
      }
    }
  } catch {}

  // Step 2: Probe RFC 8414 Authorization Server Metadata (or OpenID configuration fallback)
  const metaCandidates = [
    `${authServerOrigin}/.well-known/oauth-authorization-server`,
    `${origin}/.well-known/oauth-authorization-server`,
    `${authServerOrigin}/.well-known/openid-configuration`,
  ];

  for (const metaUrl of metaCandidates) {
    try {
      const metaRes = await fetch(metaUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(4500),
      });
      if (metaRes.ok) {
        const meta: any = await metaRes.json();
        if (meta.authorization_endpoint) {
          authorizationEndpoint = meta.authorization_endpoint;
          tokenEndpoint = meta.token_endpoint || tokenEndpoint;
          registrationEndpoint = meta.registration_endpoint || registrationEndpoint;
          issuer = meta.issuer || issuer;
          if (!scopesSupported && Array.isArray(meta.scopes_supported)) {
            scopesSupported = meta.scopes_supported.join(' ');
          }
          break;
        }
      }
    } catch {}
  }

  // Known fallback endpoints for popular services if well-known wasn't exposed directly
  if (!authorizationEndpoint && hostSlug === 'github') {
    authorizationEndpoint = 'https://github.com/login/oauth/authorize';
    tokenEndpoint = 'https://github.com/login/oauth/access_token';
    scopesSupported = scopesSupported || 'repo read:user';
  } else if (!authorizationEndpoint && hostSlug === 'spotify') {
    authorizationEndpoint = 'https://accounts.spotify.com/authorize';
    tokenEndpoint = 'https://accounts.spotify.com/api/token';
    scopesSupported = scopesSupported || 'user-modify-playback-state user-read-playback-state';
  } else if (!authorizationEndpoint && hostSlug === 'notion') {
    authorizationEndpoint = 'https://api.notion.com/v1/oauth/authorize';
    tokenEndpoint = 'https://api.notion.com/v1/oauth/token';
  } else if (!authorizationEndpoint && hostSlug === 'linear') {
    authorizationEndpoint = 'https://linear.app/oauth/authorize';
    tokenEndpoint = 'https://api.linear.app/oauth/token';
  }

  // Step 3: Attempt RFC 7591 Dynamic Client Registration (just like Claude Code & Antigravity!)
  let registeredClientId: string | undefined;
  let registeredClientSecret: string | undefined;
  let dcrSucceeded = false;
  let dcrMessage = registrationEndpoint
    ? 'Registration endpoint found'
    : 'Website does not publish an open RFC 7591 registration endpoint; enter a Client ID from the website developer portal.';

  if (registrationEndpoint) {
    try {
      const dcrRes = await fetch(registrationEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_name: 'Matilda & Sofia AI Voice Agent',
          redirect_uris: [redirectUri],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (dcrRes.ok) {
        const dcrData: any = await dcrRes.json();
        if (dcrData.client_id) {
          registeredClientId = dcrData.client_id;
          registeredClientSecret = dcrData.client_secret;
          dcrSucceeded = true;
          dcrMessage = 'Dynamic Client Registration succeeded! Ready to authorize directly on website.';
        }
      } else {
        const errTxt = await dcrRes.text().catch(() => '');
        dcrMessage = `Website DCR returned ${dcrRes.status}${errTxt ? `: ${errTxt.slice(0, 120)}` : ''}. You can enter a Client ID manually.`;
      }
    } catch (dcrErr: any) {
      dcrMessage = `Dynamic Client Registration unavailable (${dcrErr?.message || 'network'}). Enter Client ID manually.`;
    }
  }

  const connector = upsertConnector({
    provider: providerId,
    name: preferredName || `${hostSlug.charAt(0).toUpperCase() + hostSlug.slice(1)} (${parsed.hostname})`,
    description: `Connected via OAuth 2.1 to ${parsed.href}`,
    authUrl: authorizationEndpoint,
    tokenUrl: tokenEndpoint,
    scopes: scopesSupported,
    clientId: registeredClientId,
    clientSecret: registeredClientSecret,
    mcpUrl: targetUrl.includes('/mcp') || targetUrl.includes('/sse') ? targetUrl : undefined,
    portalUrl: origin,
    usePkce: true,
    registrationEndpoint: registrationEndpoint || undefined,
  });

  return {
    connector,
    discovered: {
      issuer,
      authorizationEndpoint: authorizationEndpoint || undefined,
      tokenEndpoint: tokenEndpoint || undefined,
      registrationEndpoint: registrationEndpoint || undefined,
      dcrSucceeded,
      dcrMessage,
    },
  };
}

/**
 * Builds the real external OAuth authorization URL with PKCE S256 & cryptographic state.
 */
export async function buildAuthorizationUrl(
  provider: string,
  redirectUri: string
): Promise<{ url: string; callbackUrl: string; dcrAutoRegistered?: boolean }> {
  const cfg = connectors.get(provider);
  if (!cfg) {
    throw new Error(`Unknown OAuth connector "${provider}".`);
  }

  let { clientId } = resolveEnvOrConfiguredCredentials(provider);
  let dcrAutoRegistered = false;

  // Attempt automatic RFC 8414 + RFC 7591 Dynamic Client Registration if DCR is supported & no clientId yet
  if (!clientId && (cfg.supportsDcr || cfg.mcpUrl || cfg.registrationEndpoint)) {
    const target = cfg.mcpUrl || cfg.authUrl;
    if (target) {
      const res = await discoverAndRegisterRemoteOAuth(target, redirectUri, cfg.name);
      if (res.connector.clientId) {
        clientId = res.connector.clientId;
        dcrAutoRegistered = true;
      }
    }
  }

  if (!clientId) {
    throw new Error(
      `${cfg.name} needs an OAuth Client ID before opening ${cfg.authUrl || 'the provider login page'}. Configure it right in the OAuth setup card using Callback URL: ${redirectUri}`
    );
  }

  const latestCfg = connectors.get(provider) || cfg;
  if (!latestCfg.authUrl) {
    throw new Error(`Missing Authorization URL for ${latestCfg.name}.`);
  }

  // Generate PKCE code_verifier & S256 challenge + state
  const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
  const codeChallenge = base64UrlEncode(crypto.createHash('sha256').update(codeVerifier).digest());
  const state = base64UrlEncode(crypto.randomBytes(16));

  pendingStates.set(state, {
    provider,
    codeVerifier,
    redirectUri,
    createdAt: Date.now(),
  });

  // Prune stale states older than 15 minutes
  for (const [k, v] of pendingStates.entries()) {
    if (Date.now() - v.createdAt > 15 * 60 * 1000) {
      pendingStates.delete(k);
    }
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  });

  if (latestCfg.scopes) {
    params.set('scope', latestCfg.scopes);
  }
  if (latestCfg.usePkce !== false) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }
  if (provider === 'google') {
    params.set('access_type', 'offline');
    params.set('prompt', 'consent');
  }
  if (provider === 'spotify') {
    params.set('show_dialog', 'true');
  }
  if (provider === 'notion') {
    params.set('owner', 'user');
  }

  return {
    url: `${latestCfg.authUrl}${latestCfg.authUrl.includes('?') ? '&' : '?'}${params.toString()}`,
    callbackUrl: redirectUri,
    dcrAutoRegistered,
  };
}

/**
 * Exchanges authorization code from `/auth/:provider/callback` at the website's real token endpoint.
 */
export async function completeOAuthCallback(
  provider: string,
  code: string,
  stateParam: string | undefined,
  fallbackRedirectUri: string
): Promise<ConnectedOAuthSession> {
  const cfg = connectors.get(provider);
  if (!cfg) {
    throw new Error(`Unknown OAuth connector "${provider}".`);
  }

  const pending = stateParam ? pendingStates.get(stateParam) : undefined;
  if (stateParam) pendingStates.delete(stateParam);

  const redirectUri = pending?.redirectUri || fallbackRedirectUri;
  const { clientId, clientSecret } = resolveEnvOrConfiguredCredentials(provider);
  if (!clientId) {
    throw new Error(`OAuth Client ID not found for ${provider}.`);
  }

  let accessToken = '';
  let refreshToken: string | undefined;
  let expiresIn: number | undefined;

  if (provider === 'github') {
    const tokenRes = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret || '',
        code,
        redirect_uri: redirectUri,
      }),
    });
    const tokenData: any = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'GitHub token exchange failed');
    }
    accessToken = tokenData.access_token;
  } else {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    const bodyParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
    });
    if (pending?.codeVerifier && cfg.usePkce !== false) {
      bodyParams.set('code_verifier', pending.codeVerifier);
    }
    if (clientSecret) {
      if (provider === 'spotify' || provider === 'notion') {
        headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
      } else {
        bodyParams.set('client_secret', clientSecret);
      }
    }

    const tokenRes = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers,
      body: bodyParams.toString(),
    });
    const tokenData: any = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || `${cfg.name} token exchange failed`);
    }
    accessToken = tokenData.access_token;
    refreshToken = tokenData.refresh_token;
    expiresIn = typeof tokenData.expires_in === 'number' ? tokenData.expires_in : undefined;
  }

  // Fetch friendly user identity label from the connected website
  let accountLabel = `${cfg.name} Connected`;
  try {
    if (provider === 'spotify') {
      const me = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then((r) => (r.ok ? r.json() : null));
      if (me) accountLabel = me.display_name || me.id || accountLabel;
    } else if (provider === 'github') {
      const me = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'sofia-voice-agent' },
      }).then((r) => (r.ok ? r.json() : null));
      if (me) accountLabel = me.login || me.name || accountLabel;
    } else if (provider === 'google') {
      const me = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then((r) => (r.ok ? r.json() : null));
      if (me) accountLabel = me.email || me.name || accountLabel;
    }
  } catch {}

  // If MCP endpoint is configured, attempt MCP tools/list discovery with the live OAuth token
  let mcpTools: ConnectedOAuthSession['mcpTools'];
  if (cfg.mcpUrl) {
    mcpTools = await fetchMcpToolsWithToken(cfg.mcpUrl, accessToken);
  }

  const session: ConnectedOAuthSession = {
    provider,
    accessToken,
    refreshToken,
    expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
    accountLabel,
    connectedAt: new Date().toISOString(),
    mcpTools,
  };
  activeSessions.set(provider, session);
  return session;
}

/**
 * Fetches tools/list from an OAuth-protected Streamable HTTP MCP server.
 */
export async function fetchMcpToolsWithToken(
  mcpUrl: string,
  accessToken: string
): Promise<Array<{ name: string; description?: string; inputSchema?: Record<string, any> }>> {
  try {
    const res = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const json: any = await res.json();
    const tools = json?.result?.tools;
    return Array.isArray(tools) ? tools : [];
  } catch {
    return [];
  }
}

export async function callMcpToolWithToken(
  mcpUrl: string,
  accessToken: string,
  toolName: string,
  args: Record<string, any>
): Promise<{ ok: boolean; text: string; raw?: any }> {
  const res = await fetch(mcpUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
    signal: AbortSignal.timeout(10000),
  });
  const data: any = await res.json().catch(() => ({}));
  const contentArr = data?.result?.content;
  const text = Array.isArray(contentArr)
    ? contentArr.map((c: any) => c.text || JSON.stringify(c)).join(' ')
    : JSON.stringify(data?.result || data);
  return { ok: res.ok && !data?.error, text, raw: data };
}
