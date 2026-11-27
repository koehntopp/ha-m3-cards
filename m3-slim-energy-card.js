const typeIcon = (T) => (T.fallback && !window.customIconsets?.[T.icon.split(":")[0]] ? T.fallback : T.icon);
const iconHtml = (i) => (i.includes(":") ? `<ha-icon icon="${i}"></ha-icon>` : i); // "mdi:..." or an emoji

// Type colours are the m3-cards palette (j0sp0r/m3-cards, src/shared/tokens.ts PALETTE).
// positive = which colour a value above 0 gets: producers green, consumers red.
const TYPES = {
  solar: { label: "Solar PV", icon: "mdi:white-balance-sunny", color: "#f0a24a", positive: "green" },
  battery: { label: "Battery", icon: "mdi:battery-charging-medium", color: "#81c784", positive: "red" },
  grid: { label: "Grid", icon: "mdi:transmission-tower", color: "#8f79e0", positive: "red" },
  home: { label: "Home", icon: "mdi:home", color: "#85b7eb", positive: "red" },
  heatpump: { label: "Heat pump", icon: "bha:heat-pump", fallback: "mdi:heat-pump", color: "#e57368", positive: "red" }, // bha: icon pack (HACS), mdi when not installed
  ev: { label: "EV charger", icon: "mdi:car-electric", color: "#a58fe8", positive: "red" },
  other: { label: "Other", icon: "mdi:flash", color: "#b8c4c9", positive: "green" },
};

// sum of the numeric states of ids; W -> kW (or Wh -> kWh when wh); returns [total, unit]
const sumStates = (hass, ids, wh) => {
  let t = NaN, u = "";
  for (const id of ids) {
    const s = id && hass.states[id];
    const n = s ? parseFloat(s.state) : NaN;
    if (isNaN(n)) continue;
    const un = s.attributes.unit_of_measurement || "";
    const small = un === (wh ? "Wh" : "W");
    u = small ? (wh ? "kWh" : "kW") : un;
    t = (isNaN(t) ? 0 : t) + (small ? n / 1000 : n);
  }
  return [t, u];
};

// colour for a device value: its positive colour above 0 (flipped by invert), the opposite below 0, "" near 0
const signColor = (c, kw) => {
  if (!(Math.abs(kw) > (c.threshold ?? 0.005))) return "";
  const pos = c.positive_color || (TYPES[c.type] || TYPES.other).positive || "green";
  return (kw > 0) === !c.invert ? pos : pos === "red" ? "green" : "red";
};
const signClass = (c, kw) => { const s = signColor(c, kw); return s === "green" ? "pos" : s === "red" ? "neg" : ""; };

