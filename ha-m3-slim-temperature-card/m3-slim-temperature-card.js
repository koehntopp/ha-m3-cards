// M3 Slim Temperature Card: room temperatures as slim tiles, as tall as the
// energy card's, four to a row. A `separator` entry ends the row, so a row can
// hold one to four tiles while every tile keeps the same width. Colours, the
// humidity warning and the trend arrow follow the climate overview card of
// j0sp0r/m3-cards (MIT).

const COLD = "#6ba7dc", COOL = "#7fc4d6", COMFORTABLE = "#5dcaa5", WARM = "#f0c46e", HOT = "#e57368";
const HUMIDITY_WARN = "#f0a24a";
const ROOM_STAGES = [[19, COLD], [20.5, COOL], [23.5, COMFORTABLE], [25, WARM]]; // below the limit → colour; above all: HOT
const OUTDOOR_SCALE = [[0, COLD], [10, COOL], [17, COMFORTABLE], [24, WARM], [30, HOT]]; // blended between stops
const TREND_K = 0.5; // arrow when the last hour moved more than this
const TREND_REFRESH_MS = 15 * 60 * 1000;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const celsius = (v, unit) => (unit === "°F" ? ((v - 32) * 5) / 9 : v);
const isSeparator = (e) => e === "separator" || e?.type === "separator";

const roomColor = (c) => (ROOM_STAGES.find(([limit]) => c < limit) ?? [0, HOT])[1];

const mix = (a, b, f) => "#" + [0, 1, 2].map((k) => {
  const ch = (hex) => parseInt(hex.slice(1 + 2 * k, 3 + 2 * k), 16);
  return Math.round(ch(a) + (ch(b) - ch(a)) * f).toString(16).padStart(2, "0");
}).join("");

const outdoorColor = (c) => {
  if (c <= OUTDOOR_SCALE[0][0]) return OUTDOOR_SCALE[0][1];
  for (let i = 1; i < OUTDOOR_SCALE.length; i++) {
    const [t1, c1] = OUTDOOR_SCALE[i];
    if (c <= t1) { const [t0, c0] = OUTDOOR_SCALE[i - 1]; return mix(c0, c1, (c - t0) / (t1 - t0)); }
  }
  return OUTDOOR_SCALE[OUTDOOR_SCALE.length - 1][1];
};

const CSS = `
  :host { display: block; }
  ha-card { display: block; background: transparent; border: none; box-shadow: none;
            border-radius: var(--m3-card-radius, 28px); overflow: hidden; }
  .card {
    --m3-outline: color-mix(in srgb, var(--primary-text-color) 12%, transparent);
    --m3-surface: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 55%, transparent);
    --m3-item: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
    box-sizing: border-box; display: flex; flex-direction: column; gap: 6px; padding: 12px;
    border-radius: var(--m3-card-radius, 28px); border: 1px solid var(--m3-outline);
    background: var(--m3-surface); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);
    color: var(--primary-text-color);
  }
  .row { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); gap: 6px; }
  /* same height as the energy card's tiles (68px): name, temperature and humidity */
  .t { box-sizing: border-box; height: 68px; padding: 6px 10px; gap: 2px; border-radius: 18px; overflow: hidden;
       display: flex; flex-direction: column; justify-content: center; cursor: pointer;
       background: color-mix(in srgb, var(--c) 12%, var(--m3-item));
       transition: border-radius .35s cubic-bezier(.2, 0, 0, 1); }
  .t:active { border-radius: 11px; }
  .t.na { opacity: .4; }
  .ink { color: color-mix(in srgb, var(--c) 85%, var(--primary-text-color)); }
  .hd { display: flex; align-items: center; gap: 4px; min-width: 0; line-height: 13px; }
  .hd ha-icon { --mdc-icon-size: 12px; font-size: 12px; flex: none; display: inline-flex; }
  .nm { font-size: 10px; opacity: .7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tp { display: flex; align-items: baseline; gap: 1px; line-height: 23px; white-space: nowrap; }
  .v { font-size: 20px; font-weight: 700; font-feature-settings: "tnum"; }
  .u { font-size: 11px; font-weight: 500; }
  .tr { --mdc-icon-size: 12px; font-size: 12px; opacity: .8; margin-left: 2px; align-self: center; display: inline-flex; }
  .hu { display: flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 500; line-height: 13px; white-space: nowrap; }
  .hu ha-icon { --mdc-icon-size: 10px; font-size: 10px; display: inline-flex; }
`;

