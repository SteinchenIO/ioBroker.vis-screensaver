'use strict';

/*
 * ioBroker.vis-screensaver
 *
 * Der Adapter selbst zeigt nichts an. Er
 *  - liest die Bilder aus einem Ordner des ioBroker-Dateispeichers,
 *  - prüft Dateigröße und Pixelzahl und meldet zu große Bilder,
 *  - schreibt die Einstellungen als config.json und die Steuerung als state.json
 *    in den eigenen Dateispeicher (vis-screensaver.<n>), den der Web-Adapter ausliefert,
 *  - stellt States zum Steuern bereit (control.start / control.stop / control.enabled).
 *
 * Das Browser-Skript www/screensaver.js liest diese beiden Dateien und blendet
 * den Bildschirmschoner in jeder Seite ein, in die es eingebunden ist.
 */

const os = require('node:os');
const utils = require('@iobroker/adapter-core');
const { getImageSize } = require('./lib/imageinfo');

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i;
const MAX_LOGGED_PROBLEMS = 5;

/** Zahl lesen und in den erlaubten Bereich zwingen. */
function num(value, def, min, max) {
    let v = Number(value);
    if (!Number.isFinite(v)) {
        v = def;
    }
    return Math.min(max, Math.max(min, v));
}

class Screensaver extends utils.Adapter {
    /** @param {Partial<utils.AdapterOptions>} [options] */
    constructor(options = {}) {
        super({ ...options, name: 'vis-screensaver' });

        this.settings = null;
        this.images = [];
        this.imagesKey = '';
        this.rev = Date.now();
        this.startAt = 0;
        this.stopAt = 0;
        this.runtimeEnabled = true;
        this.rescanTimer = null;
        this.warnedEmpty = false;
        this.dimCache = new Map();
        this.problemKey = '';
        this.writeQueue = Promise.resolve();

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        await this.ensureObjects();

        this.settings = this.readSettings();

        // Zeitstempel beim Start setzen, damit offene Browser-Seiten keinen alten Befehl auslösen
        this.startAt = Date.now();
        this.stopAt = this.startAt;

        const enabledState = await this.getStateAsync('control.enabled');
        this.runtimeEnabled = enabledState ? enabledState.val !== false : true;
        await this.setStateAsync('control.enabled', this.runtimeEnabled, true);

        this.subscribeStates('control.*');

        await this.refresh(true);

        if (this.settings.rescanMinutes > 0) {
            this.rescanTimer = setInterval(
                () => this.refresh(false).catch(err => this.log.warn(`Neu einlesen fehlgeschlagen: ${err.message}`)),
                this.settings.rescanMinutes * 60 * 1000,
            );
        }
    }

    /** Objekte anlegen, falls sie fehlen. */
    async ensureObjects() {
        // Meta-Objekt: nötig, damit der Adapter Dateien in vis-screensaver.<n> ablegen kann
        await this.setForeignObjectNotExistsAsync(this.namespace, {
            type: 'meta',
            common: { name: 'Screensaver files', type: 'meta.user' },
            native: {},
        });

        await this.setObjectNotExistsAsync('control', {
            type: 'channel',
            common: { name: { en: 'Control', de: 'Steuerung' } },
            native: {},
        });
        await this.setObjectNotExistsAsync('info', {
            type: 'channel',
            common: { name: { en: 'Information', de: 'Information' } },
            native: {},
        });

        const states = {
            'control.enabled': {
                name: { en: 'Screensaver enabled (runtime switch)', de: 'Bildschirmschoner aktiv (Laufzeit-Schalter)' },
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def: true,
            },
            'control.start': {
                name: { en: 'Start screensaver now', de: 'Bildschirmschoner jetzt starten' },
                type: 'boolean',
                role: 'button',
                read: false,
                write: true,
            },
            'control.stop': {
                name: { en: 'Stop screensaver / restart idle timer', de: 'Bildschirmschoner beenden / Leerlaufzeit neu starten' },
                type: 'boolean',
                role: 'button',
                read: false,
                write: true,
            },
            'info.imageCount': {
                name: { en: 'Number of images found', de: 'Anzahl gefundener Bilder' },
                type: 'number',
                role: 'value',
                read: true,
                write: false,
                def: 0,
            },
            'info.oversizedCount': {
                name: { en: 'Images larger than recommended', de: 'Bilder größer als empfohlen' },
                type: 'number',
                role: 'value',
                read: true,
                write: false,
                def: 0,
            },
            'info.imageReport': {
                name: { en: 'Image check report (JSON)', de: 'Ergebnis der Bildprüfung (JSON)' },
                type: 'string',
                role: 'json',
                read: true,
                write: false,
                def: '[]',
            },
            'info.lastScan': {
                name: { en: 'Last folder scan', de: 'Letztes Einlesen des Ordners' },
                type: 'string',
                role: 'date',
                read: true,
                write: false,
                def: '',
            },
        };
        for (const [id, common] of Object.entries(states)) {
            await this.setObjectNotExistsAsync(id, { type: 'state', common, native: {} });
        }
    }

