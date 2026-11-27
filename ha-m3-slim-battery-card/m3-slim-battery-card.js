// M3 Slim Battery Card: the weakest batteries below a threshold, in one row.
// Each slot shows a battery icon, the level and the device's name; yellow below
// the threshold, red at or below the critical level. Batteries are found by
// device_class: battery, or listed explicitly.

const YELLOW = "#f0c46e";
const RED = "#e57373";
const GREEN = "#81c784";

const STRINGS = {
  en: { ok: (t) => `All batteries above ${t} %` },
  de: { ok: (t) => `Alle Batterien über ${t} %` },
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const batteryIcon = (level, critical) =>
  level <= critical ? "mdi:battery-alert-variant-outline" : `mdi:battery-${Math.max(10, Math.min(90, Math.floor(level / 10) * 10))}`;

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
  .bat { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 4px;
         padding: 10px 4px 8px; border-radius: 20px; cursor: pointer;
         background: color-mix(in srgb, var(--c) 9%, var(--ha-card-background, var(--card-background-color)));
         transition: border-radius .35s cubic-bezier(.2, 0, 0, 1); }
  .bat:active { border-radius: 13px; }
  .well { width: 40px; height: 40px; border-radius: 14px; display: grid; place-items: center;
          --mdc-icon-size: 24px; font-size: 24px;
          background: color-mix(in srgb, var(--c) 22%, var(--ha-card-background, var(--card-background-color)));
          color: color-mix(in srgb, var(--c) 85%, var(--primary-text-color)); }
  .pct { font-size: 16px; font-weight: 700; line-height: 1.1;
         color: color-mix(in srgb, var(--c) 80%, var(--primary-text-color)); }
  .name { max-width: 100%; font-size: 11px; opacity: .8; text-align: center;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ok { flex: 1; display: flex; align-items: center; gap: 12px; padding: 4px; font-size: 14px; }
`;

class M3SlimBatteryCard extends HTMLElement {
  setConfig(config) {
    this._config = config ?? {};
    this._sig = undefined;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  static getConfigElement() {
    return document.createElement("m3-slim-battery-card-editor");
  }

  static getStubConfig() {
    return { threshold: 30, critical: 15, count: 5 };
  }

  getCardSize() {
    return 2;
  }

  _num(key, def) {
    const n = Number(this._config[key]);
    return Number.isFinite(n) && this._config[key] !== "" && this._config[key] !== undefined ? n : def;
  }

  /** Device name if the entity has one, else the friendly name; trailing "Battery" words dropped. */
  _name(id, st) {
    const reg = this._hass.entities?.[id];
    const dev = this._hass.devices?.[reg?.device_id];
    const name = (dev?.name_by_user ?? dev?.name ?? st.attributes.friendly_name ?? id).trim();
    // "CUPRA Born (ELECTRIC_VEHICLES)": drop a bracketed category at the end
    return name.replace(/\s*\([^()]*\)$/, "")
      .replace(/[\s\-–:·]*(battery|batterie|akku)(\s*(level|state|stand))?$/i, "").trim() || name;
  }

  _low() {
    const states = this._hass.states;
    // entity IDs, `*` matches any run of characters (sensor.pixel_*); without
    // a domain a pattern matches the part after it (pixel_*)
    const exclude = (this._config.exclude ?? []).map((p) => {
      const re = new RegExp(`^${String(p).trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
      return String(p).includes(".") ? (id) => re.test(id) : (id) => re.test(id.slice(id.indexOf(".") + 1));
    });
    const ids = this._config.entities?.length
      ? this._config.entities
      : Object.keys(states).filter((id) => {
        const a = states[id].attributes;
        return id.startsWith("sensor.") && a.device_class === "battery" && a.unit_of_measurement === "%";
      });
    const threshold = this._num("threshold", 30);
    const out = [];
    for (const id of ids) {
      const st = states[id];
      const level = Number(st?.state);
      if (exclude.some((match) => match(id)) || !st || st.state === "" || !Number.isFinite(level) || level >= threshold) continue;
      out.push({ id, level: Math.round(level), name: this._name(id, st) });
    }
    return out.sort((a, b) => a.level - b.level).slice(0, Math.max(1, this._num("count", 5)));
  }

  _render() {
    if (!this._config || !this._hass) return;
    const low = this._low();
    const sig = JSON.stringify([low, this._hass.locale?.language]);
    if (sig === this._sig) return;
    this._sig = sig;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("click", (ev) => {
        const id = ev.composedPath().find((n) => n.dataset?.entity)?.dataset.entity;
        if (id) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true }));
      });
    }
    this.style.display = !low.length && this._config.hide_when_ok ? "none" : "";
    const critical = this._num("critical", 15);
    const lang = (this._hass.locale?.language ?? this._hass.language ?? "en").slice(0, 2);
    const t = STRINGS[lang] ?? STRINGS.en;
    const body = low.length
      ? low.map((b) => {
        const c = b.level <= critical ? RED : YELLOW;
        return `<div class="bat" data-entity="${esc(b.id)}" style="--c:${c}" title="${esc(b.name)}: ${b.level} %">
            <div class="well"><ha-icon icon="${batteryIcon(b.level, critical)}"></ha-icon></div>
            <div class="pct">${b.level} %</div>
            <div class="name">${esc(b.name)}</div>
          </div>`;
      }).join("")
      : `<div class="ok" style="--c:${GREEN}"><div class="well"><ha-icon icon="mdi:battery-check-outline"></ha-icon></div>
           ${esc(t.ok(this._num("threshold", 30)))}</div>`;
    this.shadowRoot.innerHTML = `<style>${CSS}</style><ha-card><div class="card">${body}</div></ha-card>`;
  }
}

class M3SlimBatteryCardEditor extends HTMLElement {
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
        threshold: "Show batteries below (%)",
        critical: "Red at or below (%)",
        count: "Batteries in the row",
        entities: "Only these batteries (empty: all with device class battery)",
        exclude: "Never show",
        exclude_patterns: "Never show, by pattern (* is a wildcard: sensor.pixel_*, evcc*)",
        hide_when_ok: "Hide the card when no battery is low",
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
    const battery = { entity: { multiple: true, domain: "sensor", device_class: "battery" } };
    this._form.hass = this._hass;
    this._form.schema = [
      { name: "threshold", selector: { number: { min: 1, max: 100, step: 1, mode: "box", unit_of_measurement: "%" } } },
      { name: "critical", selector: { number: { min: 0, max: 100, step: 1, mode: "box", unit_of_measurement: "%" } } },
      { name: "count", selector: { number: { min: 1, max: 8, step: 1, mode: "box" } } },
      { name: "entities", selector: battery },
      { name: "exclude", selector: battery },
      { name: "exclude_patterns", selector: { text: { multiple: true } } },
      { name: "hide_when_ok", selector: { boolean: {} } },
    ];
    const exclude = this._config.exclude ?? [];
    this._form.data = { threshold: 30, critical: 15, count: 5, hide_when_ok: false, ...this._config,
      exclude: exclude.filter((p) => !String(p).includes("*")),
      exclude_patterns: exclude.filter((p) => String(p).includes("*")) };
  }
}

customElements.define("m3-slim-battery-card", M3SlimBatteryCard);
customElements.define("m3-slim-battery-card-editor", M3SlimBatteryCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "m3-slim-battery-card",
  name: "M3 Slim Battery Card",
  description: "Material 3 battery row: the weakest batteries below a threshold, yellow and red",
  preview: true,
});
