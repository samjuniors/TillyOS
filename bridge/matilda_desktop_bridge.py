#!/usr/bin/env python3
"""
Matilda Cross-Platform Desktop Bridge (Windows, macOS, Linux)
Connects your local desktop screen, mouse, keyboard, and app launcher securely
to Matilda's Computer Use Studio via an authenticated pairing token.

Dependencies:
  pip install websockets mss pyautogui pillow
"""

import argparse
import asyncio
import base64
import io
import json
import os
import platform
import shutil
import subprocess
import sys
import time
import webbrowser

try:
    import websockets
except ImportError:
    print("Missing dependency: websockets. Run: pip install websockets mss pyautogui pillow")
    sys.exit(1)

try:
    import mss
except ImportError:
    print("Missing dependency: mss. Run: pip install websockets mss pyautogui pillow")
    sys.exit(1)

try:
    import pyautogui
    pyautogui.FAILSAFE = True  # Move mouse to top-left corner (0,0) to abort immediately
    pyautogui.PAUSE = 0.05
except ImportError:
    print("Missing dependency: pyautogui. Run: pip install websockets mss pyautogui pillow")
    sys.exit(1)

try:
    from PIL import Image
except ImportError:
    print("Missing dependency: pillow. Run: pip install websockets mss pyautogui pillow")
    sys.exit(1)


OS_NAME = platform.system()  # 'Windows', 'Darwin', 'Linux'

APP_ALIASES = {
    "Windows": {
        "calculator": "calc.exe",
        "calc": "calc.exe",
        "notepad": "notepad.exe",
        "chrome": "chrome",
        "google chrome": "chrome",
        "edge": "msedge",
        "firefox": "firefox",
        "terminal": "cmd.exe",
        "cmd": "cmd.exe",
        "powershell": "powershell.exe",
        "explorer": "explorer.exe",
        "file explorer": "explorer.exe",
        "vscode": "code",
        "visual studio code": "code",
        "spotify": "spotify",
    },
    "Darwin": {
        "calculator": "Calculator",
        "calc": "Calculator",
        "notes": "Notes",
        "notepad": "TextEdit",
        "textedit": "TextEdit",
        "chrome": "Google Chrome",
        "google chrome": "Google Chrome",
        "safari": "Safari",
        "firefox": "Firefox",
        "terminal": "Terminal",
        "finder": "Finder",
        "vscode": "Visual Studio Code",
        "visual studio code": "Visual Studio Code",
        "spotify": "Spotify",
    },
    "Linux": {
        "calculator": "gnome-calculator",
        "calc": "gnome-calculator",
        "notepad": "gedit",
        "chrome": "google-chrome",
        "google chrome": "google-chrome",
        "chromium": "chromium-browser",
        "firefox": "firefox",
        "terminal": "x-terminal-emulator",
        "files": "xdg-open ~",
        "vscode": "code",
        "visual studio code": "code",
        "spotify": "spotify",
    },
}


def get_logical_screen_size():
    size = pyautogui.size()
    return int(size.width), int(size.height)


def normalized_to_pixel(norm_x: float, norm_y: float):
    w, h = get_logical_screen_size()
    clamped_x = max(0.0, min(999.0, float(norm_x)))
    clamped_y = max(0.0, min(999.0, float(norm_y)))
    px = int(round((clamped_x / 999.0) * max(1, w - 1)))
    py = int(round((clamped_y / 999.0) * max(1, h - 1)))
    return px, py


def capture_screen_payload(max_width: int = 1280):
    logical_w, logical_h = get_logical_screen_size()
    with mss.mss() as sct:
        monitor = sct.monitors[1] if len(sct.monitors) > 1 else sct.monitors[0]
        raw = sct.grab(monitor)
        img = Image.frombytes("RGB", raw.size, raw.bgra, "raw", "BGRX")
        physical_w, physical_h = img.size

        if physical_w > max_width:
            ratio = max_width / float(physical_w)
            new_h = max(1, int(round(physical_h * ratio)))
            img = img.resize((max_width, new_h), Image.Resampling.LANCZOS)

        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=78, optimize=True)
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    return {
        "imageBase64": b64,
        "mimeType": "image/jpeg",
        "logicalWidth": logical_w,
        "logicalHeight": logical_h,
        "physicalWidth": physical_w,
        "physicalHeight": physical_h,
        "capturedWidth": img.size[0],
        "capturedHeight": img.size[1],
        "os": OS_NAME,
        "timestamp": time.time(),
    }


