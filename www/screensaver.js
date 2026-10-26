/*
 * ioBroker.screensaver – Browser-Skript
 *
 * Einbinden:  <script src="/vis-screensaver/screensaver.js"></script>
 * Optional vorher: <script>window.SCREENSAVER_INSTANCE = 0;</script>
 *
 * Liest /vis-screensaver.<n>/config.json (Einstellungen und Bilderliste) und
 * /vis-screensaver.<n>/state.json (Steuerung). Nach der eingestellten Leerlaufzeit
 * blendet es eine Vollbild-Diashow ein. Ein Tipp beendet sie.
 */
(function () {
    'use strict';

    if (window.IoBScreensaver) {
        return;
    }
    // Nur im obersten Fenster laufen, nicht in eingebetteten Rahmen
    if (window.top !== window.self && !window.SCREENSAVER_ALLOW_FRAME) {
        return;
    }

    var INSTANCE = window.SCREENSAVER_INSTANCE != null ? window.SCREENSAVER_INSTANCE : 0;
    var BASE = '/vis-screensaver.' + INSTANCE + '/';
    var POLL_MS = 5000;
    var HIDE_MS = 800; // Dauer des Ein-/Ausblendens der Schutzfläche

    var cfg = null; // Inhalt von config.json (bereinigt)
    var ctl = { rev: null, enabled: true, startAt: null, stopAt: null }; // Inhalt von state.json
    var active = false;
    var loading = false;
    var idleTimer = null;
    var slideTimer = null;
    var fadeTimer = null;
    var hideTimer = null;
    var clockTimer = null;
    var order = [];
    var pos = 0;
    var lastUrl = '';
    var front = 0;
    var zoomIn = true;
    var blockers = [];
    var lastMouse = { x: 0, y: 0 };
    var root = null;
    var imgs = [];
    var timeEl = null;
    var dateEl = null;
    var clockBox = null;

    // ---------- Hilfsfunktionen ----------

    function clamp(value, min, max, def) {
        var v = Number(value);
        if (!isFinite(v)) {
            v = def;
        }
        return Math.min(max, Math.max(min, v));
    }

    function normalize(c) {
        var slide = clamp(c.slideSeconds, 2, 3600, 20);
        var fade = clamp(c.fadeSeconds, 0, 60, 2);
        if (fade > slide - 1) {
            fade = Math.max(0, slide - 1);
        }
        return {
            idleSeconds: clamp(c.idleSeconds, 5, 86400, 180),
            slideSeconds: slide,
            fadeSeconds: fade,
            shuffle: c.shuffle !== false,
            fit: c.fit === 'contain' ? 'contain' : 'cover',
            kenBurns: c.kenBurns !== false,
            showClock: c.showClock !== false,
            images: Array.isArray(c.images) ? c.images : []
        };
    }

    function getJson(name) {
        return fetch(BASE + name + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
            if (!r.ok) {
                throw new Error('HTTP ' + r.status);
            }
            return r.json();
        });
    }

    function canRun() {
        return !!cfg && ctl.enabled && cfg.images.length > 0;
    }

    function isBlocked() {
        for (var i = 0; i < blockers.length; i++) {
            try {
                if (blockers[i]()) {
                    return true;
                }
            } catch (e) {
                /* Fehler in fremder Funktion ignorieren */
            }
        }
        return false;
    }

    // ---------- Oberfläche ----------

    function ensureDom() {
        if (root) {
            return;
        }
        var style = document.createElement('style');
        style.textContent =
            '#iob-ss{position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483000;background:#000;overflow:hidden;' +
            'opacity:0;visibility:hidden;transition:opacity ' + HIDE_MS + 'ms ease,visibility 0s linear ' + HIDE_MS + 'ms;' +
            'cursor:none;touch-action:none;-webkit-user-select:none;user-select:none}' +
            '#iob-ss.on{opacity:1;visibility:visible;transition:opacity ' + HIDE_MS + 'ms ease,visibility 0s}' +
            '#iob-ss img{position:absolute;left:0;top:0;width:100%;height:100%;opacity:0;pointer-events:none}' +
            '#iob-ss .iob-shade{position:absolute;left:0;right:0;bottom:0;height:38%;z-index:3;pointer-events:none;' +
            'background:linear-gradient(to top,rgba(0,0,0,.55),rgba(0,0,0,0))}' +
            '#iob-ss .iob-clock{position:absolute;left:48px;bottom:34px;z-index:4;color:#fff;pointer-events:none;' +
            'font-family:"Segoe UI",system-ui,-apple-system,Roboto,sans-serif;text-shadow:0 2px 24px rgba(0,0,0,.6)}' +
            '#iob-ss .iob-time{font-size:80px;font-weight:200;letter-spacing:-1px;line-height:1}' +
            '#iob-ss .iob-date{font-size:22px;margin-top:8px;opacity:.85}' +
            '@keyframes iob-kb-in{from{transform:scale(1)}to{transform:scale(1.1)}}' +
            '@keyframes iob-kb-out{from{transform:scale(1.1)}to{transform:scale(1)}}';
        document.head.appendChild(style);

        root = document.createElement('div');
        root.id = 'iob-ss';
        for (var i = 0; i < 2; i++) {
            var img = document.createElement('img');
            img.alt = '';
            img.draggable = false;
            root.appendChild(img);
            imgs.push(img);
        }
        var shade = document.createElement('div');
        shade.className = 'iob-shade';
        clockBox = document.createElement('div');
        clockBox.className = 'iob-clock';
        timeEl = document.createElement('div');
        timeEl.className = 'iob-time';
        dateEl = document.createElement('div');
        dateEl.className = 'iob-date';
        clockBox.appendChild(timeEl);
        clockBox.appendChild(dateEl);
        root.appendChild(shade);
        root.appendChild(clockBox);
        document.body.appendChild(root);
    }

    function updateClock() {
        var d = new Date();
        timeEl.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        dateEl.textContent = d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
    }

    // ---------- Diashow ----------

    function buildOrder() {
        var n = cfg.images.length;
        var a = [];
        var i;
        for (i = 0; i < n; i++) {
            a.push(i);
        }
        if (cfg.shuffle) {
            for (i = n - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var t = a[i];
                a[i] = a[j];
                a[j] = t;
            }
        }
        // dasselbe Bild nicht zweimal hintereinander
        if (n > 1 && cfg.images[a[0]] === lastUrl) {
            a.push(a.shift());
        }
        order = a;
        pos = 0;
    }

    function nextUrl() {
        if (pos >= order.length) {
            buildOrder();
        }
        return cfg.images[order[pos++]];
    }

    /** Neues Bild über das alte blenden. Das alte bleibt darunter voll sichtbar, so gibt es keinen Helligkeitseinbruch. */
    function swap(url) {
        lastUrl = url;
        var cur = imgs[front];
        var nxt = imgs[1 - front];
        var fade = cfg.fadeSeconds;

        clearTimeout(fadeTimer);
        nxt.style.transition = 'none';
        nxt.style.opacity = '0';
        nxt.style.zIndex = '2';
        nxt.style.objectFit = cfg.fit;
        nxt.style.animation = 'none';
        cur.style.zIndex = '1';
        nxt.src = url;
        void nxt.offsetWidth; // Neuzeichnen erzwingen, damit Animation und Übergang neu starten

        if (cfg.kenBurns) {
            nxt.style.animation =
                (zoomIn ? 'iob-kb-in' : 'iob-kb-out') + ' ' + (cfg.slideSeconds + fade) + 's linear forwards';
            zoomIn = !zoomIn;
        }
        nxt.style.transition = 'opacity ' + fade + 's ease-in-out';
        nxt.style.opacity = '1';
        front = 1 - front;

        fadeTimer = setTimeout(function () {
            cur.style.transition = 'none';
            cur.style.opacity = '0';
            cur.style.animation = 'none';
        }, fade * 1000 + 100);
    }

    function showNext() {
        if (!active) {
            return;
        }
        var tries = 0;
        var maxTries = Math.min(cfg.images.length, 5);

        (function attempt() {
            if (!active) {
                return;
            }
            if (tries >= maxTries) {
                // Mehrere Bilder hintereinander nicht ladbar: später noch einmal versuchen
                slideTimer = setTimeout(showNext, 30000);
                return;
            }
            tries++;
            var url = nextUrl();
            var probe = new Image();
            probe.onload = function () {
                var go = function () {
                    if (!active) {
                        return;
                    }
                    swap(url);
                    slideTimer = setTimeout(showNext, cfg.slideSeconds * 1000);
                };
                if (probe.decode) {
                    probe.decode().then(go, go);
                } else {
                    go();
                }
            };
            probe.onerror = attempt;
            probe.src = url;
        })();
    }

    // ---------- Start und Ende ----------

    function resetIdle() {
        clearTimeout(idleTimer);
        idleTimer = null;
        if (active || !canRun()) {
            return;
        }
        idleTimer = setTimeout(function () {
            start(false);
        }, cfg.idleSeconds * 1000);
    }

    function start(force) {
        if (active || !canRun()) {
            return;
        }
        if (!force && isBlocked()) {
            resetIdle();
            return;
        }
        ensureDom();
        clearTimeout(idleTimer);
        clearTimeout(hideTimer);
        active = true;
        updateClock();
        clockBox.style.display = cfg.showClock ? '' : 'none';
        clearInterval(clockTimer);
        clockTimer = setInterval(updateClock, 10000);
        root.classList.add('on');
        order = [];
        pos = 0;
        showNext();
    }

    function stop() {
        if (!active) {
            resetIdle();
            return;
        }
        active = false;
        clearTimeout(slideTimer);
        clearTimeout(fadeTimer);
        clearInterval(clockTimer);
        root.classList.remove('on');
        // Die Schutzfläche bleibt noch kurz anklickbar, so löst der beendende Tipp nichts darunter aus.
        hideTimer = setTimeout(function () {
            if (active) {
                return;
            }
            imgs.forEach(function (img) {
                img.style.transition = 'none';
                img.style.opacity = '0';
                img.style.animation = 'none';
                img.removeAttribute('src');
            });
        }, HIDE_MS + 100);
        resetIdle();
    }

    function onActivity() {
        if (active) {
            stop();
        } else {
            resetIdle();
        }
    }

    // ---------- Einstellungen und Steuerung vom Adapter ----------

    function loadConfig() {
        if (loading) {
            return;
        }
        loading = true;
        getJson('config.json')
            .then(function (c) {
                cfg = normalize(c);
                order = [];
                pos = 0;
                if (!canRun() && active) {
                    stop();
                }
                resetIdle();
            })
            .catch(function () {
                /* beim nächsten Abruf erneut versuchen */
            })
            .then(function () {
                loading = false;
            });
    }

    function poll() {
        getJson('state.json')
            .then(function (s) {
                var prev = ctl;
                ctl = {
                    rev: s.rev,
                    enabled: s.enabled !== false,
                    startAt: Number(s.startAt) || 0,
                    stopAt: Number(s.stopAt) || 0
                };
                if (!cfg || s.rev !== prev.rev) {
                    loadConfig();
                }
                if (prev.rev === null) {
                    return; // erster Abruf: nur merken, nichts auslösen
                }
                if (!ctl.enabled && active) {
                    stop();
                }
                if (ctl.enabled && !prev.enabled) {
                    resetIdle();
                }
                if (ctl.startAt > prev.startAt) {
                    start(true);
                }
                if (ctl.stopAt > prev.stopAt) {
                    stop();
                }
            })
            .catch(function () {
                /* Adapter nicht erreichbar: mit der letzten bekannten Einstellung weiterlaufen */
            });
    }

    // ---------- Start des Skripts ----------

    function init() {
        ['pointerdown', 'touchstart', 'keydown', 'wheel'].forEach(function (name) {
            document.addEventListener(name, onActivity, true);
        });
        // Mausbewegung erst ab ein paar Pixeln werten, damit leichtes Zittern den Schoner nicht beendet
        document.addEventListener(
            'mousemove',
            function (e) {
                if (Math.abs(e.clientX - lastMouse.x) + Math.abs(e.clientY - lastMouse.y) < 8) {
                    return;
                }
                lastMouse.x = e.clientX;
                lastMouse.y = e.clientY;
                onActivity();
            },
            true
        );
        poll();
        setInterval(poll, POLL_MS);
    }

    window.IoBScreensaver = {
        /** Schoner sofort starten (ignoriert die Leerlaufzeit und blockWhile). */
        start: function () {
            start(true);
        },
        /** Schoner beenden und Leerlaufzeit neu starten. */
        stop: stop,
        /** Einstellungen sofort neu laden. */
        reload: loadConfig,
        /** Funktion registrieren, die true liefert, solange der Schoner nicht starten soll (z. B. Rahmen mit Lyrion offen). */
        blockWhile: function (fn) {
            if (typeof fn === 'function') {
                blockers.push(fn);
            }
        },
        isActive: function () {
            return active;
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