    /** Einstellungen lesen und auf sinnvolle Werte begrenzen. */
    readSettings() {
        const c = this.config || {};
        const slideSeconds = num(c.slideSeconds, 20, 2, 3600);
        let fadeSeconds = num(c.fadeSeconds, 2, 0, 60);
        if (fadeSeconds > slideSeconds - 1) {
            const fixed = Math.max(0, slideSeconds - 1);
            this.log.warn(
                `Überblendung (${fadeSeconds} s) muss mindestens 1 s kürzer sein als die Dauer pro Bild (${slideSeconds} s). Verwende ${fixed} s.`,
            );
            fadeSeconds = fixed;
        }
        return {
            enabled: c.enabled !== false,
            idleSeconds: num(c.idleSeconds, 180, 5, 86400),
            slideSeconds,
            fadeSeconds,
            shuffle: c.shuffle !== false,
            fit: c.fit === 'contain' ? 'contain' : 'cover',
            kenBurns: c.kenBurns !== false,
            showClock: c.showClock !== false,
            imageSource: String(c.imageSource || ''),
            rescanMinutes: num(c.rescanMinutes, 10, 0, 1440),
            checkImages: c.checkImages !== false,
            maxFileKB: num(c.maxFileKB, 1500, 100, 50000),
            maxMegapixels: num(c.maxMegapixels, 4, 0.5, 100),
        };
    }

    /**
     * Bilderordner einlesen.
     * Die Quelle hat die Form "<Objekt-ID>/<Unterordner>", z. B. "vis.0/slideshow".
     * Mehrere Quellen werden mit Komma getrennt. Es wird nur eine Ebene gelesen.
     *
     * @returns {Promise<Array<{url: string, objectId: string, path: string, file: string, size: number, modifiedAt: number}>>}
     *          nach URL sortiert; die URL ist so, wie sie der Web-Adapter ausliefert
     */
    async scanImages() {
        const sources = this.settings.imageSource
            .split(',')
            .map(s => s.trim().replace(/^\/+|\/+$/g, ''))
            .filter(Boolean);

        const found = [];
        for (const source of sources) {
            const slash = source.indexOf('/');
            const objectId = slash === -1 ? source : source.slice(0, slash);
            const dir = slash === -1 ? '' : source.slice(slash + 1);
            try {
                const entries = await this.readDirAsync(objectId, dir || '/');
                for (const entry of entries) {
                    if (!entry.isDir && IMAGE_EXT.test(entry.file)) {
                        const parts = [...dir.split('/').filter(Boolean), entry.file];
                        found.push({
                            url: `/${[objectId, ...parts].map(encodeURIComponent).join('/')}`,
                            objectId,
                            path: parts.join('/'),
                            file: entry.file,
                            size: Number(entry.stats && entry.stats.size) || 0,
                            modifiedAt: Number(entry.modifiedAt) || 0,
                        });
                    }
                }
            } catch (err) {
                this.log.warn(`Ordner "${source}" konnte nicht gelesen werden: ${err.message}`);
            }
        }
        return found.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
    }

