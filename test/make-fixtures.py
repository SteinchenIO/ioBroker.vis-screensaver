"""
Erzeugt kleine Testbilder für test/imageinfo.test.js.
Die Größe steckt im Dateinamen (…-<Breite>x<Höhe>.<Endung>), das Testskript liest sie von dort.

Start:  python3 test/make-fixtures.py
"""
import pathlib

from PIL import Image

OUT = pathlib.Path(__file__).resolve().parent / 'fixtures'
OUT.mkdir(exist_ok=True)


def img(w, h, mode='RGB'):
    color = (200, 60, 60) if mode == 'RGB' else (200, 60, 60, 128)
    return Image.new(mode, (w, h), color)


for p in OUT.iterdir():
    p.unlink()

img(640, 480).save(OUT / 'jpeg-baseline-640x480.jpg', 'JPEG')
img(1920, 1080).save(OUT / 'jpeg-progressive-1920x1080.jpg', 'JPEG', progressive=True)
# langer Kommentar vor den Bilddaten: der Frame-Header liegt weit hinten
img(800, 600).save(OUT / 'jpeg-langer-kopf-800x600.jpg', 'JPEG', comment=b'x' * 60000)
img(4000, 3000).save(OUT / 'jpeg-gross-4000x3000.jpg', 'JPEG')
img(300, 200).save(OUT / 'png-300x200.png', 'PNG')
img(123, 45, 'RGBA').save(OUT / 'png-rgba-123x45.png', 'PNG')
img(64, 48).save(OUT / 'gif-64x48.gif', 'GIF')
img(500, 300).save(OUT / 'webp-lossy-500x300.webp', 'WEBP', quality=70)
img(320, 240).save(OUT / 'webp-lossless-320x240.webp', 'WEBP', lossless=True)
img(100, 80, 'RGBA').save(OUT / 'webp-alpha-100x80.webp', 'WEBP')
img(120, 90).save(OUT / 'bmp-120x90.bmp', 'BMP')

(OUT / 'kein-bild.txt').write_text('Das ist kein Bild und viel zu kurz, aber lang genug fuer den Test.')
(OUT / 'abgeschnitten.jpg').write_bytes((OUT / 'jpeg-baseline-640x480.jpg').read_bytes()[:20])
print(f'{len(list(OUT.iterdir()))} Dateien in {OUT}')