class M3SlimTemperatureCard extends HTMLElement {
  setConfig(config) {
    if (!Array.isArray(config?.entities)) throw new Error("entities: list of temperature sensors required");
    this._config = config;
    this._sig = undefined;
    this._trend = new Map();
    this._trendKey = undefined;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._fetchTrend();
    this._render();
  }

  connectedCallback() {
    this._timer = setInterval(() => { this._trendKey = undefined; this._fetchTrend(); }, TREND_REFRESH_MS);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  static getConfigElement() {
    return document.createElement("m3-slim-temperature-card-editor");
  }

  static getStubConfig(hass) {
    const ids = Object.keys(hass?.states ?? {}).filter((id) =>
      id.startsWith("sensor.") && hass.states[id].attributes.device_class === "temperature").slice(0, 4);
    return { entities: ids.map((entity) => ({ entity })) };
  }

  getCardSize() {
    return Math.max(1, this._rows?.length ?? 1);
  }

  _items() {
    return this._config.entities.map((e) => (isSeparator(e) ? "separator" : typeof e === "string" ? { entity: e } : e));
  }

  /** The humidity sensor on the same device, if the entry names none. */
  _humidityOf(e) {
    if (e.humidity_entity !== undefined) return e.humidity_entity || undefined;
    const dev = this._hass.entities?.[e.entity]?.device_id;
    if (!dev) return undefined;
    return Object.keys(this._hass.entities).find((id) =>
      this._hass.entities[id].device_id === dev && this._hass.states[id]?.attributes.device_class === "humidity");
  }

  /** Area name, else the friendly name without "Temperature"/"Temperatur". */
  _name(e, st) {
    if (e.name) return e.name;
    const reg = this._hass.entities?.[e.entity];
    const area = this._hass.areas?.[reg?.area_id ?? this._hass.devices?.[reg?.device_id]?.area_id];
    if (area?.name) return area.name;
    const n = st?.attributes.friendly_name ?? e.entity;
    return n.replace(/[\s\-–:·]*(temperature|temperatur)$/i, "").trim() || n;
  }

  _icon(e) {
    if (e.icon) return e.icon;
    const reg = this._hass.entities?.[e.entity];
    return this._hass.areas?.[reg?.area_id ?? this._hass.devices?.[reg?.device_id]?.area_id]?.icon ?? "mdi:thermometer";
  }

  _fetchTrend() {
    if (!this._hass?.callWS || this._config.show_trend === false || this._trendBusy) return;
    const ids = this._items().filter((e) => e !== "separator").map((e) => e.entity);
    const key = ids.join(",");
    if (!ids.length || key === this._trendKey) return;
    this._trendKey = key;
    this._trendBusy = true;
    const start = new Date(Date.now() - 3600000);
    this._hass.callWS({
      type: "history/history_during_period", entity_ids: ids,
      start_time: start.toISOString(), end_time: new Date(start.getTime() + 60000).toISOString(),
      minimal_response: true, no_attributes: true, include_start_time_state: true, significant_changes_only: false,
    }).then((res) => {
      this._trend = new Map(Object.entries(res ?? {}).map(([id, list]) => [id, Number(list?.[0]?.s)]));
      this._render();
    }).catch(() => {}).finally(() => { this._trendBusy = false; });
  }

  _tile(e) {
    const st = this._hass.states[e.entity];
    const value = Number(st?.state);
    const ok = st && st.state !== "" && Number.isFinite(value);
    const unit = st?.attributes.unit_of_measurement ?? "°C";
    const c = ok ? celsius(value, unit) : NaN;
    const color = !ok ? "#9fb0c0" : e.outdoor ? outdoorColor(c) : roomColor(c);
    const lang = this._hass.locale?.language ?? this._hass.language ?? "en";
    const past = this._trend.get(e.entity);
    const delta = ok && this._config.show_trend !== false && Number.isFinite(past) ? value - past : 0;
    const hid = this._humidityOf(e);
    const hst = hid ? this._hass.states[hid] : undefined;
    const h = Number(hst?.state);
    const [lo, hi] = this._config.humidity_range ?? [35, 65];
    return {
      entity: e.entity, name: this._name(e, st), icon: this._icon(e), color, ok, unit,
      value: ok ? value.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—",
      trend: Math.abs(delta) > TREND_K ? (delta > 0 ? "mdi:arrow-up-thin" : "mdi:arrow-down-thin") : "",
      humidity: hid && Number.isFinite(h) ? { entity: hid, value: Math.round(h), warn: h < lo || h > hi } : undefined,
    };
  }

  _render() {
    if (!this._config || !this._hass) return;
    const cols = Math.max(1, Math.min(6, Number(this._config.columns) || 4));
    // a separator ends a row; a long row wraps at `cols`
    const rows = [[]];
    for (const e of this._items()) {
      if (e === "separator") { if (rows[rows.length - 1].length) rows.push([]); continue; }
      if (!e.entity) continue;
      if (rows[rows.length - 1].length === cols) rows.push([]);
      rows[rows.length - 1].push(this._tile(e));
    }
    if (!rows[rows.length - 1].length) rows.pop();
    this._rows = rows;
    const sig = JSON.stringify([rows, cols]);
    if (sig === this._sig) return;
    this._sig = sig;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("click", (ev) => {
        const id = ev.composedPath().find((n) => n.dataset?.entity)?.dataset.entity;
        if (id) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true }));
      });
    }
    const tile = (t) => `
      <div class="t${t.ok ? "" : " na"}" data-entity="${esc(t.entity)}" style="--c:${t.color}" title="${esc(t.name)}">
        <div class="hd"><ha-icon class="ink" icon="${esc(t.icon)}"></ha-icon><span class="nm">${esc(t.name)}</span></div>
        <div class="tp ink"><span class="v">${esc(t.value)}</span>${t.ok ? `<span class="u">${esc(t.unit)}</span>` : ""}${
          t.trend ? `<ha-icon class="tr" icon="${t.trend}"></ha-icon>` : ""}</div>
        ${t.humidity ? `<div class="hu" data-entity="${esc(t.humidity.entity)}" style="${t.humidity.warn ? `color:${HUMIDITY_WARN}` : "opacity:.55"}">
          <ha-icon icon="mdi:water-outline"></ha-icon>${t.humidity.value} %</div>` : ""}
      </div>`;
    this.shadowRoot.innerHTML = `<style>${CSS}</style><ha-card><div class="card" style="--cols:${cols}">${
      rows.map((r) => `<div class="row">${r.map(tile).join("")}</div>`).join("")}</div></ha-card>`;
  }
}

