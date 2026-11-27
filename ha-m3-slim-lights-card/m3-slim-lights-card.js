// M3 Slim Lights Card: one to four lights (or switches) as tiles in one row, as
// tall as the energy card's. A tap toggles, a sideways drag sets the brightness,
// a long press opens the more-info dialog. The fill behind each tile shows the
// brightness.

const ON = "#f0c46e";
const DRAG_PX = 6; // movement before a press becomes a drag
const LONG_MS = 500;
const HOLD_MS = 4000; // keep the dragged value while the light catches up

const STRINGS = {
  en: { on: "On", off: "Off", na: "Unavailable" },
  de: { on: "An", off: "Aus", na: "Nicht verfügbar" },
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
const dimmable = (st) => st?.entity_id?.startsWith("light.") &&
  (st.attributes.supported_color_modes ?? []).some((m) => m !== "onoff");

const CSS = `
  :host { display: block; }
  ha-card { display: block; background: transparent; border: none; box-shadow: none;
            border-radius: var(--m3-card-radius, 28px); overflow: hidden; }
  .card {
    --m3-outline: color-mix(in srgb, var(--primary-text-color) 12%, transparent);
    --m3-surface: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 55%, transparent);
    --m3-item: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
    box-sizing: border-box; display: flex; gap: 6px; padding: 12px;
    border-radius: var(--m3-card-radius, 28px); border: 1px solid var(--m3-outline);
    background: var(--m3-surface); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);
    color: var(--primary-text-color);
  }
  /* same height as the energy card's tiles (68px) */
  .l { flex: 1 1 0; min-width: 0; box-sizing: border-box; height: 68px; padding: 6px 12px; gap: 4px;
       border-radius: 18px; overflow: hidden; position: relative; cursor: pointer;
       display: flex; flex-direction: column; justify-content: center;
       touch-action: pan-y; user-select: none; -webkit-user-select: none;
       background: var(--m3-item); transition: border-radius .35s cubic-bezier(.2, 0, 0, 1); }
  .l.on { background: color-mix(in srgb, var(--c) 14%, var(--m3-item)); }
  .l.na { opacity: .4; }
  .l.drag { border-radius: 11px; }
  .fill { position: absolute; inset: 0 auto 0 0; width: var(--b); pointer-events: none;
          background: color-mix(in srgb, var(--c) 16%, transparent); transition: width .2s; }
  .l.drag .fill { transition: none; }
  .l > :not(.fill) { position: relative; }
  .ink { color: color-mix(in srgb, var(--c) 85%, var(--primary-text-color)); }
  .hd { display: flex; align-items: center; gap: 6px; min-width: 0; line-height: 15px; }
  .hd ha-icon { --mdc-icon-size: 14px; font-size: 14px; flex: none; display: inline-flex; }
  .nm { font-size: 12px; opacity: .75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .st { display: flex; align-items: center; gap: 6px; line-height: 26px; white-space: nowrap; }
  .st ha-icon { --mdc-icon-size: 24px; font-size: 24px; display: inline-flex; }
  .v { font-size: 20px; font-weight: 600; }
  .p { font-size: 12px; font-weight: 500; opacity: .75; font-feature-settings: "tnum"; }
  .l:not(.on) .ink { color: var(--primary-text-color); opacity: .7; }
`;

class M3SlimLightsCard extends HTMLElement {
  setConfig(config) {
    if (!Array.isArray(config?.entities) || !config.entities.length) throw new Error("entities: one to four lights required");
    this._config = config;
    this._sig = undefined;
    this._pending = new Map();
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  static getConfigElement() {
    return document.createElement("m3-slim-lights-card-editor");
  }

  static getStubConfig(hass) {
    return { entities: Object.keys(hass?.states ?? {}).filter((id) => id.startsWith("light.")).slice(0, 3) };
  }

  getCardSize() {
    return 2;
  }

  _items() {
    return this._config.entities.slice(0, 4).map((e) => (typeof e === "string" ? { entity: e } : e)).filter((e) => e.entity);
  }

  /** Brightness in %, the dragged value while the light has not caught up. */
  _pct(id, st) {
    const p = this._pending.get(id);
    if (p && Date.now() < p.until) return p.pct;
    this._pending.delete(id);
    return st?.state === "on" ? (st.attributes.brightness != null ? clamp(st.attributes.brightness / 2.55) : 100) : 0;
  }

  _tile(e, t) {
    const st = this._hass.states[e.entity];
    const pct = this._pct(e.entity, st);
    const na = !st || st.state === "unavailable" || st.state === "unknown";
    const on = !na && pct > 0;
    const rgb = st?.attributes.rgb_color;
    const switchLike = !e.entity.startsWith("light.");
    return {
      entity: e.entity, on, na, pct, dim: dimmable(st),
      color: on && Array.isArray(rgb) ? `rgb(${rgb.join(",")})` : ON,
      name: e.name ?? st?.attributes.friendly_name ?? e.entity,
      icon: e.icon ?? st?.attributes.icon ?? (switchLike ? "mdi:power-socket-eu" : on ? "mdi:lightbulb-on" : "mdi:lightbulb-outline"),
      state: na ? t.na : on ? t.on : t.off,
    };
  }

  _render() {
    if (!this._config || !this._hass || this._drag) return;
    const lang = (this._hass.locale?.language ?? this._hass.language ?? "en").slice(0, 2);
    const t = STRINGS[lang] ?? STRINGS.en;
    const tiles = this._items().map((e) => this._tile(e, t));
    const sig = JSON.stringify(tiles);
    if (sig === this._sig) return;
    this._sig = sig;
    if (!this.shadowRoot) this._listen();
    this.shadowRoot.innerHTML = `<style>${CSS}</style><ha-card><div class="card">${tiles.map((l) => `
      <div class="l${l.on ? " on" : ""}${l.na ? " na" : ""}" data-entity="${esc(l.entity)}" data-pct="${l.pct}"${l.dim ? " data-dim" : ""}
           style="--c:${l.color};--b:${l.dim && l.on ? l.pct : 0}%" title="${esc(l.name)}">
        <div class="fill"></div>
        <div class="hd"><ha-icon class="ink" icon="${esc(l.icon)}"></ha-icon><span class="nm">${esc(l.name)}</span></div>
        <div class="st ink"><ha-icon icon="${esc(l.icon)}"></ha-icon><span class="v">${esc(l.state)}</span>${
          l.dim && l.on ? `<span class="p">${l.pct} %</span>` : ""}</div>
      </div>`).join("")}</div></ha-card>`;
  }

  _moreInfo(id) {
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true }));
  }

  // tap toggles, sideways drag dims, long press opens more-info
  _listen() {
    this.attachShadow({ mode: "open" });
    const root = this.shadowRoot;
    let press;
    const end = () => { clearTimeout(press?.timer); press = undefined; };
    root.addEventListener("pointerdown", (ev) => {
      const el = ev.composedPath().find((n) => n.classList?.contains("l"));
      if (!el || ev.button > 0) return;
      const id = el.dataset.entity;
      press = { el, id, x: ev.clientX, y: ev.clientY, start: Number(el.dataset.pct), width: el.offsetWidth || 1,
        timer: setTimeout(() => { end(); this._moreInfo(id); }, LONG_MS) };
    });
    root.addEventListener("pointermove", (ev) => {
      if (!press) return;
      const dx = ev.clientX - press.x;
      if (!this._drag) {
        if (Math.abs(ev.clientY - press.y) > DRAG_PX && Math.abs(ev.clientY - press.y) > Math.abs(dx)) return end(); // scrolling
        if (Math.abs(dx) < DRAG_PX) return;
        clearTimeout(press.timer);
        if (!("dim" in press.el.dataset)) return end(); // a drag on an on/off light does nothing
        this._drag = press;
        press.el.setPointerCapture?.(ev.pointerId);
        press.el.classList.add("drag", "on");
      }
      const pct = clamp(press.start + (dx / press.width) * 100);
      press.pct = pct;
      press.el.style.setProperty("--b", `${pct}%`);
      const t = STRINGS[(this._hass.locale?.language ?? this._hass.language ?? "en").slice(0, 2)] ?? STRINGS.en;
      press.el.querySelector(".v").textContent = pct ? t.on : t.off;
      const p = press.el.querySelector(".p") ?? press.el.querySelector(".st").appendChild(Object.assign(document.createElement("span"), { className: "p" }));
      p.textContent = pct ? `${pct} %` : "";
    });
    root.addEventListener("pointerup", () => {
      if (!press) return;
      const { id, pct } = press;
      const dragged = this._drag;
      end();
      this._drag = undefined;
      if (dragged) {
        this._pending.set(id, { pct, until: Date.now() + HOLD_MS });
        this._hass.callService("light", pct ? "turn_on" : "turn_off", pct ? { entity_id: id, brightness_pct: pct } : { entity_id: id });
      } else {
        this._hass.callService("homeassistant", "toggle", { entity_id: id });
      }
      this._sig = undefined;
      this._render();
    });
    root.addEventListener("pointercancel", () => {
      end();
      if (this._drag) { this._drag = undefined; this._sig = undefined; this._render(); }
    });
    root.addEventListener("contextmenu", (ev) => ev.preventDefault());
  }
}

class M3SlimLightsCardEditor extends HTMLElement {
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
      this._form.computeLabel = () => "Lights and switches (one to four)";
      this._form.schema = [{ name: "entities", selector: { entity: { multiple: true, domain: ["light", "switch"] } } }];
      this._form.addEventListener("value-changed", (ev) => {
        // keep name and icon of entries that stay
        const old = new Map((this._config.entities ?? []).map((e) => (typeof e === "string" ? [e, e] : [e.entity, e])));
        const entities = (ev.detail.value.entities ?? []).slice(0, 4).map((id) => old.get(id) ?? id);
        this._config = { ...this._config, entities };
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = { entities: (this._config.entities ?? []).map((e) => (typeof e === "string" ? e : e.entity)) };
  }
}

customElements.define("m3-slim-lights-card", M3SlimLightsCard);
customElements.define("m3-slim-lights-card-editor", M3SlimLightsCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "m3-slim-lights-card",
  name: "M3 Slim Lights Card",
  description: "Material 3 row of one to four lights: tap toggles, drag sideways sets the brightness",
  preview: true,
});
