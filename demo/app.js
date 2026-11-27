// The live demo: the card, twice, over a pretend home. No Home Assistant
// behind it — demo/ha-shim.js stands in for ha-card and ha-icon, and the
// forecast below is made up.

import "./ha-shim.js";
await import("../dist/m3-cards.js");

const params = new URLSearchParams(location.search);
const language = params.get("lang") ?? "en";
const theme = params.get("theme") ?? "dark";
document.documentElement.dataset.theme = theme;

// One week of weather: high, low, rain chance, millimetres, wind.
const CONDITIONS = ["rainy", "partlycloudy", "sunny", "cloudy", "sunny", "pouring", "partlycloudy"];
const HIGHS = [12, 14, 17, 15, 13, 10, 9];
const LOWS = [6, 7, 9, 8, 5, 4, 3];
const POPS = [60, 20, 5, 30, 10, 85, 65];
const RAIN = [4.2, 0.4, 0, 1.1, 0, 9.8, 5.3];
const WIND = [14, 12, 9, 18, 22, 15, 11];

function forecast() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today.getTime() + i * 86400e3);
    date.setHours(12, 0, 0, 0);
    return {
      datetime: date.toISOString(),
      condition: CONDITIONS[i],
      temperature: HIGHS[i],
      templow: LOWS[i],
      precipitation_probability: POPS[i],
      precipitation: RAIN[i],
      wind_speed: WIND[i],
    };
  });
}

const hass = {
  states: {
    "weather.home": {
      entity_id: "weather.home",
      state: "partlycloudy",
      attributes: {
        friendly_name: language === "de" ? "Zuhause" : "Home",
        temperature: 11.8,
        humidity: 72,
        wind_speed: 14,
        pressure: 1014,
        temperature_unit: "°C",
        wind_speed_unit: "km/h",
        precipitation_unit: "mm",
      },
    },
    "sensor.garden_temperature": {
      entity_id: "sensor.garden_temperature",
      state: "10.2",
      attributes: { friendly_name: "Garden", unit_of_measurement: "°C" },
    },
    "sensor.garden_max": {
      entity_id: "sensor.garden_max",
      state: "15.4",
      attributes: { friendly_name: "Garden max", unit_of_measurement: "°C" },
    },
    "sensor.garden_min": {
      entity_id: "sensor.garden_min",
      state: "2.1",
      attributes: { friendly_name: "Garden min", unit_of_measurement: "°C" },
    },
  },
  locale: { language, time_format: "24" },
  language,
  config: { unit_system: { temperature: "°C" } },
  connected: true,
  callWS: async () => ({ response: { "weather.home": { forecast: forecast() } } }),
  formatEntityState: (stateObj) => stateObj.state,
};

/** A card element with the pretend home behind it. */
function card(config) {
  const el = document.createElement("m3-weather-card-week");
  el.setConfig(config);
  el.hass = hass;
  return el;
}

document.querySelector("#list").appendChild(card({ entity: "weather.home" }));
document.querySelector("#row").appendChild(
  card({
    entity: "weather.home",
    layout: "row",
    sensors: {
      temperature: "sensor.garden_temperature",
      high: "sensor.garden_max",
      low: "sensor.garden_min",
    },
  }),
);

for (const button of document.querySelectorAll("[data-param]")) {
  button.addEventListener("click", () => {
    const [key, value] = button.dataset.param.split("=");
    const next = new URLSearchParams(location.search);
    next.set(key, value);
    location.search = next.toString();
  });
}

for (const button of document.querySelectorAll("[data-param]")) {
  const [key, value] = button.dataset.param.split("=");
  button.classList.toggle("on", (params.get(key) ?? (key === "theme" ? "dark" : "en")) === value);
}
