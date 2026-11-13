# Pim

Pim ist eine Island am oberen Bildschirmrand von Windows, wie die Notch beim Mac. Zugeklappt ist sie eine schwarze Pille mit dem Maskottchen Pim und einer Statuszeile. Fährt die Maus darüber, klappt sie auf.

## Funktionen

| Tab | Was es tut |
|---|---|
| **Musik** | Zeigt Titel, Interpret, Cover und Fortschritt des aktuellen Players. Zurück, Play/Pause und Weiter steuern ihn live. Funktioniert mit jedem Player, der die Windows-Mediensteuerung nutzt: Spotify, Apple Music, YouTube/Netflix im Browser, VLC und andere. |
| **Zwischenablage** | Die letzten 50 kopierten Texte. Ein Klick kopiert einen Eintrag erneut. Die Liste liegt nur im Arbeitsspeicher und ist nach dem Beenden weg, damit kopierte Passwörter nie auf der Festplatte landen. |
| **Steam** | Laufende Steam-Downloads mit Prozent, Größe und Geschwindigkeit. Liest die `appmanifest_*.acf` aller Steam-Bibliotheken, ein Login ist nicht nötig. |
| **Upload** | Dateien auf die Island ziehen oder klicken. Sie werden auf den gewählten Speicher hochgeladen. Vorhandene Dateien werden nie überschrieben, Pim hängt dann „(1)“ an. |
| **Speicher** | Speicherorte einrichten und den Standard wählen. |

Pim reagiert auf das, was passiert. Bei Musik tanzt es, bei Steam-Downloads arbeitet es, beim Upload wird es zur Kiste. Nach 5 Minuten Ruhe schläft es ein.

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
| `lib/media.ps1`, `lib/media.js` | Mediensteuerung über Windows-SMTC (PowerShell, keine Zusatzpakete) |
| `lib/steam.js` | Steam-Bibliotheken finden und Manifeste lesen |
| `lib/upload.js` | Upload in Ordner/SMB und per WebDAV |
| `src/pim.js` | Pim zeichnen (Canvas, ohne Bilder) |
| `src/island.*` | Oberfläche der Island |

## Grenzen

- Nur Windows 10/11. Musik und Steam funktionieren nur dort.
- Steam schreibt den Fortschritt nur alle paar Sekunden. Prozent und Tempo springen deshalb.
- Kein direkter API-Zugang zu Dropbox, Google Drive oder iCloud. Dafür braucht es die jeweilige Desktop-App.
- Die Zwischenablage speichert nur Text, keine Bilder.
- Die Builds sind nicht signiert. Windows SmartScreen fragt beim ersten Start nach („Weitere Informationen“, dann „Trotzdem ausführen“).
