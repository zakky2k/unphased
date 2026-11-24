"""Unphased launcher — one command, both processes.

    python run.py            start the planner API and the web app, then print the URL
    python run.py --no-open  same, without opening a browser window

It starts `api.server` (astropy, on 127.0.0.1:8642) and the Next.js server for
the built web app in one console, waits until both answer, opens the page, and
shuts the children down cleanly if either of them dies or you press Ctrl+C.

Nothing here reaches the network beyond localhost: the astronomy is computed on
this machine and the browser loads from this machine.

Run from the repository (or release) root with a Python that has the
requirements installed. `--web` overrides where the built app lives, for people
who keep it somewhere else.
"""

import argparse
import os
import shutil
import socket
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
API_HOST, API_PORT = "127.0.0.1", 8642
WEB_HOST, WEB_PORT = "127.0.0.1", 4101


def find_web_dir(override: str | None) -> Path:
    """The built app, in the order a release user is most likely to have it."""
    if override:
        return Path(override).resolve()
    candidates = [
        ROOT / "web-standalone",           # packaged release layout
        ROOT / "web" / "app" / ".next" / "standalone",  # built from source
    ]
    for c in candidates:
        if (c / "server.js").exists():
            return c
    raise SystemExit(
        "No built web app found.\n"
        f"  looked in: {', '.join(str(c) for c in candidates)}\n"
        "  Build it first:  cd web\\app && npm install && npm run build\n"
        "  Or develop against the dev server instead:  cd web\\app && npm run dev"
    )


def find_node() -> str:
    node = shutil.which("node")
    if not node:
        raise SystemExit(
            "node is not on PATH. Unphased's front end needs Node.js 20 or newer "
            "(https://nodejs.org). Install it and run this again."
        )
    return node


def port_free(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((host, port)) != 0


def wait_for_http(url: str, timeout: float = 30.0) -> bool:
    """Poll until the server answers anything — a 404 still means it is up."""
    import urllib.error
    import urllib.request

    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as res:
                return 200 <= res.status < 500
        except urllib.error.HTTPError:
            return True
        except Exception:
            time.sleep(0.25)
    return False


def terminate(proc: subprocess.Popen) -> None:
    if proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


def main() -> int:
    ap = argparse.ArgumentParser(description="Run the Unphased night planner locally.")
    ap.add_argument("--web", help="folder containing server.js for the built app")
    ap.add_argument("--api-port", type=int, default=API_PORT)
    ap.add_argument("--web-port", type=int, default=WEB_PORT)
    ap.add_argument("--no-open", action="store_true", help="do not open a browser window")
    args = ap.parse_args()

    web_dir = find_web_dir(args.web)
    node = find_node()

    for label, port in (("planner API", args.api_port), ("web app", args.web_port)):
        if not port_free("127.0.0.1", port):
            print(f"Port {port} is already in use ({label}). Close whatever holds it "
                  f"or pass --{label.split()[0].lower()}-port.", file=sys.stderr)
            return 1

    # The browser-side base URL is baked in at build time, so the API has to sit
    # where the bundle expects it. NEXT_PUBLIC_API_BASE keeps them in step.
    api_base = f"http://{API_HOST}:{args.api_port}"
    env = os.environ.copy()
    env.setdefault("NEXT_PUBLIC_API_BASE", api_base)

    api = subprocess.Popen(
        [sys.executable, "-m", "api.server", "--port", str(args.api_port)],
        cwd=str(ROOT), env=env,
    )
    web = subprocess.Popen(
        [node, str(web_dir / "server.js")],
        cwd=str(web_dir),
        env={**env, "HOSTNAME": WEB_HOST, "PORT": str(args.web_port),
             "NODE_ENV": "production"},
    )

    url = f"http://{WEB_HOST}:{args.web_port}/"
    try:
        if not wait_for_http(f"{api_base}/api/night"):
            print("The planner API did not come up on "
                  f"{api_base}. See its output above.", file=sys.stderr)
            return 1
        if not wait_for_http(url):
            print(f"The web app did not come up on {url}. See its output above.",
                  file=sys.stderr)
            return 1

        print(f"\n  Unphased is running:  {url}")
        print(f"  planner API:          {api_base}/api/night")
        print("  Ctrl+C to stop both.\n")
        if not args.no_open:
            webbrowser.open(url)

        while True:
            for name, proc in (("planner API", api), ("web app", web)):
                code = proc.poll()
                if code is not None:
                    print(f"\n{name} exited with code {code}; stopping the other one.",
                          file=sys.stderr)
                    return code or 1
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nstopping Unphased.")
        return 0
    finally:
        terminate(web)
        terminate(api)


if __name__ == "__main__":
    raise SystemExit(main())
