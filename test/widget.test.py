"""
Test des vis-Widgets www/widgets/screensaver.html in einem echten Chromium.

Da hier kein vis läuft, ersetzt eine kleine Attrappe die Teile von vis, die das
Widget benutzt (vis.editMode, vis.states, vis.setValue, vis.binds, systemDictionary)
und ein winziger Interpreter die EJS-Vorlage.

Start:  python3 test/widget.test.py [--write-preview]
        --write-preview speichert www/widgets/screensaver/img/Prev.png
"""
import pathlib
import re
import sys
import time

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from support import ROOT, default_data, start_server  # noqa: E402

WRITE_PREVIEW = '--write-preview' in sys.argv
SOURCE = (ROOT / 'www' / 'widgets' / 'screensaver.html').read_text(encoding='utf-8')

STYLE = re.search(r'<style>(.*?)</style>', SOURCE, re.S).group(1)
CODE = re.search(r'<script type="text/javascript">(.*?)</script>', SOURCE, re.S).group(1)
TPL_MATCH = re.search(r'<script id="tplScreensaver"(.*?)data-vis-attrs="([^"]*)">(.*?)</script>', SOURCE, re.S)
TPL_HEAD, TPL_ATTRS, TPL = TPL_MATCH.group(1), TPL_MATCH.group(2), TPL_MATCH.group(3)

PAGE = b"""<!doctype html><html><head><meta charset="utf-8"><title>w</title>
<script src="/jquery.js"></script></head>
<body style="margin:0;background:#101830">
<div id="stage" style="position:absolute;left:40px;top:40px;width:120px;height:130px"></div>
</body></html>"""

# Attrappe von vis und ein Mini-EJS
HARNESS = """
window.systemDictionary = {};
window.__set = [];
window.__binds = {};
window.vis = {
  editMode: %(edit)s,
  binds: {},
  states: {
    bind: function (id, fn) { (window.__binds[id] = window.__binds[id] || []).push(fn); }
  },
  setValue: function (id, val) {
    window.__set.push([id, val]);
    vis.states[id + '.val'] = val;
    (window.__binds[id + '.val'] || []).forEach(function (fn) { fn(null, val); });
  }
};
%(states)s
window.renderWidget = function (tpl, data) {
  var ctx = { data: data, view: 'v', style: {} };
  Object.defineProperty(data, 'attr', { value: function (k) { return data[k]; }, enumerable: false });
  var after = [];
  var html = tpl.replace(/<%%(==|=)?([\\s\\S]*?)%%>/g, function (m, kind, code) {
    if (kind) {
      var v = new Function('return (' + code + ');').call(ctx);
      return v == null ? '' : String(v);
    }
    after.push(code);
    return '';
  });
  document.getElementById('stage').innerHTML = html;
  after.forEach(function (code) { new Function(code).call(ctx); });
};
"""

DEFAULT_WIDGET = {
    'wid': 'w1', 'class': '', 'oid-enabled': 'vis-screensaver.0.control.enabled', 'instance': 0,
    'startOnTap': True, 'showLabel': True, 'label': 'Bildschirm\u00adschoner', 'showStatus': True, 'logo': '',
}

failures = []


def check(name, cond, detail=''):
    print(f"  {'ok  ' if cond else 'FAIL'} {name}{' – ' + str(detail) if detail and not cond else ''}")
    if not cond:
        failures.append(name)


