// M3 Slim Trash Card: the next bin collection plus a timeline of the coming
// days. Design and the name→icon/colour rules follow the waste card of
// j0sp0r/m3-cards (MIT); this is a standalone, dependency-free version of its
// hero + timeline, without the per-bin list and the reminder mode.

const DOT = 15; // px, timeline marker size
const STACK = 10; // px, offset between markers on the same day
const DEFAULT_ICON = "mdi:trash-can-outline";
const DEFAULT_COLOR = "#9fb0c0";
const RULES = [
  [/(alt)?papier|paper|karton|carton/i, "mdi:newspaper-variant-outline", "#6ba7dc"],
  [/bio|organi|grüngut|gruengut|compost|gft|tuinafval/i, "mdi:leaf", "#81c784"],
  [/rest(müll|muell|afval)?|general|r(e|é)sidu|schwarz|ménagers|menagers/i, "mdi:trash-can-outline", "#888780"],
  [/wertstoff|gelb|plastik|plastic|verpackung|recycl|lvp|pmc/i, "mdi:recycle", "#f0c46e"],
  [/glas|glass|verre/i, "mdi:bottle-soda-outline", "#7bc4b0"],
  [/sperrm(ü|ue)ll|bulk|encombrant|grofvuil/i, "mdi:sofa-outline", "#b8946a"],
];

const STRINGS = {
  en: {
    next: "Next collection", none: "No collection scheduled", today: "Today", tomorrow: "Tomorrow",
    in_days: (n) => `in ${n} days`, today_short: "today", span: (n) => (n === 14 ? "Next two weeks" : `Next ${n} days`),
  },
  de: {
    next: "Nächste Abholung", none: "Keine Abholung geplant", today: "Heute", tomorrow: "Morgen",
    in_days: (n) => `in ${n} Tagen`, today_short: "heute", span: (n) => (n === 14 ? "Nächste zwei Wochen" : `Nächste ${n} Tage`),
  },
};

/**
 * Days from today until a collection. A state is either a day count ("3") or
 * the date itself ("2026-12-01" or a timestamp); a date is recognised first,
 * since parsing it as a number would read the year as a day count.
 */
