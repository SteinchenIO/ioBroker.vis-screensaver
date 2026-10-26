"""
Gemeinsame Hilfen für die Browser-Tests: kleiner Webserver und Testbilder.

Der Server liefert
  /test.html                       die übergebene Testseite
  /vis-screensaver/<Datei>         Dateien aus www/ (Skript, Widget, Logo)
  /adapter/vis-screensaver/<Datei> Dateien aus admin/ (Foto-Werkzeug)
  /vis-screensaver.0/config.json   DATA['config']  (während des Tests änderbar)
  /vis-screensaver.0/state.json    DATA['state']
  /vis.0/slideshow/<1|2|3>.jpg     einfarbige Testbilder
  /jquery.js                       lokale jQuery-Kopie (für den Widget-Test)
"""
import http.server
import io
import json
import mimetypes
import pathlib
import threading

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
WWW = ROOT / 'www'
ADMIN = ROOT / 'admin'
JQUERY = pathlib.Path('/usr/share/javascript/jquery/jquery.min.js')

COLORS = {'1.jpg': (200, 40, 40), '2.jpg': (40, 160, 60), '3.jpg': (50, 80, 200)}


def _make_image(color):
    buf = io.BytesIO()
    Image.new('RGB', (1280, 800), color).save(buf, 'JPEG', quality=90)
    return buf.getvalue()


IMAGES = {name: _make_image(c) for name, c in COLORS.items()}


def default_data():
    return {
        'config': {
            'rev': 1, 'idleSeconds': 5, 'slideSeconds': 4, 'fadeSeconds': 1.5,
            'shuffle': False, 'fit': 'cover', 'kenBurns': True, 'showClock': True,
            'images': [f'/vis.0/slideshow/{n}' for n in COLORS],
        },
        'state': {'rev': 1, 'enabled': True, 'startAt': 1000, 'stopAt': 1000},
    }


def start_server(data, page):
    """Startet den Server in einem Thread. Liefert (server, port)."""

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def send(self, code, body=b'', ctype='text/plain'):
            self.send_response(code)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            path = self.path.split('?')[0]
            if path == '/test.html':
                return self.send(200, page, 'text/html; charset=utf-8')
            if path == '/jquery.js':
                return self.send(200, JQUERY.read_bytes(), 'application/javascript')
            if path.startswith('/vis-screensaver/'):
                rel = path[len('/vis-screensaver/'):]
                target = (WWW / rel).resolve()
                if WWW in target.parents and target.is_file():
                    ctype = mimetypes.guess_type(target.name)[0] or 'application/octet-stream'
                    if target.suffix == '.js':
                        ctype = 'application/javascript'
                    return self.send(200, target.read_bytes(), ctype)
            if path.startswith('/adapter/vis-screensaver/'):
                target = (ADMIN / path[len('/adapter/vis-screensaver/'):]).resolve()
                if ADMIN in target.parents and target.is_file():
                    return self.send(200, target.read_bytes(), mimetypes.guess_type(target.name)[0] or 'application/octet-stream')
            if path == '/vis-screensaver.0/config.json':
                return self.send(200, json.dumps(data['config']).encode(), 'application/json')
            if path == '/vis-screensaver.0/state.json':
                return self.send(200, json.dumps(data['state']).encode(), 'application/json')
            if path.startswith('/vis.0/slideshow/'):
                name = path.rsplit('/', 1)[1]
                if name in IMAGES:
                    return self.send(200, IMAGES[name], 'image/jpeg')
            return self.send(404)

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, server.server_address[1]


def close(rgb, expected, tol=45):
    return all(abs(a - b) <= tol for a, b in zip(rgb, expected))
