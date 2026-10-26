#!/usr/bin/env python3
"""tvhome: watcher (launches the app when the TV turns on) + HTTP (/off, /screenoff, /health).
Environment: TV_HOST (required), TV_KEY_FILE, APP_ID, HUB_PORT."""
import asyncio, logging, pathlib, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from aiohttp import web
from aiowebostv import WebOsClient

from tvconfig import APP_ID as APP, HUB_PORT as PORT, client_key, tv_host

TV = tv_host()
KEY = client_key()
HOME_APPS = (None, "", "com.webos.app.home", "com.webos.app.launcher")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("tvhome")
logging.getLogger("aiowebostv").setLevel(logging.CRITICAL)

client = None          # active watcher connection
launch_task = None


def new_client():
    return WebOsClient(TV, client_key=KEY, connect_timeout=3)


async def try_connect(c):
    try:
        return bool(await asyncio.wait_for(c.connect(), 10))
    except Exception:
        return False


async def maybe_launch(c):
    await asyncio.sleep(6)
    if not c.is_connected():
        return
    try:
        app = await c.get_current_app()
    except Exception as e:
        log.info("reading foreground app failed: %r", e)
        return
    if app in HOME_APPS:
        log.info("foreground=%r -> launch %s", app, APP)
        try:
            await c.launch_app(APP)
        except Exception as e:
            log.info("launch failed: %r", e)
    else:
        log.info("foreground=%s, doing nothing", app)


def active(c):
    ps = c.tv_state.power_state or {}
    return ps.get("state") == "Active" or (not ps and c.tv_state.is_on)


async def watcher():
    global client, launch_task
    was_reachable = False
    while True:
        c = new_client()
        if not await try_connect(c):
            if was_reachable:
                log.info("tv unreachable")
            was_reachable = False
            try:
                await c.disconnect()
            except Exception:
                pass
            await asyncio.sleep(5)
            continue
        client = c
        log.info("connected (state=%s)", (c.tv_state.power_state or {}).get("state"))
        prev_active = False

        def trigger():
            global launch_task
            if launch_task and not launch_task.done():
                launch_task.cancel()
            launch_task = asyncio.create_task(maybe_launch(c))

        # first connection (unreachable -> reachable)
        if active(c):
            trigger()
        prev_active = active(c)
        prev_app = c.tv_state.current_app_id

        async def cb(_c):
            nonlocal prev_active, prev_app
            now = active(c)
            app = c.tv_state.current_app_id
            if now and not prev_active:
                log.info("tv Active")
                trigger()
            elif now and app != prev_app and app == "com.webos.app.home":
                log.info("foreground became home")
                trigger()
            prev_active = now
            prev_app = app

        await c.register_state_update_callback(cb)
        while c.is_connected():
            await asyncio.sleep(5)
        log.info("connection lost")
        client = None
        was_reachable = False
        try:
            await c.disconnect()
        except Exception:
            pass
        await asyncio.sleep(5)


async def with_tv(fn):
    c = client if client is not None and client.is_connected() else None
    temp = None
    if c is None:
        temp = c = new_client()
        if not await try_connect(c):
            raise RuntimeError("tv unreachable")
    try:
        return await fn(c)
    finally:
        if temp is not None:
            await temp.disconnect()


def reply(data, status=200):
    return web.json_response(data, status=status, headers={"Access-Control-Allow-Origin": "*"})


async def h_off(_):
    async def f(c):
        await c.command("request", "system/turnOff")
    try:
        await with_tv(f)
        await asyncio.sleep(0.3)
        return reply({"ok": True})
    except Exception as e:
        return reply({"ok": False, "error": repr(e)}, 502)


async def h_screenoff(_):
    async def f(c):
        return await c.request("com.webos.service.tvpower/power/turnOffScreen", {"standbyMode": "active"})
    try:
        return reply({"ok": True, "res": await with_tv(f)})
    except Exception as e:
        return reply({"ok": False, "error": repr(e)}, 502)


async def h_health(_):
    return reply({"ok": True, "tv_connected": bool(client and client.is_connected())})


async def main():
    app = web.Application()
    app.add_routes([web.get("/off", h_off), web.get("/screenoff", h_screenoff), web.get("/health", h_health)])
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, "0.0.0.0", PORT).start()
    log.info("http on :%d", PORT)
    await watcher()

asyncio.run(main())
