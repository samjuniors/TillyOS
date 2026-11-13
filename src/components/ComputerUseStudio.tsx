import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Monitor,
  Globe,
  Layers,
  Cast,
  Square,
  Camera,
  Play,
  Send,
  Copy,
  Check,
  Download,
  Terminal,
  ShieldCheck,
  AlertTriangle,
  X,
  MousePointerClick,
  RefreshCw,
  ArrowUpRight,
} from 'lucide-react';
import {
  ComputerUsePublicState,
  ComputerTargetMode,
  ComputerBridgePairingInfo,
} from '../types';
import {
  setComputerTargetMode,
  createBridgePairingToken,
  captureComputerFrame,
  sendScreenShareFrame,
  navigateSandboxUrl,
  runComputerTask,
  stopComputerTask,
} from '../services/api';

interface ComputerUseStudioProps {
  isOpen: boolean;
  onClose: () => void;
  computerState: ComputerUsePublicState;
  onStateChange: (nextState: ComputerUsePublicState) => void;
  onLog?: (msg: string) => void;
}

const SAMPLE_TASKS = [
  {
    label: 'Browse Wikipedia',
    goal: 'Go to https://en.wikipedia.org and summarize the main sections visible on the page.',
  },
  {
    label: 'Open Calculator',
    goal: 'Open Calculator',
  },
  {
    label: 'Inspect Screen',
    goal: 'Inspect what is currently visible on my screen and summarize it in 2 sentences.',
  },
];

