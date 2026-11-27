// M3 Slim Open Windows Card: the open windows in one row, longest open first.
// Each slot shows an icon, how long it has been open and the name; yellow while
// open, red once open longer than `alert_after` minutes. Windows and doors are
// found by device_class, or listed explicitly.

const YELLOW = "#f0c46e";
const RED = "#e57373";
const GREEN = "#81c784";
const ICONS = { door: "mdi:door-open", garage_door: "mdi:garage-open", opening: "mdi:square-rounded-outline" };
const WINDOW_ICON = "mdi:window-open-variant";
// words dropped from names: vendors and what the sensor is ("Shelly Fensterkontakt Bad Window" → "Bad")
const NOISE = /\b(shelly|aqara|xiaomi|hue|ikea|tuya|sonoff|homematic|eve|fensterkontakte?|fenster|window|door|kontakt|contact|sensor|opening)\b/gi;

const STRINGS = {
  en: { closed: "All windows and doors closed", now: "now", day: "d" },
  de: { closed: "Alle Fenster und Türen geschlossen", now: "gerade", day: "T" },
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** "now", "12 min", "2 h 5 min", "3 d 4 h" */
const duration = (minutes, t) => {
  if (minutes < 1) return t.now;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;
  const d = Math.floor(h / 24), rh = h % 24;
  return rh ? `${d} ${t.day} ${rh} h` : `${d} ${t.day}`;
};

/** Entity ID patterns, `*` matches any run of characters; without a domain a pattern matches the part after it. */
const matcher = (p) => {
  const re = new RegExp(`^${String(p).trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
  return String(p).includes(".") ? (id) => re.test(id) : (id) => re.test(id.slice(id.indexOf(".") + 1));
};

const CSS = `
  :host { display: block; }
  ha-card { display: block; background: transparent; border: none; box-shadow: none;
            border-radius: var(--m3-card-radius, 28px); overflow: hidden; }
  .card {
    --m3-outline: color-mix(in srgb, var(--primary-text-color) 12%, transparent);
    --m3-surface: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 55%, transparent);
    box-sizing: border-box; display: flex; gap: 8px; padding: 10px;
    border-radius: var(--m3-card-radius, 28px); border: 1px solid var(--m3-outline);
    background: var(--m3-surface); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);
    color: var(--primary-text-color);
  }
  .win { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 4px;
         padding: 10px 4px 8px; border-radius: 20px; cursor: pointer;
         background: color-mix(in srgb, var(--c) 9%, var(--ha-card-background, var(--card-background-color)));
         transition: border-radius .35s cubic-bezier(.2, 0, 0, 1); }
  .win:active { border-radius: 13px; }
  .well { width: 40px; height: 40px; border-radius: 14px; display: grid; place-items: center; flex: none;
          --mdc-icon-size: 24px; font-size: 24px;
          background: color-mix(in srgb, var(--c) 22%, var(--ha-card-background, var(--card-background-color)));
          color: color-mix(in srgb, var(--c) 85%, var(--primary-text-color)); }
  .well ha-icon { display: flex; } /* inline, it sits on the text baseline and drops low when text is enlarged */
  .time { font-size: 15px; font-weight: 700; line-height: 1.1; white-space: nowrap;
          color: color-mix(in srgb, var(--c) 80%, var(--primary-text-color)); }
  .name { max-width: 100%; font-size: 11px; opacity: .8; text-align: center;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ok { flex: 1; display: flex; align-items: center; gap: 12px; padding: 4px; font-size: 14px; }
`;

class M3SlimOpenWindowsCard extends HTMLElement {
  setConfig(config) {
    this._config = config ?? {};
    this._sig = undefined;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  // the durations move on without a state change
  connectedCallback() {
    this._timer = setInterval(() => this._render(), 30000);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  static getConfigElement() {
    return document.createElement("m3-slim-open-windows-card-editor");
  }

  static getStubConfig() {
    return { alert_after: 30, count: 5 };
  }

  getCardSize() {
    return 2;
  }

  _num(key, def) {
    const v = this._config[key];
    return v === "" || v === undefined || !Number.isFinite(Number(v)) ? def : Number(v);
  }

  /** Device name if the entity has one, else the friendly name; vendors and "Window"/"Fensterkontakt" dropped. */
  _name(id, st) {
    const reg = this._hass.entities?.[id];
    const dev = this._hass.devices?.[reg?.device_id];
    const name = (dev?.name_by_user ?? dev?.name ?? st.attributes.friendly_name ?? id).trim();
    return name.replace(NOISE, " ").replace(/\s*\([^()]*\)$/, "").replace(/\s+/g, " ").trim() || name;
  }

  _open() {
    const states = this._hass.states;
    const classes = this._config.device_classes?.length ? this._config.device_classes : ["window", "door"];
    const exclude = (this._config.exclude ?? []).map(matcher);
    const ids = this._config.entities?.length
      ? this._config.entities
      : Object.keys(states).filter((id) => id.startsWith("binary_sensor.") && classes.includes(states[id].attributes.device_class));
    const now = Date.now();
    const out = [];
    for (const id of ids) {
      const st = states[id];
      if (st?.state !== "on" || exclude.some((match) => match(id))) continue;
      const minutes = Math.max(0, Math.floor((now - Date.parse(st.last_changed)) / 60000));
      out.push({ id, minutes, name: this._name(id, st), icon: ICONS[st.attributes.device_class] ?? WINDOW_ICON });
    }
    return out.sort((a, b) => b.minutes - a.minutes).slice(0, Math.max(1, this._num("count", 5)));
  }

  _render() {
    if (!this._config || !this._hass) return;
    const lang = (this._hass.locale?.language ?? this._hass.language ?? "en").slice(0, 2);
    const t = STRINGS[lang] ?? STRINGS.en;
    const alertAfter = this._num("alert_after", 30);
    const open = this._open().map((w) => ({ ...w, time: duration(w.minutes, t), alert: w.minutes >= alertAfter }));
    const sig = JSON.stringify([open, lang]);
    if (sig === this._sig) return;
    this._sig = sig;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("click", (ev) => {
        const id = ev.composedPath().find((n) => n.dataset?.entity)?.dataset.entity;
        if (id) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true }));
      });
    }
    this.style.display = !open.length && this._config.hide_when_ok ? "none" : "";
    const body = open.length
      ? open.map((w) => `<div class="win" data-entity="${esc(w.id)}" style="--c:${w.alert ? RED : YELLOW}" title="${esc(w.name)}: ${esc(w.time)}">
            <div class="well"><ha-icon icon="${w.icon}"></ha-icon></div>
            <div class="time">${esc(w.time)}</div>
            <div class="name">${esc(w.name)}</div>
          </div>`).join("")
      : `<div class="ok" style="--c:${GREEN}"><div class="well"><ha-icon icon="mdi:window-closed-variant"></ha-icon></div>
           ${esc(this._config.closed_text ?? t.closed)}</div>`;
    this.shadowRoot.innerHTML = `<style>${CSS}</style><ha-card><div class="card">${body}</div></ha-card>`;
  }
}

class M3SlimOpenWindowsCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    else this._render();
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => ({
        alert_after: "Red after (minutes open)",
        count: "Windows in the row",
        device_classes: "Sensor types (default: window, door)",
        entities: "Only these sensors (empty: all of the types above)",
        exclude: "Never show",
        exclude_patterns: "Never show, by pattern (* is a wildcard: binary_sensor.garage_*, *_tuer_*)",
        closed_text: "Text when everything is closed",
        hide_when_ok: "Hide the card when everything is closed",
      })[s.name] ?? s.name;
      this._form.addEventListener("value-changed", (ev) => {
        // the form shows exact entities and wildcard patterns apart; the config keeps one list
        const { exclude_patterns: patterns = [], ...v } = ev.detail.value;
        const config = { ...this._config, ...v,
          exclude: [...(v.exclude ?? []), ...patterns.map((p) => String(p).trim()).filter(Boolean)] };
        for (const k of Object.keys(config)) {
          if (config[k] === "" || config[k] === undefined || (Array.isArray(config[k]) && !config[k].length)) delete config[k];
        }
        this._config = config;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    const sensors = { entity: { multiple: true, domain: "binary_sensor" } };
    this._form.hass = this._hass;
    this._form.schema = [
      { name: "alert_after", selector: { number: { min: 1, max: 1440, step: 1, mode: "box", unit_of_measurement: "min" } } },
      { name: "count", selector: { number: { min: 1, max: 8, step: 1, mode: "box" } } },
      { name: "device_classes", selector: { select: { multiple: true, options: [
        { value: "window", label: "Window" },
        { value: "door", label: "Door" },
        { value: "garage_door", label: "Garage door" },
        { value: "opening", label: "Opening" },
      ] } } },
      { name: "entities", selector: sensors },
      { name: "exclude", selector: sensors },
      { name: "exclude_patterns", selector: { text: { multiple: true } } },
      { name: "closed_text", selector: { text: {} } },
      { name: "hide_when_ok", selector: { boolean: {} } },
    ];
    const exclude = this._config.exclude ?? [];
    this._form.data = { alert_after: 30, count: 5, hide_when_ok: false, ...this._config,
      exclude: exclude.filter((p) => !String(p).includes("*")),
      exclude_patterns: exclude.filter((p) => String(p).includes("*")) };
  }
}

customElements.define("m3-slim-open-windows-card", M3SlimOpenWindowsCard);
customElements.define("m3-slim-open-windows-card-editor", M3SlimOpenWindowsCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "m3-slim-open-windows-card",
  name: "M3 Slim Open Windows Card",
  description: "Material 3 row of open windows and doors: name and how long each has been open",
  preview: true,
});
