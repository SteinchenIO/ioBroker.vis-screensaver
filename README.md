# ioBroker.vis-screensaver

🇩🇪 [Deutsche Version: README-DE.md](README-DE.md)

[<img src="admin/spende.svg" alt="Buy me a coffee" height="22">](https://www.paypal.me/SteinchenIO)

Screensaver with your own photos for wall tablets and kiosk displays running ioBroker/vis.
After an adjustable idle time it cross-fades images from an ioBroker folder. A tap ends it without triggering anything underneath.

## Settings (Admin → Instance)

| Setting | Meaning | Default |
|---|---|---|
| Time until start | Seconds without interaction until the screensaver starts | 180 |
| Display time per image | Seconds each image is shown (including the cross-fade) | 20 |
| Cross-fade duration | Seconds for the soft cross-fade (must be at least 1 s shorter than the display time) | 2 |
| Image folder | Folder in the ioBroker file storage in the form `area/subfolder`, e.g. `vis.0/slideshow` or `0_userdata.0/slideshow`; several folders separated by commas. Only one level is read | `vis.0/slideshow` |
| Random order | Shuffles the images, never showing the same image twice in a row | on |
| Image fit | Fill the screen (crop) or show the whole image | fill |
| Slow zoom | Gentle movement within the image (Ken Burns) | on |
| Show clock | Time and date at the bottom left | on |
| Rescan folder | New images are detected every n minutes; 0 = only when the instance starts | 10 |
| Check image size | Reports oversized images in the log | on |
| Check resolution | Opens every image to read its resolution. Switch off to save memory: the file size is still checked, resolutions are not | on |

## Objects

- `vis-screensaver.0.control.enabled` switches the screensaver on and off (kept after a restart)
- `vis-screensaver.0.control.start` and `.stop` start or end it on all open pages (button value `true`)
- `vis-screensaver.0.info.imageCount`, `.oversizedCount`, `.imageReport`, `.lastScan`

## Integration

The screensaver is a script that the page loads itself. There are three ways:

### 1. vis 1, for all views (recommended)

In the editor open the **Scripts** tab on the right and add this line:

```javascript
(function(){var s=document.createElement('script');s.src='/vis-screensaver/screensaver.js';document.head.appendChild(s);})();
```

This applies to the whole project. Remove any old screensaver code from this tab first, otherwise two would run. Then reload the view in runtime mode (not in the editor) with Ctrl+F5. The screensaver never starts inside the editor.

### 2. vis 1, widget

After the installation vis restarts once (the adapter does this itself). In the editor choose the set `screensaver` under "Insert widget" and drag **Bildschirmschoner** onto a view. It loads the script, shows the status and starts the screensaver on tap. A long press (0.8 s) switches it on or off. The field "Switch state" contains `vis-screensaver.0.control.enabled`. You only need the widget if you want the tile. The script works without it.

### 3. Your own HTML (e.g. a desktop menu)

Add before `</body>`:

```html
<script src="/vis-screensaver/screensaver.js"></script>
```

### Example view for vis 1

The file [`examples/vis-view-screensaver-demo.json`](examples/vis-view-screensaver-demo.json) is a ready-made vis 1 view with the tile, an on/off lamp for `control.enabled` and the button "Schoner starten" and three lines with the values from `info` (images found, too large, last scan). Import it in the editor on the **Views** tab (import view) and paste the file content. It contains nothing but the screensaver controls.

### Control from your own code

```javascript
IoBScreensaver.start();     // start immediately
IoBScreensaver.stop();      // end it, restart the idle time
IoBScreensaver.reload();    // reload the settings
IoBScreensaver.isActive();  // true while the screensaver is running
```

For embedded pages (e.g. Lyrion in a frame) where a tap does not reach the outer page:

```javascript
IoBScreensaver.blockWhile(function () { return frameIsOpen; });
```

The function prevents the start as long as it returns `true`.
If your desktop menu has its own screensaver (`CONFIG.saver`), set `enabled:false` there.

## Images: strategy

- **Target size:** The Waveshare display is 1280 × 800 (16:10). With the zoom an image needs up to 10 % reserve, so **1600 × 1000** pixels. More gives no benefit but costs memory and causes stutter on a Raspberry Pi.
- **Format:** JPEG, quality 80–85, preferably below 1.5 MB, usually below 400 KB.
- **Shrinking:** In the instance settings under "Images" click the **Foto-Werkzeug öffnen** image. It opens in a new tab; if your browser blocks pop-ups for the admin address it opens in the same tab instead, so allow pop-ups there or save your settings first (alternatively `http://<ioBroker-IP>:8081/files/vis-screensaver.admin/tools/resize.html`). Drop your photos in and download the ZIP. Everything runs in the browser; the phone rotation (EXIF) is respected and file names are cleaned.
- **People detection (optional):** The photo tool can find people and crop around them instead of cutting from the middle. You can also move the crop by hand ("Ausschnitt verschieben"). The detection runs in the browser, the photos stay on your computer. It needs four files (about 22 MB) that are **not** part of the adapter, so updates stay small.
  Install it once in the adapter settings under **People detection** with the button "Install people detection (about 22 MB)". The adapter downloads the files once (model from Google, library from jsDelivr), checks their checksums and keeps them in its own file storage, so adapter updates do not download them again. With several instances the tool always uses the files of instance 0 (`vis-screensaver.0`), so only install them there; "Check status" on another instance also tells you whether they exist in instance 0. Without them the tool crops from the middle and says so under "Bildausschnitt".
- **Upload:** Admin → **Files** → folder `vis.0/slideshow` → drag the unpacked images into the window.
- **Check:** The adapter checks the images without decoding them. Anything above "Maximum file size" or "Maximum megapixels" appears in the log and in `info.imageReport`. The images are still shown.
- Portrait images: With "fill the screen" they are cropped heavily. Choose "show whole image" or prepare them in the tool with "Fit".

## Installation

Requirements: Node.js 22 or newer, js-controller 6.0.11 or newer, admin 7.6.20 or newer.

Install the adapter on the **Adapters** tab of the ioBroker admin. Then check under **Instances** that `vis-screensaver.0` exists and create the instance if it does not. Afterwards enter the image folder and the timing in the instance settings. How to integrate the screensaver into vis or your own page is described under "Integration".

### Update

Update the adapter on the **Adapters** tab like any other adapter. The instance settings are kept. The adapter restarts vis once so that the widget is recognised.

## Support

Do you like the adapter? You can support further development with a small donation via [PayPal.me/SteinchenIO](https://www.paypal.me/SteinchenIO). The adapter stays free in any case.

## Changelog

### 0.1.33
- Releases are published to npm automatically by GitHub Actions (trusted publishing). No functional change. Old changelog entries moved to `CHANGELOG_OLD.md`.

### 0.1.32
- With the image check switched off, `info.oversizedCount` and `info.imageReport` are cleared at start (0 and `[]`), so no old results remain.

### 0.1.31
- New switch "Check resolution". Switched off, the adapter no longer opens every image at start, which saves memory (about 65 MB peak with 170 images of 800 KB each, measured on one Pi). The file size is still checked.

### 0.1.30
- The status check shows whether person detection is installed in instance 0 as well. The photo tool always uses the files of instance 0.

### 0.1.29
- Admin texts moved to translation files (`admin/i18n`).

### 0.1.28
- Admin dialog translated into all 11 languages.

### 0.1.27
- Texts: the photo tool link opens in a new tab (pop-ups must be allowed).

### 0.1.26
- Photo tool: people detection is installed with one button in the adapter settings.

Older entries: see [CHANGELOG_OLD.md](CHANGELOG_OLD.md).

## License

MIT License

Copyright (c) 2026 SteinchenIO <git@felz.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