const CSS = `
  :host { display: block; }
  ha-card { display: block; background: transparent; border: none; box-shadow: none;
            border-radius: var(--m3-card-radius, 28px); overflow: hidden; }
  .card {
    --m3-outline: color-mix(in srgb, var(--primary-text-color) 12%, transparent);
    --m3-surface: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 55%, transparent);
    --m3-item: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
    --m3-green: #81c784; --m3-red: #e57368;
    box-sizing: border-box; container-type: inline-size;
    display: flex; flex-direction: column; gap: 12px; padding: 12px;
    border-radius: var(--m3-card-radius, 28px); border: 1px solid var(--m3-outline);
    background: var(--m3-surface);
    -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);
    color: var(--primary-text-color);
  }
  /* header: 44px squircle swatch, name 15/700, subtitle 12/65%, value 20/700 */
  .hdr { display: flex; align-items: center; gap: 12px; }
  .swatch { position: relative; flex: none; width: 44px; height: 44px; border-radius: 16px;
            display: grid; place-items: center; --mdc-icon-size: 22px; font-size: 22px;
            background: color-mix(in srgb, #f0a24a 18%, transparent);
            color: color-mix(in srgb, #f0a24a 70%, var(--primary-text-color)); }
  .htext { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .hname { font-size: 15px; font-weight: 700; line-height: 1.2; }
  .hsub { font-size: 12px; opacity: .65; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hright { flex: none; text-align: right; }
  .hnum { font-size: 20px; font-weight: 700; line-height: 1.1; font-feature-settings: "tnum"; }
  .hunit { font-size: 11px; opacity: .6; }
  /* items: 18px radius, 6% surface, colour-mixed fills and icon wells */
  .tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .rows { display: flex; flex-direction: column; gap: 6px; }
  .it { position: relative; display: flex; align-items: center; gap: 8px; min-height: 56px;
        padding: 6px 10px; border-radius: 18px; overflow: hidden; background: var(--m3-item);
        cursor: pointer; transition: border-radius .35s cubic-bezier(.2, 0, 0, 1); }
  .it:active { border-radius: 11px; }
  .rows .it { min-height: 0; height: 52px; padding: 0 12px; gap: 10px; }
  .fill { position: absolute; inset: 0 auto 0 0; border-radius: inherit; pointer-events: none;
          transition: width .6s cubic-bezier(.2, 0, 0, 1); }
  .well { position: relative; flex: none; width: 28px; height: 28px; border-radius: 10px;
          display: grid; place-items: center; --mdc-icon-size: 16px; font-size: 16px;
          background: color-mix(in srgb, var(--c) 20%, transparent);
          color: color-mix(in srgb, var(--c) 70%, var(--primary-text-color)); }
  .rows .well { width: 30px; height: 30px; border-radius: 11px; }
  .tx { position: relative; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .rows .tx { flex: 1; }
  .val, .rval { font-size: 14px; font-weight: 700; line-height: 1.15; white-space: nowrap;
                font-feature-settings: "tnum"; }
  .rval { flex: none; }
  .u { font-size: 10px; font-weight: 500; opacity: .65; margin-left: 1px; }
  .sub { font-size: 10px; line-height: 1.25; opacity: .62; overflow: hidden;
         white-space: nowrap; text-overflow: ellipsis; }
  .rows .sub { font-size: 11px; }
  .sub span { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* a narrow slot can't hold three text columns: fall back to two per row */
  @container (max-width: 350px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .nm { position: relative; font-size: 13px; font-weight: 500; line-height: 1.2;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pos .val, .pos .rval, .hnum.pos { color: color-mix(in srgb, var(--m3-green) 82%, var(--primary-text-color)); }
  .neg .val, .neg .rval, .hnum.neg { color: color-mix(in srgb, var(--m3-red) 82%, var(--primary-text-color)); }
`;

class M3SlimEnergyCard extends HTMLElement {
  setConfig(config) {
    if (!Array.isArray(config.entities) || !config.entities.length) {
      throw new Error("entities: list required");
    }
    this._config = config;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" }).innerHTML = `<style>${CSS}</style><ha-card><div class="card"></div></ha-card>`;
      this._card = this.shadowRoot.querySelector(".card");
      this._card.addEventListener("click", (e) => {
        const el = e.target.closest(".it");
        if (el) this.dispatchEvent(new CustomEvent("hass-more-info", {
          detail: { entityId: el.dataset.e }, bubbles: true, composed: true,
        }));
      });
    }
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  static getConfigElement() {
    return document.createElement("m3-slim-energy-card-editor");
  }

  static getStubConfig() {
    return { entities: [{ entity: "" }] };
  }

  _active() {
    return this._config.entities.filter((c) => c.enabled !== false && c.entity);
  }

  getCardSize() {
    return 1 + Math.ceil(this._active().length / 3);
  }

  _num(id) {
    const s = id && this._hass.states[id];
    const n = s ? parseFloat(s.state) : NaN;
    return [n, s];
  }

  _sum(ids, wh) {
    return sumStates(this._hass, ids, wh);
  }

