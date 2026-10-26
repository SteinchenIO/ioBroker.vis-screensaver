'use strict';

/*
 * Test der Adapter-Logik ohne echten ioBroker.
 * @iobroker/adapter-core wird durch eine kleine Attrappe ersetzt, die Objekte,
 * States und Dateien im Speicher hält.
 */

const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const Module = require('node:module');
const path = require('node:path');

class MockAdapter extends EventEmitter {
    constructor(options) {
        super();
        this.name = options.name;
        this.namespace = `${options.name}.0`;
        this.config = MockAdapter.nextConfig;
        this.objects = new Map();
        this.states = new Map();
        this.files = new Map(); // "<id>/<name>" -> Daten
        this.folders = new Map(); // "<id>/<dir>" -> [{file,isDir}]
        this.fileData = new Map(); // "<id>/<Pfad>" -> Buffer (Inhalt gelesener Bilder)
        this.reads = []; // Pfade, die gelesen wurden
        this.subscribed = [];
        this.logs = [];
        const log = level => msg => this.logs.push([level, msg]);
        this.log = { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') };
        MockAdapter.last = this;
    }
    async setForeignObjectNotExistsAsync(id, obj) {
        if (!this.objects.has(id)) {
            this.objects.set(id, obj);
        }
    }
    async setObjectNotExistsAsync(id, obj) {
        const full = `${this.namespace}.${id}`;
        if (!this.objects.has(full)) {
            this.objects.set(full, obj);
        }
    }
    async getStateAsync(id) {
        return this.states.get(`${this.namespace}.${id}`) || null;
    }
    async setStateAsync(id, val, ack) {
        this.states.set(`${this.namespace}.${id}`, { val, ack: !!ack });
    }
    subscribeStates(pattern) {
        this.subscribed.push(pattern);
    }
    async readDirAsync(id, dir) {
        const key = `${id}/${dir.replace(/^\/+|\/+$/g, '')}`;
        if (!this.folders.has(key)) {
            throw new Error(`Not exists: ${key}`);
        }
        return this.folders.get(key);
    }
    async writeFileAsync(id, name, data) {
        this.files.set(`${id}/${name}`, data);
    }
    async readFileAsync(id, name) {
        const key = `${id}/${name}`;
        this.reads.push(key);
        if (!this.fileData.has(key)) {
            throw new Error(`Not exists: ${key}`);
        }
        return { file: this.fileData.get(key), mimeType: 'image/png' };
    }
    json(name) {
        return JSON.parse(this.files.get(`${this.namespace}/${name}`));
    }
}

// require('@iobroker/adapter-core') auf die Attrappe umleiten
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
    if (request === '@iobroker/adapter-core') {
        return { Adapter: MockAdapter };
    }
    return originalLoad.call(this, request, ...rest);
};

const factory = require(path.join(__dirname, '..', 'main.js'));

const defaults = {
    enabled: true,
    idleSeconds: 180,
    slideSeconds: 20,
    fadeSeconds: 2,
    imageSource: 'vis.0/slideshow',
    shuffle: true,
    fit: 'cover',
    kenBurns: true,
    showClock: true,
    rescanMinutes: 0,
    checkImages: true,
    maxFileKB: 1500,
    maxMegapixels: 4,
};

async function create(config, folders) {
    MockAdapter.nextConfig = { ...defaults, ...config };
    const adapter = factory({});
    for (const [key, entries] of Object.entries(folders || {})) {
        adapter.folders.set(key, entries);
    }
    return adapter;
}

