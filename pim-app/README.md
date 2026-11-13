# Pim

Pim ist eine Island am oberen Bildschirmrand von Windows, wie die Notch beim Mac. Zugeklappt ist sie eine schwarze Pille mit dem Maskottchen Pim und einer Statuszeile. Fährt die Maus darüber, klappt sie auf.

## Bedienung

| Aktion | Wirkung |
|---|---|
| Maus über die Pille | Nichts klappt auf. Die Pille zeigt den Status, z. B. Song, Steam-Download, Upload. |
| **Strg halten** und Maus über die Pille | Das Menü klappt auf. |
| **Strg + Mausrad** | Blättert durch die Menüs. Das Fenster passt seine Größe an das jeweilige Menü an. |
| Mausrad über der zugeklappten Pille | Systemlautstärke |
| Datei auf die Pille ziehen | Ein offener weißer Karton erscheint. Beim Loslassen schließt er sich, ein Papierflieger fliegt aus der Notch, und die Datei wird auf den Standardspeicher hochgeladen. Fortschritt und Ergebnis zeigt die Pille. |
| `Esc` oder Maus weg | Klappt zu. |

## Menüs

| Menü | Was es tut |
|---|---|
| **Musik** | Kleiner Player für den aktuellen Song: Cover, Titel, Fortschritt, vorheriger Titel, 10 s zurück, Play/Pause, 10 s vor, nächster Titel. Funktioniert mit jedem Player, der die Windows-Mediensteuerung nutzt: Spotify, Apple Music, YouTube/Netflix im Browser, VLC und andere. |
| **Zwischenablage** | Die letzten 50 kopierten Texte und 10 Bilder. Ein Klick kopiert einen Eintrag erneut, Bilder lassen sich direkt hochladen. Der Verlauf liegt nur im Arbeitsspeicher, damit kopierte Passwörter nie auf der Festplatte landen. Angeheftete Einträge bleiben dauerhaft und werden gespeichert: Texte in `settings.json`, Bilder als PNG. |
| **Steam** | Laufende Steam-Downloads, eine Zeile pro Spiel: Titel, Balken, Größe, Tempo. Lange Titel enden mit „…“ und laufen beim Darüberfahren durch. |
| **Speicher** | Speicherorte einrichten und den Standard für Uploads wählen. |
| **Akku** | Laptop-Akku mit Restzeit sowie Bluetooth-Kopfhörer und -Headsets. Unter 20 % (Laptop) oder 15 % (Bluetooth) warnt die Pille. |
| **Pim** | Accessoire (oder automatisch nach Jahreszeit), Farbe, Spielmodus, Updates. |

Alle Knöpfe sind Symbole. Beim Darüberfahren zeigt ein Tooltip, was sie tun.

**Spielmodus:** Läuft ein Spiel, ein Video oder eine Präsentation im Vollbild, blendet sich Pim aus. Danach erscheint es wieder.

Im Grundzustand ist Pim weiß und atmet und blinzelt. Seine Augen folgen dann dem Mauszeiger auf dem ganzen Bildschirm, ebenso bei kurzen Reaktionen wie „kopiert“, „Upload fertig“ oder beim Drag & Drop. Ansonsten reagiert Pim auf das, was passiert. Bei Musik tanzt es, bei Steam-Downloads arbeitet es, beim Upload wird es zur Kiste, bei leerem Akku sackt es zusammen. Bewegt sich die Maus 5 Minuten nicht, gähnt Pim und schläft ein. Bewegt sie sich wieder, wacht es überrascht auf, winkt und ist wieder bereit. Findet Pim ein Update, freut es sich kurz. Nach der Installation tanzt es 10 Sekunden lang.

### Speicherorte

| Vorlage | Typ | Voraussetzung |
|---|---|---|
| FRITZ!NAS | Ordner (SMB) `\\fritz.nas\FRITZ.NAS` | FRITZ!NAS in der FRITZ!Box aktiv. Zugangsdaten einmal im Explorer eingeben. |
| TrueNAS | Ordner (SMB) `\\truenas.local\<freigabe>` | SMB-Freigabe |
| TrueNAS (WebDAV) | WebDAV | WebDAV-Dienst in TrueNAS aktiv |
| iCloud Drive | Ordner | iCloud für Windows |
| Dropbox | Ordner | Dropbox-App |
| Google Drive | Ordner `G:\Meine Ablage` | Google Drive für Desktop |
| OneDrive | Ordner | bei Windows dabei |
| Eigener Ordner / WebDAV | frei | z. B. Nextcloud, MyFRITZ-Onlinespeicher |