  // everything an item shows, so build and update share one source
  _data(c, maxAbs) {
    const [kw, unit] = this._sum([c.entity, c.entity_2]);
    const T = TYPES[c.type] || TYPES.other;
    let num = "n/a", u = "", color = "";
    if (!isNaN(kw)) {
      num = Math.abs(kw).toFixed(c.decimals ?? 2);
      u = unit;
      color = signClass(c, kw);
    }
    let soc = NaN, socText = "";
    if (c.soc_entity) {
      [soc] = this._num(c.soc_entity);
      if (!isNaN(soc)) socText = `${Math.round(soc)}%`;
    }
    const [d, du] = this._sum([c.daily_entity, c.daily_entity_2], true);
    const daily = isNaN(d) ? "" : `${d.toFixed(1)} ${du || "kWh"}`;
    let price = "";
    const priceId = c.price_entity || this._config.price_entity; // card-level kept for old configs
    if (c.type === "grid" && priceId) {
      const [p, ps] = this._num(priceId);
      if (!isNaN(p)) price = `${p.toFixed(2)} ${ps.attributes.unit_of_measurement || ""}`.trim();
    }
    // fill: sun = share of peak, battery = state of charge, everything else = share of the biggest value
    let frac = 0;
    if (!isNaN(kw) && Math.abs(kw) > (c.threshold ?? 0.005) && maxAbs > 0) {
      if (c.type === "solar" && c.peak_kw > 0 && unit === "kW") frac = Math.abs(kw) / c.peak_kw;
      else if (c.type === "battery" && !isNaN(soc)) frac = soc / 100;
      else frac = Math.abs(kw) / maxAbs;
    }
    frac = Math.max(0, Math.min(1, frac));
    return {
      num, u, color, icon: c.icon || typeIcon(T), color2: T.color,
      name: c.name || T.label,
      fill: frac >= 0.25 ? `width:${(frac * 100).toFixed(1)}%;background:color-mix(in srgb,${T.color} 16%,transparent)` : "",
      // tiles have ~65px for text: one part per line; rows have room for one joined line
      parts: [socText, daily, price].filter(Boolean),
    };
  }

  _build(fields, rows) {
    const c = this._config;
    let html = "";
    if (c.header !== false) {
      const home = fields.find((f) => f.type === "home");
      const [hkw, hu] = home ? this._sum([home.entity, home.entity_2]) : [NaN, ""];
      const price = this._priceText();
      const sub = c.subtitle || `${fields.length} ${fields.length === 1 ? "source" : "sources"}${price ? ` · ${price}` : ""}`;
      html += `<div class="hdr">
        <div class="swatch">${iconHtml(c.icon || "mdi:solar-power")}</div>
        <div class="htext"><div class="hname">${c.title || "Energy"}</div><div class="hsub">${sub}</div></div>
        ${isNaN(hkw) ? "" : `<div class="hright"><div class="hnum ${signClass(home, hkw)}">${Math.abs(hkw).toFixed(home.decimals ?? 2)}</div><div class="hunit">${hu || "kW"} home</div></div>`}
      </div>`;
    }
    html += `<div class="${rows ? "rows" : "tiles"}">`;
    for (const f of fields) {
      html += `<div class="it" data-e="${f.entity}" title="${(f.name || "").replace(/"/g, "&quot;")}">
        <span class="fill"></span>
        <span class="well" style="--c:${(TYPES[f.type] || TYPES.other).color}"></span>
        <span class="tx">
          ${rows ? `<span class="nm"></span>` : `<span class="val"><span class="v"></span><span class="u"></span></span>`}
          <span class="sub"></span>
        </span>
        ${rows ? `<span class="rval"><span class="v"></span><span class="u"></span></span>` : ""}
      </div>`;
    }
    this._card.innerHTML = html + "</div>";
  }

  _priceText() {
    const g = this._active().find((c) => c.type === "grid" && (c.price_entity || this._config.price_entity));
    if (!g) return "";
    const [p, s] = this._num(g.price_entity || this._config.price_entity);
    return isNaN(p) ? "" : `${p.toFixed(2)} ${s.attributes.unit_of_measurement || ""}`.trim();
  }

