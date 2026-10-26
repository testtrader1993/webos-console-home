#!/usr/bin/env python3
"""Pair with the TV and store the client key in TV_KEY_FILE.
Usage: TV_HOST=192.168.1.20 python3 pair.py
Accept the prompt that appears on the TV."""
import asyncio
import json

from aiowebostv import WebOsClient

from tvconfig import KEY_FILE, tv_host


async def main():
    client = WebOsClient(tv_host())
    await client.connect()  # shows the pairing prompt on the TV
    key = client.client_key
    await client.disconnect()
    if not key:
        raise SystemExit("Pairing failed: no client key received.")
    KEY_FILE.write_text(json.dumps({"client-key": key}))
    KEY_FILE.chmod(0o600)
    print("Client key saved to %s" % KEY_FILE)


asyncio.run(main())
