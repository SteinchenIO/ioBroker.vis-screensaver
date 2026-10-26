"""
Test des Verkleinerungs-Werkzeugs www/tools/resize.html in einem echten Chromium.
Start:  python3 test/resize.test.py
"""
import io
import pathlib
import sys
import tempfile
import time
import zipfile

from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from support import start_server, default_data  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

failures = []


def check(name, ok, info=''):
    print(('  ok   ' if ok else '  FAIL ') + name + ('' if ok else f'  [{info}]'))
    if not ok:
        failures.append(name)


tmp = pathlib.Path(tempfile.mkdtemp(prefix='resize-'))
# Testbilder
big = Image.effect_noise((4000, 3000), 40).convert('RGB')
big.save(tmp / 'Großes Foto (1).jpg', quality=95)
Image.new('RGB', (3000, 2000), (200, 40, 40)).save(tmp / 'portrait raw.jpg')
# EXIF-Orientation 6 = 90 Grad drehen: gespeichert 3000x2000, angezeigt 2000x3000
rot = Image.new('RGB', (3000, 2000), (40, 160, 60))
exif = Image.Exif(); exif[274] = 6
rot.save(tmp / 'rotiert.jpg', exif=exif)
Image.new('RGBA', (800, 600), (50, 80, 200, 128)).save(tmp / 'alpha.png')
Image.new('RGB', (400, 300), (10, 10, 10)).save(tmp / 'klein.png')
(tmp / 'kaputt.jpg').write_bytes(b'kein bild')
Image.new('RGB', (900, 900), (9, 9, 9)).save(tmp / 'Großes Foto 1.jpg')  # Namenskollision nach Bereinigung

server, port = start_server(default_data(), b'<html></html>')
url = f'http://127.0.0.1:{port}/adapter/vis-screensaver/tools/resize.html'
errors = []

print('Verkleinerungs-Werkzeug')
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(accept_downloads=True, viewport={'width': 1100, 'height': 900})
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(url)

    def wait_done(n):
        page.wait_for_function('document.querySelector("#summary").textContent.includes("fertig") || document.querySelector("#summary").textContent.includes("Kein Bild")', timeout=60000)
        time.sleep(0.3)

    page.set_input_files('#files', [str(tmp / n) for n in
        ['Großes Foto (1).jpg', 'Großes Foto 1.jpg', 'portrait raw.jpg', 'rotiert.jpg', 'alpha.png', 'klein.png', 'kaputt.jpg']])
    wait_done(6)

    rows = page.eval_on_selector_all('.row[data-out]', 'els => els.map(e => [e.dataset.out, +e.dataset.w, +e.dataset.h])')
    byname = {r[0]: r for r in rows}
    check('6 gültige Bilder, 1 Fehlerzeile', len(rows) == 6 and page.locator('.row .err').count() == 1, rows)
    check('Dateinamen bereinigt und eindeutig',
          sorted(byname) == sorted(['Grosses-Foto-1.jpg', 'Grosses-Foto-1-2.jpg', 'portrait-raw.jpg', 'rotiert.jpg', 'alpha.jpg', 'klein.jpg']), sorted(byname))
    check('4000x3000 wird auf 1600x1000 zugeschnitten', byname['Grosses-Foto-1.jpg'][1:] == [1600, 1000], byname['Grosses-Foto-1.jpg'])
    check('EXIF-Drehung: 3000x2000 -> hochkant, Zuschnitt 1600x1000', byname['rotiert.jpg'][1:] == [1600, 1000], byname['rotiert.jpg'])
    check('kleines Bild wird nicht vergrößert (nur zugeschnitten: 400x250)', byname['klein.jpg'][1:] == [400, 250], byname['klein.jpg'])
    check('Zusammenfassung zeigt nicht lesbar', 'nicht lesbar' in page.inner_text('#summary'), page.inner_text('#summary'))

    # ZIP
    with page.expect_download() as dl:
        page.click('#zip')
    zpath = tmp / 'out.zip'
    dl.value.save_as(zpath)
    with zipfile.ZipFile(zpath) as z:
        check('ZIP ist gültig (CRC)', z.testzip() is None)
        names = sorted(z.namelist())
        check('ZIP enthält 6 Dateien', len(names) == 6, names)
        im = Image.open(io.BytesIO(z.read('Grosses-Foto-1.jpg')))
        check('ZIP-Bild hat 1600x1000', im.size == (1600, 1000), im.size)
        check('ZIP-Bild ist kleiner als das Original', len(z.read('Grosses-Foto-1.jpg')) < (tmp / 'Großes Foto (1).jpg').stat().st_size)

    # Contain-Modus mit EXIF-gedrehtem Bild: 2000x3000 -> 667x1000
    page.select_option('#mode', 'contain')
    time.sleep(0.6)
    wait_done(6)
    rows = page.eval_on_selector_all('.row[data-out]', 'els => els.map(e => [e.dataset.out, +e.dataset.w, +e.dataset.h])')
    byname = {r[0]: r for r in rows}
    check('Einpassen: gedrehtes Bild 667x1000', byname['rotiert.jpg'][1:] == [667, 1000], byname.get('rotiert.jpg'))
    check('Einpassen: 4000x3000 -> 1333x1000', byname['Grosses-Foto-1.jpg'][1:] == [1333, 1000], byname.get('Grosses-Foto-1.jpg'))

    # Preset 1280x800 + WebP
    page.select_option('#preset', '1280x800')
    page.select_option('#format', 'image/webp')
    page.select_option('#mode', 'cover')
    time.sleep(0.6)
    wait_done(6)
    rows = page.eval_on_selector_all('.row[data-out]', 'els => els.map(e => [e.dataset.out, +e.dataset.w, +e.dataset.h])')
    byname = {r[0]: r for r in rows}
    check('WebP-Endung und 1280x800', 'Grosses-Foto-1.webp' in byname and byname['Grosses-Foto-1.webp'][1:] == [1280, 800], list(byname))

    # Liste leeren
    page.click('#clear')
    time.sleep(0.4)
    check('Liste leeren entfernt alles', page.locator('.row').count() == 0 and page.is_disabled('#zip'))
    check('keine JavaScript-Fehler', not errors, errors)
    b.close()

server.shutdown()
print(f"\n{'Alle Tests bestanden' if not failures else str(len(failures)) + ' fehlgeschlagen: ' + ', '.join(failures)}")
sys.exit(1 if failures else 0)
