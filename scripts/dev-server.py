#!/usr/bin/env python3
"""Local dev server that mimics Cloudflare Workers Assets' clean-URL handling
(e.g. /weather -> weather.html), so the topbar's nav links work the same way
locally as they do in production.

Usage: python scripts/dev-server.py [port]   (default port 8080 — required by
the Worker's ALLOWED_ORIGINS CORS allowlist, see CLAUDE.md)
"""
import contextlib
import http.server
import os
import socket
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class CleanUrlHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=REPO_ROOT, **kwargs)

    def translate_path(self, path):
        full_path = super().translate_path(path)
        if not os.path.exists(full_path) and not os.path.splitext(full_path)[1]:
            html_path = full_path + ".html"
            if os.path.exists(html_path):
                return html_path
        return full_path


class DualStackServer(http.server.ThreadingHTTPServer):
    # Same trick `python -m http.server` uses: bind the IPv6 wildcard but
    # allow IPv4 connections in too, so both localhost and 127.0.0.1 work
    # (the Worker's CORS allowlist checks both — see CLAUDE.md).
    def server_bind(self):
        with contextlib.suppress(Exception):
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        return super().server_bind()


if __name__ == "__main__":
    http.server.test(HandlerClass=CleanUrlHandler, ServerClass=DualStackServer, port=PORT)
