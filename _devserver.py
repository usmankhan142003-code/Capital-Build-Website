#!/usr/bin/env python3
"""Local dev server that forces no-cache on every response.

Plain `python3 -m http.server` lets Safari (and other browsers) cache
HTML pages indefinitely with no explicit Cache-Control header, using
heuristic caching. That caused this project's index.html to get stuck
serving a version from early in development no matter how many times
the underlying files changed. This wrapper just adds headers that
make every response always re-fetch from disk.
"""
import http.server
import functools

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

if __name__ == "__main__":
    port = 8743
    handler = NoCacheHandler
    with http.server.ThreadingHTTPServer(("", port), handler) as httpd:
        print(f"Serving on http://localhost:{port} (no-cache headers on every response)")
        httpd.serve_forever()