export const ComputerUseStudio: React.FC<ComputerUseStudioProps> = ({
  isOpen,
  onClose,
  computerState,
  onStateChange,
  onLog,
}) => {
  const [goalInput, setGoalInput] = useState('');
  const [sandboxUrlInput, setSandboxUrlInput] = useState('https://en.wikipedia.org');
  const [isBusy, setIsBusy] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pairingInfo, setPairingInfo] = useState<ComputerBridgePairingInfo | null>(null);
  const [pairingOsTab, setPairingOsTab] = useState<'macos' | 'windows' | 'linux'>(() => {
    if (typeof navigator !== 'undefined') {
      const p = navigator.platform.toLowerCase();
      if (p.includes('win')) return 'windows';
      if (p.includes('mac')) return 'macos';
    }
    return 'linux';
  });
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [hoverCoords, setHoverCoords] = useState<{ x: number; y: number } | null>(null);

  // Browser Screen Share (getDisplayMedia)
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const shareStreamRef = useRef<MediaStream | null>(null);
  const shareVideoRef = useRef<HTMLVideoElement | null>(null);
  const shareTimerRef = useRef<number | null>(null);

  const stopScreenShare = useCallback(() => {
    if (shareTimerRef.current) {
      window.clearInterval(shareTimerRef.current);
      shareTimerRef.current = null;
    }
    if (shareStreamRef.current) {
      shareStreamRef.current.getTracks().forEach((t) => t.stop());
      shareStreamRef.current = null;
    }
    if (shareVideoRef.current) {
      shareVideoRef.current.srcObject = null;
    }
    setIsScreenSharing(false);
  }, []);

  useEffect(() => {
    return () => {
      stopScreenShare();
    };
  }, [stopScreenShare]);

  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      stopScreenShare();
      onLog?.('COMPUTER USE: Stopped browser screen share');
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setActionError('Screen capture API (getDisplayMedia) is unavailable in this browser.');
      return;
    }

    setActionError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 5, max: 10 } },
        audio: false,
      });
      shareStreamRef.current = stream;
      setIsScreenSharing(true);

      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      shareVideoRef.current = video;

      const pushFrame = async () => {
        if (!shareVideoRef.current || shareVideoRef.current.readyState < 2) return;
        const vw = shareVideoRef.current.videoWidth || 1280;
        const vh = shareVideoRef.current.videoHeight || 720;
        const maxW = 1280;
        const scale = vw > maxW ? maxW / vw : 1;
        const cw = Math.round(vw * scale);
        const ch = Math.round(vh * scale);

        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(shareVideoRef.current, 0, 0, cw, ch);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        await sendScreenShareFrame({
          imageBase64: dataUrl,
          mimeType: 'image/jpeg',
          width: vw,
          height: vh,
          label: `Browser Screen Share (${vw}x${vh})`,
        }).catch(() => {});
      };

      await pushFrame();
      shareTimerRef.current = window.setInterval(pushFrame, 2000);

      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        stopScreenShare();
      });
      onLog?.('COMPUTER USE: Started live browser screen share');
    } catch (err: any) {
      setActionError(err?.message || 'Screen share cancelled or blocked.');
      stopScreenShare();
    }
  };

  const handleModeChange = async (mode: ComputerTargetMode) => {
    setActionError(null);
    try {
      const next = await setComputerTargetMode(mode);
      onStateChange(next);
    } catch (err: any) {
      setActionError(err?.message || 'Could not switch mode');
    }
  };

  const handleGeneratePairing = async () => {
    setActionError(null);
    try {
      const info = await createBridgePairingToken();
      setPairingInfo(info);
      onLog?.('COMPUTER USE: Generated Desktop Bridge pairing token');
    } catch (err: any) {
      setActionError(err?.message || 'Could not generate pairing token');
    }
  };

  const handleCaptureFrame = async () => {
    setIsCapturing(true);
    setActionError(null);
    try {
      const explicitSource =
        computerState.targetMode === 'desktop_bridge'
          ? 'desktop_bridge'
          : computerState.targetMode === 'browser_sandbox'
          ? 'browser_sandbox'
          : computerState.targetMode === 'screen_share'
          ? 'screen_share'
          : computerState.bridge.connected
          ? 'desktop_bridge'
          : 'browser_sandbox';
      const res = await captureComputerFrame(explicitSource);
      onStateChange(res.state);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to capture screen frame');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleNavigateSandbox = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!sandboxUrlInput.trim()) return;
    setIsCapturing(true);
    setActionError(null);
    try {
      const res = await navigateSandboxUrl(sandboxUrlInput.trim());
      onStateChange(res.state);
      onLog?.(`COMPUTER SANDBOX: Loaded ${sandboxUrlInput.trim()}`);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to load URL in sandbox');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleRunTask = async (goalText: string) => {
    const clean = goalText.trim();
    if (!clean || isBusy) return;
    setIsBusy(true);
    setActionError(null);
    try {
      const res = await runComputerTask({ goal: clean });
      onStateChange(res.state);
      setGoalInput('');
      onLog?.(`COMPUTER USE: ${res.session.summary}`);
    } catch (err: any) {
      setActionError(err?.message || 'Computer Use run failed');
    } finally {
      setIsBusy(false);
    }
  };

  const handleEmergencyStop = async () => {
    try {
      const res = await stopComputerTask('Emergency STOP pressed by user.');
      onStateChange(res.state);
      onLog?.('COMPUTER USE: Emergency STOP activated');
    } catch {}
  };

  const handleCopyCommand = () => {
    if (!pairingInfo) return;
    const cmd = pairingOsTab === 'windows' ? pairingInfo.commands.windows : pairingInfo.commands.unix;
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 1800);
  };

  const handleMouseMoveViewport = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = Math.max(0, Math.min(999, Math.round(((e.clientX - rect.left) / rect.width) * 999)));
    const ny = Math.max(0, Math.min(999, Math.round(((e.clientY - rect.top) / rect.height) * 999)));
    setHoverCoords({ x: nx, y: ny });
  };

  if (!isOpen) return null;

  const { bridge, sandbox, latestFrame, session, targetMode } = computerState;
  const isRunning = session.status === 'running';
  const lastCoords = session.lastCoords;

  const statusLabel = bridge.connected
    ? `Bridge Online · ${bridge.os || 'Desktop'}`
    : isScreenSharing
    ? 'Screen Share Live'
    : sandbox.ready
    ? 'Browser Sandbox Ready'
    : 'Unpaired';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 md:p-5">
      <div
        className="w-full max-w-6xl h-[88vh] rounded-xl bg-[#0C0A09] border border-stone-800 shadow-2xl flex flex-col overflow-hidden"
        style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        {/* TOP BAR CONTRACT */}
        <div className="h-14 px-4 bg-[#1C1917] border-b border-stone-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <Monitor className="w-4 h-4 text-amber-400" />
              <span
                className="text-sm font-semibold text-white tracking-tight whitespace-nowrap"
                style={{ fontFamily: "'Outfit', sans-serif" }}
              >
                Matilda <span className="text-stone-500">/</span> Computer Use Studio
              </span>
            </div>

            <span
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium border whitespace-nowrap ${
                bridge.connected || isScreenSharing || sandbox.ready
                  ? 'bg-emerald-950/70 text-emerald-400 border-emerald-800/70'
                  : 'bg-stone-900 text-stone-400 border-stone-700'
              }`}
            >
              {statusLabel}
            </span>

            {session.status === 'awaiting_confirmation' && (
              <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-950/70 text-amber-300 border border-amber-700/70 whitespace-nowrap">
                Approval Needed
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCaptureFrame}
              disabled={isCapturing}
              className="px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-700 text-xs font-medium text-stone-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <Camera className="w-3.5 h-3.5 text-amber-400" />
              <span>{isCapturing ? 'Capturing...' : 'Capture Frame'}</span>
            </button>

            <button
              onClick={handleToggleScreenShare}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                isScreenSharing
                  ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                  : 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-200'
              }`}
            >
              <Cast className="w-3.5 h-3.5" />
              <span>{isScreenSharing ? 'Stop Share' : 'Share Screen'}</span>
            </button>

            <button
              onClick={handleEmergencyStop}
              className="px-3 py-1.5 rounded-lg bg-[#DC2626] hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              title="Emergency STOP Kill Switch"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>STOP</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 cursor-pointer"
              title="Close Computer Use Studio"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* MAIN SPLIT WORKSPACE (65% Viewport / 35% Inspector) */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          {/* LEFT STAGE (~65%): LIVE VIEWPORT + TARGET RETICLE */}
          <div className="flex-1 flex flex-col p-4 gap-3 min-w-0 min-h-0 overflow-y-auto">
            {/* Sandbox Quick Navigation + Mode Switcher Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-lg bg-[#1C1917] border border-stone-800 p-0.5">
                {(
                  [
                    { id: 'hybrid', label: 'Hybrid Auto', icon: Layers },
                    { id: 'desktop_bridge', label: 'Desktop Bridge', icon: Monitor },
                    { id: 'browser_sandbox', label: 'Browser Sandbox', icon: Globe },
                  ] as const
                ).map((m) => {
                  const Icon = m.icon;
                  const active = targetMode === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => handleModeChange(m.id)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                        active
                          ? 'bg-amber-500 text-stone-950 font-semibold'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>

              <form onSubmit={handleNavigateSandbox} className="flex items-center gap-1.5 flex-1 max-w-md">
                <input
                  type="text"
                  value={sandboxUrlInput}
                  onChange={(e) => setSandboxUrlInput(e.target.value)}
                  placeholder="https://en.wikipedia.org"
                  className="flex-1 px-3 py-1.5 rounded-lg bg-[#1C1917] border border-stone-800 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  disabled={isCapturing}
                  className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-100 text-xs font-medium whitespace-nowrap cursor-pointer"
                >
                  Open URL
                </button>
              </form>
            </div>

            {actionError && (
              <div className="px-3 py-2 rounded-lg bg-red-950/60 border border-red-800/70 text-xs text-red-200 flex items-center justify-between gap-2">
                <span>{actionError}</span>
                <button onClick={() => setActionError(null)} className="text-red-300 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* 16:9 VIEWPORT CANVAS */}
            <div
              onMouseMove={handleMouseMoveViewport}
              onMouseLeave={() => setHoverCoords(null)}
              className="relative w-full aspect-video rounded-xl bg-[#1C1917] border border-stone-800 overflow-hidden flex items-center justify-center shrink-0"
            >
              {latestFrame ? (
                <>
                  <img
                    src={`data:${latestFrame.mimeType};base64,${latestFrame.imageBase64}`}
                    alt="Live Computer Viewport"
                    className="w-full h-full object-contain bg-black select-none"
                  />

                  {/* Normalized 0-999 Coordinate Reticle & Drag Vector Overlay */}
                  {lastCoords && (lastCoords.x !== undefined || lastCoords.endX !== undefined) && (
                    <svg
                      viewBox="0 0 1000 1000"
                      preserveAspectRatio="none"
                      className="absolute inset-0 w-full h-full pointer-events-none"
                    >
                      {lastCoords.action === 'drag_and_drop' &&
                      lastCoords.x !== undefined &&
                      lastCoords.y !== undefined &&
                      lastCoords.endX !== undefined &&
                      lastCoords.endY !== undefined ? (
                        <>
                          <line
                            x1={lastCoords.x}
                            y1={lastCoords.y}
                            x2={lastCoords.endX}
                            y2={lastCoords.endY}
                            stroke="#F59E0B"
                            strokeWidth="4"
                            strokeDasharray="10 8"
                          />
                          <circle cx={lastCoords.x} cy={lastCoords.y} r="10" fill="#F59E0B" opacity="0.85" />
                          <circle
                            cx={lastCoords.endX}
                            cy={lastCoords.endY}
                            r="16"
                            fill="none"
                            stroke="#F59E0B"
                            strokeWidth="4"
                          />
                        </>
                      ) : lastCoords.x !== undefined && lastCoords.y !== undefined ? (
                        <g>
                          <circle
                            cx={lastCoords.x}
                            cy={lastCoords.y}
                            r="22"
                            fill="rgba(245, 158, 11, 0.16)"
                            stroke="#F59E0B"
                            strokeWidth="3"
                          />
                          <circle cx={lastCoords.x} cy={lastCoords.y} r="5" fill="#F59E0B" />
                        </g>
                      ) : null}
                    </svg>
                  )}

                  {/* Top-left Source Overlay & Hover 0-999 Readout */}
                  <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
                    <span className="px-2.5 py-1 rounded-md bg-black/80 border border-stone-700 text-[11px] text-stone-200 truncate max-w-[65%]">
                      {latestFrame.urlOrApp || latestFrame.source}
                    </span>
                    <span
                      className="px-2.5 py-1 rounded-md bg-black/80 border border-stone-700 text-[11px] text-amber-300"
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {hoverCoords
                        ? `GRID X:${String(hoverCoords.x).padStart(3, '0')} Y:${String(hoverCoords.y).padStart(3, '0')}`
                        : `${latestFrame.width}×${latestFrame.height}`}
                    </span>
                  </div>
                </>
              ) : (
                /* CLEAN EMPTY STATE */
                <div className="max-w-md text-center px-6 py-8 space-y-4">
                  <div className="w-11 h-11 rounded-xl bg-stone-900 border border-stone-700 flex items-center justify-center mx-auto text-amber-400">
                    <MousePointerClick className="w-5 h-5" />
                  </div>
                  <div className="space-y-1.5">
                    <h3
                      className="text-base font-semibold text-white"
                      style={{ fontFamily: "'Outfit', sans-serif" }}
                    >
                      Hybrid Desktop & Sandbox Ready
                    </h3>
                    <p className="text-xs text-stone-400 leading-relaxed">
                      Pair your Windows, macOS, or Linux desktop via the Bridge on the right to launch apps and
                      click anywhere—or test instant web automation in the Browser Sandbox right now.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      onClick={() => handleRunTask(SAMPLE_TASKS[0].goal)}
                      disabled={isBusy}
                      className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Run Sample Sandbox Task</span>
                    </button>
                    <button
                      onClick={handleCaptureFrame}
                      disabled={isCapturing}
                      className="px-3.5 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 text-xs font-medium cursor-pointer"
                    >
                      Capture Sandbox View
                    </button>
                  </div>
                </div>
              )}

              {/* Active Step Banner */}
              {(isRunning || isBusy) && (
                <div className="absolute top-2.5 left-2.5 px-3 py-1 rounded-md bg-black/85 border border-amber-500/60 text-xs text-amber-300 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    Step {session.currentStep}/{session.maxSteps} · Planning visual action...
                  </span>
                </div>
              )}
            </div>

            {/* Session Summary Strip */}
            <div className="px-3.5 py-2.5 rounded-xl bg-[#1C1917] border border-stone-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold">
                  Active Goal & Summary
                </div>
                <div className="text-xs text-stone-200 truncate mt-0.5">
                  {session.goal ? `${session.goal} — ${session.summary}` : session.summary}
                </div>
              </div>
              <div
                className="text-xs font-medium text-stone-400 shrink-0"
                style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}
              >
                {session.steps.length} step{session.steps.length === 1 ? '' : 's'}
              </div>
            </div>
          </div>

          {/* RIGHT INSPECTOR (~35%, 360px): COMMAND COMPOSER + BRIDGE PAIRING + STEP TIMELINE */}
          <div className="w-full lg:w-[370px] border-t lg:border-t-0 lg:border-l border-stone-800 bg-[#141210] flex flex-col min-h-0 shrink-0">
            <div className="p-4 border-b border-stone-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span
                  className="text-xs font-semibold text-white uppercase tracking-wider"
                  style={{ fontFamily: "'Outfit', sans-serif" }}
                >
                  Run Computer Command
                </span>
                <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Safe Auto · Risky Confirm</span>
                </span>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleRunTask(goalInput);
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  placeholder='e.g. "Open Calculator" or "Click English on Wikipedia"'
                  className="flex-1 px-3 py-2 rounded-lg bg-[#1C1917] border border-stone-800 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  disabled={!goalInput.trim() || isBusy}
                  className="p-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 disabled:opacity-40 cursor-pointer"
                  title="Execute Computer Task"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>

              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_TASKS.map((t) => (
                  <button
                    key={t.label}
                    onClick={() => handleRunTask(t.goal)}
                    disabled={isBusy}
                    className="px-2 py-1 rounded-md bg-[#1C1917] hover:bg-stone-800 border border-stone-800 text-[11px] text-stone-300 flex items-center gap-1 cursor-pointer"
                  >
                    <span>{t.label}</span>
                    <ArrowUpRight className="w-3 h-3 text-amber-400" />
                  </button>
                ))}
              </div>
            </div>

            {/* CROSS-PLATFORM DESKTOP BRIDGE PAIRING */}
            <div className="p-4 border-b border-stone-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-semibold text-white">Local Desktop Bridge</span>
                </div>
                {bridge.connected ? (
                  <span
                    className="text-[11px] text-emerald-400 font-medium"
                    style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}
                  >
                    {bridge.os} · {bridge.logicalWidth}×{bridge.logicalHeight}
                  </span>
                ) : (
                  <button
                    onClick={handleGeneratePairing}
                    className="px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-stone-950 text-[11px] font-bold cursor-pointer"
                  >
                    {pairingInfo ? 'Refresh Pair Token' : 'Pair My Computer'}
                  </button>
                )}
              </div>

              {bridge.connected ? (
                <p className="text-[11px] text-stone-400 leading-relaxed">
                  Paired to <strong className="text-stone-200">{bridge.hostname || 'desktop'}</strong>. Matilda can
                  capture your screen, click, drag, scroll, type, and launch native apps with confirmation.
                </p>
              ) : pairingInfo ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="inline-flex rounded-md bg-[#1C1917] border border-stone-800 p-0.5 text-[11px]">
                      {(['macos', 'windows', 'linux'] as const).map((os) => (
                        <button
                          key={os}
                          onClick={() => setPairingOsTab(os)}
                          className={`px-2 py-0.5 rounded capitalize cursor-pointer ${
                            pairingOsTab === os ? 'bg-stone-700 text-white font-semibold' : 'text-stone-400'
                          }`}
                        >
                          {os === 'macos' ? 'macOS' : os === 'windows' ? 'Windows' : 'Linux'}
                        </button>
                      ))}
                    </div>
                    <a
                      href={pairingInfo.scriptDownloadUrl}
                      download="matilda_desktop_bridge.py"
                      className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download .py</span>
                    </a>
                  </div>

                  <div className="relative rounded-lg bg-[#0C0A09] border border-stone-800 p-2 pr-8">
                    <code
                      className="block text-[10px] text-stone-300 break-all leading-relaxed"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {pairingOsTab === 'windows' ? pairingInfo.commands.windows : pairingInfo.commands.unix}
                    </code>
                    <button
                      onClick={handleCopyCommand}
                      className="absolute top-1.5 right-1.5 p-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 cursor-pointer"
                      title="Copy command"
                    >
                      {copiedCmd ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-stone-400 leading-relaxed">
                  Click <strong className="text-stone-200">Pair My Computer</strong> for a one-line macOS, Windows,
                  or Linux command giving Matilda real desktop mouse, keyboard, and app control.
                </p>
              )}
            </div>

            {/* ACTION EXECUTION TIMELINE (36px-44px rows) */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-stone-800 flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Action Step Timeline</span>
                <span
                  className="text-[11px] text-stone-500"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}
                >
                  0–999 GRID
                </span>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-stone-800/70">
                {session.steps.length === 0 ? (
                  <div className="p-6 text-center text-xs text-stone-500">
                    No visual steps executed yet. Run a command above or speak a computer command to Matilda.
                  </div>
                ) : (
                  [...session.steps].reverse().map((step) => {
                    const coordText =
                      step.normalizedCoords?.x !== undefined
                        ? step.normalizedCoords.endX !== undefined
                          ? `${step.normalizedCoords.x},${step.normalizedCoords.y}→${step.normalizedCoords.endX},${step.normalizedCoords.endY}`
                          : `X:${step.normalizedCoords.x} Y:${step.normalizedCoords.y}`
                        : step.targetUsed === 'desktop_bridge'
                        ? 'OS'
                        : 'WEB';

                    return (
                      <div
                        key={`${session.sessionId}-${step.stepIndex}`}
                        className="px-3.5 py-2.5 hover:bg-stone-900/50 transition-colors flex items-start justify-between gap-2 min-h-[42px]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="text-[11px] text-stone-500 font-semibold"
                              style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}
                            >
                              {String(step.stepIndex).padStart(2, '0')}
                            </span>
                            <span className="text-xs font-semibold text-stone-100 truncate">
                              {step.action}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                step.riskTier === 'risky'
                                  ? 'bg-amber-950/70 text-amber-300 border border-amber-800/60'
                                  : 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/60'
                              }`}
                            >
                              {step.riskTier === 'risky' ? step.approvalState.replace('_', ' ') : 'safe auto'}
                            </span>
                          </div>
                          <div className="text-[11px] text-stone-400 truncate mt-0.5">{step.message}</div>
                        </div>

                        <div
                          className="text-right shrink-0 text-[10px] text-stone-400 space-y-0.5"
                          style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}
                        >
                          <div className="text-amber-300">{coordText}</div>
                          <div>{step.latencyMs}ms</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
