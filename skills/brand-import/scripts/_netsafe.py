"""One guarded way to fetch anything a web page names.

A page under extraction chooses its own favicon, logo, stylesheet and font URLs. Fetched blindly,
`<link rel="icon" href="file:///Users/me/.ssh/id_rsa">` copies a key into the output folder, and
`http://169.254.169.254/` or `http://localhost:8080/admin` turns the extractor into a probe of the
user's machine and network. Everything page-derived therefore goes through `fetch()`:

- `http:` and `https:` only. `file:` is read only for a local source the user passed on the command
  line, and only for files inside that source's own folder.
- The host is resolved and every address it has must be public: loopback, private, link-local,
  carrier-grade NAT, multicast, reserved and unspecified addresses are refused, for IPv4 and IPv6,
  including IPv4-mapped, NAT64 and 6to4 forms. The connection is then made to the address that was
  checked (not resolved a second time), so a DNS answer cannot change between check and connect.
- At most three redirects, each hop checked the same way.
- A byte cap per resource, a cap on the whole run, and a wall-clock timeout.
- For images and fonts the content type and the first bytes must agree with what was asked for.
- No cookies or credentials are sent, and the caller names the output file; nothing from the URL
  becomes a file name.

An origin (`http://127.0.0.1:5960`) can be allowed explicitly, for a site the user runs locally.
Nothing is allowed by default.

The browser that loads the page is held to the same rule: it is launched behind `start_proxy()`,
a small filtering proxy on loopback that resolves, checks and connects to the checked address for
every connection the browser makes (redirect hops and the page's own `fetch()` included), and
`guard_context()` refuses the schemes a proxy never sees (`file:` and the like).

What remains open: a page can still make the browser talk to any public host (that is what loading
a page is); UDP traffic (WebRTC) does not pass through an HTTP proxy, so extract_web.py turns it
off with launch flags and cannot verify the browser obeyed; and a host that is public today but
points at an internal service through the public internet is indistinguishable from any other.

Standard library only (Playwright objects are passed in, never imported).
"""
from __future__ import annotations

import http.client
import ipaddress
import os
import select
import socket
import socketserver
import ssl
import threading
import time
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit

import _filesafe as F

MAX_REDIRECTS = 3
USER_AGENT = "Mozilla/5.0 (compatible; brand-import)"
IMAGE_KINDS = ("svg", "png", "webp", "jpg", "gif", "ico")
FONT_KINDS = ("woff2", "woff", "ttf", "otf")
_IMAGE_TYPES = {"image/svg+xml": ("svg",), "image/png": ("png",), "image/webp": ("webp",), "image/jpeg": ("jpg",), "image/gif": ("gif",),
                "image/x-icon": ("ico", "png"), "image/vnd.microsoft.icon": ("ico", "png")}
_FONT_TYPES = ("font/", "application/font-", "application/x-font-", "application/octet-stream", "binary/octet-stream")
_NAT64 = ipaddress.ip_network("64:ff9b::/96")
_SIXTOFOUR = ipaddress.ip_network("2002::/16")


class Blocked(Exception):
    """A URL was not fetched; the message says why."""


def is_public_address(text: str) -> bool:
    """Whether an IP address is one on the public internet."""
    try:
        ip = ipaddress.ip_address(text.split("%", 1)[0])
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped is not None:
            return is_public_address(str(ip.ipv4_mapped))
        if ip in _NAT64:
            return is_public_address(str(ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)))
        if ip in _SIXTOFOUR:
            return is_public_address(str(ipaddress.IPv4Address((int(ip) >> 80) & 0xFFFFFFFF)))
    if ip.is_loopback or ip.is_private or ip.is_link_local or ip.is_multicast or ip.is_unspecified or ip.is_reserved:
        return False
    if getattr(ip, "is_site_local", False):
        return False
    return bool(ip.is_global)


def origin_of(url: str) -> str | None:
    """`scheme://host:port` in lower case with the default port written out, or None when the URL has none."""
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        return None
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return None
    return f"{parts.scheme}://{parts.hostname.lower()}:{port or (443 if parts.scheme == 'https' else 80)}"