def launch_application(app_name: str):
    clean = (app_name or "").strip()
    if not clean:
        return False, "No application name specified."

    aliases = APP_ALIASES.get(OS_NAME, {})
    resolved = aliases.get(clean.lower(), clean)

    try:
        if OS_NAME == "Windows":
            subprocess.Popen(f'start "" "{resolved}"', shell=True)
            return True, f"Launched {resolved} on Windows."
        elif OS_NAME == "Darwin":
            subprocess.Popen(["open", "-a", resolved])
            return True, f"Launched {resolved} on macOS."
        else:
            cmd_parts = resolved.split()
            exe = shutil.which(cmd_parts[0])
            if exe:
                subprocess.Popen([exe, *cmd_parts[1:]], start_new_session=True)
                return True, f"Launched {resolved} on Linux."
            subprocess.Popen(["xdg-open", resolved], start_new_session=True)
            return True, f"Opened {resolved} via xdg-open on Linux."
    except Exception as exc:
        return False, f"Could not launch {clean}: {exc}"


def normalize_key_name(key: str) -> str:
    k = (key or "").strip().lower()
    mapping = {
        "return": "enter",
        "esc": "escape",
        "cmd": "command" if OS_NAME == "Darwin" else "ctrl",
        "super": "command" if OS_NAME == "Darwin" else "win",
        "meta": "command" if OS_NAME == "Darwin" else "win",
        "mod": "command" if OS_NAME == "Darwin" else "ctrl",
        "control": "ctrl",
        "del": "delete",
        "arrowup": "up",
        "arrowdown": "down",
        "arrowleft": "left",
        "arrowright": "right",
        "pageup": "pageup",
        "pagedown": "pagedown",
    }
    return mapping.get(k, k)


def execute_action(action: str, args: dict):
    a = (action or "").strip().lower()

    if a == "click_at":
        px, py = normalized_to_pixel(args.get("x", 500), args.get("y", 500))
        pyautogui.click(px, py)
        return True, f"Clicked at ({px}, {py})", {"pixelX": px, "pixelY": py}

    if a == "double_click_at":
        px, py = normalized_to_pixel(args.get("x", 500), args.get("y", 500))
        pyautogui.doubleClick(px, py)
        return True, f"Double-clicked at ({px}, {py})", {"pixelX": px, "pixelY": py}

    if a == "right_click_at":
        px, py = normalized_to_pixel(args.get("x", 500), args.get("y", 500))
        pyautogui.rightClick(px, py)
        return True, f"Right-clicked at ({px}, {py})", {"pixelX": px, "pixelY": py}

    if a == "move_cursor":
        px, py = normalized_to_pixel(args.get("x", 500), args.get("y", 500))
        pyautogui.moveTo(px, py, duration=0.18)
        return True, f"Moved cursor to ({px}, {py})", {"pixelX": px, "pixelY": py}

    if a == "drag_and_drop":
        sx, sy = normalized_to_pixel(args.get("x", 300), args.get("y", 300))
        ex, ey = normalized_to_pixel(args.get("endX", 600), args.get("endY", 600))
        duration = max(0.15, min(2.0, float(args.get("durationMs", 450)) / 1000.0))
        pyautogui.moveTo(sx, sy, duration=0.12)
        pyautogui.dragTo(ex, ey, duration=duration, button="left")
        return True, f"Dragged from ({sx}, {sy}) to ({ex}, {ey})", {
            "pixelX": sx,
            "pixelY": sy,
            "endPixelX": ex,
            "endPixelY": ey,
        }

    if a == "scroll_at":
        px, py = normalized_to_pixel(args.get("x", 500), args.get("y", 500))
        delta_y = int(args.get("deltaY", -360))
        pyautogui.moveTo(px, py)
        # PyAutoGUI scroll: positive = up, negative = down
        clicks = int(-delta_y / 120) if delta_y != 0 else -3
        if clicks == 0:
            clicks = -1 if delta_y > 0 else 1
        pyautogui.scroll(clicks, x=px, y=py)
        return True, f"Scrolled ({clicks}) at ({px}, {py})", {"pixelX": px, "pixelY": py}

    if a == "type_text":
        text = str(args.get("text", ""))
        pyautogui.write(text, interval=0.015)
        if args.get("pressEnter"):
            pyautogui.press("enter")
        return True, f"Typed {len(text)} characters", {}

    if a == "press_key":
        key = normalize_key_name(args.get("key", "enter"))
        pyautogui.press(key)
        return True, f"Pressed key {key}", {}

    if a == "hotkey":
        keys_raw = args.get("keys", [])
        if isinstance(keys_raw, str):
            keys_raw = [k.strip() for k in keys_raw.split("+") if k.strip()]
        keys = [normalize_key_name(k) for k in keys_raw]
        if not keys:
            return False, "No hotkey keys provided.", {}
        pyautogui.hotkey(*keys)
        return True, f"Pressed hotkey {'+'.join(keys)}", {}

    if a == "open_app":
        ok, message = launch_application(str(args.get("appName", "")))
        time.sleep(0.9)
        return ok, message, {}

    if a == "open_url":
        url = str(args.get("url", "https://www.google.com"))
        if not url.startswith(("http://", "https://")):
            url = "https://" + url
        webbrowser.open(url)
        time.sleep(1.0)
        return True, f"Opened {url} in default desktop browser", {}

    if a == "wait_seconds":
        secs = max(0.2, min(5.0, float(args.get("seconds", 1.0))))
        time.sleep(secs)
        return True, f"Waited {secs:.1f}s", {}

    return False, f"Unsupported desktop action: {action}", {}