const f = file => ({ file, isDir: false });
/** Dateieintrag mit Größe, wie ihn readDir liefert */
const sized = (file, kb, modifiedAt = 1) => ({ file, isDir: false, stats: { size: kb * 1024 }, modifiedAt });
/** Minimaler PNG-Kopf mit der gewünschten Größe */
function pngHeader(w, h) {
    const b = Buffer.alloc(33);
    b.writeUInt32BE(0x89504e47, 0);
    b.writeUInt32BE(0x0d0a1a0a, 4);
    b.writeUInt32BE(13, 8);
    b.write('IHDR', 12, 'latin1');
    b.writeUInt32BE(w, 16);
    b.writeUInt32BE(h, 20);
    return b;
}
let passed = 0;
async function test(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  ok   ${name}`);
    } catch (err) {
        console.error(`  FAIL ${name}\n       ${err.message}`);
        process.exitCode = 1;
    }
}

(async () => {
    console.log('Adapter-Tests');

    await test('schreibt config.json mit den drei Zeitwerten und nur Bilddateien (sortiert, URL-kodiert)', async () => {
        const a = await create(
            { idleSeconds: 120, slideSeconds: 15, fadeSeconds: 3 },
            {
                'vis.0/slideshow': [f('b.JPG'), f('a.png'), f('notiz.txt'), f('Urlaub 1.webp'), { file: 'unter', isDir: true }],
            },
        );
        await a.onReady();
        await a.writeQueue;
        const cfg = a.json('config.json');
        assert.equal(cfg.idleSeconds, 120);
        assert.equal(cfg.slideSeconds, 15);
        assert.equal(cfg.fadeSeconds, 3);
        assert.deepEqual(cfg.images, ['/vis.0/slideshow/Urlaub%201.webp', '/vis.0/slideshow/a.png', '/vis.0/slideshow/b.JPG']);
        assert.equal(a.states.get('vis-screensaver.0.info.imageCount').val, 3);
        assert.ok(a.objects.has('vis-screensaver.0'), 'Meta-Objekt für den Dateispeicher fehlt');
        assert.equal(a.objects.get('vis-screensaver.0').common.type, 'meta.user');
        assert.ok(a.subscribed.includes('control.*'));
    });

    await test('state.json enthält enabled, rev und Zeitstempel', async () => {
        const a = await create({}, { 'vis.0/slideshow': [f('a.jpg')] });
        await a.onReady();
        await a.writeQueue;
        const s = a.json('state.json');
        assert.equal(s.enabled, true);
        assert.equal(typeof s.rev, 'number');
        assert.equal(s.startAt, s.stopAt);
        assert.equal(a.json('config.json').rev, s.rev);
    });

    await test('Überblendung >= Bilddauer wird auf Bilddauer-1 begrenzt und gewarnt', async () => {
        const a = await create({ slideSeconds: 10, fadeSeconds: 10 }, { 'vis.0/slideshow': [f('a.jpg')] });
        await a.onReady();
        await a.writeQueue;
        assert.equal(a.json('config.json').fadeSeconds, 9);
        assert.ok(a.logs.some(l => l[0] === 'warn' && /Überblendung/.test(l[1])));
    });

    await test('unsinnige Werte werden auf erlaubte Grenzen gezwungen', async () => {
        const a = await create(
            { idleSeconds: 'abc', slideSeconds: 1, fadeSeconds: -5 },
            { 'vis.0/slideshow': [f('a.jpg')] },
        );
        await a.onReady();
        await a.writeQueue;
        const cfg = a.json('config.json');
        assert.equal(cfg.idleSeconds, 180); // Standardwert bei Text
        assert.equal(cfg.slideSeconds, 2); // Minimum
        assert.equal(cfg.fadeSeconds, 0); // Minimum
    });

    await test('mehrere Ordner mit Komma, fehlender Ordner wird übersprungen und gewarnt', async () => {
        const a = await create(
            { imageSource: ' vis.0/slideshow , vis-screensaver.0/images, gibt.es/nicht ' },
            { 'vis.0/slideshow': [f('a.jpg')], 'vis-screensaver.0/images': [f('b.jpg')] },
        );
        await a.onReady();
        await a.writeQueue;
        assert.deepEqual(a.json('config.json').images, ['/vis-screensaver.0/images/b.jpg', '/vis.0/slideshow/a.jpg']);
        assert.ok(a.logs.some(l => l[0] === 'warn' && /gibt\.es\/nicht/.test(l[1])));
    });

    await test('leerer Ordner: Warnung nur einmal, config enthält leere Liste', async () => {
        const a = await create({}, { 'vis.0/slideshow': [] });
        await a.onReady();
        await a.refresh(false);
        await a.writeQueue;
        assert.deepEqual(a.json('config.json').images, []);
        assert.equal(a.logs.filter(l => /Keine Bilder/.test(l[1])).length, 1);
    });

    await test('erneutes Einlesen ohne Änderung lässt rev unverändert, mit neuer Datei steigt rev', async () => {
        const a = await create({}, { 'vis.0/slideshow': [f('a.jpg')] });
        await a.onReady();
        await a.writeQueue;
        const rev1 = a.json('config.json').rev;
        await new Promise(r => setTimeout(r, 5));
        await a.refresh(false);
        await a.writeQueue;
        assert.equal(a.json('config.json').rev, rev1);
        a.folders.set('vis.0/slideshow', [f('a.jpg'), f('neu.jpg')]);
        await new Promise(r => setTimeout(r, 5));
        await a.refresh(false);
        await a.writeQueue;
        const cfg = a.json('config.json');
        assert.ok(cfg.rev > rev1);
        assert.equal(cfg.images.length, 2);
        assert.equal(a.json('state.json').rev, cfg.rev);
    });

    await test('control.start und control.stop erhöhen die Zeitstempel in state.json', async () => {
        const a = await create({}, { 'vis.0/slideshow': [f('a.jpg')] });
        await a.onReady();
        await a.writeQueue;
        const s0 = a.json('state.json');
        await new Promise(r => setTimeout(r, 5));
        await a.onStateChange('vis-screensaver.0.control.start', { val: true, ack: false });
        await a.writeQueue;
        const s1 = a.json('state.json');
        assert.ok(s1.startAt > s0.startAt);
        assert.equal(s1.stopAt, s0.stopAt);
        await new Promise(r => setTimeout(r, 5));
        await a.onStateChange('vis-screensaver.0.control.stop', { val: true, ack: false });
        await a.writeQueue;
        const s2 = a.json('state.json');
        assert.ok(s2.stopAt > s1.stopAt);
        assert.equal(s2.startAt, s1.startAt);
    });

    await test('bestätigte States (ack=true) und leere States werden ignoriert', async () => {
        const a = await create({}, { 'vis.0/slideshow': [f('a.jpg')] });
        await a.onReady();
        await a.writeQueue;
        const before = a.files.get('vis-screensaver.0/state.json');
        await a.onStateChange('vis-screensaver.0.control.start', { val: true, ack: true });
        await a.onStateChange('vis-screensaver.0.control.start', null);
        await a.writeQueue;
        assert.equal(a.files.get('vis-screensaver.0/state.json'), before);
    });

    await test('control.enabled schaltet ab; Einstellung "aktiv" im Admin bleibt Hauptschalter', async () => {
        const a = await create({}, { 'vis.0/slideshow': [f('a.jpg')] });
        await a.onReady();
        await a.writeQueue;
        await a.onStateChange('vis-screensaver.0.control.enabled', { val: false, ack: false });
        await a.writeQueue;
        assert.equal(a.json('state.json').enabled, false);
        await a.onStateChange('vis-screensaver.0.control.enabled', { val: true, ack: false });
        await a.writeQueue;
        assert.equal(a.json('state.json').enabled, true);

        const off = await create({ enabled: false }, { 'vis.0/slideshow': [f('a.jpg')] });
        await off.onReady();
        await off.writeQueue;
        assert.equal(off.json('state.json').enabled, false);
    });

    await test('gespeicherter Wert von control.enabled=false überlebt einen Neustart', async () => {
        MockAdapter.nextConfig = { ...defaults };
        const a = factory({});
        a.folders.set('vis.0/slideshow', [f('a.jpg')]);
        a.states.set('vis-screensaver.0.control.enabled', { val: false, ack: true });
        await a.onReady();
        await a.writeQueue;
        assert.equal(a.json('state.json').enabled, false);
    });

    await test('Unload räumt den Timer auf', async () => {
        const a = await create({ rescanMinutes: 5 }, { 'vis.0/slideshow': [f('a.jpg')] });
        await a.onReady();
        assert.ok(a.rescanTimer, 'Timer sollte laufen');
        await new Promise(resolve => a.onUnload(resolve));
        assert.equal(a.rescanTimer, null);
    });


    // ---- Bildprüfung ----------------------------------------------------------
    const checkFolders = () => ({
        'vis.0/slideshow': [sized('ok.png', 200), sized('riesig.png', 6000), sized('viele-pixel.png', 300)],
    });
    const fillData = a => {
        a.fileData.set('vis.0/slideshow/ok.png', pngHeader(1600, 1000));
        a.fileData.set('vis.0/slideshow/riesig.png', pngHeader(6000, 4000));
        a.fileData.set('vis.0/slideshow/viele-pixel.png', pngHeader(5000, 3000));
    };
    const warns = a => a.logs.filter(l => l[0] === 'warn').map(l => l[1]);

    await test('Bildprüfung meldet zu große Dateien und zu viele Pixel', async () => {
        const a = await create({}, checkFolders());
        fillData(a);
        await a.onReady();
        assert.equal(a.states.get('vis-screensaver.0.info.oversizedCount').val, 2);
        const report = JSON.parse(a.states.get('vis-screensaver.0.info.imageReport').val);
        assert.deepEqual(report.map(r => r.file).sort(), ['riesig.png', 'viele-pixel.png']);
        const riesig = report.find(r => r.file === 'riesig.png');
        assert.equal(riesig.width, 6000);
        assert.equal(riesig.issues.length, 2); // Dateigröße und Pixel
        assert.equal(report.find(r => r.file === 'viele-pixel.png').issues.length, 1); // nur Pixel
        assert.ok(warns(a).some(w => /2 von 3 Bildern/.test(w)));
        assert.ok(warns(a).some(w => /riesig\.png/.test(w)));
        assert.ok(!warns(a).some(w => /ok\.png/.test(w)), 'ok.png darf nicht gemeldet werden');
    });

    await test('Bildprüfung: jede Datei wird nur einmal gelesen und das Log wiederholt sich nicht', async () => {
        const a = await create({}, checkFolders());
        fillData(a);
        await a.onReady();
        assert.equal(a.reads.length, 3);
        const warnCount = warns(a).length;
        await a.refresh(false);
        await a.refresh(false);
        assert.equal(a.reads.length, 3, 'unveränderte Dateien dürfen nicht erneut gelesen werden');
        assert.equal(warns(a).length, warnCount, 'Warnung darf nicht bei jedem Einlesen erscheinen');
    });

    await test('Bildprüfung: geänderte Datei (neuer Zeitstempel) wird neu geprüft', async () => {
        const a = await create({}, checkFolders());
        fillData(a);
        await a.onReady();
        a.folders.set('vis.0/slideshow', [sized('ok.png', 200), sized('riesig.png', 6000, 2), sized('viele-pixel.png', 300)]);
        a.fileData.set('vis.0/slideshow/riesig.png', pngHeader(1000, 700));
        await a.refresh(false);
        assert.equal(a.reads.length, 4);
        const report = JSON.parse(a.states.get('vis-screensaver.0.info.imageReport').val);
        const riesig = report.find(r => r.file === 'riesig.png');
        assert.equal(riesig.issues.length, 1, 'nur noch die Dateigröße ist zu groß');
        assert.equal(riesig.width, 1000);
    });

    await test('Bildprüfung abgeschaltet: keine Dateizugriffe, keine Meldungen', async () => {
        const a = await create({ checkImages: false }, checkFolders());
        fillData(a);
        await a.onReady();
        assert.equal(a.reads.length, 0);
        assert.equal(a.states.has('vis-screensaver.0.info.oversizedCount'), false);
        assert.ok(!warns(a).some(w => /größer als empfohlen/.test(w)));
    });

    await test('Bildprüfung: Grenzwerte sind einstellbar', async () => {
        const a = await create({ maxMegapixels: 30, maxFileKB: 10000 }, checkFolders());
        fillData(a);
        await a.onReady();
        assert.equal(a.states.get('vis-screensaver.0.info.oversizedCount').val, 0);
    });

    await test('Bildprüfung: nicht lesbares Bild bricht nichts ab, Dateigröße zählt trotzdem', async () => {
        const a = await create({}, checkFolders());
        a.fileData.set('vis.0/slideshow/ok.png', pngHeader(1600, 1000));
        // riesig.png und viele-pixel.png sind nicht lesbar
        await a.onReady();
        const report = JSON.parse(a.states.get('vis-screensaver.0.info.imageReport').val);
        assert.deepEqual(report.map(r => r.file), ['riesig.png']);
        assert.equal(report[0].width, null);
        assert.equal(a.json('config.json').images.length, 3, 'Bilder bleiben in der Liste');
    });

    await test('Bildprüfung: Unterordner wird als Lesepfad verwendet', async () => {
        const a = await create({ imageSource: 'vis.0/slideshow/urlaub' }, { 'vis.0/slideshow/urlaub': [sized('a b.png', 100)] });
        a.fileData.set('vis.0/slideshow/urlaub/a b.png', pngHeader(800, 600));
        await a.onReady();
        assert.deepEqual(a.reads, ['vis.0/slideshow/urlaub/a b.png']);
        assert.deepEqual(a.json('config.json').images, ['/vis.0/slideshow/urlaub/a%20b.png']);
    });

    console.log(`\n${passed} Tests bestanden${process.exitCode ? ', mindestens einer ist fehlgeschlagen' : ''}`);
})();