class Policy:
    """What may be fetched in one extraction run, and the record of what was refused."""

    def __init__(self, allow_origins=(), local_root: Path | None = None, max_bytes: int = 8 * 1024 * 1024,
                 max_total_bytes: int = 64 * 1024 * 1024, timeout: float = 15.0, max_redirects: int = MAX_REDIRECTS):
        self.allow_origins = set()
        self._allow_hosts = set()
        for origin in allow_origins:
            normal = origin_of(origin)
            if normal is None:
                raise ValueError(f"not an http(s) origin: {origin!r}")
            self.allow_origins.add(normal)
            self._allow_hosts.add(normal.split("://", 1)[1])
        self.local_root = Path(os.path.realpath(local_root)) if local_root is not None else None
        self.max_bytes, self.max_total_bytes, self.timeout, self.max_redirects = max_bytes, max_total_bytes, timeout, max_redirects
        self.total = 0
        self.max_tunnel_bytes = 256 * 1024 * 1024
        self.blocked: list[dict] = []
        self._verdicts: dict[str, str | None] = {}

    def record(self, url: str, reason: str, by: str = "fetch") -> None:
        entry = {"url": url[:300], "reason": reason, "by": by}
        if entry not in self.blocked and len(self.blocked) < 200:
            self.blocked.append(entry)

    def resolve(self, url: str) -> tuple[str, str, int, str, str]:
        """(scheme, host, port, address to connect to, path and query) for a URL that may be fetched."""
        try:
            parts = urlsplit(url)
            port = parts.port
        except ValueError:
            raise Blocked("not a valid URL") from None
        if parts.scheme not in ("http", "https"):
            raise Blocked(f"scheme {parts.scheme or '(none)'}: only http and https are fetched")
        if parts.username is not None or parts.password is not None:
            raise Blocked("credentials in the URL")
        host = parts.hostname
        if not host:
            raise Blocked("no host")
        port = port or (443 if parts.scheme == "https" else 80)
        address, port = self.address_for(host, port)
        target = parts.path or "/"
        if parts.query:
            target += "?" + parts.query
        return parts.scheme, host, port, address, target

    def address_for(self, host: str, port: int) -> tuple[str, int]:
        """The address to connect to for a host, after checking every address the name has."""
        if not 0 < port < 65536:
            raise Blocked("no such port")
        try:
            infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        except (socket.gaierror, UnicodeError) as exc:
            raise Blocked(f"the host does not resolve ({exc})") from None
        addresses = sorted(dict.fromkeys(info[4][0] for info in infos), key=lambda a: ":" in a)
        if not addresses:
            raise Blocked("the host does not resolve")
        if f"{host.lower()}:{port}" not in self._allow_hosts:
            private = [a for a in addresses if not is_public_address(a)]
            if private:
                raise Blocked(f"{host} resolves to {private[0]}, which is not a public address (loopback, private, link-local or reserved)")
        return addresses[0], port

    def browser_verdict(self, url: str) -> str | None:
        """Why the browser may not request a URL, or None when it may."""
        try:
            scheme = urlsplit(url).scheme.lower()
        except ValueError:
            return "not a valid URL"
        if scheme in ("data", "blob", "about"):
            return None
        if scheme == "file":
            try:
                self.local_path(url)
                return None
            except Blocked as exc:
                return str(exc)
        if scheme not in ("http", "https"):
            return f"scheme {scheme or '(none)'}: only http and https are loaded"
        key = origin_of(url) or url
        if key not in self._verdicts:
            try:
                self.resolve(url)
                self._verdicts[key] = None
            except Blocked as exc:
                self._verdicts[key] = str(exc)
        return self._verdicts[key]

    def local_path(self, url: str) -> str:
        """The real path of a `file:` URL inside the local source's folder."""
        if self.local_root is None:
            raise Blocked("file: URL named by a page; local files are read only for a local source passed on the command line")
        try:
            parts = urlsplit(url)
        except ValueError:
            raise Blocked("not a valid URL") from None
        if parts.netloc not in ("", "localhost"):
            raise Blocked("file: URL with a host")
        real = os.path.realpath(unquote(parts.path))
        root = str(self.local_root)
        if real != root and os.path.commonpath([root, real]) != root:
            raise Blocked("file: URL outside the local source's folder")
        return real


class _Pinned(http.client.HTTPConnection):
    """An HTTP connection to an address that was already checked, whatever the name resolves to now."""

    def __init__(self, host: str, port: int, address: str, timeout: float):
        super().__init__(host, port, timeout=timeout)
        self._address = address

    def connect(self) -> None:
        self.sock = socket.create_connection((self._address, self.port), self.timeout)


