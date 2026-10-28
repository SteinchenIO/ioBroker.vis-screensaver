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
- **Shrinking:** In the instance settings under "Images" click the **Foto-Werkzeug öffnen** image. It opens in the same tab, so save your settings first (alternatively `http://<ioBroker-IP>:8081/files/vis-screensaver.admin/tools/resize.html`). Drop your photos in and download the ZIP. Everything runs in the browser; the phone rotation (EXIF) is respected and file names are cleaned.
- **Upload:** Admin → **Files** → folder `vis.0/slideshow` → drag the unpacked images into the window.
- **Check:** The adapter checks the images without decoding them. Anything above "Maximum file size" or "Maximum megapixels" appears in the log and in `info.imageReport`. The images are still shown.
- Portrait images: With "fill the screen" they are cropped heavily. Choose "show whole image" or prepare them in the tool with "Fit".

## Installation

Requirements: Node.js 22 or newer, js-controller 6.0.11 or newer, admin 7.6.20 or newer.

The adapter is not in the official ioBroker repository and is therefore installed directly from GitHub. On the ioBroker machine (e.g. Raspberry Pi) via SSH:

```
cd /opt/iobroker
iobroker url https://github.com/SteinchenIO/ioBroker.vis-screensaver
```

Then check in the admin under Instances that `vis-screensaver.0` exists. If not:

```
iobroker add vis-screensaver
```

Afterwards enter the image folder and the timing in the instance settings. How to integrate the screensaver into vis or your own page is described under "Integration".

### Alternatively in the admin

The installation also works through the user interface. The **cat icon** (GitHub symbol) in the adapter view is **only available in expert mode**.

1. **Switch on expert mode** (switch at the bottom left of the menu bar).
2. On the **Adapters** tab click the **cat icon** in the toolbar.
3. In the dialog choose the **Custom** tab. The "From GitHub" tab does not fit here, it only lists adapters from the adapter list.
4. Enter the address `https://github.com/SteinchenIO/ioBroker.vis-screensaver`.
5. Leave "Create an instance if none exists" ticked and click **Install**.

### Important: do not copy by hand into `node_modules`

A folder copied by hand into `/opt/iobroker/node_modules/` is not listed in the `package.json` of ioBroker. The next `npm install` (e.g. during an adapter update) removes it as superfluous, and the instance reports `startInstance cannot find adapter`. Installing with `iobroker url` registers the adapter and protects it.

### Update

Run the same command again:

```
cd /opt/iobroker
iobroker url https://github.com/SteinchenIO/ioBroker.vis-screensaver
```

The instance settings are kept. The adapter restarts vis once so that the widget is recognised.

## Support

Do you like the adapter? You can support further development with a small donation via [PayPal.me/SteinchenIO](https://www.paypal.me/SteinchenIO). The adapter stays free in any case.

## Changelog

### 0.1.23
- Standard ioBroker tests and GitHub workflow added.

### 0.1.22
- README button opens the German README.

### 0.1.21
- Translations added, e-mail address in the license.

### 0.1.20
- Formatted, colored code examples in the settings and README.

### 0.1.19
- Admin layout sizes completed, admin 7.6.20 recommended.

### 0.1.18
- Requirements raised: Node.js 22, js-controller 6.0.11, admin 7.6.17; adapter-core updated.

### 0.1.17
- Admin layout sizes for large screens, shorter news list.

### 0.1.16
- Adapter timer, state roles and metadata follow the ioBroker guidelines.

### 0.1.15
- Description corrected (no vis-2 widget).

Older entries: see the commit history on GitHub.

## License

MIT License

Copyright (c) 2026 SteinchenIO <git@felz.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