  _render() {
    if (!this._config || !this._hass || !this._card) return;
    const fields = this._active();
    const rows = this._config.layout === "rows";
    const sig = JSON.stringify([rows, this._config.header, this._config.title, this._config.icon, this._config.subtitle, fields]);
    if (sig !== this._sig) {
      this._sig = sig;
      this._build(fields, rows);
      this._nodes = [...this._card.querySelectorAll(".it")];
    }
    const values = fields.map((f) => this._sum([f.entity, f.entity_2])[0]);
    const maxAbs = Math.max(...values.map(Math.abs).filter((v) => !isNaN(v)), 0);
    this._nodes.forEach((el, i) => {
      const d = this._data(fields[i], maxAbs);
      el.className = `it ${d.color}`;
      el.querySelector(".well").innerHTML = iconHtml(d.icon);
      el.querySelector(".fill").setAttribute("style", d.fill);
      el.querySelectorAll(".v").forEach((n) => (n.textContent = d.num));
      el.querySelectorAll(".u").forEach((n) => (n.textContent = d.u));
      if (rows) {
        el.querySelector(".nm").textContent = d.name;
        el.querySelector(".sub").textContent = d.parts.join(" · ");
      } else {
        el.querySelector(".sub").innerHTML = d.parts.map((l) => `<span>${l}</span>`).join("");
      }
    });
    if (this._config.header !== false) this._paintHeader(fields);
  }

  _paintHeader(fields) {
    const home = fields.find((f) => f.type === "home");
    const num = this._card.querySelector(".hnum");
    if (!home || !num) return;
    const [kw, u] = this._sum([home.entity, home.entity_2]);
    if (isNaN(kw)) { num.textContent = "n/a"; num.className = "hnum"; return; }
    num.textContent = Math.abs(kw).toFixed(home.decimals ?? 2);
    num.className = `hnum ${signClass(home, kw)}`;
    this._card.querySelector(".hunit").textContent = `${u || "kW"} home`;
  }
}

const ent = (extra = {}) => ({ entity: { domain: "sensor", ...extra } });
const sel = (options) => ({ select: { options, mode: "dropdown" } });
const TYPE_OPTIONS = Object.entries(TYPES).map(([value, t]) => ({ value, label: t.label }));
const LABELS = {
  enabled: "Show", type: "Type", name: "Name", entity: "Power entity", icon: "Icon",
  entity_2: "Second power entity (optional, added)", daily_entity_2: "Second daily energy entity (optional, added)", soc_entity: "Battery SoC entity", daily_entity: "Daily energy entity", peak_kw: "Peak capacity (kW), fills the tile green",
  positive_color: "Colour when the value is above 0", invert: "Invert sign", price_entity: "Price entity",
};
const bool = { boolean: {} };
// fields depend on the device type: SoC only for batteries
const schemaFor = (type) => [
  { name: "enabled", selector: bool },
  { name: "type", selector: sel(TYPE_OPTIONS) },
  { name: "name", selector: { text: {} } },
  { name: "entity", selector: ent() },
  ...(type === "solar" ? [{ name: "entity_2", selector: ent() }, { name: "peak_kw", selector: { number: { min: 0, step: 0.1, mode: "box", unit_of_measurement: "kW" } } }] : []),
  { name: "icon", selector: { icon: { placeholder: typeIcon(TYPES[type]) } } }, // standard icon shown as placeholder
  ...(type === "battery" ? [{ name: "soc_entity", selector: ent({ device_class: "battery" }) }] : []),
  ...(type === "grid" ? [{ name: "price_entity", selector: ent() }] : []),
  { name: "daily_entity", selector: ent({ device_class: "energy" }) },
  ...(type === "solar" ? [{ name: "daily_entity_2", selector: ent({ device_class: "energy" }) }] : []),
  { name: "positive_color", selector: sel([{ value: "green", label: "Green" }, { value: "red", label: "Red" }]),
    helper: "Colour while the value is above 0; below 0 the opposite colour is used. The live value and resulting colour show in the row header." },
  { name: "invert", selector: bool,
    helper: "Flip the sign first, for a sensor that reports the opposite direction (e.g. discharging as positive). Check the live value in the row header." },
];
const MANAGED = ["enabled", "type", "name", "entity", "entity_2", "icon", "soc_entity", "price_entity", "daily_entity", "daily_entity_2", "peak_kw", "positive_color", "invert"];

class M3SlimEnergyCardEditor extends HTMLElement {
  _nk = 0;
  _open = new Set();