    /** Breite und Höhe eines Bildes aus seinen Kopfdaten lesen (null, wenn nicht möglich). */
    async readDimensions(entry) {
        try {
            const res = await this.readFileAsync(entry.objectId, entry.path);
            const data = Buffer.isBuffer(res) ? res : res && (res.file || res.data);
            return getImageSize(Buffer.isBuffer(data) ? data : Buffer.from(data || ''));
        } catch (err) {
            this.log.debug(`Bild "${entry.path}" konnte nicht geprüft werden: ${err.message}`);
            return null;
        }
    }

    /**
     * Dateigröße und Pixelzahl gegen die Grenzwerte prüfen. Zu große Bilder laden auf dem Pi langsam
     * und können beim Überblenden ruckeln. Das Ergebnis geht ins Log und in die States info.*.
     */
    async checkImages(entries) {
        const s = this.settings;
        const cache = new Map();
        const problems = [];

        for (const e of entries) {
            const key = `${e.url}|${e.size}|${e.modifiedAt}`;
            let dim = this.dimCache.get(key);
            if (dim === undefined) {
                dim = await this.readDimensions(e);
            }
            cache.set(key, dim);

            const issues = [];
            if (e.size > s.maxFileKB * 1024) {
                issues.push(`Datei ${Math.round(e.size / 1024)} KB (empfohlen höchstens ${s.maxFileKB} KB)`);
            }
            if (dim && dim.width * dim.height > s.maxMegapixels * 1e6) {
                const mp = (dim.width * dim.height) / 1e6;
                issues.push(`${dim.width}×${dim.height} Pixel = ${mp.toFixed(1)} MP (empfohlen höchstens ${s.maxMegapixels} MP)`);
            }
            if (issues.length) {
                problems.push({
                    file: e.file,
                    kb: Math.round(e.size / 1024),
                    width: dim ? dim.width : null,
                    height: dim ? dim.height : null,
                    issues,
                });
            }
        }
        this.dimCache = cache;

        // Nur loggen, wenn sich das Ergebnis geändert hat, nicht bei jedem Neu-Einlesen
        const problemKey = JSON.stringify(problems);
        if (problemKey !== this.problemKey) {
            this.problemKey = problemKey;
            if (problems.length) {
                this.log.warn(
                    `${problems.length} von ${entries.length} Bildern sind größer als empfohlen. ` +
                        'Verkleinern: in den Instanz-Einstellungen unter "Bilder" auf "Foto-Werkzeug öffnen" klicken (siehe README).',
                );
                for (const p of problems.slice(0, MAX_LOGGED_PROBLEMS)) {
                    this.log.warn(`  ${p.file}: ${p.issues.join('; ')}`);
                }
                if (problems.length > MAX_LOGGED_PROBLEMS) {
                    this.log.warn(`  … und ${problems.length - MAX_LOGGED_PROBLEMS} weitere (siehe State info.imageReport)`);
                }
            }
        }
        await this.setStateAsync('info.oversizedCount', problems.length, true);
        await this.setStateAsync('info.imageReport', JSON.stringify(problems), true);
    }

    /** Ordner einlesen und die Dateien nur schreiben, wenn sich etwas geändert hat. */
    async refresh(force) {
        const entries = await this.scanImages();
        const images = entries.map(e => e.url);
        const key = JSON.stringify(images);
        const changed = key !== this.imagesKey;

        if (changed || force) {
            this.images = images;
            this.imagesKey = key;
            this.rev = Date.now();
            await this.writeConfig();
            await this.writeControl();
            this.log.info(`${images.length} Bild(er) in "${this.settings.imageSource}" gefunden`);
        }

        if (images.length === 0 && !this.warnedEmpty) {
            this.warnedEmpty = true;
            this.log.warn(
                `Keine Bilder in "${this.settings.imageSource}" gefunden. Der Bildschirmschoner startet erst, wenn Bilder vorhanden sind.`,
            );
        } else if (images.length > 0) {
            this.warnedEmpty = false;
        }

        await this.setStateAsync('info.imageCount', images.length, true);
        await this.setStateAsync('info.lastScan', new Date().toISOString(), true);

        if (this.settings.checkImages) {
            await this.checkImages(entries);
        }
    }

