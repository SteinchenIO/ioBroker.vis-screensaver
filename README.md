# ioBroker.vis-screensaver

Bildschirmschoner mit eigenen Fotos für Wandtablets und Kiosk-Displays mit ioBroker/vis.
Nach einer einstellbaren Leerlaufzeit blendet er Bilder aus einem ioBroker-Ordner weich ineinander über. Ein Tipp beendet ihn, ohne dass darunter etwas ausgelöst wird.

## Einstellungen (Admin → Instanz)

| Einstellung | Bedeutung | Standard |
|---|---|---|
| Zeit bis zum Start | Sekunden ohne Bedienung, bis der Schoner startet | 180 |
| Anzeigedauer je Bild | Sekunden, die jedes Bild zu sehen ist (inklusive Überblendung) | 20 |
| Dauer der Überblendung | Sekunden für die weiche Überblendung (muss mindestens 1 s kürzer sein als die Anzeigedauer) | 2 |
| Bilderordner | Ordner im ioBroker-Dateispeicher, z. B. `vis.0/slideshow`; mehrere mit Komma | `vis.0/slideshow` |
| Zufällige Reihenfolge | mischt die Bilder, ohne dasselbe Bild zweimal hintereinander | an |
| Bildanpassung | Bildschirm füllen (zuschneiden) oder ganzes Bild zeigen | füllen |
| Langsamer Zoom | sanfte Bewegung im Bild (Ken Burns) | an |
| Uhr anzeigen | Uhrzeit und Datum unten links | an |
| Ordner neu einlesen | alle n Minuten werden neue Bilder erkannt | 10 |
| Bildgröße prüfen | meldet zu große Bilder im Log | an |

## Objekte

- `vis-screensaver.0.control.enabled` schaltet den Schoner ein und aus (bleibt nach Neustart erhalten)
- `vis-screensaver.0.control.start` und `.stop` starten oder beenden ihn auf allen offenen Seiten (Button-Wert `true`)
- `vis-screensaver.0.info.imageCount`, `.oversizedCount`, `.imageReport`, `.lastScan`

## Einbinden

Der Schoner ist ein Skript, das die Seite selbst lädt. Es gibt drei Wege:

1. **Eigenes HTML (z. B. Desktop-Menü):** vor `</body>` einfügen
   `<script src="/vis-screensaver/screensaver.js"></script>`
2. **vis 1, Widget:** nach der Installation startet vis einmal neu (macht der Adapter selbst). Im Editor das Widget **Bildschirmschoner** auf eine Ansicht ziehen. Es lädt das Skript, zeigt den Status und startet den Schoner per Tipp. Langer Druck (0,8 s) schaltet ihn ein oder aus.
3. **vis 1 ohne Widget:** im Reiter **Skript** einfügen:
   `(function(){var s=document.createElement('script');s.src='/vis-screensaver/screensaver.js';document.head.appendChild(s);})();`
   Ein alter Schoner-Code in diesem Reiter muss vorher raus, sonst laufen zwei.

Steuerung aus eigenem Code: `IoBScreensaver.start()`, `.stop()`, `.reload()`, `.isActive()`.
Bei eingebetteten Seiten (z. B. Lyrion im Rahmen), in denen Tippen die Seite nicht erreicht:
`IoBScreensaver.blockWhile(function(){ return rahmenIstOffen; })` verhindert den Start, solange die Funktion `true` liefert.
Hat das Desktop-Menü einen eigenen Schoner (`CONFIG.saver`), dort `enabled:false` setzen.

## Bilder: Strategie

- **Zielgröße:** Das Waveshare-Display hat 1280 × 800 (16:10). Mit dem Zoom braucht ein Bild bis zu 10 % Reserve, also **1600 × 1000** Pixel. Mehr bringt nichts, kostet aber Speicher und Ruckler auf dem Raspberry Pi.
- **Format:** JPEG, Qualität 80–85, möglichst unter 1,5 MB, im Normalfall unter 400 KB.
- **Verkleinern:** In der Instanz (Bilder) auf **Foto-Werkzeug öffnen** klicken (alternativ `http://<ioBroker-IP>:8081/adapter/vis-screensaver/tools/resize.html`), Fotos hineinziehen, ZIP laden. Alles läuft im Browser; die Handy-Drehung (EXIF) wird beachtet, Dateinamen werden bereinigt.
- **Hochladen:** Admin → **Dateien** → Ordner `vis.0/slideshow` → entpackte Bilder ins Fenster ziehen.
- **Kontrolle:** Der Adapter prüft die Bilder ohne sie zu dekodieren. Was über „Maximale Dateigröße“ oder „Maximale Megapixel“ liegt, steht im Log und in `info.imageReport`. Bilder werden trotzdem gezeigt.
- Hochformatbilder: Bei „Bildschirm füllen“ werden sie stark beschnitten. Dafür „Ganzes Bild zeigen“ wählen oder sie im Werkzeug mit „Einpassen“ vorbereiten.

## Installation

Auf dem ioBroker-Server (aus dem entpackten Ordner):

```
cd /opt/iobroker
npm install /pfad/zu/iobroker.vis-screensaver
iobroker upload vis-screensaver
iobroker add vis-screensaver
```

Alternativ aus einem eigenen GitHub-Repository über Admin → Adapter → Benutzerdefiniert (Katze-Symbol). Dafür in `package.json` und `io-package.json` Autor und Repository eintragen (steht noch `DEIN-NAME`).

## Getestet und nicht getestet

Getestet (automatisch): Adapterlogik gegen eine Attrappe von `@iobroker/adapter-core` (19 Tests), Größenerkennung für JPEG/PNG/GIF/WebP/BMP (14), Schoner im echten Chromium (Start, Überblendung, Tippen, Fernsteuerung, Uhr, fehlende Bilder, 25 Prüfungen), Widget mit Attrappe von vis (20), Verkleinerungs-Werkzeug samt ZIP (15). Der Knopf „Foto-Werkzeug öffnen“ in der Instanz ist nicht getestet: Er verweist relativ auf `./adapter/vis-screensaver/tools/resize.html` (Admin liefert den `admin`-Ordner des Adapters aus). Öffnet er nichts, die ausgeschriebene Adresse oben nehmen.

**Nicht getestet**, weil hier kein ioBroker lief:
- das Zusammenspiel mit einem echten ioBroker (Dateien im Adapter-Speicher, Rückgabeform von `readFileAsync`)
- die URLs `/vis-screensaver.0/…` und `/vis-screensaver/…` über den Web-Adapter
- ob vis 1 das Widget-Set automatisch findet

Falls einer dieser Punkte abweicht, sind es kleine Anpassungen. Dann bitte die Log-Zeile oder den Fehler aus der Browser-Konsole (F12) schicken.

## Lizenz

MIT