DATA = default_data()
server, PORT = start_server(DATA, PAGE)

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--no-sandbox'])
    errors = []

    def open_page(edit=False, enabled=True):
        page = browser.new_page(viewport={'width': 800, 'height': 500}, device_scale_factor=2 if WRITE_PREVIEW else 1)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and '404' not in m.text else None)
        page.goto(f'http://127.0.0.1:{PORT}/test.html')
        page.wait_for_function('window.jQuery')
        page.add_style_tag(content=STYLE)
        states = "vis.states['vis-screensaver.0.control.enabled.val'] = %s;" % ('true' if enabled else 'false')
        page.add_script_tag(content=HARNESS % {'edit': 'true' if edit else 'false', 'states': states})
        page.add_script_tag(content=CODE)
        return page

    def render(page, **overrides):
        data = dict(DEFAULT_WIDGET, **overrides)
        page.evaluate('([tpl, data]) => window.renderWidget(tpl, data)', [TPL, data])
        page.wait_for_selector('#w1 .vissc-tile')

    print('Widget-Tests')

    # --- Aufbau der Vorlage ------------------------------------------------
    check('Vorlage ist als Widget des Sets "screensaver" registriert',
          'data-vis-set="screensaver"' in TPL_HEAD and 'class="vis-tpl"' in TPL_HEAD and 'data-vis-name=' in TPL_HEAD)
    attr_names = [a.split('/')[0] for a in TPL_ATTRS.split(';') if a]
    check('Einstellungen vorhanden', attr_names == ['oid-enabled', 'instance', 'startOnTap', 'showLabel', 'label', 'showStatus', 'logo'], attr_names)

    # --- Darstellung -------------------------------------------------------
    page = open_page(edit=True)
    render(page)
    check('zeigt Standard-Logo', page.get_attribute('#w1 .vissc-logo', 'src').endswith('/img/logo.svg'))
    page.wait_for_function("document.querySelector('#w1 .vissc-logo').naturalWidth > 0")
    check('Standard-Logo lässt sich laden', True)
    check('zeigt Beschriftung', page.inner_text('#w1 .vissc-label').replace('\u00ad', '') == 'Bildschirmschoner')
    check('Statuspunkt sichtbar, Kachel aktiv', page.is_visible('#w1 .vissc-dot') and 'vissc-off' not in page.get_attribute('#w1 .vissc-tile', 'class'))
    if WRITE_PREVIEW:
        out = ROOT / 'www' / 'widgets' / 'screensaver' / 'img' / 'Prev.png'
        page.locator('#stage').screenshot(path=str(out))
        print(f'  ->  Vorschaubild geschrieben: {out.relative_to(ROOT)}')
    page.close()

    page = open_page(edit=True)
    render(page, logo='/vis-screensaver/widgets/screensaver/img/logo.png')
    check('eigenes Logo wird verwendet', page.get_attribute('#w1 .vissc-logo', 'src').endswith('/img/logo.png'))
    render(page, showLabel=False, showStatus=False)
    check('Beschriftung und Statuspunkt lassen sich ausblenden',
          not page.is_visible('#w1 .vissc-label') and not page.is_visible('#w1 .vissc-dot'))
    page.close()

    # --- Zustand des Schalters ---------------------------------------------
    page = open_page(edit=True, enabled=False)
    render(page)
    check('ausgeschalteter Schoner wird grau dargestellt', 'vissc-off' in page.get_attribute('#w1 .vissc-tile', 'class'))
    page.evaluate("vis.setValue('vis-screensaver.0.control.enabled', true)")
    check('Statuswechsel wird übernommen', 'vissc-off' not in page.get_attribute('#w1 .vissc-tile', 'class'))
    page.close()

    # --- Editor: nichts auslösen, Skript nicht laden --------------------------
    page = open_page(edit=True)
    render(page)
    page.click('#w1 .vissc-tile')
    time.sleep(0.7)
    check('im Editor wird das Skript nicht geladen', page.evaluate('typeof window.IoBScreensaver') == 'undefined')
    page.close()

    # --- Betrieb: Skript laden, Tippen startet ------------------------------
    page = open_page(edit=False)
    render(page)
    page.wait_for_function('window.IoBScreensaver', timeout=4000)
    check('im Betrieb lädt das Widget das Browser-Skript', True)
    time.sleep(0.8)  # Einstellungen vom Adapter abwarten
    page.click('#w1 .vissc-tile')
    started = False
    end = time.time() + 2
    while time.time() < end and not started:
        started = page.evaluate('IoBScreensaver.isActive()')
        time.sleep(0.1)
    check('Tippen startet den Bildschirmschoner', started)
    page.mouse.click(600, 400)
    time.sleep(0.2)
    check('Tippen beendet ihn wieder', not page.evaluate('IoBScreensaver.isActive()'))
    check('Tippen schaltet den Schalter nicht um', page.evaluate('window.__set.length') == 0)
    page.close()

    # --- Langer Druck schaltet um ------------------------------------------
    page = open_page(edit=False)
    render(page)
    page.wait_for_function('window.IoBScreensaver', timeout=4000)
    time.sleep(0.8)
    box = page.locator('#w1 .vissc-tile').bounding_box()
    page.mouse.move(box['x'] + 30, box['y'] + 30)
    page.mouse.down()
    time.sleep(1.0)
    page.mouse.up()
    time.sleep(0.2)
    sets = page.evaluate('window.__set')
    check('langer Druck schaltet den Schalter aus', sets == [['vis-screensaver.0.control.enabled', False]], sets)
    check('langer Druck startet den Schoner nicht', not page.evaluate('IoBScreensaver.isActive()'))
    check('Kachel zeigt danach "aus"', 'vissc-off' in page.get_attribute('#w1 .vissc-tile', 'class'))
    page.close()

    # --- startOnTap aus ----------------------------------------------------
    page = open_page(edit=False)
    render(page, startOnTap=False)
    page.wait_for_function('window.IoBScreensaver', timeout=4000)
    time.sleep(0.8)
    page.click('#w1 .vissc-tile')
    time.sleep(0.8)
    check('mit startOnTap=aus startet Tippen nichts', not page.evaluate('IoBScreensaver.isActive()'))
    page.close()

    check('keine JavaScript-Fehler', not errors, errors)
    browser.close()

server.shutdown()
print(f"\n{'Alle Widget-Tests bestanden' if not failures else str(len(failures)) + ' Test(s) fehlgeschlagen: ' + ', '.join(failures)}")
sys.exit(1 if failures else 0)
