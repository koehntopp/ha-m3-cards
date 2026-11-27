# M3 Slim Energy Card

A Material 3 take on a compact Home Assistant energy overview: solar, battery, grid, home, heat pump, EV charger, or anything else with a power sensor. Same numbers as before, in the shape of [j0sp0r/m3-cards](https://github.com/j0sp0r/m3-cards): 28px card radius, frosted surface, squircle icon wells, tinted fill bars and the m3 palette.

<img src="https://raw.githubusercontent.com/koehntopp/ha-m3energy/main/docs/card.png" alt="M3 Slim Energy Card, tiles" width="55%">

Two layouts:

- **tiles** (default) — three per row, for a narrow dashboard slot. Below ~380px the grid falls back to two per row.
- **rows** — one device per line, in the shape of the m3 power-list card. Taller, but the numbers get room.

<img src="https://raw.githubusercontent.com/koehntopp/ha-m3energy/main/docs/card-rows.png" alt="M3 Slim Energy Card, rows" width="55%">

## Features
- One tile or row per device: an icon well in the source colour, live power in kW, and state of charge / daily energy / grid price as a second line.
- The value is coloured by direction: green producing or exporting, red consuming or charging. Configurable per device and invertible.
- A fill bar behind the tile shows magnitude: solar as the share of `peak_kw`, battery as its state of charge, every other device as the share of the largest value on the card.
- Header with the icon swatch, title, a subtitle (source count and grid price) and the home consumption on the right. Can be switched off.
- Visual editor: drag to reorder, copy, remove, switch devices off, pick the layout. Only fields that fit the device type are shown.
- Standard `mdi:` icon per type (sun, battery, tower, house, heat pump, car); override with any `mdi:` icon or emoji.
- Works in light and dark themes; colours come from the theme, the palette only tints.
- Tap a tile to open the entity's more-info dialog. W values are converted to kW, Wh to kWh, missing values show `n/a`.
- No dependencies, one JS file, no build.

## Install
1. HACS → ⋮ → Custom repositories → `https://github.com/koehntopp/ha-m3energy`, type *Dashboard* → Download.
2. If it isn't added automatically: Settings → Dashboards → Resources → `/hacsfiles/ha-m3energy/m3-slim-energy-card.js`, type *JavaScript module*.
3. Reload the browser, then add the card *M3 Slim Energy Card*.

## Configuration
Use the visual editor, or YAML.

<img src="https://raw.githubusercontent.com/koehntopp/ha-m3energy/main/docs/editor.png" alt="Editor" width="55%">

```yaml
type: custom:m3-slim-energy-card
layout: tiles                     # tiles (default) | rows
title: Energy                     # optional, header title
icon: mdi:solar-power             # optional, header icon
header: true                      # false hides the whole header
subtitle: 6 sources · live        # optional, default: "<n> sources · <grid price>"
entities:
  - type: solar                   # solar|battery|grid|home|heatpump|ev|other
    entity: sensor.solar_power
    entity_2: sensor.solar2_power # optional second inverter, summed
    daily_entity: sensor.solar_energy_today
    daily_entity_2: sensor.solar2_energy_today
    peak_kw: 10                   # tile fills by output / peak
  - type: battery
    entity: sensor.battery_power
    soc_entity: sensor.battery_soc # fills the tile with the state of charge
    daily_entity: sensor.battery_energy_today
  - type: grid
    entity: sensor.grid_power
    price_entity: sensor.electricity_price
    daily_entity: sensor.grid_energy_today
  - type: home
    entity: sensor.house_power
    daily_entity: sensor.house_energy_today
  - type: heatpump
    entity: sensor.heatpump_power
    daily_entity: sensor.heatpump_energy_today
  - type: ev
    entity: sensor.car_charging_power
```

Each device has a type. The type sets the default icon, the icon-well colour and the direction colour, and decides which fields are offered (battery: state of charge entity, grid: price entity, solar: second inverter and peak capacity).

### Device options
| option | default | |
|---|---|---|
| `type` | `other` | `solar`, `battery`, `grid`, `home`, `heatpump`, `ev`, `other` |
| `name` | type label | tooltip and row name |
| `enabled` | `true` | `false` hides the device |
| `entity` | — | power sensor, W or kW |
| `entity_2` | — | solar only: second power sensor, added |
| `daily_entity` | — | daily energy, kWh or Wh |
| `daily_entity_2` | — | solar only: second daily sensor, added |
| `soc_entity` | — | battery: state of charge in %, fills the tile |
| `peak_kw` | — | solar: peak capacity, fills the tile by output / peak |
| `price_entity` | — | grid: price, shown after the daily energy |
| `icon` | type icon | any `mdi:` icon, or an emoji via YAML |
| `positive_color` | type default | `green` or `red` for a value above 0 |
| `invert` | `false` | flip the sign first, for a sensor that reports the opposite direction |
| `decimals` | `2` | decimals of the power value |
| `threshold` | `0.005` | kW below which the value counts as neutral |

Colour defaults: solar and home green, battery, grid, heat pump, EV and other red — i.e. positive means producing/exporting or consuming/charging. Tap a value to check it in the editor row header.

## Notes
- The design tokens (radii, type scale, spacing, palette) and the row/fill pattern are from [j0sp0r/m3-cards](https://github.com/j0sp0r/m3-cards) (MIT). This card is independent of it.
- Screenshots are made from `preview.html` (mocked `hass`, emoji-free `ha-icon` webfont, mocked `ha-form`).

## Migrating from `slim-energy-card`
Entity configs carry over unchanged. Card-level `price_entity` is still read as a fallback. `soc_fill`, `daily_line` and `color_value` are gone: filling and the coloured value are part of the design now, and details always sit on the second line.

## License
MIT
