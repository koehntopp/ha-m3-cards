// Shared weather-forecast helpers for the weather cards.
//
// Both cards read the same `weather.get_forecasts` response and must draw the
// same glyph for the same condition, so the item shape, the condition → mdi
// mapping and the day/night choice live here rather than twice.

/** One entry of a `weather.get_forecasts` response, hourly or daily. */
export interface WeatherForecastItem {
  datetime: string;
  condition?: string;
  temperature?: number;
  templow?: number;
  precipitation?: number;
  precipitation_probability?: number;
  wind_speed?: number;
  humidity?: number;
  is_daytime?: boolean;
}

export const CONDITION_ICONS: Record<string, string> = {
  "clear-night": "mdi:weather-night",
  cloudy: "mdi:weather-cloudy",
  exceptional: "mdi:alert-circle-outline",
  fog: "mdi:weather-fog",
  hail: "mdi:weather-hail",
  lightning: "mdi:weather-lightning",
  "lightning-rainy": "mdi:weather-lightning-rainy",
  partlycloudy: "mdi:weather-partly-cloudy",
  pouring: "mdi:weather-pouring",
  rainy: "mdi:weather-rainy",
  snowy: "mdi:weather-snowy",
  "snowy-rainy": "mdi:weather-snowy-rainy",
  sunny: "mdi:weather-sunny",
  windy: "mdi:weather-windy",
  "windy-variant": "mdi:weather-windy-variant",
};

// Conditions that visually only make sense in daylight get swapped for a
// night-appropriate icon when the forecast hour/day falls outside daytime —
// most weather integrations report "sunny"/"partlycloudy" around the clock
// and rely on the dashboard to pick the night variant itself.
const NIGHT_ICON_OVERRIDES: Record<string, string> = {
  sunny: "mdi:weather-night",
  partlycloudy: "mdi:weather-night-partly-cloudy",
};

export function weatherIcon(condition: string | undefined, daytime: boolean): string {
  if (!condition) return "mdi:weather-cloudy";
  if (!daytime && NIGHT_ICON_OVERRIDES[condition]) return NIGHT_ICON_OVERRIDES[condition];
  return CONDITION_ICONS[condition] ?? "mdi:weather-cloudy";
}

// No per-location sunrise/sunset table is available without extra API
// round-trips, so daytime is approximated from the hour of day. Close
// enough for icon selection; `is_daytime` on the forecast item (provided by
// most modern weather integrations) is preferred when present.
export function isDaytime(item: WeatherForecastItem): boolean {
  if (typeof item.is_daytime === "boolean") return item.is_daytime;
  const hour = new Date(item.datetime).getHours();
  return hour >= 6 && hour < 20;
}

/** Whether a forecast datetime falls on the local calendar day of `now`. */
export function isSameDay(datetime: string, now: Date = new Date()): boolean {
  const d = new Date(datetime);
  return (
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  );
}
