# Pim

Pim ist eine Island am oberen Bildschirmrand von Windows, wie die Notch beim Mac. Zugeklappt ist sie eine schwarze Pille mit dem Maskottchen Pim und einer Statuszeile. Fährt die Maus darüber, klappt sie auf.

## Funktionen

| Tab | Was es tut |
|---|---|
| **Musik** | Zeigt Titel, Interpret, Cover und Fortschritt des aktuellen Players. Zurück, Play/Pause und Weiter steuern ihn live. Funktioniert mit jedem Player, der die Windows-Mediensteuerung nutzt: Spotify, Apple Music, YouTube/Netflix im Browser, VLC und andere. Darunter ein Regler für die Systemlautstärke mit Stummschalter. Das Mausrad über der Pille ändert die Lautstärke ebenfalls. |
| **Zwischenablage** | Die letzten 50 kopierten Texte und 10 Bilder. Ein Klick kopiert einen Eintrag erneut. Bilder lassen sich mit ↑ direkt auf den Standardspeicher hochladen. Der Verlauf liegt nur im Arbeitsspeicher, damit kopierte Passwörter nie auf der Festplatte landen. Mit 📌 angeheftete Einträge bleiben dauerhaft und werden gespeichert: Texte in `settings.json`, Bilder als PNG. |
| **Steam** | Laufende Steam-Downloads mit Prozent, Größe und Geschwindigkeit. Liest die `appmanifest_*.acf` aller Steam-Bibliotheken, ein Login ist nicht nötig. |
| **Upload** | Dateien auf die Island ziehen oder klicken. Sie werden auf den gewählten Speicher hochgeladen. Vorhandene Dateien werden nie überschrieben, Pim hängt dann „(1)“ an. |
| **Speicher** | Speicherorte einrichten und den Standard wählen. |
| **Akku** | Laptop-Akku mit Restzeit sowie Bluetooth-Kopfhörer und -Headsets mit Ladestand. Fällt ein Akku unter 20 % (Laptop) oder 15 % (Bluetooth), zeigt die Pille eine Warnung. |
| **Pim** | Accessoire wählen (Mütze, Krone, Brille …) oder automatisch nach Jahreszeit: Hexenhut Ende Oktober, Weihnachtsmütze im Dezember, Partyhut an Silvester, Mütze im Winter. Grundfarbe wählen. Spielmodus ein- oder ausschalten. |

**Spielmodus:** Läuft ein Spiel, ein Video oder eine Präsentation im Vollbild, blendet sich Pim aus. Danach erscheint es wieder. Pim fragt dafür denselben Status ab, den Windows für „Bitte nicht stören“ nutzt.

Pim reagiert auf das, was passiert. Bei Musik tanzt es, bei Steam-Downloads arbeitet es, beim Upload wird es zur Kiste, bei leerem Akku sackt es zusammen. Nach 5 Minuten Ruhe schläft es ein.

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

`Pim-<version>-portable.exe` starten. Pim erscheint oben in der Mitte des Hauptbildschirms und im Infobereich der Taskleiste. Ein Rechtsklick auf das Tray-Symbol bietet „Pim anzeigen“, „Mit Windows starten“ und „Beenden“. `Esc` klappt die Island zu.

## Entwickeln

```bash
cd pim-app
npm install
npm start        # App starten
npm test         # Tests: Steam-Parser, Ordner- und WebDAV-Upload
npm run dist     # Windows-Build nach dist/ (portable .exe und Installer)
```

Die Windows-Builds entstehen auch automatisch in GitHub Actions (Workflow „Pim Windows build“, Artefakt „Pim-Windows“).

| Datei | Inhalt |
|---|---|
| `main.js` | Fenster am oberen Rand, Tray, Einstellungen, Zwischenablage, IPC |
| `preload.js` | sichere Brücke zur Oberfläche |
| `lib/bridge.ps1`, `lib/bridge.js` | Windows-Brücke (PowerShell, keine Zusatzpakete): Mediensteuerung (SMTC), Systemlautstärke, Vollbild-Erkennung, Zwischenablage-Zähler |
| `lib/battery.js` | Bluetooth-Akkustände |
| `lib/steam.js` | Steam-Bibliotheken finden und Manifeste lesen |
| `lib/upload.js` | Upload in Ordner/SMB und per WebDAV |
| `src/pim.js` | Pim zeichnen (Canvas, ohne Bilder) |
| `src/island.*` | Oberfläche der Island |

## Grenzen

- Nur Windows 10/11. Musik und Steam funktionieren nur dort.
- Steam schreibt den Fortschritt nur alle paar Sekunden. Prozent und Tempo springen deshalb.
- Kein direkter API-Zugang zu Dropbox, Google Drive oder iCloud. Dafür braucht es die jeweilige Desktop-App.
- Die Zwischenablage erfasst Text und Bilder, keine Dateien. Kopiert ein Programm beides (z. B. Excel), zählt der Text.
- Der Lautstärkeregler steuert das Standard-Ausgabegerät, nicht einzelne Apps.
- Den Bluetooth-Akku sieht Pim nur bei Geräten, die ihn an Windows melden (die meisten Kopfhörer). Viele Mäuse, Tastaturen und Xbox-Controller melden ihn nicht. Der Wert wird jede Minute aktualisiert.
- Die Builds sind nicht signiert. Windows SmartScreen fragt beim ersten Start nach („Weitere Informationen“, dann „Trotzdem ausführen“).
