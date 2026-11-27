# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
Versionierung folgt [SemVer](https://semver.org/lang/de/).

## [1.1.0] – 2026-11-27

### Added

- **Luftfeuchtigkeit und aktuelle Temperatur oben rechts.** Neuer Sensor
  `sensors.humidity`. Ist `sensors.temperature` oder `sensors.humidity`
  gesetzt, zeigt die Karte oben rechts die aktuelle Temperatur und die
  Luftfeuchtigkeit, Höchst-/Tiefstwert der Woche rücken in eine kleinere
  Zeile darunter. Fehlt ein Sensor-Wert, springt der Wert der
  Wetter-Entität ein.

### Fixed

- Eigene Sensoren aktualisieren die Karte jetzt sofort; bisher erst, wenn
  sich die Wetter-Entität änderte.

## [1.0.0] – 2026-11-27

Erste Veröffentlichung als eigenständiges Repository: nur die Wochenkarte,
gebaut auf dem gemeinsamen Kit von [M3 Cards](https://github.com/j0sp0r/m3-cards).

### Added

- **m3-weather-card-week.** Eine Zeile pro Tag mit Wetterlage,
  Regenwahrscheinlichkeit, einem Balken vom Tiefst- zum Höchstwert und beiden
  Zahlen; der heutige Tag ist getönt und trägt einen Punkt, wo die aktuelle
  Temperatur in seiner Spanne liegt.
- **`layout: row`** legt die ganze Woche in eine einzige Zeile — eine Spalte
  pro Tag, bei Platzmangel seitwärts scrollend statt gequetscht.
- **`sensors`** ersetzt die beiden Werte oben rechts und die aktuelle Messung
  hinter dem „Jetzt"-Punkt durch eigene Sensoren; ist einer nicht erreichbar,
  steht wieder der Wert der Vorhersage da.
- Editor auf Deutsch, Englisch und Ukrainisch, inklusive Wochenübersicht
  (`show_summary`, standardmäßig aus).
