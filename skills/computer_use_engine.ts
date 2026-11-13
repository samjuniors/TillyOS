import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';
import { WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type ComputerTargetMode = 'hybrid' | 'desktop_bridge' | 'browser_sandbox' | 'screen_share';
export type ComputerSessionStatus =
  | 'idle'
  | 'running'
  | 'awaiting_confirmation'
  | 'completed'
  | 'aborted'
  | 'error';

export type ComputerActionType =
  | 'click_at'
  | 'double_click_at'
  | 'right_click_at'
  | 'drag_and_drop'
  | 'move_cursor'
  | 'scroll_at'
  | 'type_text'
  | 'press_key'
  | 'hotkey'
  | 'open_app'
  | 'open_url'
  | 'wait_seconds'
  | 'complete_task';

export interface ComputerActionStep {
  stepIndex: number;
  timestamp: string;
  targetUsed: 'desktop_bridge' | 'browser_sandbox' | 'screen_share';
  action: ComputerActionType;
  args: Record<string, any>;
  rationale: string;
  riskTier: 'safe' | 'risky';
  riskReason?: string;
  approvalState: 'auto_approved' | 'pending' | 'user_approved' | 'rejected';
  status: 'planned' | 'executed' | 'blocked' | 'failed';
  message: string;
  latencyMs: number;
  normalizedCoords?: {
    x?: number;
    y?: number;
    endX?: number;
    endY?: number;
  };
  pixelCoords?: {
    pixelX?: number;
    pixelY?: number;
    endPixelX?: number;
    endPixelY?: number;
  };
}

export interface BridgeConnectionState {
  connected: boolean;
  os?: string;
  hostname?: string;
  logicalWidth?: number;
  logicalHeight?: number;
  physicalWidth?: number;
  physicalHeight?: number;
  connectedAt?: string;
  lastHeartbeatAt?: string;
  activeToken?: string | null;
}

export interface BrowserSandboxState {
  ready: boolean;
  launching: boolean;
  currentUrl: string;
  pageTitle: string;
  viewportWidth: number;
  viewportHeight: number;
  error?: string | null;
}

export interface ComputerFrameState {
  imageBase64: string;
  mimeType: string;
  source: 'desktop_bridge' | 'browser_sandbox' | 'screen_share';
  width: number;
  height: number;
  timestamp: string;
  urlOrApp?: string;
}

export interface PendingRiskyConfirmation {
  confirmationId: string;
  sessionId: string;
  stepIndex: number;
  targetUsed: 'desktop_bridge' | 'browser_sandbox' | 'screen_share';
  action: ComputerActionType;
  args: Record<string, any>;
  rationale: string;
  riskReason: string;
  normalizedCoords?: {
    x?: number;
    y?: number;
    endX?: number;
    endY?: number;
  };
  previewImageBase64?: string;
  previewMimeType?: string;
}

export interface ComputerUseSessionState {
  sessionId: string;
  goal: string;
  targetMode: ComputerTargetMode;
  status: ComputerSessionStatus;
  maxSteps: number;
  currentStep: number;
  summary: string;
  error?: string | null;
  startedAt: string;
  updatedAt: string;
  steps: ComputerActionStep[];
  pendingConfirmation: PendingRiskyConfirmation | null;
  lastCoords?: {
    action: ComputerActionType;
    x?: number;
    y?: number;
    endX?: number;
    endY?: number;
    timestamp: string;
  } | null;
}

interface PairingTokenEntry {
  token: string;
  createdAt: number;
  expiresAt: number;
  used?: boolean;
}

const COMPUTER_USE_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'click_at',
    description: 'Left-click a UI element on screen at normalized 0-999 coordinates.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        x: { type: Type.NUMBER, description: 'Horizontal coordinate (0=left edge, 999=right edge).' },
        y: { type: Type.NUMBER, description: 'Vertical coordinate (0=top edge, 999=bottom edge).' },
        targetLabel: { type: Type.STRING, description: 'Human description of element being clicked.' },
        rationale: { type: Type.STRING, description: 'Why clicking this advances the task.' },
      },
      required: ['x', 'y', 'rationale'],
    },
  },
  {
    name: 'double_click_at',
    description: 'Double-click a desktop icon, file, or element at normalized 0-999 coordinates.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        x: { type: Type.NUMBER, description: 'Horizontal coordinate (0-999).' },
        y: { type: Type.NUMBER, description: 'Vertical coordinate (0-999).' },
        targetLabel: { type: Type.STRING, description: 'Element being double-clicked.' },
        rationale: { type: Type.STRING, description: 'Reason for double-clicking.' },
      },
      required: ['x', 'y', 'rationale'],
    },
  },
  {
    name: 'right_click_at',
    description: 'Open a context menu via right-click at normalized 0-999 coordinates.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        x: { type: Type.NUMBER, description: 'Horizontal coordinate (0-999).' },
        y: { type: Type.NUMBER, description: 'Vertical coordinate (0-999).' },
        targetLabel: { type: Type.STRING, description: 'Element being right-clicked.' },
        rationale: { type: Type.STRING, description: 'Reason for opening context menu.' },
      },
      required: ['x', 'y', 'rationale'],
    },
  },
  {
    name: 'drag_and_drop',
    description: 'Press, drag, and release mouse from (x, y) to (endX, endY) on the 0-999 grid.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        x: { type: Type.NUMBER, description: 'Start X (0-999).' },
        y: { type: Type.NUMBER, description: 'Start Y (0-999).' },
        endX: { type: Type.NUMBER, description: 'Destination X (0-999).' },
        endY: { type: Type.NUMBER, description: 'Destination Y (0-999).' },
        durationMs: { type: Type.NUMBER, description: 'Optional drag duration in ms (default 450).' },
        rationale: { type: Type.STRING, description: 'Reason for dragging this item or window.' },
      },
      required: ['x', 'y', 'endX', 'endY', 'rationale'],
    },
  },
  {
    name: 'move_cursor',
    description: 'Move mouse cursor / hover at normalized 0-999 coordinates.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        x: { type: Type.NUMBER, description: 'Horizontal coordinate (0-999).' },
        y: { type: Type.NUMBER, description: 'Vertical coordinate (0-999).' },
        rationale: { type: Type.STRING, description: 'Reason for hovering.' },
      },
      required: ['x', 'y', 'rationale'],
    },
  },
  {
    name: 'scroll_at',
    description: 'Scroll vertically at (x, y). Positive deltaY scrolls down; negative scrolls up.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        x: { type: Type.NUMBER, description: 'Horizontal coordinate (0-999).' },
        y: { type: Type.NUMBER, description: 'Vertical coordinate (0-999).' },
        deltaY: { type: Type.NUMBER, description: 'Scroll delta (e.g. 420 to scroll down, -420 up).' },
        rationale: { type: Type.STRING, description: 'Reason for scrolling.' },
      },
      required: ['x', 'y', 'deltaY', 'rationale'],
    },
  },
  {
    name: 'type_text',
    description: 'Type text into the currently focused input field or application.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        text: { type: Type.STRING, description: 'Text to type.' },
        pressEnter: { type: Type.BOOLEAN, description: 'Whether to press Enter after typing.' },
        targetLabel: { type: Type.STRING, description: 'Input field or form description.' },
        rationale: { type: Type.STRING, description: 'Reason for typing this text.' },
      },
      required: ['text', 'rationale'],
    },
  },
  {
    name: 'press_key',
    description: 'Press a single keyboard key such as enter, escape, tab, backspace, up, down.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        key: { type: Type.STRING, description: 'Key name.' },
        rationale: { type: Type.STRING, description: 'Reason for pressing this key.' },
      },
      required: ['key', 'rationale'],
    },
  },
  {
    name: 'hotkey',
    description: 'Press a keyboard shortcut combination such as ["mod","c"] or ["alt","tab"]. Use "mod" for Ctrl on Win/Linux or Cmd on macOS.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        keys: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Array of key names in combination.',
        },
        rationale: { type: Type.STRING, description: 'Reason for this keyboard shortcut.' },
      },
      required: ['keys', 'rationale'],
    },
  },
  {
    name: 'open_app',
    description: 'Launch a native desktop application by name (requires Desktop Bridge & confirmation).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        appName: { type: Type.STRING, description: 'App name like Calculator, Notes, Chrome, VS Code, Terminal, Spotify.' },
        rationale: { type: Type.STRING, description: 'Why launching this application is needed.' },
      },
      required: ['appName', 'rationale'],
    },
  },
  {
    name: 'open_url',
    description: 'Open or navigate to a web URL.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: { type: Type.STRING, description: 'Full URL starting with https:// or domain.' },
        rationale: { type: Type.STRING, description: 'Why navigating to this URL.' },
      },
      required: ['url', 'rationale'],
    },
  },
  {
    name: 'wait_seconds',
    description: 'Pause briefly while a page or application finishes loading.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        seconds: { type: Type.NUMBER, description: 'Seconds to wait (0.5 to 4).' },
        rationale: { type: Type.STRING, description: 'Reason for waiting.' },
      },
      required: ['seconds', 'rationale'],
    },
  },
  {
    name: 'complete_task',
    description: 'Call this ONLY once the visible screen confirms the goal has been completed or cannot proceed.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING, description: 'Concise 1-2 sentence spoken summary of what was done and observed.' },
        succeeded: { type: Type.BOOLEAN, description: 'True if the task goal is achieved.' },
      },
      required: ['summary', 'succeeded'],
    },
  },
];

function getGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || '',
    apiVersion: 'v1beta',
    httpOptions: {
      apiVersion: 'v1beta',
      headers: { 'User-Agent': 'aistudio-build' },
    },
  });
}

class ComputerUseCoordinator {
  private uiClients: Set<WebSocket> = new Set();
  private bridgeWs: WebSocket | null = null;
  private pairingTokens: Map<string, PairingTokenEntry> = new Map();
  private pendingBridgeRequests: Map<
    string,
    { resolve: (val: any) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  > = new Map();

  private targetMode: ComputerTargetMode = 'hybrid';
  private bridgeState: BridgeConnectionState = { connected: false };
  private sandboxState: BrowserSandboxState = {
    ready: false,
    launching: false,
    currentUrl: 'about:blank',
    pageTitle: 'New Sandbox Tab',
    viewportWidth: 1280,
    viewportHeight: 720,
    error: null,
  };
  private latestFrame: ComputerFrameState | null = null;
  private session: ComputerUseSessionState = {
    sessionId: 'cu-idle',
    goal: '',
    targetMode: 'hybrid',
    status: 'idle',
    maxSteps: 10,
    currentStep: 0,
    summary: 'Ready for voice or text computer commands.',
    error: null,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    steps: [],
    pendingConfirmation: null,
    lastCoords: null,
  };

  private playwrightBrowser: any = null;
  private playwrightPage: any = null;
  private activeConfirmationResolver: ((approved: boolean) => void) | null = null;
  private loopAbortController: { aborted: boolean } | null = null;

  public registerUiClient(ws: WebSocket) {
    this.uiClients.add(ws);
    this.sendToWs(ws, { type: 'computer_state', state: this.getPublicState() });
    ws.on('close', () => {
      this.uiClients.delete(ws);
    });
  }

  private sendToWs(ws: WebSocket, payload: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  private broadcastUi(payload: any) {
    const encoded = JSON.stringify(payload);
    for (const client of this.uiClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(encoded);
      }
    }
  }

  private broadcastState() {
    this.session.updatedAt = new Date().toISOString();
    this.broadcastUi({ type: 'computer_state', state: this.getPublicState() });
  }

  public getPublicState() {
    return {
      targetMode: this.targetMode,
      bridge: this.bridgeState,
      sandbox: this.sandboxState,
      latestFrame: this.latestFrame,
      session: this.session,
    };
  }

  public setTargetMode(mode: ComputerTargetMode) {
    this.targetMode = mode;
    this.session.targetMode = mode;
    this.broadcastState();
    return this.getPublicState();
  }

  public createPairingToken(): { token: string; expiresInSeconds: number } {
    // Cleanup expired tokens
    const now = Date.now();
    for (const [k, v] of this.pairingTokens.entries()) {
      if (v.expiresAt < now) this.pairingTokens.delete(k);
    }
    const token = `mtb_${crypto.randomBytes(16).toString('hex')}`;
    this.pairingTokens.set(token, {
      token,
      createdAt: now,
      expiresAt: now + 30 * 60 * 1000, // 30 minutes
    });
    return { token, expiresInSeconds: 1800 };
  }

  public validatePairingToken(token: string): boolean {
    if (!token) return false;
    const entry = this.pairingTokens.get(token);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.pairingTokens.delete(token);
      return false;
    }
    return true;
  }

