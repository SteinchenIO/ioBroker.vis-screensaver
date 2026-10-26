'use strict';

/*
 * Liest Breite und Höhe aus den Kopfdaten eines Bildes, ohne es zu dekodieren.
 * Unterstützt JPEG, PNG, GIF, WebP und BMP. Liefert null, wenn das Format
 * nicht erkannt wird oder die Daten unvollständig sind.
 */

/** @param {Buffer} buf */
function jpegSize(buf) {
    let i = 2;
    while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) {
            i++;
            continue;
        }
        const marker = buf[i + 1];
        if (marker === 0xff) {
            i++; // Füllbyte
            continue;
        }
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
            i += 2; // Marker ohne Länge
            continue;
        }
        if (marker === 0xda) {
            return null; // Bilddaten beginnen, ohne dass ein SOF-Block gefunden wurde
        }
        // SOF0..SOF15, außer DHT (C4), JPG (C8) und DAC (CC)
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + buf.readUInt16BE(i + 2);
    }
    return null;
}

/** @param {Buffer} buf */
function webpSize(buf) {
    if (buf.length < 30) {
        return null;
    }
    const chunk = buf.toString('latin1', 12, 16);
    if (chunk === 'VP8 ') {
        return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === 'VP8L') {
        const b0 = buf[21];
        const b1 = buf[22];
        const b2 = buf[23];
        const b3 = buf[24];
        return {
            width: 1 + (((b1 & 0x3f) << 8) | b0),
            height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
        };
    }
    if (chunk === 'VP8X') {
        return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    }
    return null;
}

/**
 * @param {Buffer} buf
 * @returns {{width: number, height: number} | null}
 */
function getImageSize(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 26) {
        return null;
    }
    try {
        if (buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) {
            return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }; // PNG
        }
        if (buf.toString('latin1', 0, 3) === 'GIF') {
            return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
        }
        if (buf[0] === 0xff && buf[1] === 0xd8) {
            return jpegSize(buf);
        }
        if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
            return webpSize(buf);
        }
        if (buf[0] === 0x42 && buf[1] === 0x4d) {
            return { width: Math.abs(buf.readInt32LE(18)), height: Math.abs(buf.readInt32LE(22)) }; // BMP
        }
    } catch (err) {
        return null;
    }
    return null;
}

module.exports = { getImageSize };
