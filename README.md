# Taktwerk

Eine kleine Angular-Anwendung, mit der sich Schlagzeug-Patterns in frei einstellbaren Taktarten schreiben, anhören und exportieren lassen.

## Funktionen

- Schlagzeug-Partitur mit fünf Notenlinien, Taktstrichen und Percussion-Schlüssel für Crash/Hi-Hat, erstes und zweites Tom, Floortom, Snare und Bass Drum
- Takte umbrechen abhängig von der verfügbaren Fensterbreite automatisch in weitere Zeilen
- Noten, Pausen, Auswahl und Text über eine sichtbare Werkzeugleiste bedienen; passende Noten- und Pausenwerte auswählen und Instrumente direkt oder weiterhin anhand der Klickhöhe wählen
- Notenbeginn rastet passend zum gewählten Notenwert auf den nächsten horizontalen Rasterpunkt ein
- Nach Wahl von Instrument und Notenwert einen Takt mit gleichmäßig verteilten Noten füllen; vorhandene Noten und Pausen dieser Instrumentenspur im Takt werden ersetzt
- Achtel- und kürzere Noten desselben Instruments, auch in Tuplet-Gruppen, werden automatisch pro Schlag verbunden; die Automatik ist abschaltbar
- Notenstriche und Notenbalken lassen sich pro Note nach oben oder unten ausrichten
- Im Auswahlmodus Noten und Texte per Klick oder Auswahlrahmen markieren, bearbeiten, löschen und kopieren
- Kopierte Noten und Texte per Strg+V und Zielklick oder über die Werkzeugleiste einfügen
- Die letzten bis zu 50 Partituränderungen über die Werkzeugleiste oder Strg/Cmd+Z rückgängig machen; die Werkzeugleiste zeigt kontextbezogene Bedienhinweise
- Tuplets mit frei wählbarem Verhältnis N:M über mehrere Instrumenthöhen setzen und in der Partitur markieren
- Noten im Notenmodus per Klick setzen und anklicken zum Entfernen; über Taktgrenzen reichende Noten werden gebunden
- Verschiedene Pausenwerte instrumentbezogen setzen; eine Pause ersetzt überlappende Noten desselben Instruments
- Texteingabe und Platzierungsoptionen nur im Textmodus anzeigen; Freitext an einer angeklickten Stelle platzieren sowie Text wie Handsätze an Noten hängen, Text anklicken zum Entfernen
- Angeheftete Notentexte einzeln ober- oder unterhalb aller Noten platzieren
- Mitgeliefertes 2-Takt-Pattern als Ausgangspunkt
- Einstellbare Taktart mit Zähler von 1 bis 32 und Nenner von 1, 2, 4, 8, 16, 32 oder 64
- Dynamisches Raster bis hin zu 64teln; beim Kürzen eines Taktes werden überzählige Schritte entfernt
- Ein bis vier Takte sowie ein Tempo von 40 bis 240 BPM
- Wiedergabe mit synthetisierten Schlagzeugklängen für Becken, Hi-Hat, Toms, Snare und Bass Drum im Browser
- Speichern im lokalen Browserspeicher und Export als JSON
- Direkter PDF-Download mit frei wählbarem Titel und Takten pro Zeile; der Footer erscheint auf jeder PDF-Seite

## Projektstruktur

```text
src/
  app/
    app.config.ts
    features/
      score-editor/
        components/
          editor-toolbar/   # Taktart, Tempo und Wiedergabe
          editor-toolbox/   # Instrumente, Noten- und Pausenwerte sowie Textmodus
          score-sheet/      # Notensystem, Noten, Pausen und Taktsteuerung
          pattern-actions/  # Leeren und JSON-Export
        models/       # Noten, Pausen, Instrumente, Annotationen und Pattern-Typen
        services/    # Audio-Erzeugung/-Planung und Pattern-Persistenz
        score-editor.component.ts
        score-editor.html
        score-editor.css
        score-layout.ts
        score-notation.ts
        score-editor.constants.ts
  main.ts
  styles.css
```

Die `ScoreEditorComponent` koordiniert den Editor-Zustand und verbindet die UI-Bausteine über
typisierte Inputs und Outputs. Die Notationsprojektion liegt als reine Funktion in `score-layout.ts`;
Pattern-Speicherung/-Migration, Wiedergabeplanung und Audio-Erzeugung bleiben in eigenen Modulen.
Die UI-Bausteine verwenden OnPush-Change-Detection und signalbasierte Inputs, damit Zuständigkeiten
unabhängig erweitert und getestet werden können.

## Lokal starten

Voraussetzung: Node.js und npm.

```bash
npm install
npm start
```

Anschließend `http://localhost:4200/` im Browser öffnen. Für die Wiedergabe muss der Browser Audio unterstützen.

## Prüfen und bauen

```bash
npm test
npm run build
```

## Veröffentlichung auf GitHub Pages

Der Workflow veröffentlicht den Produktionsbuild bei jedem Push auf `main` sowie manuell über
GitHub Actions. Er verwendet `npm ci`, wenn eine `package-lock.json` vorhanden ist, und fällt
andernfalls auf `npm install` zurück. In den Repository-Einstellungen unter **Pages** muss als
Build-Quelle einmalig **GitHub Actions** ausgewählt werden.