  public getBridgeScriptWithConfig(wsUrl: string, token: string): string {
    const bridgePath = path.resolve(__dirname, '../bridge/matilda_desktop_bridge.py');
    let source = fs.readFileSync(bridgePath, 'utf-8');
    source = source
      .replace(
        'default=os.environ.get("MATILDA_WS_URL", "")',
        `default=os.environ.get("MATILDA_WS_URL", ${JSON.stringify(wsUrl)})`
      )
      .replace(
        'default=os.environ.get("MATILDA_PAIR_TOKEN", "")',
        `default=os.environ.get("MATILDA_PAIR_TOKEN", ${JSON.stringify(token)})`
      );
    return source;
  }

  public attachBridgeSocket(ws: WebSocket, token: string) {
    if (this.bridgeWs && this.bridgeWs !== ws) {
      try {
        this.bridgeWs.close();
      } catch {}
    }
    this.bridgeWs = ws;
    this.bridgeState = {
      connected: true,
      connectedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      activeToken: token,
    };
    this.broadcastState();

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        this.bridgeState.lastHeartbeatAt = new Date().toISOString();

        if (msg.type === 'bridge_hello') {
          this.bridgeState = {
            ...this.bridgeState,
            connected: true,
            os: msg.os || 'Desktop',
            hostname: msg.hostname || 'local-host',
            logicalWidth: msg.logicalWidth,
            logicalHeight: msg.logicalHeight,
          };
          this.broadcastState();
        } else if (msg.type === 'screen_frame' && msg.imageBase64) {
          this.latestFrame = {
            imageBase64: msg.imageBase64,
            mimeType: msg.mimeType || 'image/jpeg',
            source: 'desktop_bridge',
            width: msg.logicalWidth || msg.capturedWidth || 1280,
            height: msg.logicalHeight || msg.capturedHeight || 720,
            timestamp: new Date().toISOString(),
            urlOrApp: `${msg.os || 'Desktop'} (${msg.logicalWidth || 1280}x${msg.logicalHeight || 720})`,
          };
          if (msg.logicalWidth && msg.logicalHeight) {
            this.bridgeState.logicalWidth = msg.logicalWidth;
            this.bridgeState.logicalHeight = msg.logicalHeight;
            this.bridgeState.physicalWidth = msg.physicalWidth;
            this.bridgeState.physicalHeight = msg.physicalHeight;
          }
          this.broadcastState();
        } else if (msg.requestId && this.pendingBridgeRequests.has(msg.requestId)) {
          const pending = this.pendingBridgeRequests.get(msg.requestId)!;
          clearTimeout(pending.timer);
          this.pendingBridgeRequests.delete(msg.requestId);
          pending.resolve(msg);
        }
      } catch (err) {
        console.warn('[ComputerUse] Bridge message parse error:', err);
      }
    });

    ws.on('close', () => {
      if (this.bridgeWs === ws) {
        this.bridgeWs = null;
        this.bridgeState = { connected: false };
        for (const [id, pending] of this.pendingBridgeRequests.entries()) {
          clearTimeout(pending.timer);
          pending.reject(new Error('Desktop Bridge disconnected.'));
          this.pendingBridgeRequests.delete(id);
        }
        this.broadcastState();
      }
    });
  }

  private async sendBridgeRpc(payload: Record<string, any>, timeoutMs = 15000): Promise<any> {
    if (!this.bridgeWs || this.bridgeWs.readyState !== WebSocket.OPEN) {
      throw new Error('Local Desktop Bridge is not connected.');
    }
    const requestId = `br_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingBridgeRequests.delete(requestId);
        reject(new Error('Timed out waiting for Local Desktop Bridge response.'));
      }, timeoutMs);
      this.pendingBridgeRequests.set(requestId, { resolve, reject, timer });
      this.bridgeWs!.send(JSON.stringify({ ...payload, requestId }));
    });
  }

  public ingestBrowserScreenShareFrame(params: {
    imageBase64: string;
    mimeType?: string;
    width?: number;
    height?: number;
    label?: string;
  }) {
    const cleanBase64 = params.imageBase64.replace(/^data:image\/[a-z+]+;base64,/i, '');
    this.latestFrame = {
      imageBase64: cleanBase64,
      mimeType: params.mimeType || 'image/jpeg',
      source: 'screen_share',
      width: params.width || 1280,
      height: params.height || 720,
      timestamp: new Date().toISOString(),
      urlOrApp: params.label || 'Browser Screen Share',
    };
    this.broadcastState();
    return this.latestFrame;
  }

  private async ensureSandboxPage(): Promise<any> {
    if (this.playwrightPage && !this.playwrightPage.isClosed()) {
      return this.playwrightPage;
    }

    this.sandboxState.launching = true;
    this.sandboxState.error = null;
    this.broadcastState();

    try {
      const { chromium } = await import('playwright');
      if (!this.playwrightBrowser || !this.playwrightBrowser.isConnected()) {
        this.playwrightBrowser = await chromium.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
          ],
        });
      }
      const context = await this.playwrightBrowser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      this.playwrightPage = await context.newPage();
      await this.playwrightPage.setContent(`
        <!doctype html>
        <html>
          <head><title>Matilda Cloud Browser Sandbox</title></head>
          <body style="margin:0;min-height:100vh;background:#0c0a09;color:#e7e5e4;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;padding:32px;">
            <div style="max-width:560px;border:1px solid #292524;background:#1c1917;border-radius:16px;padding:28px;">
              <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.12em;color:#f59e0b;font-weight:700;margin-bottom:8px;">Cloud Browser Sandbox</div>
              <h1 style="margin:0 0 10px 0;font-size:22px;color:#fff;">Ready for Visual Automation</h1>
              <p style="margin:0 0 18px 0;font-size:14px;line-height:1.6;color:#a8a29e;">Enter a URL or tell Matilda what to open, search, click, or inspect.</p>
              <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <a href="https://en.wikipedia.org" style="padding:9px 14px;border-radius:10px;background:#f59e0b;color:#0c0a09;text-decoration:none;font-weight:700;font-size:13px;">Open Wikipedia</a>
                <a href="https://news.ycombinator.com" style="padding:9px 14px;border-radius:10px;border:1px solid #44403c;color:#e7e5e4;text-decoration:none;font-weight:600;font-size:13px;">Hacker News</a>
                <a href="https://example.com" style="padding:9px 14px;border-radius:10px;border:1px solid #44403c;color:#e7e5e4;text-decoration:none;font-weight:600;font-size:13px;">Example.com</a>
              </div>
            </div>
          </body>
        </html>
      `);
      this.sandboxState.ready = true;
      this.sandboxState.launching = false;
      this.sandboxState.currentUrl = 'sandbox://home';
      this.sandboxState.pageTitle = 'Matilda Cloud Browser Sandbox';
      this.broadcastState();
      return this.playwrightPage;
    } catch (err: any) {
      this.sandboxState.ready = false;
      this.sandboxState.launching = false;
      this.sandboxState.error = err?.message || 'Could not launch Playwright Chromium sandbox.';
      this.broadcastState();
      throw err;
    }
  }

  public async navigateSandbox(url: string): Promise<ComputerFrameState> {
    const page = await this.ensureSandboxPage();
    let target = (url || '').trim();
    if (!target) target = 'https://example.com';
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = `https://${target}`;
    }
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(450);
    return this.captureFrame('browser_sandbox');
  }

  private resolveExecutionTarget(goalOrAction?: {
    goal?: string;
    action?: ComputerActionType;
    args?: Record<string, any>;
  }): 'desktop_bridge' | 'browser_sandbox' | 'screen_share' {
    const mode = this.targetMode;
    if (mode === 'desktop_bridge') return 'desktop_bridge';
    if (mode === 'browser_sandbox') return 'browser_sandbox';
    if (mode === 'screen_share') return 'screen_share';

    // Hybrid Auto Selection:
    if (goalOrAction?.action === 'open_app') {
      return 'desktop_bridge';
    }
    const g = (goalOrAction?.goal || '').toLowerCase();
    const mentionsDesktopApp = /\b(calculator|notepad|finder|explorer|vscode|vs code|terminal|powershell|spotify app|desktop|window|app|mac|windows|linux)\b/i.test(
      g
    );
    if (mentionsDesktopApp && this.bridgeState.connected) {
      return 'desktop_bridge';
    }
    if (this.bridgeState.connected && !/\b(sandbox|in browser|website|url|https?:\/\/)\b/i.test(g)) {
      return 'desktop_bridge';
    }
    if (
      !this.bridgeState.connected &&
      this.latestFrame?.source === 'screen_share' &&
      !/\b(open url|navigate|browse|website|wikipedia|hacker news|example\.com)\b/i.test(g)
    ) {
      return 'screen_share';
    }
    return 'browser_sandbox';
  }

  public async captureFrame(
    explicitSource?: 'desktop_bridge' | 'browser_sandbox' | 'screen_share'
  ): Promise<ComputerFrameState> {
    const source = explicitSource || this.resolveExecutionTarget({ goal: this.session.goal });

    if (source === 'desktop_bridge') {
      const res = await this.sendBridgeRpc({ type: 'capture_screen' });
      const frame: ComputerFrameState = {
        imageBase64: res.imageBase64,
        mimeType: res.mimeType || 'image/jpeg',
        source: 'desktop_bridge',
        width: res.logicalWidth || res.capturedWidth || 1280,
        height: res.logicalHeight || res.capturedHeight || 720,
        timestamp: new Date().toISOString(),
        urlOrApp: `${res.os || 'Desktop'} (${res.logicalWidth || 1280}x${res.logicalHeight || 720})`,
      };
      this.latestFrame = frame;
      this.broadcastState();
      return frame;
    }

    if (source === 'screen_share') {
      if (this.latestFrame && this.latestFrame.source === 'screen_share') {
        return this.latestFrame;
      }
      throw new Error('No live browser screen share frame available. Click "Share Screen" or switch to Browser Sandbox.');
    }

    // Browser sandbox capture
    const page = await this.ensureSandboxPage();
    const buf = await page.screenshot({ type: 'jpeg', quality: 80 });
    const title = await page.title().catch(() => 'Browser Sandbox');
    const url = page.url();
    this.sandboxState.currentUrl = url === 'about:blank' ? 'sandbox://home' : url;
    this.sandboxState.pageTitle = title || 'Browser Sandbox';
    const frame: ComputerFrameState = {
      imageBase64: buf.toString('base64'),
      mimeType: 'image/jpeg',
      source: 'browser_sandbox',
      width: 1280,
      height: 720,
      timestamp: new Date().toISOString(),
      urlOrApp: `${title || 'Browser'} — ${this.sandboxState.currentUrl}`,
    };
    this.latestFrame = frame;
    this.broadcastState();
    return frame;
  }

  private scaleNormalizedToSandbox(x: number, y: number) {
    const cx = Math.max(0, Math.min(999, Number(x) || 500));
    const cy = Math.max(0, Math.min(999, Number(y) || 500));
    return {
      pixelX: Math.round((cx / 999) * (this.sandboxState.viewportWidth - 1)),
      pixelY: Math.round((cy / 999) * (this.sandboxState.viewportHeight - 1)),
    };
  }

  private async executeLowLevelAction(
    target: 'desktop_bridge' | 'browser_sandbox' | 'screen_share',
    action: ComputerActionType,
    args: Record<string, any>
  ): Promise<{
    success: boolean;
    message: string;
    pixelCoords?: { pixelX?: number; pixelY?: number; endPixelX?: number; endPixelY?: number };
    frame?: ComputerFrameState;
  }> {
    if (target === 'screen_share') {
      return {
        success: false,
        message:
          'Screen Share is visual-only in the browser. Pair the Local Desktop Bridge or switch to Browser Sandbox to perform clicks and OS actions.',
      };
    }

    if (target === 'desktop_bridge') {
      const res = await this.sendBridgeRpc({
        type: 'execute_action',
        action,
        args,
      });
      let frame: ComputerFrameState | undefined;
      if (res.frame?.imageBase64) {
        frame = {
          imageBase64: res.frame.imageBase64,
          mimeType: res.frame.mimeType || 'image/jpeg',
          source: 'desktop_bridge',
          width: res.frame.logicalWidth || 1280,
          height: res.frame.logicalHeight || 720,
          timestamp: new Date().toISOString(),
          urlOrApp: `${res.frame.os || 'Desktop'} (${res.frame.logicalWidth || 1280}x${res.frame.logicalHeight || 720})`,
        };
        this.latestFrame = frame;
      }
      return {
        success: Boolean(res.success),
        message: res.message || `Executed ${action} on Desktop Bridge.`,
        pixelCoords: res.extra,
        frame,
      };
    }

    // Browser Sandbox (Playwright) execution
    const page = await this.ensureSandboxPage();
    let pixelCoords: { pixelX?: number; pixelY?: number; endPixelX?: number; endPixelY?: number } = {};
    let message = `Executed ${action} in Browser Sandbox.`;

    if (action === 'open_url') {
      const frame = await this.navigateSandbox(String(args.url || 'https://example.com'));
      return { success: true, message: `Navigated sandbox to ${frame.urlOrApp}`, frame };
    }

    if (action === 'open_app') {
      if (!this.bridgeState.connected) {
        return {
          success: false,
          message: `Cannot launch native app "${args.appName}" inside Browser Sandbox. Pair Local Desktop Bridge to launch desktop apps.`,
        };
      }
      return this.executeLowLevelAction('desktop_bridge', action, args);
    }

    if (action === 'click_at') {
      const pt = this.scaleNormalizedToSandbox(args.x, args.y);
      pixelCoords = pt;
      await page.mouse.click(pt.pixelX, pt.pixelY);
      message = `Clicked at (${pt.pixelX}, ${pt.pixelY}) in Browser Sandbox.`;
    } else if (action === 'double_click_at') {
      const pt = this.scaleNormalizedToSandbox(args.x, args.y);
      pixelCoords = pt;
      await page.mouse.dblclick(pt.pixelX, pt.pixelY);
      message = `Double-clicked at (${pt.pixelX}, ${pt.pixelY}) in Browser Sandbox.`;
    } else if (action === 'right_click_at') {
      const pt = this.scaleNormalizedToSandbox(args.x, args.y);
      pixelCoords = pt;
      await page.mouse.click(pt.pixelX, pt.pixelY, { button: 'right' });
      message = `Right-clicked at (${pt.pixelX}, ${pt.pixelY}) in Browser Sandbox.`;
    } else if (action === 'move_cursor') {
      const pt = this.scaleNormalizedToSandbox(args.x, args.y);
      pixelCoords = pt;
      await page.mouse.move(pt.pixelX, pt.pixelY);
      message = `Moved cursor to (${pt.pixelX}, ${pt.pixelY}).`;
    } else if (action === 'drag_and_drop') {
      const start = this.scaleNormalizedToSandbox(args.x, args.y);
      const end = this.scaleNormalizedToSandbox(args.endX, args.endY);
      pixelCoords = {
        pixelX: start.pixelX,
        pixelY: start.pixelY,
        endPixelX: end.pixelX,
        endPixelY: end.pixelY,
      };
      await page.mouse.move(start.pixelX, start.pixelY);
      await page.mouse.down();
      await page.mouse.move(end.pixelX, end.pixelY, { steps: 14 });
      await page.mouse.up();
      message = `Dragged from (${start.pixelX}, ${start.pixelY}) to (${end.pixelX}, ${end.pixelY}).`;
    } else if (action === 'scroll_at') {
      const pt = this.scaleNormalizedToSandbox(args.x ?? 500, args.y ?? 500);
      pixelCoords = pt;
      const dy = Number(args.deltaY ?? 360);
      await page.mouse.move(pt.pixelX, pt.pixelY);
      await page.mouse.wheel(0, dy);
      message = `Scrolled deltaY=${dy} at (${pt.pixelX}, ${pt.pixelY}).`;
    } else if (action === 'type_text') {
      const txt = String(args.text || '');
      await page.keyboard.type(txt, { delay: 18 });
      if (args.pressEnter) {
        await page.keyboard.press('Enter');
      }
      message = `Typed "${txt.slice(0, 40)}" in Browser Sandbox.`;
    } else if (action === 'press_key') {
      const rawKey = String(args.key || 'Enter');
      const mapKey: Record<string, string> = {
        enter: 'Enter',
        escape: 'Escape',
        tab: 'Tab',
        backspace: 'Backspace',
        space: 'Space',
        up: 'ArrowUp',
        down: 'ArrowDown',
        left: 'ArrowLeft',
        right: 'ArrowRight',
      };
      const k = mapKey[rawKey.toLowerCase()] || rawKey;
      await page.keyboard.press(k);
      message = `Pressed key ${k}.`;
    } else if (action === 'hotkey') {
      const keysRaw: string[] = Array.isArray(args.keys)
        ? args.keys
        : String(args.keys || '')
            .split('+')
            .map((s) => s.trim())
            .filter(Boolean);
      const combo = keysRaw
        .map((k) => {
          const low = k.toLowerCase();
          if (low === 'mod' || low === 'ctrl' || low === 'control') return 'Control';
          if (low === 'cmd' || low === 'meta') return 'Meta';
          if (low === 'alt') return 'Alt';
          if (low === 'shift') return 'Shift';
          return k.length === 1 ? k : k[0].toUpperCase() + k.slice(1);
        })
        .join('+');
      await page.keyboard.press(combo);
      message = `Pressed shortcut ${combo}.`;
    } else if (action === 'wait_seconds') {
      const secs = Math.max(0.2, Math.min(4, Number(args.seconds || 1)));
      await page.waitForTimeout(secs * 1000);
      message = `Waited ${secs}s.`;
    }

    await page.waitForTimeout(350);
    const frame = await this.captureFrame('browser_sandbox');
    return { success: true, message, pixelCoords, frame };
  }

  /**
   * Two-tier safety classifier matching user preference:
   * Auto-run safe actions; confirm risky actions.
   */
  public classifyActionRisk(
    action: ComputerActionType,
    args: Record<string, any>
  ): { riskTier: 'safe' | 'risky'; riskReason?: string } {
    if (action === 'open_app') {
      return {
        riskTier: 'risky',
        riskReason: `Launching desktop application "${args.appName || 'app'}" affects your local OS.`,
      };
    }

    if (action === 'hotkey') {
      const joined = (Array.isArray(args.keys) ? args.keys.join('+') : String(args.keys || '')).toLowerCase();
      const safeCombos = ['mod+c', 'ctrl+c', 'cmd+c', 'mod+a', 'ctrl+a', 'cmd+a', 'mod+f', 'ctrl+f', 'cmd+f'];
      if (!safeCombos.includes(joined)) {
        return {
          riskTier: 'risky',
          riskReason: `System/application shortcut "${joined}" requires confirmation.`,
        };
      }
    }

    const combinedText = `${args.targetLabel || ''} ${args.rationale || ''} ${args.text || ''} ${args.url || ''}`.toLowerCase();
    const riskyKeyword = combinedText.match(
      /\b(delete|remove|uninstall|format|shutdown|restart|sudo|rm\s+-rf|powershell|terminal|purchase|checkout|buy\s+now|pay\s+now|place\s+order|send\s+email|submit\s+payment|transfer\s+money)\b/i
    );
    if (riskyKeyword && ['click_at', 'double_click_at', 'right_click_at', 'type_text', 'press_key'].includes(action)) {
      return {
        riskTier: 'risky',
        riskReason: `Action involves sensitive operation ("${riskyKeyword[1]}") and requires confirmation.`,
      };
    }

    return { riskTier: 'safe' };
  }

  private async planNextActionWithVision(
    goal: string,
    frame: ComputerFrameState,
    history: ComputerActionStep[],
    target: 'desktop_bridge' | 'browser_sandbox' | 'screen_share'
  ): Promise<{ action: ComputerActionType; args: Record<string, any> }> {
    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is missing.');
    }

    const ai = getGeminiClient();
    const historyText =
      history.length > 0
        ? history
            .map(
              (h) =>
                `Step ${h.stepIndex}: ${h.action}(${JSON.stringify(h.args)}) -> ${h.status}: ${h.message}`
            )
            .join('\n')
        : 'No previous actions yet.';

    const prompt = `You are Matilda's Computer Use visual agent.
USER GOAL: "${goal}"
ACTIVE TARGET: ${target} (${
      target === 'desktop_bridge'
        ? `User's local ${this.bridgeState.os || 'Desktop'} OS (${frame.width}x${frame.height})`
        : target === 'browser_sandbox'
        ? `Cloud Playwright Chromium Browser (1280x720, current URL: ${this.sandboxState.currentUrl})`
        : 'Browser Screen Share (visual inspection only; explain what you see via complete_task)'
    })

