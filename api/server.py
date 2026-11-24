"""Development HTTP layer over the planner package: exactly one endpoint,

    GET /api/night?date=YYYY-MM-DD&lat=<float>&lon=<float>&tz=<IANA>

returning the §6 contract from docs/REQUIREMENTS.md. Standard library only —
the astronomy lives in planner/, and this file knows nothing about it beyond
that shape. Kept deliberately thin so the deployment decision (open question
1) stays reversible.

Run:  python -m api.server                     (default http://127.0.0.1:8642)
      python -m api.server --port 8700         (alternate port, see run.py)
"""

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

from planner import NightError, Site, compute_night, night_payload

HOST, PORT = "127.0.0.1", 8642


def build_response(params):
    """params: parsed query dict of lists. Returns (status, payload)."""
    def one(name):
        vals = params.get(name)
        return vals[0] if vals else None

    try:
        lat = float(one("lat") or 50.0875)
        lon = float(one("lon") or 14.4213)
    except ValueError:
        return 422, {"error": {"code": "bad_number", "message": "lat/lon must be numbers"}}

    site = Site(lat, lon, one("tz") or "Europe/Prague")
    date = one("date")
    pivot = site.localize_noon(date) if date else site.today_noon()
    return 200, night_payload(compute_night(site, pivot))


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        url = urlparse(self.path)
        if url.path != "/api/night":
            self._send(404, {"error": {"code": "not_found", "message": "unknown path"}})
            return
        try:
            status, payload = build_response(parse_qs(url.query))
        except NightError as exc:
            self._send(422, {"error": {"code": exc.code, "message": str(exc)}})
            return
        except Exception as exc:  # keep the dev server alive; report honestly
            self._send(500, {"error": {"code": "internal", "message": f"{type(exc).__name__}: {exc}"}})
            return
        self._send(status, payload)

    def _send(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        # The dev server and the web app run on different ports.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass  # quiet: one request per chart interaction would spam the console


def main():
    ap = argparse.ArgumentParser(description="Unphased planner API.")
    ap.add_argument("--host", default=HOST)
    ap.add_argument("--port", type=int, default=PORT)
    args = ap.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"planner api on http://{args.host}:{args.port}/api/night")
    server.serve_forever()


if __name__ == "__main__":
    main()
