'use strict';

/* Prüft die Größenerkennung gegen Testbilder, die mit Pillow erzeugt wurden (test/make-fixtures.py). */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getImageSize } = require('../lib/imageinfo');

const dir = path.join(__dirname, 'fixtures');
let passed = 0;

console.log('Bildgrößen-Tests');
for (const file of fs.readdirSync(dir).sort()) {
    const buf = fs.readFileSync(path.join(dir, file));
    const m = file.match(/-(\d+)x(\d+)\.\w+$/);
    try {
        const size = getImageSize(buf);
        if (m) {
            assert.deepEqual(size, { width: Number(m[1]), height: Number(m[2]) });
        } else {
            assert.equal(size, null, 'sollte nicht erkannt werden');
        }
        passed++;
        console.log(`  ok   ${file}${size ? ` -> ${size.width}x${size.height}` : ' -> null'}`);
    } catch (err) {
        console.error(`  FAIL ${file}: ${err.message}`);
        process.exitCode = 1;
    }
}
try {
    assert.equal(getImageSize(null), null);
    assert.equal(getImageSize('text'), null);
    assert.equal(getImageSize(Buffer.alloc(0)), null);
    passed++;
    console.log('  ok   ungültige Eingaben ergeben null');
} catch (err) {
    console.error(`  FAIL ungültige Eingaben: ${err.message}`);
    process.exitCode = 1;
}
console.log(`\n${passed} Tests bestanden${process.exitCode ? ', mindestens einer ist fehlgeschlagen' : ''}`);
