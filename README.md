# ioBroker.vis-screensaver

[<img src="admin/spende.svg" alt="Kaffee spenden" height="28">](https://www.paypal.me/SteinchenIO)

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
- **Verkleinern:** In den Instanz-Einstellungen unter „Bilder“ auf das Bild **Foto-Werkzeug öffnen** klicken. Es öffnet sich im selben Tab, speichere vorher deine Einstellungen (alternativ `http://<ioBroker-IP>:8081/files/vis-screensaver.admin/tools/resize.html`), Fotos hineinziehen, ZIP laden. Alles läuft im Browser; die Handy-Drehung (EXIF) wird beachtet, Dateinamen werden bereinigt.
- **Hochladen:** Admin → **Dateien** → Ordner `vis.0/slideshow` → entpackte Bilder ins Fenster ziehen.
- **Kontrolle:** Der Adapter prüft die Bilder ohne sie zu dekodieren. Was über „Maximale Dateigröße“ oder „Maximale Megapixel“ liegt, steht im Log und in `info.imageReport`. Bilder werden trotzdem gezeigt.
- Hochformatbilder: Bei „Bildschirm füllen“ werden sie stark beschnitten. Dafür „Ganzes Bild zeigen“ wählen oder sie im Werkzeug mit „Einpassen“ vorbereiten.

## Installation

Voraussetzungen: Node.js 18 oder neuer, js-controller 5.0.19 oder neuer, Admin 6.17.14 oder neuer.

Der Adapter steht nicht im offiziellen ioBroker-Repository und wird deshalb direkt von GitHub installiert. Das geht auf dem ioBroker-Rechner (z. B. Raspberry Pi) per SSH:

```
cd /opt/iobroker
iobroker url https://github.com/SteinchenIO/ioBroker.vis-screensaver
```

Danach in der Admin-Oberfläche unter Instanzen prüfen, ob `vis-screensaver.0` vorhanden ist. Falls nicht:

```
iobroker add vis-screensaver
```

Anschließend in den Instanz-Einstellungen Bilderordner und Zeiten eintragen. Wie du den Schoner in vis oder eine eigene Seite einbindest, steht unter „Einbinden“.

### Alternativ im Admin

Die Installation geht auch über die Oberfläche. Das **Katzen-Symbol** (GitHub-Zeichen) in der Adapter-Ansicht gibt es aber **nur im Expertenmodus**.

1. **Expertenmodus einschalten** (Schalter unten links in der Menüleiste).
2. Im Reiter **Adapter** oben in der Werkzeugleiste auf das **Katzen-Symbol** klicken.
3. Im Dialog den Reiter **Benutzerdefiniert** wählen. Der Reiter „Von GitHub“ passt hier nicht, er zeigt nur Adapter aus der Adapterliste.
4. Die Adresse `https://github.com/SteinchenIO/ioBroker.vis-screensaver` eintragen.
5. Den Haken bei „Instanz erstellen, wenn noch keine existiert“ gesetzt lassen und auf **Installieren** klicken.

### Wichtig: nicht von Hand nach `node_modules` kopieren

Ein von Hand nach `/opt/iobroker/node_modules/` kopierter Ordner steht nicht in der `package.json` von ioBroker. Beim nächsten `npm install` (z. B. bei einem Adapter-Update) wird er dann als überflüssig entfernt, und die Instanz meldet `startInstance cannot find adapter`. Die Installation über `iobroker url` trägt den Adapter dagegen ein und schützt ihn.

### Update

Erneut denselben Befehl ausführen:

```
cd /opt/iobroker
iobroker url https://github.com/SteinchenIO/ioBroker.vis-screensaver
```

Die Instanz-Einstellungen bleiben erhalten. Der Adapter startet dabei vis einmal neu, damit das Widget erkannt wird.

## Unterstützen

Gefällt dir der Adapter? Über [PayPal.me/SteinchenIO](https://www.paypal.me/SteinchenIO) kannst du die Weiterentwicklung mit einer kleinen Spende unterstützen. Der Adapter bleibt in jedem Fall kostenlos.

## Lizenz

Der Adapter steht unter der **MIT-Lizenz**. Maßgeblich ist der englische Originaltext in [LICENSE](LICENSE). Die folgende deutsche Fassung ist eine unverbindliche Übersetzung (auch als Datei: [LICENSE-DE.md](LICENSE-DE.md)).

Copyright (c) 2026 SteinchenIO

Hiermit wird unentgeltlich jeder Person, die eine Kopie der Software und der zugehörigen Dokumentationsdateien (die „Software“) erhält, die Erlaubnis erteilt, uneingeschränkt mit der Software zu verfahren. Dies umfasst insbesondere das Recht, die Software zu nutzen, zu kopieren, zu verändern, zusammenzuführen, zu veröffentlichen, zu verbreiten, zu unterlizenzieren und/oder zu verkaufen, und Personen, denen die Software bereitgestellt wird, dies ebenfalls zu gestatten, unter den folgenden Bedingungen:

Der obige Urheberrechtsvermerk und dieser Erlaubnisvermerk sind in allen Kopien oder wesentlichen Teilen der Software beizufügen.

DIE SOFTWARE WIRD OHNE JEDE AUSDRÜCKLICHE ODER IMPLIZIERTE GARANTIE BEREITGESTELLT, EINSCHLIESSLICH DER GARANTIE ZUR BENUTZUNG FÜR DEN VORGESEHENEN ODER EINEN BESTIMMTEN ZWECK SOWIE JEGLICHER RECHTSVERLETZUNG, JEDOCH NICHT DARAUF BESCHRÄNKT. IN KEINEM FALL SIND DIE AUTOREN ODER COPYRIGHTINHABER FÜR JEGLICHEN SCHADEN ODER SONSTIGE ANSPRÜCHE HAFTBAR ZU MACHEN, OB INFOLGE DER ERFÜLLUNG EINES VERTRAGES, EINES DELIKTES ODER ANDERS IM ZUSAMMENHANG MIT DER SOFTWARE ODER SONSTIGER VERWENDUNG DER SOFTWARE ENTSTANDEN.