async def run_bridge(ws_url: str, token: str):
    sep = "&" if "?" in ws_url else "?"
    full_url = f"{ws_url}{sep}role=bridge&token={token}"
    logical_w, logical_h = get_logical_screen_size()

    print(f"[Matilda Desktop Bridge] OS={OS_NAME} Screen={logical_w}x{logical_h}")
    print(f"[Matilda Desktop Bridge] Connecting to {ws_url} ...")
    print("[Matilda Desktop Bridge] Fail-Safe active: Slam mouse to top-left (0,0) anytime to abort.")

    while True:
        try:
            async with websockets.connect(full_url, max_size=25 * 1024 * 1024) as ws:
                await ws.send(
                    json.dumps(
                        {
                            "type": "bridge_hello",
                            "token": token,
                            "os": OS_NAME,
                            "hostname": platform.node(),
                            "logicalWidth": logical_w,
                            "logicalHeight": logical_h,
                            "pythonVersion": platform.python_version(),
                        }
                    )
                )
                print("[Matilda Desktop Bridge] Paired and online!")

                # Send an initial frame immediately
                initial_frame = await asyncio.to_thread(capture_screen_payload)
                await ws.send(json.dumps({"type": "screen_frame", **initial_frame}))

                async for raw in ws:
                    msg = json.loads(raw)
                    msg_type = msg.get("type")
                    req_id = msg.get("requestId")

                    if msg_type == "ping":
                        await ws.send(json.dumps({"type": "pong", "requestId": req_id}))
                    elif msg_type == "capture_screen":
                        frame = await asyncio.to_thread(capture_screen_payload)
                        await ws.send(
                            json.dumps(
                                {
                                    "type": "capture_result",
                                    "requestId": req_id,
                                    "success": True,
                                    **frame,
                                }
                            )
                        )
                    elif msg_type == "execute_action":
                        action = msg.get("action", "")
                        args = msg.get("args") or {}
                        try:
                            ok, message, extra = await asyncio.to_thread(execute_action, action, args)
                            await asyncio.sleep(0.35)
                            frame = await asyncio.to_thread(capture_screen_payload)
                            await ws.send(
                                json.dumps(
                                    {
                                        "type": "action_result",
                                        "requestId": req_id,
                                        "success": ok,
                                        "message": message,
                                        "extra": extra,
                                        "frame": frame,
                                    }
                                )
                            )
                        except pyautogui.FailSafeException:
                            await ws.send(
                                json.dumps(
                                    {
                                        "type": "action_result",
                                        "requestId": req_id,
                                        "success": False,
                                        "message": "PyAutoGUI fail-safe triggered (cursor moved to 0,0).",
                                        "failsafeTriggered": True,
                                    }
                                )
                            )
                        except Exception as exc:
                            await ws.send(
                                json.dumps(
                                    {
                                        "type": "action_result",
                                        "requestId": req_id,
                                        "success": False,
                                        "message": str(exc),
                                    }
                                )
                            )
        except Exception as err:
            print(f"[Matilda Desktop Bridge] Connection lost ({err}). Retrying in 3s...")
            await asyncio.sleep(3)


def main():
    parser = argparse.ArgumentParser(description="Matilda Cross-Platform Desktop Bridge")
    parser.add_argument("--ws-url", default=os.environ.get("MATILDA_WS_URL", ""), help="WebSocket URL")
    parser.add_argument("--token", default=os.environ.get("MATILDA_PAIR_TOKEN", ""), help="Pairing token")
    args = parser.parse_args()

    if not args.ws_url or not args.token:
        print("Error: --ws-url and --token are required (download pre-configured script from Matilda UI).")
        sys.exit(1)

    try:
        asyncio.run(run_bridge(args.ws_url, args.token))
    except KeyboardInterrupt:
        print("\n[Matilda Desktop Bridge] Stopped by user.")


if __name__ == "__main__":
    main()