const ROOM_SCHEMA = [
  { name: "entity", required: true, selector: { entity: { domain: "sensor", device_class: "temperature" } } },
  { name: "humidity_entity", selector: { entity: { domain: "sensor", device_class: "humidity" } } },
  { type: "grid", name: "", schema: [
    { name: "name", selector: { text: {} } },
    { name: "icon", selector: { icon: {} } },
  ] },
  { name: "outdoor", selector: { boolean: {} } },
];
const OPTIONS_SCHEMA = [
  { type: "grid", name: "", schema: [
    { name: "columns", selector: { number: { min: 1, max: 6, step: 1, mode: "box" } } },
    { name: "show_trend", selector: { boolean: {} } },
    { name: "humidity_low", selector: { number: { min: 0, max: 100, step: 1, mode: "box", unit_of_measurement: "%" } } },
    { name: "humidity_high", selector: { number: { min: 0, max: 100, step: 1, mode: "box", unit_of_measurement: "%" } } },
  ] },
];
const LABELS = {
  entity: "Temperature sensor", humidity_entity: "Humidity sensor (default: the one on the same device)",
  name: "Name (default: area)", icon: "Icon (default: area icon)", outdoor: "Outdoor (colours on the weather scale)",
  columns: "Tiles per row", show_trend: "Trend arrow (last hour)",
  humidity_low: "Humidity warning below", humidity_high: "Humidity warning above",
};

class M3SlimTemperatureCardEditor extends HTMLElement {
  setConfig(config) {
    if (JSON.stringify(config) === JSON.stringify(this._config)) return;
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this.querySelectorAll("ha-form").forEach((f) => (f.hass = hass));
    if (!this.childElementCount) this._render();
  }

