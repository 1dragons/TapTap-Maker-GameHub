"""Read-only loopback preview of the public SOP reader and its resources."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import argparse
import webbrowser

ROOT = Path(__file__).resolve().parents[1]


class Reader(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = Path(unquote(urlsplit(self.path).path).lstrip('/'))
        if '..' in path.parts or any(p.startswith('.') for p in path.parts):
            self.send_error(403); return
        if path.parts and path.parts[0] not in ('portal', 'docs', 'library', 'samples', 'README.md'):
            self.send_error(404); return
        super().do_GET()

    def do_HEAD(self):
        # Same allowlist as GET, without serving filesystem listings.
        path = Path(unquote(urlsplit(self.path).path).lstrip('/'))
        if '..' in path.parts or any(p.startswith('.') for p in path.parts):
            self.send_error(403); return
        if path.parts and path.parts[0] not in ('portal', 'docs', 'library', 'samples', 'README.md'):
            self.send_error(404); return
        super().do_HEAD()

    def list_directory(self, path):
        self.send_error(403, 'Directory listing disabled')
        return None


if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--open',action='store_true',help='Open the local reader when explicitly launched by the user')
    args=parser.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),partial(Reader,directory=str(ROOT)))
    url=f'http://127.0.0.1:{server.server_address[1]}/portal/index.html'
    print(url,flush=True)
    if args.open:
        webbrowser.open(url)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