  setConfig(config) {
    if (JSON.stringify(config) === JSON.stringify(this._config)) return;
    this._config = config;
    if (!this._keys || this._keys.length !== config.entities.length) this._keys = config.entities.map(() => this._nk++);
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this.querySelectorAll("ha-form").forEach((f) => (f.hass = hass));
    this.querySelectorAll("summary").forEach((sum, i) => this._config?.entities[i] && this._head(sum, this._config.entities[i]));
  }

  _emit(entities, extra = {}) {
    this._config = { ...this._config, ...extra, entities };
    for (const k of Object.keys(this._config)) if (this._config[k] === undefined) delete this._config[k];
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
  }

  _form(schema, data, onChange) {
    const f = document.createElement("ha-form");
    f.hass = this._hass;
    f.schema = schema;
    f.data = data;
    f.computeLabel = (s) => LABELS[s.name] || s.name;
    f.computeHelper = (s) => s.helper || "";
    f.addEventListener("value-changed", (e) => {
      e.stopPropagation();
      f.data = e.detail.value; // ha-form merges edits into its data prop
      onChange(e.detail.value);
    });
    return f;
  }

  _head(sum, e) {
    const T = TYPES[e.type] || TYPES.other;
    const icon = e.icon || typeIcon(T);
    sum.querySelector(".ic").innerHTML = iconHtml(icon);
    sum.querySelector(".nm").textContent = (e.enabled === false ? "(off) " : "") + (e.name || T.label);
    sum.querySelector(".id").textContent = e.entity || "";
    sum.querySelector(".warn").textContent = e.entity ? "" : "⚠ no entity";
    // live value and the colour it currently gets, so direction / invert are easy to judge
    const cur = sum.querySelector(".cur");
    const [kw, unit] = this._hass && e.entity ? sumStates(this._hass, [e.entity, e.entity_2]) : [NaN, ""];
    if (isNaN(kw)) cur.textContent = "";
    else {
      const col = signColor(e, kw);
      cur.innerHTML = `${kw < 0 ? "−" : "+"}${Math.abs(kw).toFixed(2)} ${unit} <span style="color:${col === "red" ? "#e57368" : col === "green" ? "#81c784" : "gray"}">● ${col || "neutral"}</span>`;
    }
  }

  _move(from, to) {
    const entities = this._config.entities.slice();
    entities.splice(to, 0, entities.splice(from, 1)[0]);
    this._keys.splice(to, 0, this._keys.splice(from, 1)[0]);
    this._emit(entities);
    this._render();
  }