const daysFromState = (state, now = new Date()) => {
  if (!state) return undefined;
  const s = String(state).trim();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ymd = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(s);
  if (ymd) {
    const at = s.length > 10 && !isNaN(Date.parse(s)) ? new Date(Date.parse(s)) : new Date(+ymd[1], +ymd[2] - 1, +ymd[3]);
    return Math.round((new Date(at.getFullYear(), at.getMonth(), at.getDate()) - today) / 86400000);
  }
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : undefined;
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const CSS = `
  :host { display: block; }
  ha-card { display: block; background: transparent; border: none; box-shadow: none;
            border-radius: var(--m3-card-radius, 28px); overflow: hidden; }
  .card {
    --m3-outline: color-mix(in srgb, var(--primary-text-color) 12%, transparent);
    --m3-surface: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 55%, transparent);
    box-sizing: border-box; display: flex; flex-direction: column; gap: 14px; padding: 12px;
    border-radius: var(--m3-card-radius, 28px); border: 1px solid var(--m3-outline);
    background: var(--m3-surface); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);
    color: var(--primary-text-color);
  }
  .hero { display: flex; align-items: center; gap: 12px; padding: 13px; border-radius: 20px; cursor: pointer;
          background: color-mix(in srgb, var(--accent) 9%, var(--ha-card-background, var(--card-background-color)));
          transition: border-radius .35s cubic-bezier(.2, 0, 0, 1); }
  .hero:active { border-radius: 13px; }
  .icons { flex: none; display: flex; }
  .well { width: 56px; height: 56px; border-radius: 20px; display: grid; place-items: center;
          --mdc-icon-size: 28px; font-size: 28px;
          background: color-mix(in srgb, var(--c) 22%, var(--ha-card-background, var(--card-background-color)));
          color: color-mix(in srgb, var(--c) 85%, var(--primary-text-color)); }
  .icons .well + .well { margin-left: -22px; box-shadow: -2px 0 0 0 var(--ha-card-background, var(--card-background-color)); }
  .ht { flex: 1; min-width: 0; }
  .label { font-size: 12px; opacity: .7; }
  .main { font-size: 21px; font-weight: 700; line-height: 1.15;
          color: color-mix(in srgb, var(--accent) 85%, var(--primary-text-color)); }
  .sub { font-size: 13px; opacity: .85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tl { display: flex; flex-direction: column; gap: 6px; padding: 0 2px; }
  .tl-label { font-size: 12px; opacity: .6; }
  .track { position: relative; height: 20px; }
  .line { position: absolute; top: 50%; left: 0; right: 0; height: 3px; transform: translateY(-50%); border-radius: 2px;
          background: color-mix(in srgb, var(--primary-text-color) 12%, var(--ha-card-background, var(--card-background-color))); }
  /* a day's markers form one group, positioned so the group never leaves the track */
  .day { position: absolute; top: 50%; height: ${DOT}px; transform: translateY(-50%); cursor: pointer; }
  .dot { position: absolute; top: 0; width: ${DOT}px; height: ${DOT}px; border-radius: 5px; background: var(--c);
         box-shadow: 0 0 0 2px var(--ha-card-background, var(--card-background-color)); }
  .axis { display: flex; justify-content: space-between; font-size: 10px; opacity: .5; }
`;

class M3SlimTrashCard extends HTMLElement {
  setConfig(config) {
    if (!Array.isArray(config.entities) || !config.entities.length) throw new Error("entities: list of sensors required");
    this._config = config;
    this._render();
  }

  set hass(hass) {
    const prev = this._hass;
    this._hass = hass;
    const ids = this._entities().map((e) => e.entity);
    const day = new Date().toDateString();
    if (prev && this._day === day && ids.every((id) => prev.states[id] === hass.states[id])) return;
    this._day = day;
    this._render();
  }

  static getConfigElement() {
    return document.createElement("m3-slim-trash-card-editor");
  }

  static getStubConfig(hass) {
    const ids = Object.keys(hass?.states ?? {}).filter((id) => id.startsWith("sensor.") && RULES.some(([re]) => re.test(id)));
    return { entities: ids.slice(0, 4) };
  }

  getCardSize() {
    return this._config?.show_timeline === false ? 2 : 3;
  }

  _entities() {
    return (this._config?.entities ?? []).map((e) => (typeof e === "string" ? { entity: e } : e)).filter((e) => e?.entity);
  }

  _t() {
    const lang = (this._hass?.locale?.language ?? this._hass?.language ?? "en").slice(0, 2);
    return STRINGS[lang] ?? STRINGS.en;
  }

  /** The friendly name without the device's name in front (often the street address). */
  _name(e, st) {
    if (e.name) return e.name;
    let name = st?.attributes?.friendly_name ?? e.entity;
    const dev = this._hass?.devices?.[this._hass?.entities?.[e.entity]?.device_id];
    const d = (dev?.name_by_user ?? dev?.name ?? "").trim();
    if (d && name.length > d.length && name.toLowerCase().startsWith(d.toLowerCase())) {
      name = name.slice(d.length).replace(/^[\s\-–:·,]+/, "") || name;
    }
    return name;
  }

  _streams() {
    const out = [];
    for (const e of this._entities()) {
      const st = this._hass?.states[e.entity];
      if (!st) continue;
      // Waste Collection Schedule "upcoming" sensor: one attribute per date,
      // its value the bins of that day ("Restmüll, Gelber Sack").
      const dated = Object.entries(st.attributes).filter(([k]) => /^\d{4}-\d{2}-\d{2}$/.test(k));
      if (dated.length) {
        for (const [date, types] of dated) {
          const days = daysFromState(date);
          if (days < 0) continue;
          for (const name of String(types).split(/\s*,\s*/).filter(Boolean)) {
            const rule = RULES.find(([re]) => re.test(name));
            out.push({ entity: e.entity, name, days, icon: rule?.[1] ?? DEFAULT_ICON, color: rule?.[2] ?? DEFAULT_COLOR });
          }
        }
        continue;
      }
      const days = daysFromState(st.state);
      if (days === undefined || days < 0) continue;
      const name = this._name(e, st);
      const rule = RULES.find(([re]) => re.test(name)) ?? RULES.find(([re]) => re.test(e.entity));
      out.push({
        entity: e.entity, name, days,
        icon: e.icon ?? st.attributes.icon ?? rule?.[1] ?? DEFAULT_ICON,
        color: e.color ?? rule?.[2] ?? DEFAULT_COLOR,
      });
    }
    return out.sort((a, b) => a.days - b.days);
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("click", (ev) => {
        const id = ev.composedPath().find((n) => n.dataset?.entity)?.dataset.entity;
        if (id) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true }));
      });
    }
    const t = this._t();
    const lang = this._hass.locale?.language ?? this._hass.language ?? "en";
    const streams = this._streams();
    const next = streams[0];
    const sameDay = next ? streams.filter((s) => s.days === next.days) : [];
    const accent = next?.color ?? DEFAULT_COLOR;
    const date = next ? new Date(Date.now() + next.days * 86400000) : undefined;
    const weekday = date?.toLocaleDateString(lang, { weekday: "long" });
    const shortDate = date?.toLocaleDateString(lang, { day: "numeric", month: "short" });
    const rel = (n) => (n === 0 ? t.today : n === 1 ? t.tomorrow : t.in_days(n));
    const names = sameDay.map((s) => s.name).join(", ");

    let main = "—", sub = "";
    if (next) {
      const primary = this._config.hero_primary ?? "weekday";
      if (next.days <= 1) { main = rel(next.days); sub = `${names} · ${weekday}`; }
      else if (primary === "days") { main = rel(next.days); sub = `${names} · ${weekday}`; }
      else if (primary === "date") { main = shortDate; sub = `${names} · ${rel(next.days)}`; }
      else { main = weekday; sub = `${names} · ${rel(next.days)}`; }
      main = main.charAt(0).toUpperCase() + main.slice(1);
    }
    const icons = (this._config.hero_icon === "multi" ? sameDay.slice(0, 3) : sameDay.slice(0, 1))
      .map((s) => `<div class="well" style="--c:${esc(s.color)}"><ha-icon icon="${esc(s.icon)}"></ha-icon></div>`)
      .join("") || `<div class="well" style="--c:${DEFAULT_COLOR}"><ha-icon icon="${DEFAULT_ICON}"></ha-icon></div>`;

    let timeline = "";
    if (this._config.show_timeline !== false) {
      const span = Math.max(7, Math.min(28, Number(this._config.timeline_days) || 14));
      const byDay = new Map();
      for (const s of streams) if (s.days <= span) byDay.set(s.days, [...(byDay.get(s.days) ?? []), s]);
      const groups = [...byDay].map(([d, list]) => {
        const w = DOT + (list.length - 1) * STACK;
        const dots = list.map((s, i) =>
          `<div class="dot" style="--c:${esc(s.color)};left:${i * STACK}px;z-index:${list.length - i}" title="${esc(s.name)}"></div>`).join("");
        return `<div class="day" data-entity="${esc(list[0].entity)}" title="${esc(list.map((s) => s.name).join(", "))}"
                  style="width:${w}px;left:calc((100% - ${w}px) * ${(d / span).toFixed(4)})">${dots}</div>`;
      }).join("");
      timeline = `
        <div class="tl">
          <div class="tl-label">${esc(this._config.timeline_title ?? t.span(span))}</div>
          <div class="track"><div class="line"></div>${groups}</div>
          <div class="axis"><span>${t.today_short}</span><span>+${Math.round(span / 2)}</span><span>+${span}</span></div>
        </div>`;
    }

    this.shadowRoot.innerHTML = `
      <style>${CSS}</style>
      <ha-card>
        <div class="card" style="--accent:${esc(accent)}">
          <div class="hero" ${next ? `data-entity="${esc(next.entity)}"` : ""}>
            <div class="icons">${icons}</div>
            <div class="ht">
              <div class="label">${esc(next ? this._config.title ?? t.next : t.none)}</div>
              <div class="main">${esc(main)}</div>
              ${sub ? `<div class="sub">${esc(sub)}</div>` : ""}
            </div>
          </div>
          ${timeline}
        </div>
      </ha-card>`;
  }
}

