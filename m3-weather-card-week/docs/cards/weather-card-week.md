---
title: M3 Weather Card Week
type: m3-weather-card-week
category: climate
display: Weather Week
summary: A week at a glance — one row per day with rain chance, a temperature-range bar and a week summary
table_order: 4
section_order: 15
---

The weekly counterpart to the weather card: one row per day, each with the
condition, the rain chance, a bar running from that day's low to its high and
both figures. Today's row is tinted and carries a dot where the current
temperature sits inside its range. Under the list, a summary strip averages
the highs and lows and totals the week's precipitation.

<img src="docs/images/weather-card-week.png" alt="Weather Card Week" width="440">

<details>
<summary>Configuration, examples & options</summary>

```yaml
type: custom:m3-weather-card-week
entity: weather.forecast_home
```

### Where the data comes from

Like the weather card, this one reads the `daily` forecast through
`weather.get_forecasts` and refreshes it every 15 minutes — it does not
generate weather data of its own. How many days the integration delivers is
up to the integration: Met.no, for example, delivers 6 days max, so asking
for 7 shows 6. If the entity provides no daily forecast at all, the card says
so instead of drawing an empty list.

Each day's bar is drawn on the week's shared scale, so the rows line up and
the whole week can be read at a glance. Its colour is the temperature itself,
on the same fixed outdoor scale as the weather card: blue up to 0 °C, green
around 17 °C, red from 30 °C.

With `layout: row` the same week sits in a single row instead — one column
per day with the weekday, condition, rain chance, high and low. That is the
shape a phone's weather app uses, and it costs about a third of the height.
The columns keep a minimum width: if the card is too narrow or `days` is
larger than fits, the strip scrolls sideways instead of squeezing the days
into unreadable slivers. On a narrow card the rain chance is the first thing
to go.

<img src="docs/images/weather-card-week-row.png" alt="Weather Card Week, one row" width="440">

```yaml
type: custom:m3-weather-card-week
entity: weather.forecast_home
layout: row
```

### Your own sensors

The forecast says 17°, your station says 15.4° — the two figures in the card's
top right come from the forecast by default. `sensors` takes your own instead.
`high` and `low` replace those two numbers; `temperature` replaces the reading
that marks "now" on today's bar. Each one falls back to the forecast's value
while its sensor is unavailable, so a dead battery never blanks the header.
Sensors are shown as they read — pick ones in the same unit as the weather
entity, since the header prints degrees without converting.

```yaml
type: custom:m3-weather-card-week
entity: weather.home
sensors:
  temperature: sensor.garden_temperature
  high: sensor.garden_temp_max
  low: sensor.garden_temp_min
```

### Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `entity` | string | – (required) | `weather` entity |
| `name` | string | entity's friendly name | Header title |
| `days` | number | `7` | Days shown, 1–14 (limited by what the integration delivers) |
| `layout` | `list` \| `row` | `list` | `list`: one row per day, with the date, rain chance and a temperature bar. `row`: the days side by side in one row for a week at a glance — columns keep a minimum width, and the strip scrolls sideways rather than squeezing more days in than fit |
| `show_date` | boolean | `true` | The date under each weekday |
| `show_precipitation` | boolean | `true` | Rain chance per day; hidden entirely when the integration has none |
| `show_wind` | boolean | `false` | Wind speed per day; hidden entirely when the integration has none |
| `show_summary` | boolean | `false` | Adds the average-high/low and precipitation strip under the week. Off by default — those figures can be read off the days themselves |
| `highlight_today` | boolean | `true` | Tints today's row and marks the current temperature on its bar |
| `decimals` | number | `0` | Decimal places of the temperatures, 0–2 |
| `sensors` | object | – | Own sensors instead of the forecast's figures: `temperature` is the current reading that marks "now" on today's bar, `high` and `low` are the two numbers in the top right. An unavailable sensor falls back to the forecast's value |
| `tap_action` | action | `more-info` | Tap on the header |
| `accent_color` | string | solar yellow; `primary` on a card added from the card picker | Today's tint, the icon well and the "now" dot |
| `accent_opacity` | number | `18` | Strength of that tint, 0–100 |
| `precipitation_color` | string | `#6ba7dc` | The rain-chance column |
| `text_color` / `secondary_text_color` | string | theme default | Temperatures/day names vs. dates and secondary values |
| `card_background` | string | glass/solid background | Card background |
| `animation` | `auto` \| `on` \| `off` | `auto` | Rows fade in one after another; `auto`/`on` respect `prefers-reduced-motion` |
| `glass_background` | boolean | `true` | Frosted glass background |
| `radius` / `corners` | number / object | `28` | Corner radius, optional per corner |

</details>
