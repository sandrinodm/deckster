"""A local HTTP server for the fetch tests: a "public site" that names hostile resources, and an "internal
service" that must never be reached. Loopback only."""
from __future__ import annotations

import http.server
import threading
import time

import _helpers as H


class Site(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True

    def __init__(self, port: int, routes: dict):
        self.routes, self.hits = routes, []
        super().__init__(("127.0.0.1", port), _Handler)
        threading.Thread(target=self.serve_forever, daemon=True).start()

    def stop(self) -> None:
        self.shutdown()
        self.server_close()


class _Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def log_message(self, *args) -> None:
        pass

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        self.server.hits.append(path)
        route = self.server.routes.get(path)
        if route is None:
            self.send_error(404)
            return
        status, headers, body = route(self) if callable(route) else route
        self.send_response(status)
        for key, value in headers.items():
            self.send_header(key, value)
        self.end_headers()
        try:
            if callable(body):
                body(self.wfile)
            else:
                self.wfile.write(body)
        except OSError:
            pass


def ok(content_type: str, body: bytes):
    return (200, {"Content-Type": content_type, "Content-Length": str(len(body))}, body)


def redirect(location: str, status: int = 302):
    return (status, {"Location": location, "Content-Length": "0"}, b"")


def endless(wfile) -> None:
    wfile.write(H.PNG)
    for _ in range(40):
        wfile.write(b"\x00" * (1024 * 1024))


def drip(wfile) -> None:
    wfile.write(H.PNG[:8])
    wfile.flush()
    for _ in range(40):
        time.sleep(0.25)
        wfile.write(b"\x00")
        wfile.flush()
