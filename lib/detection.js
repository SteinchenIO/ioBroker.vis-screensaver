'use strict';

/*
 * Optionale Personenerkennung für das Foto-Werkzeug (admin/tools/resize.html).
 *
 * Die Dateien (zusammen rund 22 MB) liegen NICHT im Adapter-Paket, damit nicht bei jedem
 * Update das Datenvolumen verbraucht wird. Der Adapter lädt sie auf Knopfdruck einmal
 * herunter, prüft die SHA-256-Summe jeder Datei und legt sie im eigenen Dateispeicher
 * (vis-screensaver.<n>/mediapipe/…) ab. Dieser bleibt bei Adapter-Updates erhalten.
 */

const crypto = require('node:crypto');

const VERSION = 'mediapipe-tasks-vision-1.2.0+efficientdet-lite0-float16';
const NPM = 'npm/@mediapipe/tasks-vision@1.2.0';

/** Dateien: Zielpfad im Dateispeicher, erwartete Größe und SHA-256, Quellen (der Reihe nach probiert). */
const FILES = [
    {
        path: 'mediapipe/efficientdet_lite0.tflite',
        size: 7254339,
        sha256: '4b59100025bea1235a84c1038879a6cccc9f6c49f5e41144e91e74d99e780993',
        urls: [
            'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/latest/efficientdet_lite0.tflite',
        ],
    },
    {
        path: 'mediapipe/vision_bundle.mjs',
        size: 156344,
        sha256: '870da5cfc43bfcf2a8b0f14e8152dae8c7e701722e1191b0e592b94b81b4127a',
        urls: [`https://cdn.jsdelivr.net/${NPM}/vision_bundle.mjs`, `https://unpkg.com/@mediapipe/tasks-vision@1.2.0/vision_bundle.mjs`],
    },
    {
        path: 'mediapipe/wasm/vision_wasm_internal.js',
        size: 334128,
        sha256: '85c1a342be70427987f900969a5f26e17557351111364e6585e97fb03e93e108',
        urls: [
            `https://cdn.jsdelivr.net/${NPM}/wasm/vision_wasm_internal.js`,
            'https://unpkg.com/@mediapipe/tasks-vision@1.2.0/wasm/vision_wasm_internal.js',
        ],
    },
    {
        path: 'mediapipe/wasm/vision_wasm_internal.wasm',
        size: 14466654,
        sha256: 'bcc13df22d3d69ec8cbe8e280989356d844ae00f4523eb82072d2484f44134dc',
        urls: [
            `https://cdn.jsdelivr.net/${NPM}/wasm/vision_wasm_internal.wasm`,
            'https://unpkg.com/@mediapipe/tasks-vision@1.2.0/wasm/vision_wasm_internal.wasm',
        ],
    },
];

const MARKER = 'mediapipe/installed.json';

function sha256(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

/** Datei laden und gegen Größe und Summe prüfen. Wirft einen Fehler mit verständlichem Text. */
async function download(file, fetchFn, log) {
    const problems = [];
    for (const url of file.urls) {
        try {
            const res = await fetchFn(url, { redirect: 'follow', signal: AbortSignal.timeout(180000) });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length !== file.size || sha256(buf) !== file.sha256) {
                throw new Error(`Datei stimmt nicht mit der erwarteten Prüfsumme überein (${buf.length} Bytes)`);
            }
            return buf;
        } catch (err) {
            const host = (() => {
                try {
                    return new URL(url).host;
                } catch {
                    return url;
                }
            })();
            problems.push(`${host}: ${err.message}`);
            log.warn(`Personenerkennung: ${file.path} von ${url} nicht geladen: ${err.message}`);
        }
    }
    throw new Error(`${file.path} konnte nicht geladen werden (${problems.join('; ')})`);
}

/**
 * Status lesen.
 * @param {(name: string) => Promise<any>} read liest eine Datei aus dem Dateispeicher (wirft, wenn sie fehlt)
 * @returns {Promise<{installed: boolean, version?: string, outdated?: boolean}>}
 */
async function status(read) {
    try {
        const res = await read(MARKER);
        const data = res && res.file !== undefined ? res.file : res;
        const marker = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : String(data));
        if (marker.version === VERSION) {
            return { installed: true, version: marker.version };
        }
        return { installed: false, version: marker.version, outdated: true };
    } catch {
        return { installed: false };
    }
}

/**
 * Installieren. Lädt nur, wenn nichts oder etwas Veraltetes installiert ist (oder force gesetzt ist).
 * @param {{read: Function, write: Function, fetchFn?: Function, log: any, force?: boolean, files?: typeof FILES}} o
 * @returns {Promise<{downloaded: boolean, bytes: number}>}
 */
async function install(o) {
    const fetchFn = o.fetchFn || fetch;
    const files = o.files || FILES;
    if (!o.force) {
        const st = await status(o.read);
        if (st.installed) {
            return { downloaded: false, bytes: 0 };
        }
    }
    let bytes = 0;
    const sums = {};
    for (const file of files) {
        o.log.info(`Personenerkennung: lade ${file.path} …`);
        const buf = await download(file, fetchFn, o.log);
        await o.write(file.path, buf);
        bytes += buf.length;
        sums[file.path] = file.sha256;
    }
    // Marker zuletzt: nur wenn alles da ist, gilt die Installation als vollständig
    await o.write(MARKER, JSON.stringify({ version: VERSION, installedAt: new Date().toISOString(), files: sums }));
    o.log.info(`Personenerkennung installiert (${(bytes / 1048576).toFixed(1)} MB).`);
    return { downloaded: true, bytes };
}

module.exports = { VERSION, FILES, MARKER, status, install, sha256 };
