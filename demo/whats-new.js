// The "New" view: what the latest release brought, shown on the pretend home.
//
// Update this with every release. `version` must match package.json — a unit
// test (src/demo-whats-new.test.ts) fails when a release bumps the version and
// this page still shows the release before.

export const WHATS_NEW = {
  version: "2.13.0",
  date: "2026-11-27",
  /** The release in a sentence or two, for the head of the page. */
  summary: {
    en: "The week at a glance: the new m3-weather-card-week shows the coming days one per row — or all of them side by side in a single row — with the rain chance, a temperature bar and, if you want, your own station's readings in the header. Everything else is the fork of M3 Cards it was built on.",
    de: "Die Woche auf einen Blick: Die neue m3-weather-card-week zeigt die kommenden Tage als Zeile pro Tag — oder alle nebeneinander in einer einzigen Zeile — mit Regenwahrscheinlichkeit, Temperaturbalken und, wenn gewünscht, den eigenen Messwerten im Kopf. Alles andere ist der Fork von M3 Cards, auf dem sie aufbaut.",
  },
  /** Counts for the chips beside the summary; a zero hides its chip. */
  counts: { cards: 1, features: 2 },
  /**
   * @param t (en, de) => the text in the demo's language
   * @param nav (view key) => that view's path
   */
  sections: (t /*, nav */) => [
    [
      t("The week, two ways", "Die Woche, zweimal"),
      [
        { type: "custom:m3-weather-card-week", entity: "weather.home", glass_background: false, variant: t("one row per day", "eine Zeile pro Tag") },
        { type: "custom:m3-weather-card-week", entity: "weather.home", layout: "row", variant: t("the whole week in one row", "die ganze Woche in einer Zeile") },
      ],
    ],
  ],
};