class _PinnedTLS(_Pinned):
    default_port = 443

    def connect(self) -> None:
        super().connect()
        self.sock = ssl.create_default_context().wrap_socket(self.sock, server_hostname=self.host)


def _check_kind(kind: str | None, content_type: str, data: bytes) -> str | None:
    """The detected kind of a body, after checking it against what was asked for. Raises Blocked."""
    ctype = content_type.split(";", 1)[0].strip().lower()
    found = F.sniff(data)
    if kind == "image":
        if ctype not in _IMAGE_TYPES:
            raise Blocked(f"content type {ctype or '(none)'} is not an image")
        if found not in _IMAGE_TYPES[ctype]:
            raise Blocked(f"the content does not start as {ctype} does")
        return found
    if kind == "font":
        if not ctype.startswith(_FONT_TYPES):
            raise Blocked(f"content type {ctype or '(none)'} is not a font")
        if found not in FONT_KINDS:
            raise Blocked("the content does not start as a font file does")
        return found
    if kind == "css":
        if ctype != "text/css":
            raise Blocked(f"content type {ctype or '(none)'} is not a stylesheet")
        return "css"
    return found


def fetch(url: str, policy: Policy, kind: str | None = None, max_bytes: int | None = None) -> tuple[bytes, str | None]:
    """GET a URL under the policy. Returns (body, detected kind); raises Blocked and records why.

    `kind` is "image", "font", "css" or None (no content check).
    """
    limit = min(max_bytes or policy.max_bytes, policy.max_bytes)
    start = url
    try:
        if url[:5].lower() == "file:":
            return _read_local(url, policy, kind, limit)
        deadline = time.monotonic() + policy.timeout
        for _hop in range(policy.max_redirects + 1):
            scheme, host, port, address, target = policy.resolve(url)
            if policy.total >= policy.max_total_bytes:
                raise Blocked(f"the run's download budget ({policy.max_total_bytes} bytes) is used up")
            conn = (_PinnedTLS if scheme == "https" else _Pinned)(host, port, address, max(0.5, deadline - time.monotonic()))
            try:
                conn.request("GET", target, headers={"User-Agent": USER_AGENT, "Accept": "*/*", "Accept-Encoding": "identity", "Connection": "close"})
                resp = conn.getresponse()
                if resp.status in (301, 302, 303, 307, 308):
                    location = resp.getheader("Location")
                    if not location:
                        raise Blocked(f"HTTP {resp.status} without a Location")
                    url = urljoin(url, location)
                    continue
                if resp.status != 200:
                    raise Blocked(f"HTTP {resp.status}")
                declared = resp.getheader("Content-Length")
                if declared and declared.isdigit() and int(declared) > limit:
                    raise Blocked(f"{declared} bytes, more than the {limit} byte limit for one resource")
                chunks, size = [], 0
                while True:
                    if time.monotonic() > deadline:
                        raise Blocked(f"slower than the {policy.timeout:g} s limit")
                    chunk = resp.read1(65536)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > limit:
                        raise Blocked(f"more than the {limit} byte limit for one resource")
                    chunks.append(chunk)
                data = b"".join(chunks)
                policy.total += size
                return data, _check_kind(kind, resp.getheader("Content-Type") or "", data)
            finally:
                conn.close()
        raise Blocked(f"more than {policy.max_redirects} redirects")
    except Blocked as exc:
        where = "" if url == start else f" (after a redirect to {url[:200]})"
        policy.record(start, str(exc) + where)
        raise
    except (OSError, http.client.HTTPException, ssl.SSLError) as exc:
        policy.record(start, f"request failed ({type(exc).__name__}: {str(exc)[:120]})")
        raise Blocked(f"request failed ({exc})") from None


def _read_local(url: str, policy: Policy, kind: str | None, limit: int) -> tuple[bytes, str | None]:
    real = policy.local_path(url)
    try:
        if not os.path.isfile(real) or os.path.getsize(real) > limit:
            raise Blocked("not a regular file within the size limit")
        data = Path(real).read_bytes()
    except OSError as exc:
        raise Blocked(f"cannot be read ({exc.strerror})") from None
    found = F.sniff(data)
    if kind == "image" and found not in IMAGE_KINDS:
        raise Blocked("the file does not start as an image does")
    if kind == "font" and found not in FONT_KINDS:
        raise Blocked("the file does not start as a font file does")
    if kind == "css" and not real.lower().endswith(".css"):
        raise Blocked("not a .css file")
    return data, "css" if kind == "css" else found


