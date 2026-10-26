#!/usr/bin/env python3
"""Send remote-control keys and take a screenshot. Usage: tvctl.py [KEY[*n] ...] [--app ID] [--nosshot]
Keys: HOME BACK UP DOWN LEFT RIGHT ENTER EXIT MENU ... ; 'wait' = 1.5 s pause.
Requires TV_HOST; the screenshot is written to shots/s.jpg."""
import asyncio, sys, pathlib, urllib.request, io
from aiowebostv import WebOsClient
from PIL import Image

from tvconfig import ROOT, client_key, tv_host

DIR = ROOT


async def main(args):
    c = WebOsClient(tv_host(), client_key=client_key())
    await c.connect()
    shot = "--nosshot" not in args
    it = iter(a for a in args if a != "--nosshot")
    for a in it:
        if a == "--app":
            await c.launch_app(next(it)); await asyncio.sleep(3); continue
        if a == "wait":
            await asyncio.sleep(1.5); continue
        k, _, n = a.partition("*")
        for _ in range(int(n or 1)):
            await c.button(k); await asyncio.sleep(0.6)
    await asyncio.sleep(1.2)
    if shot:
        r = await c.request("tv/executeOneShot", {"path": "/tmp/capture.jpg", "method": "DISPLAY", "format": "JPG"})
        im = Image.open(io.BytesIO(urllib.request.urlopen(r["imageUri"], timeout=5).read()))
        im.thumbnail((960, 540)); (DIR / "shots").mkdir(exist_ok=True); im.save(DIR / "shots" / "s.jpg", quality=70)
    print("app:", c.tv_state.current_app_id)
    await c.disconnect()

asyncio.run(main(sys.argv[1:]))