class M3SlimTrashCardEditor extends HTMLElement {
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
        entities: "Bins (sensors: days until collection, the date, or a Waste Collection Schedule \"upcoming\" sensor)",
        title: "Hero label (default: Next collection)",
        hero_primary: "Leading line",
        hero_icon: "Icons on a shared day",
        show_timeline: "Show timeline",
        timeline_days: "Timeline days (7–28)",
        timeline_title: "Timeline label",
      })[s.name] ?? s.name;
      this._form.addEventListener("value-changed", (ev) => {
        const v = ev.detail.value;
        // keep per-bin name/icon/colour set in YAML for bins still selected
        const old = new Map((this._config.entities ?? []).map((e) => (typeof e === "string" ? [e, e] : [e.entity, e])));
        const config = { ...this._config, ...v, entities: (v.entities ?? []).map((id) => old.get(id) ?? id) };
        for (const k of Object.keys(config)) if (config[k] === "" || config[k] === undefined) delete config[k];
        this._config = config;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = [
      { name: "entities", selector: { entity: { multiple: true, domain: "sensor" } } },
      { name: "hero_primary", selector: { select: { mode: "dropdown", options: [
        { value: "weekday", label: "Weekday (Thursday)" },
        { value: "days", label: "Days (in 6 days)" },
        { value: "date", label: "Date (4 Dec)" },
      ] } } },
      { name: "hero_icon", selector: { select: { mode: "dropdown", options: [
        { value: "first", label: "First bin's icon" },
        { value: "multi", label: "All bins, overlapping" },
      ] } } },
      { name: "title", selector: { text: {} } },
      { name: "show_timeline", selector: { boolean: {} } },
      { name: "timeline_days", selector: { number: { min: 7, max: 28, step: 1, mode: "box" } } },
      { name: "timeline_title", selector: { text: {} } },
    ];
    this._form.data = {
      hero_primary: "weekday", hero_icon: "first", show_timeline: true, timeline_days: 14,
      ...this._config,
      entities: (this._config.entities ?? []).map((e) => (typeof e === "string" ? e : e.entity)),
    };
  }
}

customElements.define("m3-slim-trash-card", M3SlimTrashCard);
customElements.define("m3-slim-trash-card-editor", M3SlimTrashCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "m3-slim-trash-card",
  name: "M3 Slim Trash Card",
  description: "Material 3 bin collection: the next pickup and a timeline of the coming days",
  preview: true,
});