  _emit(config) {
    for (const k of Object.keys(config)) if (config[k] === undefined || config[k] === "") delete config[k];
    this._config = config;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }

  _form(schema, data, onChange) {
    const f = document.createElement("ha-form");
    f.hass = this._hass;
    f.schema = schema;
    f.data = data;
    f.computeLabel = (s) => LABELS[s.name] ?? s.name;
    f.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      f.data = ev.detail.value;
      onChange(ev.detail.value);
    });
    return f;
  }

  _setEntities(entities, rerender = true) {
    this._emit({ ...this._config, entities });
    if (rerender) this._render();
  }

  _render() {
    if (!this._hass || !this._config) return;
    this.innerHTML = `<style>
      .it { border: 1px solid var(--divider-color); border-radius: 12px; margin: 8px 0; }
      .it summary { display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; list-style: none; }
      .it summary::-webkit-details-marker { display: none; }
      .it .lbl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .it.sep summary { color: var(--secondary-text-color); font-style: italic; }
      .it ha-form { display: block; padding: 0 12px 12px; }
      .bt { cursor: pointer; color: var(--secondary-text-color); padding: 2px 4px; user-select: none; }
      .add { display: inline-block; cursor: pointer; color: var(--primary-color); padding: 8px 12px 8px 0; }
    </style>`;
    const [lo, hi] = this._config.humidity_range ?? [35, 65];
    this.appendChild(this._form(OPTIONS_SCHEMA,
      { columns: 4, show_trend: true, ...this._config, humidity_low: lo, humidity_high: hi },
      (v) => {
        const { humidity_low: l, humidity_high: h, ...rest } = v;
        const range = l === 35 && h === 65 ? undefined : [Number(l), Number(h)];
        this._emit({ ...this._config, ...rest, humidity_range: range, columns: rest.columns === 4 ? undefined : rest.columns,
          show_trend: rest.show_trend ? undefined : false });
      }));
    const entities = this._config.entities ?? [];
    entities.forEach((raw, i) => {
      const sep = isSeparator(raw);
      const e = sep ? undefined : typeof raw === "string" ? { entity: raw } : raw;
      const d = document.createElement("details");
      d.className = `it${sep ? " sep" : ""}`;
      const label = sep ? "— line break —"
        : e.name || this._hass.states[e.entity]?.attributes.friendly_name || e.entity || "(no sensor)";
      d.innerHTML = `<summary><span class="lbl"></span>
        <span class="bt" data-a="up" title="Up">▲</span><span class="bt" data-a="down" title="Down">▼</span>
        <span class="bt" data-a="del" title="Remove">✕</span></summary>`;
      d.querySelector(".lbl").textContent = label;
      d.querySelector("summary").addEventListener("click", (ev) => {
        const a = ev.target.dataset?.a;
        if (!a) { if (sep) ev.preventDefault(); return; }
        ev.preventDefault();
        const list = entities.slice();
        const j = a === "up" ? i - 1 : i + 1;
        if (a === "del") list.splice(i, 1);
        else if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
        else return;
        this._setEntities(list);
      });
      if (!sep) {
        d.appendChild(this._form(ROOM_SCHEMA, e, (v) => {
          const n = { ...e };
          for (const k of ["entity", "humidity_entity", "name", "icon"]) { if (v[k]) n[k] = v[k]; else delete n[k]; }
          if (v.outdoor) n.outdoor = true; else delete n.outdoor;
          const list = entities.slice();
          list[i] = n;
          d.querySelector(".lbl").textContent = n.name || this._hass.states[n.entity]?.attributes.friendly_name || n.entity;
          this._setEntities(list, false);
        }));
      }
      this.appendChild(d);
    });
    for (const [text, item] of [["+ Add room", { entity: "" }], ["+ Add line break", "separator"]]) {
      const a = document.createElement("span");
      a.className = "add";
      a.textContent = text;
      a.addEventListener("click", () => this._setEntities([...(this._config.entities ?? []), item]));
      this.appendChild(a);
    }
  }
}

customElements.define("m3-slim-temperature-card", M3SlimTemperatureCard);
customElements.define("m3-slim-temperature-card-editor", M3SlimTemperatureCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "m3-slim-temperature-card",
  name: "M3 Slim Temperature Card",
  description: "Material 3 room temperatures as slim tiles, four to a row, with humidity and trend",
  preview: true,
});
