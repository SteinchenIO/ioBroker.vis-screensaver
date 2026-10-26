"""
Test des Browser-Skripts www/screensaver.js in einem echten Chromium.

Ein kleiner Webserver liefert die Testseite, das Skript, config.json, state.json
und drei einfarbige Testbilder aus. Die Dateien config.json / state.json lassen
sich während des Tests ändern, so wie es der Adapter tut.

Start:  python3 test/browser.test.py [Ordner für Screenshots]
"""
import io
import json
import pathlib
import sys
import time

from PIL import Image
from playwright.sync_api import sync_playwright

SHOTS = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from support import COLORS, close, default_data, start_server  # noqa: E402

PAGE = b"""<!doctype html><html><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#fff">
<button id="btn" style="position:absolute;left:100px;top:100px;width:200px;height:100px">Klick</button>
<script>window.clicks=0;document.getElementById('btn').onclick=function(){window.clicks++};</script>
<script src="/vis-screensaver/screensaver.js"></script>
</body></html>"""

DATA = default_data()
server, PORT = start_server(DATA, PAGE)

failures = []


def check(name, cond, detail=''):
    print(f"  {'ok  ' if cond else 'FAIL'} {name}{' – ' + str(detail) if detail and not cond else ''}")
    if not cond:
        failures.append(name)



