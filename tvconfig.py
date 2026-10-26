"""Shared configuration, read from environment variables."""
import json
import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
KEY_FILE = pathlib.Path(os.environ.get("TV_KEY_FILE") or ROOT / "client_key.json")
APP_ID = os.environ.get("APP_ID", "io.github.webosconsole.home")
HUB_PORT = int(os.environ.get("HUB_PORT", "8787"))


def tv_host():
    host = os.environ.get("TV_HOST")
    if not host:
        sys.exit("TV_HOST is not set. Export the IP address of your TV, e.g. TV_HOST=192.168.1.20")
    return host


def client_key():
    try:
        return json.loads(KEY_FILE.read_text())["client-key"]
    except FileNotFoundError:
        sys.exit("Key file %s not found. Run pair.py first." % KEY_FILE)
