#!/usr/bin/env python3
"""Local dev server: no-cache headers, HTTP range support, LAN-visible.

Three things `python3 -m http.server` gets wrong for this project:

1. No Cache-Control header, so Safari applies heuristic caching and can
   serve an index.html from early in development no matter how many times
   the file changes on disk. Every response here is explicitly no-store.

2. No Range request support. iOS Safari will not play a video element
   unless the server answers with 206 Partial Content — it probes with a
   range request first and gives up on a 200. Without this, video works on
   the deployed site (Netlify handles ranges) but silently fails when
   testing locally from a phone.

3. Binds loopback only, so a phone on the same Wi-Fi can't reach it.
   This binds 0.0.0.0 and prints the LAN URL to open on the phone.
"""
import http.server
import os
import re
import socket
import sys

PORT = 8743


class DevHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def send_head(self):
        """Serve a byte range when asked; otherwise fall back to the default."""
        rng = self.headers.get("Range")
        if not rng:
            return super().send_head()

        path = self.translate_path(self.path)
        if os.path.isdir(path) or not os.path.isfile(path):
            return super().send_head()

        m = re.match(r"bytes=(\d*)-(\d*)\s*$", rng.strip())
        if not m:
            return super().send_head()

        size = os.path.getsize(path)
        start_s, end_s = m.group(1), m.group(2)
        if start_s == "":
            # Suffix form: "bytes=-500" means the last 500 bytes.
            if end_s == "":
                return super().send_head()
            length = min(int(end_s), size)
            start, end = size - length, size - 1
        else:
            start = int(start_s)
            end = int(end_s) if end_s else size - 1

        if start >= size or start > end:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None

        end = min(end, size - 1)
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        # copyfile() streams to EOF, so hand it only the requested slice.
        return _Slice(f, end - start + 1)

    def log_message(self, fmt, *args):
        if "?" in self.path or self.path.endswith((".mp4", ".html")):
            super().log_message(fmt, *args)


class _Slice:
    """File wrapper that stops after n bytes, for ranged responses."""

    def __init__(self, f, remaining):
        self.f, self.remaining = f, remaining

    def read(self, n=-1):
        if self.remaining <= 0:
            return b""
        if n < 0 or n > self.remaining:
            n = self.remaining
        data = self.f.read(n)
        self.remaining -= len(data)
        return data

    def close(self):
        self.f.close()


def lan_ip():
    """Best-guess LAN address: the source IP used to reach the outside world."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


if __name__ == "__main__":
    ip = lan_ip()
    with http.server.ThreadingHTTPServer(("0.0.0.0", PORT), DevHandler) as httpd:
        print(f"  this mac : http://localhost:{PORT}")
        if ip:
            print(f"  phone    : http://{ip}:{PORT}   <- same Wi-Fi")
        else:
            print("  phone    : could not determine LAN IP")
        sys.stdout.flush()
        httpd.serve_forever()