  _render() {
    const c = this._config;
    this.innerHTML = `<style>
      .opts { display: flex; align-items: center; gap: 16px; font-size: 13px; padding: 4px 0 8px; }
      .opts label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
      .row { background: var(--card-background-color); border: 1px solid var(--divider-color); border-radius: 16px; margin: 8px 0; padding: 0 12px 8px; }
      .row.over { outline: 2px dashed var(--primary-color); }
      summary { display: flex; align-items: center; gap: 8px; cursor: pointer; list-style: none; padding: 10px 0; }
      summary::-webkit-details-marker { display: none; }
      .h { cursor: grab; } .nm { font-weight: 600; } .warn { color: var(--warning-color, #ffa600); }
      .cur { font-size: .8em; white-space: nowrap; } .id { flex: 1; min-width: 0; color: var(--secondary-text-color); font-size: .8em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .btn { cursor: pointer; --mdc-icon-size: 20px; }
      .add { display: inline-block; cursor: pointer; color: var(--primary-color); padding: 8px 0; }
    </style>`;
    const opts = document.createElement("div");
    opts.className = "opts";
    opts.innerHTML = `<label>Layout <select class="lay">
        <option value="tiles">Tiles · 3 per row</option>
        <option value="rows">Rows · one per device</option>
      </select></label>
      <label><input type="checkbox" class="hdr"> Header</label>`;
    opts.querySelector(".lay").value = c.layout === "rows" ? "rows" : "tiles";
    opts.querySelector(".lay").addEventListener("change", (e) => {
      const v = e.target.value;
      this._emit(this._config.entities, { layout: v === "rows" ? "rows" : undefined });
    });
    const hdr = opts.querySelector(".hdr");
    hdr.checked = c.header !== false;
    hdr.addEventListener("change", () => this._emit(this._config.entities, { header: hdr.checked ? undefined : false }));
    this.appendChild(opts);
    c.entities.forEach((e, i) => {
      const key = this._keys[i];
      const d = document.createElement("details");
      d.className = "row";
      d.open = this._open.has(key) || !e.entity;
      d.addEventListener("toggle", () => (d.open ? this._open.add(key) : this._open.delete(key)));
      const sum = document.createElement("summary");
      sum.innerHTML = `<ha-icon class="h" icon="mdi:drag"></ha-icon><span class="ic"></span><span class="nm"></span><span class="id"></span><span class="cur"></span><span class="warn"></span>
        <ha-icon class="btn cp" icon="mdi:content-copy"></ha-icon><ha-icon class="btn rm" icon="mdi:close"></ha-icon>`;
      this._head(sum, e);
      const act = (cls, fn) => sum.querySelector(cls).addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); fn(); });
      act(".cp", () => {
        const entities = this._config.entities.slice(); // closures outlive renders: never use the render-time config
        entities.splice(i + 1, 0, { ...entities[i] });
        this._keys.splice(i + 1, 0, this._nk++);
        this._emit(entities);
        this._render();
      });
      act(".rm", () => {
        this._keys.splice(i, 1);
        this._emit(this._config.entities.filter((_, j) => j !== i));
        this._render();
      });
      const h = sum.querySelector(".h");
      h.addEventListener("mousedown", () => (d.draggable = true));
      d.addEventListener("dragend", () => { d.draggable = false; });
      d.addEventListener("dragstart", (ev) => { this._drag = i; ev.dataTransfer.setData("text/plain", ""); ev.dataTransfer.effectAllowed = "move"; });
      d.addEventListener("dragover", (ev) => { ev.preventDefault(); d.classList.add("over"); });
      d.addEventListener("dragleave", () => d.classList.remove("over"));
      d.addEventListener("drop", (ev) => { ev.preventDefault(); if (this._drag !== undefined && this._drag !== i) this._move(this._drag, i); this._drag = undefined; });
      d.appendChild(sum);
      const type = e.type || "other";
      const data = { ...e, enabled: e.enabled !== false, type, positive_color: e.positive_color || TYPES[type].positive };
      d.appendChild(this._form(schemaFor(type), data, (v) => {
        const n = {};
        const entities = this._config.entities.slice();
        const kept = { ...entities[i] };
        MANAGED.forEach((k) => delete kept[k]);
        for (const k of ["name", "icon", "entity", "daily_entity", ...(v.type === "solar" ? ["entity_2", "daily_entity_2"] : []), ...(v.type === "battery" ? ["soc_entity"] : []), ...(v.type === "grid" ? ["price_entity"] : [])]) if (v[k] || k === "entity") n[k] = v[k] || "";
        if (v.type && v.type !== "other") n.type = v.type;
        // a colour that was just the old type's default follows the new type
        const dflt = v.type !== type && v.positive_color === TYPES[type].positive ? TYPES[v.type].positive : v.positive_color;
        if (dflt && dflt !== TYPES[v.type].positive) n.positive_color = dflt;
        if (v.invert) n.invert = true;
        if (v.type === "solar" && Number(v.peak_kw) > 0) n.peak_kw = Number(v.peak_kw);
        if (!v.enabled) n.enabled = false;
        entities[i] = { ...kept, ...n };
        this._emit(entities);
        if (v.type !== type) this._render(); else this._head(sum, entities[i]);
      }));
      this.appendChild(d);
    });
    const add = document.createElement("div");
    add.className = "add";
    add.textContent = "+ Add device";
    add.addEventListener("click", () => {
      this._keys.push(this._nk++);
      this._emit([...this._config.entities, { entity: "" }]);
      this._render();
    });
    this.appendChild(add);
  }
}

customElements.define("m3-slim-energy-card", M3SlimEnergyCard);
customElements.define("m3-slim-energy-card-editor", M3SlimEnergyCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "m3-slim-energy-card",
  name: "M3 Slim Energy Card",
  description: "Material 3 energy overview: solar, battery, grid, home, heat pump, EV — as tiles or rows",
});