class _ProxyHandler(socketserver.BaseRequestHandler):
    """One connection from the browser: a CONNECT tunnel, or one plain-HTTP request and its response."""

    def handle(self) -> None:
        policy: Policy = self.server.policy  # type: ignore[attr-defined]
        client = self.request
        client.settimeout(30)
        head, url = b"", ""
        try:
            while b"\r\n\r\n" not in head:
                chunk = client.recv(65536)
                if not chunk or len(head) > 256 * 1024:
                    return
                head += chunk
            raw_head, _, rest = head.partition(b"\r\n\r\n")
            lines = raw_head.decode("latin-1").split("\r\n")
            method, _, tail = lines[0].partition(" ")
            target = tail.rsplit(" ", 1)[0]
            if method.upper() == "CONNECT":
                host, _, port = target.rpartition(":")
                url = f"https://{host}:{port}/"
                address, port_n = policy.address_for(host.strip("[]"), int(port))
                upstream = socket.create_connection((address, port_n), policy.timeout)
                client.sendall(b"HTTP/1.1 200 Connection established\r\n\r\n")
            else:
                url = target
                _scheme, host, port_n, address, path = policy.resolve(target)
                if _scheme != "http":
                    raise Blocked("only http is forwarded in plain form")
                upstream = socket.create_connection((address, port_n), policy.timeout)
                kept = [line for line in lines[1:] if line.split(":", 1)[0].strip().lower() not in ("proxy-connection", "connection", "proxy-authorization", "keep-alive")]
                upstream.sendall(("\r\n".join([f"{method} {path} HTTP/1.1", *kept, "Connection: close"]) + "\r\n\r\n").encode("latin-1") + rest)
        except Blocked as exc:
            policy.record(url, str(exc), by="browser")
            self._refuse(403, str(exc))
            return
        except (OSError, ValueError, IndexError) as exc:
            self._refuse(502, f"{type(exc).__name__}")
            return
        self._relay(client, upstream, policy)

    def _refuse(self, status: int, reason: str) -> None:
        body = f"brand-import blocked this request: {reason}\n".encode("utf-8", "replace")
        try:
            self.request.sendall(f"HTTP/1.1 {status} Blocked\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {len(body)}\r\nConnection: close\r\n\r\n".encode() + body)
        except OSError:
            pass

    @staticmethod
    def _relay(client, upstream, policy: "Policy") -> None:
        moved = 0
        try:
            while moved <= policy.max_tunnel_bytes:
                ready, _, _ = select.select([client, upstream], [], [], 60)
                if not ready:
                    break
                for sock in ready:
                    data = sock.recv(65536)
                    if not data:
                        return
                    moved += len(data)
                    (upstream if sock is client else client).sendall(data)
        except OSError:
            pass
        finally:
            upstream.close()


class _ProxyServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def start_proxy(policy: Policy, port: int = 0):
    """Start the filtering proxy the browser is launched behind. Returns (server, "http://127.0.0.1:<port>").

    Every connection the browser makes goes through it: the first request, every redirect hop,
    `fetch()` and XHR from the page's own scripts, WebSockets. For each one the proxy resolves the
    host, refuses non-public addresses (unless the origin was allowed explicitly) and then connects
    to the address it checked, so a DNS answer that changes afterwards (rebinding) has no effect.
    It listens on loopback only and stops with the process.
    """
    server = _ProxyServer(("127.0.0.1", port), _ProxyHandler)
    server.policy = policy  # type: ignore[attr-defined]
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}"


def guard_context(context, policy: Policy) -> None:
    """Refuse, inside a Playwright browser context, what the proxy never sees or should not be asked.

    Request interception sees the first URL of every request (not its redirect hops, which is why
    the proxy from `start_proxy()` is the enforcement point for hosts). Here: any scheme other than
    http, https, data, blob and about is aborted; `file:` is allowed only inside a local source's
    own folder; a host that resolves to a non-public address is aborted early so the report names
    the full URL; WebSockets are closed.
    """

    def on_route(route) -> None:
        url = route.request.url
        reason = policy.browser_verdict(url)
        if reason is None:
            route.continue_()
        else:
            policy.record(url, reason, by="browser")
            route.abort("blockedbyclient")

    context.route("**/*", on_route)
    if hasattr(context, "route_web_socket"):
        context.route_web_socket("**/*", lambda ws: (policy.record(ws.url, "WebSocket: not opened during extraction", by="browser"), ws.close()))
