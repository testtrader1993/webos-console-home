#!/usr/bin/env python3
"""Extend LG Developer Mode (expires after 1000 h) when needed and nobody is disturbed.
Only runs if the last extension is older than 7 days and the launcher is in the foreground.
Environment: TV_HOST (required), TV_KEY_FILE, APP_ID. Requires ares-launch (@webos-tools/cli)
with a device named "tv" (see ares-setup-device); override the binary with ARES."""
import asyncio, os, pathlib, subprocess, sys, time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from aiowebostv import WebOsClient

from tvconfig import APP_ID, client_key, tv_host

DIR = pathlib.Path(__file__).parent
STAMP = DIR / ".devmode_extended"
ARES = os.environ.get("ARES", "ares-launch")

async def foreground():
    c = WebOsClient(tv_host(), client_key=client_key())
    await asyncio.wait_for(c.connect(), 8)
    app = c.tv_state.current_app_id
    await c.disconnect()
    return app

def main():
    if STAMP.exists() and time.time() - STAMP.stat().st_mtime < 7 * 86400:
        return
    try:
        if asyncio.run(foreground()) != APP_ID:
            return
    except Exception:
        return  # TV is off
    r = subprocess.run([ARES, "-d", "tv", "com.palmdts.devmode", "-p", "extend=true"], capture_output=True, text=True, timeout=60)
    print(r.stdout.strip(), r.stderr.strip())
    time.sleep(5)
    subprocess.run([ARES, "-d", "tv", APP_ID], capture_output=True, timeout=60)
    if r.returncode == 0:
        STAMP.touch()

main()