with sync_playwright() as p:
    browser = p.chromium.launch(args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))

    def active():
        return page.evaluate('window.IoBScreensaver && IoBScreensaver.isActive()')

    def wait_for(fn, timeout, step=0.1):
        end = time.time() + timeout
        while time.time() < end:
            if fn():
                return True
            time.sleep(step)
        return False

    def pixel():
        shot = Image.open(io.BytesIO(page.screenshot())).convert('RGB')
        return shot.getpixel((20, 20))

    def layers():
        return page.evaluate(
            """() => [...document.querySelectorAll('#iob-ss img')].map(i => ({
                src: (i.getAttribute('src') || '').split('/').pop(),
                opacity: parseFloat(getComputedStyle(i).opacity),
                z: i.style.zIndex }))"""
        )

    def shot(name):
        if SHOTS:
            SHOTS.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(SHOTS / name))

    print('Browser-Tests')

    # --- Leerlauf ---------------------------------------------------------
    t0 = time.time()
    page.goto(f'http://127.0.0.1:{PORT}/test.html')
    page.wait_for_function('window.IoBScreensaver')
    time.sleep(2)
    check('startet nicht vor Ablauf der Leerlaufzeit', not active())
    started = wait_for(active, 10)
    elapsed = time.time() - t0
    check('startet nach der Leerlaufzeit (5 s)', started and 4.5 <= elapsed <= 8.5, f'{elapsed:.1f} s')

    time.sleep(2.6)
    shot('01_erstes_bild.png')
    check('zeigt das erste Bild vollständig', close(pixel(), COLORS['1.jpg']), pixel())
    clock_visible = page.evaluate("getComputedStyle(document.querySelector('#iob-ss .iob-clock')).display !== 'none'")
    check('zeigt die Uhr', clock_visible)

    # --- Überblendung -----------------------------------------------------
    def new_image_on_top():
        return any(l['z'] == '2' and l['src'] == '2.jpg' for l in layers())

    check('wechselt zum zweiten Bild', wait_for(new_image_on_top, 6, 0.05))
    time.sleep(0.75)  # Mitte der Überblendung (1,5 s)
    mid = layers()
    top = next(l for l in mid if l['src'] == '2.jpg')
    below = next(l for l in mid if l['src'] == '1.jpg')
    check('Überblendung: neues Bild halb eingeblendet', 0.2 <= top['opacity'] <= 0.8, top)
    check('Überblendung: altes Bild bleibt darunter voll sichtbar', below['opacity'] == 1.0, below)
    shot('02_mitte_ueberblendung.png')
    time.sleep(1.6)
    after = layers()
    check('nach der Überblendung: altes Bild ausgeblendet', next(l for l in after if l['src'] == '1.jpg')['opacity'] == 0.0, after)
    check('nach der Überblendung: zweites Bild zu sehen', close(pixel(), COLORS['2.jpg']), pixel())

    # --- Beenden per Klick ------------------------------------------------
    page.mouse.click(150, 130)  # genau auf den Knopf der Seite
    check('Klick beendet den Schoner', not active())
    check('beendender Klick löst nichts darunter aus', page.evaluate('window.clicks') == 0, page.evaluate('window.clicks'))
    time.sleep(1.3)
    hidden = page.evaluate("getComputedStyle(document.getElementById('iob-ss')).visibility") == 'hidden'
    check('Schutzfläche danach ausgeblendet', hidden)
    page.mouse.click(150, 130)
    check('Seite reagiert danach wieder auf Klicks', page.evaluate('window.clicks') == 1, page.evaluate('window.clicks'))

    # --- Fernsteuerung über state.json ------------------------------------
    DATA['state']['startAt'] = 2000
    check('control.start startet den Schoner (spätestens nach 5 s Abfrage)', wait_for(active, 8))
    DATA['state']['stopAt'] = 2000
    check('control.stop beendet den Schoner', wait_for(lambda: not active(), 8))

    # --- Abschalten -------------------------------------------------------
    DATA['state']['startAt'] = 3000
    wait_for(active, 8)
    DATA['state']['enabled'] = False
    check('enabled=false beendet laufenden Schoner', wait_for(lambda: not active(), 8))
    time.sleep(7)
    check('enabled=false: startet auch nach der Leerlaufzeit nicht', not active())
    DATA['state']['enabled'] = True
    check('enabled=true: Leerlaufzeit läuft wieder an', wait_for(active, 14))
    page.mouse.click(700, 500)

    # --- Sperre (z. B. Lyrion-Rahmen offen) --------------------------------
    page.evaluate('window.__block = true; IoBScreensaver.blockWhile(function () { return window.__block; })')
    time.sleep(7.5)
    check('blockWhile verhindert den Start', not active())
    page.evaluate('window.__block = false')
    check('ohne Sperre startet der Schoner wieder', wait_for(active, 8))
    page.mouse.click(700, 500)
    time.sleep(1)

    # --- Fehlendes Bild, neue Einstellungen -------------------------------
    DATA['config'] = dict(
        DATA['config'], rev=2, shuffle=False, kenBurns=False,
        images=['/vis.0/slideshow/fehlt.jpg', '/vis.0/slideshow/2.jpg'],
    )
    DATA['state']['rev'] = 2
    time.sleep(6)  # Abfrage-Intervall abwarten
    page.evaluate('IoBScreensaver.start()')
    check('fehlendes Bild wird übersprungen', wait_for(lambda: any(l['src'] == '2.jpg' for l in layers()), 4), layers())
    time.sleep(2.2)
    check('neue Bilderliste nach rev-Wechsel aktiv', close(pixel(), COLORS['2.jpg']), pixel())
    anim = page.evaluate("[...document.querySelectorAll('#iob-ss img')].map(i => i.style.animationName)")
    check('Zoom lässt sich abschalten', all(a in ('', 'none') for a in anim), anim)

    # --- Uhr abschaltbar ----------------------------------------------------
    page.evaluate('IoBScreensaver.stop()')
    DATA['config'] = dict(DATA['config'], rev=3, showClock=False)
    DATA['state']['rev'] = 3
    time.sleep(6)
    page.evaluate('IoBScreensaver.start()')
    time.sleep(0.5)
    check('showClock=false blendet die Uhr aus', page.evaluate("getComputedStyle(document.querySelector('#iob-ss .iob-clock')).display") == 'none')

    check('keine JavaScript-Fehler auf der Seite', not errors, errors)
    browser.close()

server.shutdown()
print(f"\n{'Alle Browser-Tests bestanden' if not failures else str(len(failures)) + ' Test(s) fehlgeschlagen: ' + ', '.join(failures)}")
sys.exit(1 if failures else 0)