Cloud-Dienste laufen über ihre Sync-Ordner. Pim kopiert die Datei hinein, die Hersteller-App lädt sie hoch. WebDAV-Passwörter verschlüsselt Pim mit Windows (DPAPI über Electron `safeStorage`). Die Oberfläche bekommt sie nie zu sehen.

## Benutzen

`Pim-Setup-<version>.exe` einmal installieren. Admin-Rechte braucht es nicht, Pim landet im Benutzerprofil. Pim erscheint oben in der Mitte des Hauptbildschirms und im Infobereich der Taskleiste. Ein Rechtsklick auf das Tray-Symbol bietet „Pim anzeigen“, „Nach Updates suchen“, „Mit Windows starten“ und „Beenden“. `Esc` klappt die Island zu.

### Updates

Die installierte Version prüft 15 Sekunden nach dem Start und danach alle 6 Stunden, ob es auf GitHub ein neues Release gibt. Ein Update lädt sie im Hintergrund. Ist es fertig, zeigt die Pille „Update … bereit“. Im Tab „Pim“ startet „Jetzt neu starten“ die Installation. Ohne Klick wird das Update beim nächsten Beenden installiert. Deinstallieren ist nie nötig, Einstellungen, Speicherorte und angeheftete Einträge bleiben erhalten.

Die portable `.exe` kann sich nicht selbst ersetzen. Sie meldet neue Versionen nur und verlinkt den Download. Wer automatische Updates will, installiert einmal `Pim-Setup`.

## Entwickeln

```bash
cd pim-app
npm install
npm start        # App starten
npm test         # Tests: Steam-Parser, Ordner- und WebDAV-Upload
npm run dist     # Windows-Build nach dist/ (portable .exe und Installer)
```

Die Windows-Builds entstehen auch automatisch in GitHub Actions (Workflow „Pim Windows build“, Artefakt „Pim-Windows“).

**Neue Version veröffentlichen:** `version` in `package.json` erhöhen, z. B. auf `0.4.0`, und nach `main` pushen. GitHub Actions baut dann unter Windows. Gibt es für diese Version noch kein Release, veröffentlicht der Workflow es mit Tag `v0.4.0`, `Pim-Setup-0.4.0.exe`, portabler `.exe` und `latest.yml`. Alle installierten Pims aktualisieren sich daraufhin. Ein gepushtes Tag `v0.4.0` löst das Release ebenfalls aus.

| Datei | Inhalt |
|---|---|
| `main.js` | Fenster am oberen Rand, Tray, Einstellungen, Zwischenablage, IPC |
| `preload.js` | sichere Brücke zur Oberfläche |
| `lib/bridge.ps1`, `lib/bridge.js` | Windows-Brücke (PowerShell, keine Zusatzpakete): Mediensteuerung (SMTC), Systemlautstärke, Vollbild-Erkennung, Zwischenablage-Zähler |
| `lib/battery.js` | Bluetooth-Akkustände |
| `lib/updater.js` | Selbst-Update über GitHub Releases |
| `lib/steam.js` | Steam-Bibliotheken finden und Manifeste lesen |
| `lib/upload.js` | Upload in Ordner/SMB und per WebDAV |
| `src/pim.js` | Pim zeichnen (Canvas, ohne Bilder) |
| `src/island.*` | Oberfläche der Island |
| `src/drop.js` | Karton- und Papierflieger-Animation beim Drag & Drop |

## Grenzen

- Nur Windows 10/11. Musik und Steam funktionieren nur dort.
- Steam schreibt den Fortschritt nur alle paar Sekunden. Prozent und Tempo springen deshalb.
- Kein direkter API-Zugang zu Dropbox, Google Drive oder iCloud. Dafür braucht es die jeweilige Desktop-App.
- Die Zwischenablage erfasst Text und Bilder, keine Dateien. Kopiert ein Programm beides (z. B. Excel), zählt der Text.
- Das Mausrad steuert die Lautstärke des Standard-Ausgabegeräts, nicht einzelner Apps.
- 10 s vor/zurück funktioniert nur, wenn der Player das Springen über Windows erlaubt. Browser tun das meist, Spotify nicht immer.
- Ordner lassen sich nicht hochladen, nur Dateien.
- Den Bluetooth-Akku sieht Pim nur bei Geräten, die ihn an Windows melden (die meisten Kopfhörer). Viele Mäuse, Tastaturen und Xbox-Controller melden ihn nicht. Der Wert wird jede Minute aktualisiert.
- Die Builds sind nicht signiert. Windows SmartScreen fragt beim ersten Start nach („Weitere Informationen“, dann „Trotzdem ausführen“).