    /** Schreibzugriffe nacheinander ausführen, damit sich Dateien nicht überholen. */
    enqueue(job) {
        this.writeQueue = this.writeQueue.then(job, job);
        return this.writeQueue;
    }

    writeConfig() {
        const s = this.settings;
        const config = {
            rev: this.rev,
            idleSeconds: s.idleSeconds,
            slideSeconds: s.slideSeconds,
            fadeSeconds: s.fadeSeconds,
            shuffle: s.shuffle,
            fit: s.fit,
            kenBurns: s.kenBurns,
            showClock: s.showClock,
            images: this.images,
        };
        return this.enqueue(() => this.writeFileAsync(this.namespace, 'config.json', JSON.stringify(config)));
    }

    writeControl() {
        const control = {
            rev: this.rev,
            enabled: this.settings.enabled && this.runtimeEnabled,
            startAt: this.startAt,
            stopAt: this.stopAt,
        };
        return this.enqueue(() => this.writeFileAsync(this.namespace, 'state.json', JSON.stringify(control)));
    }

    /**
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    async onStateChange(id, state) {
        if (!state || state.ack) {
            return;
        }
        const local = id.substring(this.namespace.length + 1);
        try {
            if (local === 'control.start' && state.val) {
                this.startAt = Date.now();
                await this.writeControl();
                await this.setStateAsync(local, true, true);
            } else if (local === 'control.stop' && state.val) {
                this.stopAt = Date.now();
                await this.writeControl();
                await this.setStateAsync(local, true, true);
            } else if (local === 'control.enabled') {
                this.runtimeEnabled = !!state.val;
                await this.writeControl();
                await this.setStateAsync(local, this.runtimeEnabled, true);
            }
        } catch (err) {
            this.log.warn(`Steuerbefehl "${local}" fehlgeschlagen: ${err.message}`);
        }
    }

    /**
     * Baut die vollständige Adresse des Foto-Werkzeugs (Admin-Port und IP-Adresse dieses Rechners).
     * Fällt bei Problemen auf den relativen Pfad zurück.
     * @returns {Promise<string>}
     */
    async photoToolUrl() {
        const path = '/files/vis-screensaver.admin/tools/resize.html';
        try {
            let port = 8081;
            let protocol = 'http';
            const admin = await this.getForeignObjectAsync('system.adapter.admin.0');
            if (admin && admin.native) {
                port = admin.native.port || port;
                protocol = admin.native.secure ? 'https' : 'http';
            }
            for (const list of Object.values(os.networkInterfaces())) {
                for (const net of list || []) {
                    if (net.family === 'IPv4' && !net.internal) {
                        return `${protocol}://${net.address}:${port}${path}`;
                    }
                }
            }
        } catch (err) {
            this.log.debug(`Adresse des Foto-Werkzeugs nicht ermittelbar: ${err.message}`);
        }
        return path;
    }

    /**
     * Nachrichten aus der Admin-Oberfläche (Knopf "Foto-Werkzeug öffnen").
     * Die Antwort enthält openUrl (der Admin öffnet die Adresse in einem neuen Tab) und die Adresse
     * als Text, damit man sie auch sieht und abtippen kann, falls der Browser das Fenster blockiert.
     * @param {ioBroker.Message} obj
     */
    async onMessage(obj) {
        this.log.debug(`Nachricht empfangen: ${obj && obj.command}`);
        if (!obj || obj.command !== 'openPhotoTool' || !obj.callback) {
            return;
        }
        const url = await this.photoToolUrl();
        this.sendTo(obj.from, obj.command, { openUrl: url, window: '_blank', result: `Foto-Werkzeug: ${url}` }, obj.callback);
    }

    /** @param {() => void} callback */
    onUnload(callback) {
        try {
            if (this.rescanTimer) {
                clearInterval(this.rescanTimer);
                this.rescanTimer = null;
            }
        } finally {
            callback();
        }
    }
}

if (require.main !== module) {
    // Export für den Adapter-Controller (compact mode)
    module.exports = options => new Screensaver(options);
} else {
    // Start als eigener Prozess
    (() => new Screensaver())();
}