PREVIOUS STEPS:
${historyText}

INSTRUCTIONS:
1. Inspect the attached current screenshot carefully.
2. Call EXACTLY ONE function declaration representing the next atomic step to accomplish the user's goal.
3. All (x, y, endX, endY) coordinates use the normalized 0-999 grid where (0,0) is top-left and (999,999) is bottom-right.
4. Do not repeat an identical failed click; adjust coordinates or scroll or call complete_task if impossible.
5. If the goal is already satisfied on screen (or if target is screen_share visual inspection), call complete_task immediately with a clear voice-friendly 1-2 sentence summary.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: frame.mimeType || 'image/jpeg',
                data: frame.imageBase64,
              },
            },
            { text: prompt },
          ],
        },
      ],
      config: {
        tools: [{ functionDeclarations: COMPUTER_USE_TOOL_DECLARATIONS }],
      },
    });

    const fc = response.functionCalls?.[0];
    if (fc && fc.name) {
      return {
        action: fc.name as ComputerActionType,
        args: (fc.args as Record<string, any>) || {},
      };
    }

    return {
      action: 'complete_task',
      args: {
        summary: (response.text || 'I inspected the screen and finished the task.').slice(0, 260),
        succeeded: true,
      },
    };
  }

  public async runTask(params: {
    goal: string;
    targetMode?: ComputerTargetMode;
    startUrl?: string;
    maxSteps?: number;
  }): Promise<ComputerUseSessionState> {
    if (this.session.status === 'running' || this.session.status === 'awaiting_confirmation') {
      this.abortSession('Superseded by new command.');
    }

    if (params.targetMode) {
      this.targetMode = params.targetMode;
    }

    const abortFlag = { aborted: false };
    this.loopAbortController = abortFlag;

    const sessionId = `cu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const maxSteps = Math.max(1, Math.min(12, params.maxSteps || 8));

    this.session = {
      sessionId,
      goal: params.goal,
      targetMode: this.targetMode,
      status: 'running',
      maxSteps,
      currentStep: 0,
      summary: `Working on: "${params.goal}"...`,
      error: null,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [],
      pendingConfirmation: null,
      lastCoords: null,
    };
    this.broadcastState();

    if (params.startUrl) {
      const preferred = this.resolveExecutionTarget({ goal: params.goal });
      if (preferred === 'browser_sandbox') {
        await this.navigateSandbox(params.startUrl).catch(() => {});
      }
    }

    return this.executeStepLoop(1, maxSteps, abortFlag, params.startUrl);
  }

  private async executeStepLoop(
    startStepIdx: number,
    maxSteps: number,
    abortFlag: { aborted: boolean },
    startUrl?: string
  ): Promise<ComputerUseSessionState> {
    const goal = this.session.goal;
    const sessionId = this.session.sessionId;
    try {
      const preferredTarget = this.resolveExecutionTarget({ goal });
      const openAppMatch = goal.match(
        /^(?:please\s+|can\s+you\s+)?(?:open|launch|start)\s+(?:the\s+)?(?:app\s+)?([a-zA-Z0-9 ._-]{2,32}?)(?:\s+app|\s+on\s+my\s+computer)?$/i
      );
      const directUrlMatch = goal.match(/https?:\/\/[^\s]+/i);

      for (let stepIdx = startStepIdx; stepIdx <= maxSteps; stepIdx++) {
        if (abortFlag.aborted) break;

        this.session.currentStep = stepIdx;
        this.broadcastState();

        let target = preferredTarget;
        let frame: ComputerFrameState | null = null;

        if (stepIdx === 1 && openAppMatch && !directUrlMatch && this.bridgeState.connected) {
          target = 'desktop_bridge';
          frame = this.latestFrame || (await this.captureFrame('desktop_bridge').catch(() => null));
        } else {
          try {
            frame = await this.captureFrame(target);
          } catch (capErr: any) {
            if (openAppMatch && !this.bridgeState.connected && target === 'desktop_bridge') {
              this.session.status = 'error';
              this.session.error =
                'Local Desktop Bridge is not connected yet. Pair it in Computer Use Studio to open desktop apps on your Windows/Mac/Linux computer.';
              this.session.summary = this.session.error;
              this.broadcastState();
              return this.session;
            }
            throw capErr;
          }
        }

        const stepStart = Date.now();
        let planned: { action: ComputerActionType; args: Record<string, any> };

        if (stepIdx === 1 && openAppMatch && !directUrlMatch) {
          planned = {
            action: 'open_app',
            args: {
              appName: openAppMatch[1].trim(),
              rationale: `User requested launching ${openAppMatch[1].trim()}.`,
            },
          };
          if (this.bridgeState.connected) {
            target = 'desktop_bridge';
          }
        } else if (stepIdx === 1 && directUrlMatch && !startUrl) {
          planned = {
            action: 'open_url',
            args: {
              url: directUrlMatch[0],
              rationale: `Navigate to requested URL ${directUrlMatch[0]}.`,
            },
          };
        } else if (frame) {
          planned = await this.planNextActionWithVision(goal, frame, this.session.steps, target);
        } else {
          throw new Error('Could not obtain a screenshot for Computer Use planning.');
        }

        if (abortFlag.aborted) break;

        if (planned.action === 'complete_task') {
          this.session.status = 'completed';
          this.session.summary = String(planned.args.summary || 'Task completed.');
          this.broadcastState();
          return this.session;
        }

        const normCoords =
          planned.args.x !== undefined || planned.args.y !== undefined
            ? {
                x: Number(planned.args.x),
                y: Number(planned.args.y),
                ...(planned.args.endX !== undefined ? { endX: Number(planned.args.endX) } : {}),
                ...(planned.args.endY !== undefined ? { endY: Number(planned.args.endY) } : {}),
              }
            : undefined;

        if (normCoords) {
          this.session.lastCoords = {
            action: planned.action,
            ...normCoords,
            timestamp: new Date().toISOString(),
          };
        }

        const risk = this.classifyActionRisk(planned.action, planned.args);

        const stepRecord: ComputerActionStep = {
          stepIndex: stepIdx,
          timestamp: new Date().toISOString(),
          targetUsed: target,
          action: planned.action,
          args: planned.args,
          rationale: String(planned.args.rationale || `Execute ${planned.action}`),
          riskTier: risk.riskTier,
          riskReason: risk.riskReason,
          approvalState: risk.riskTier === 'safe' ? 'auto_approved' : 'pending',
          status: 'planned',
          message: risk.riskTier === 'safe' ? 'Executing...' : 'Awaiting your confirmation...',
          latencyMs: Date.now() - stepStart,
          normalizedCoords: normCoords,
        };

        this.session.steps.push(stepRecord);

        if (risk.riskTier === 'risky') {
          const confirmationId = `cu-conf-${Date.now()}`;
          this.session.status = 'awaiting_confirmation';
          this.session.pendingConfirmation = {
            confirmationId,
            sessionId,
            stepIndex: stepIdx,
            targetUsed: target,
            action: planned.action,
            args: planned.args,
            rationale: stepRecord.rationale,
            riskReason: risk.riskReason || 'High-impact action requires approval.',
            normalizedCoords: normCoords,
            previewImageBase64: frame?.imageBase64,
            previewMimeType: frame?.mimeType || 'image/jpeg',
          };
          this.session.summary = `Paused before ${planned.action}(${JSON.stringify(
            planned.args
          )}) — click Approve & Execute to continue.`;
          this.broadcastState();
          return this.session;
        }

        const execStart = Date.now();
        const execRes = await this.executeLowLevelAction(target, planned.action, planned.args);
        stepRecord.latencyMs = Date.now() - execStart;
        stepRecord.status = execRes.success ? 'executed' : 'failed';
        stepRecord.message = execRes.message;
        stepRecord.pixelCoords = execRes.pixelCoords;
        this.broadcastState();

        if (!execRes.success) {
          this.session.status = 'error';
          this.session.error = execRes.message;
          this.session.summary = execRes.message;
          this.broadcastState();
          return this.session;
        }
      }

      if (!abortFlag.aborted && this.session.status === 'running') {
        this.session.status = 'completed';
        const lastStep = this.session.steps[this.session.steps.length - 1];
        this.session.summary =
          lastStep?.message || `Finished executing ${this.session.steps.length} step(s) for "${goal}".`;
        this.broadcastState();
      }
      return this.session;
    } catch (err: any) {
      this.session.status = 'error';
      this.session.error = err?.message || 'Computer Use execution error.';
      this.session.summary = this.session.error || 'Execution failed.';
      this.broadcastState();
      return this.session;
    }
  }

  public async resolveConfirmation(confirmationId: string, approved: boolean): Promise<ComputerUseSessionState> {
    const pending = this.session.pendingConfirmation;
    if (!pending || (confirmationId && pending.confirmationId !== confirmationId)) {
      return this.session;
    }

    const stepRecord = this.session.steps.find((s) => s.stepIndex === pending.stepIndex);
    this.session.pendingConfirmation = null;

    if (!approved) {
      if (stepRecord) {
        stepRecord.approvalState = 'rejected';
        stepRecord.status = 'blocked';
        stepRecord.message = 'Cancelled by user safety gate.';
      }
      this.session.status = 'aborted';
      this.session.summary = 'Action cancelled at your request.';
      this.broadcastState();
      return this.session;
    }

    if (stepRecord) {
      stepRecord.approvalState = 'user_approved';
      stepRecord.message = 'Executing approved action...';
    }
    this.session.status = 'running';
    this.broadcastState();

    const execStart = Date.now();
    const execRes = await this.executeLowLevelAction(pending.targetUsed, pending.action, pending.args);
    if (stepRecord) {
      stepRecord.latencyMs = Date.now() - execStart;
      stepRecord.status = execRes.success ? 'executed' : 'failed';
      stepRecord.message = execRes.message;
      stepRecord.pixelCoords = execRes.pixelCoords;
    }

    if (!execRes.success) {
      this.session.status = 'error';
      this.session.error = execRes.message;
      this.session.summary = execRes.message;
      this.broadcastState();
      return this.session;
    }

    const openAppMatch = this.session.goal.match(
      /^(?:please\s+|can\s+you\s+)?(?:open|launch|start)\s+(?:the\s+)?(?:app\s+)?([a-zA-Z0-9 ._-]{2,32}?)(?:\s+app|\s+on\s+my\s+computer)?$/i
    );
    if (pending.action === 'open_app' && openAppMatch) {
      this.session.status = 'completed';
      this.session.summary = execRes.message;
      this.broadcastState();
      return this.session;
    }

    const abortFlag = this.loopAbortController || { aborted: false };
    if (pending.stepIndex < this.session.maxSteps && !abortFlag.aborted) {
      return this.executeStepLoop(pending.stepIndex + 1, this.session.maxSteps, abortFlag);
    }

    this.session.status = 'completed';
    this.session.summary = execRes.message;
    this.broadcastState();
    return this.session;
  }

  public abortSession(reason = 'Stopped by emergency kill switch.'): ComputerUseSessionState {
    if (this.loopAbortController) {
      this.loopAbortController.aborted = true;
    }
    this.session.pendingConfirmation = null;
    if (this.session.status === 'running' || this.session.status === 'awaiting_confirmation') {
      this.session.status = 'aborted';
      this.session.summary = reason;
    }
    this.broadcastState();
    return this.session;
  }
}

export const computerUseCoordinator = new ComputerUseCoordinator();
