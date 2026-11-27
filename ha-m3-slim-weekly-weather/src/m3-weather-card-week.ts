import { LitElement, html, css, unsafeCSS, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HomeAssistant,
  M3WeatherCardWeekConfig,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceGridOptions,
  HaActionConfig,
} from "./types";
import {
  CARD_VERSION,
  DEFAULT_WEATHER_ACCENT,
  DEFAULT_WEATHER_PRECIPITATION_COLOR,
  DEFAULT_WEATHER_RADIUS,
  DEFAULT_WEATHER_WEEK_DAYS,
  NEW_CARD_ACCENT,
  WEATHER_REFRESH_MS,
  WEATHER_WEEK_NARROW_WIDTH,
  WEATHER_WEEK_ROW_GAP,
  WEATHER_WEEK_ROW_HEIGHT,
  WEATHER_WEEK_ROW_RADIUS,
  WEATHER_WEEK_WET_DAY_PERCENT,
  resolveCornerRadius,
} from "./const";
import {
  resolveThemeColor,
  buildCssVars,
  resolveCommonColors,
  tintOn,
  tintInk,
  foregroundOn,
  foregroundVars,
} from "./shared/color-config";
import { glassCardStyles, glassCardClass, renderMissingEntity } from "./shared/glass-card";
import { renderCardHeader, cardHeaderStyles } from "./shared/card-header";
import { shouldAnimate, STANDARD_EASING } from "./shared/animation";
import { outdoorTemperatureGradient } from "./shared/temperature-color";
import { localize, type TranslationKey } from "./localize";
import { hassChangeMatters } from "./shared/should-update";
import { formatNumber } from "./shared/formatting";
import { TemplatedCard } from "./shared/templated-card";
import { openEntityDetail } from "./shared/entity-detail";
import { runHaAction, navigateTo, isActionable } from "./shared/actions";
import { isMissingState } from "./shared/entity-actions";
import { isDaytime, isSameDay, weatherIcon, type WeatherForecastItem } from "./shared/weather";

console.info(
  `%c M3-WEATHER-CARD-WEEK %c v${CARD_VERSION} `,
  "color: #222; background: #6ba7dc; font-weight: 700; border-radius: 4px 0 0 4px;",
  "color: #6ba7dc; background: #222; font-weight: 700; border-radius: 0 4px 4px 0;",
);

const EASING = unsafeCSS(STANDARD_EASING);

// Everything the row needs from the week as a whole: the scale its bar is
// drawn on, the units, and the "now" marker's temperature.
interface WeekScale {
  min: number;
  max: number;
  range: number;
  tempUnit: string;
  nowTemp?: number;
}

@customElement("m3-weather-card-week")
export class M3WeatherCardWeek extends TemplatedCard(LitElement) implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3WeatherCardWeekConfig;
  @state() private _daily?: WeatherForecastItem[];

  private _refreshTimer?: number;
  private _lastFetchKey?: string;

  public static getStubConfig(hass: HomeAssistant): M3WeatherCardWeekConfig {
    const entities = Object.keys(hass?.states ?? {}).filter((eid) => eid.startsWith("weather."));
    return {
      type: "custom:m3-weather-card-week",
      entity: entities[0] ?? "",
      glass_background: true,
      accent_color: NEW_CARD_ACCENT,
    };
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    return hassChangeMatters(changed, this.hass, [
      this._config?.entity,
      ...Object.values(this._config?.sensors ?? {}),
    ]);
  }

  public setConfig(config: M3WeatherCardWeekConfig): void {
    if (!config.entity) {
      throw new Error("Bitte eine weather-Entität auswählen / Please select a weather entity");
    }
    this._config = {
      glass_background: true,
      animation: "auto",
      days: DEFAULT_WEATHER_WEEK_DAYS,
      decimals: 0,
      show_date: true,
      show_precipitation: true,
      show_wind: false,
      show_summary: false,
      highlight_today: true,
      ...config,
    };
  }

  public getCardSize(): number {
    if (this._config?.layout === "row") return 5;
    return Math.max(4, 2 + (this._config?.days ?? DEFAULT_WEATHER_WEEK_DAYS));
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: "full", rows: "auto", min_rows: 4 };
  }

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./m3-weather-card-week-editor");
    return document.createElement("m3-weather-card-week-editor") as unknown as LovelaceCardEditor;
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._refreshTimer = window.setInterval(() => {
      this._lastFetchKey = undefined;
      this._maybeFetch();
    }, WEATHER_REFRESH_MS);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._refreshTimer !== undefined) {
      window.clearInterval(this._refreshTimer);
      this._refreshTimer = undefined;
    }
  }

  protected updated(): void {
    this._maybeFetch();
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _maybeFetch(): void {
    if (!this.hass || !this._config?.entity) return;
    const key = this._config.entity;
    if (key === this._lastFetchKey) return;
    this._lastFetchKey = key;
    this._fetchForecast();
  }

  private async _fetchForecast(): Promise<void> {
    if (!this.hass || !this._config) return;
    const entityId = this._config.entity;
    try {
      const res = await this.hass.callWS<{ response: Record<string, { forecast: WeatherForecastItem[] }> }>({
        type: "call_service",
        domain: "weather",
        service: "get_forecasts",
        service_data: { type: "daily" },
        target: { entity_id: entityId },
        return_response: true,
      });
      this._daily = res.response?.[entityId]?.forecast ?? [];
    } catch (e) {
      console.warn("m3-weather-card-week: daily forecast fetch failed", e);
      if (this._daily === undefined) this._daily = [];
    }
  }

  private get _tapAction(): HaActionConfig {
    return this._config?.tap_action ?? { action: "more-info" };
  }

  /** Runs `tap_action`; unset, more-info on the weather entity as usual. */
  private _onHeaderTap(): void {
    if (!this.hass) return;
    runHaAction(this.hass, this._tapAction, {
      entityId: this._config?.entity,
      fireMoreInfo: (id) => openEntityDetail(this, id ?? this._config?.entity),
      navigate: (path) => navigateTo(this, path),
      source: this,
    });
  }

  /** `decimals`, held to 0–2: whole degrees unless asked otherwise. */
  private get _decimals(): number {
    const d = Number(this._config?.decimals ?? 0);
    return Number.isFinite(d) ? Math.max(0, Math.min(2, Math.round(d))) : 0;
  }

  private _formatNumber(value: number, decimals = this._decimals): string {
    return formatNumber(this._language, value, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  private _formatWeekday(date: Date): string {
    return new Intl.DateTimeFormat(this._language, { weekday: "short" }).format(date);
  }

  private _formatDayMonth(date: Date): string {
    return new Intl.DateTimeFormat(this._language, { day: "numeric", month: "short" }).format(date);
  }

  private _dayCount(): number {
    const days = Number(this._config?.days ?? DEFAULT_WEATHER_WEEK_DAYS);
    return Number.isFinite(days) ? Math.max(1, Math.min(14, Math.round(days))) : DEFAULT_WEATHER_WEEK_DAYS;
  }

  protected render() {
    if (!this._config || !this.hass) return nothing;

    const entity = this.hass.states[this._config.entity];
    if (!entity) return renderMissingEntity(this._config.entity);

    const attrs = entity.attributes;
    const name = this._config.name || (attrs.friendly_name as string) || this._config.entity;
    const tempUnit = (attrs.temperature_unit as string) || this.hass.config?.unit_system?.temperature || "°C";
    const precipUnit = (attrs.precipitation_unit as string) || "mm";
    const windUnit = (attrs.wind_speed_unit as string) || "";

    const accentColor = this._config.accent_color
      ? resolveThemeColor(this._config.accent_color)
      : DEFAULT_WEATHER_ACCENT;
    const precipColor = this._config.precipitation_color
      ? resolveThemeColor(this._config.precipitation_color)
      : DEFAULT_WEATHER_PRECIPITATION_COLOR;
    const { textColorCss, secondaryTextColorCss, cardBackgroundCss } = resolveCommonColors(this._config);

    const radius = resolveCornerRadius(this._config.radius ?? DEFAULT_WEATHER_RADIUS, this._config.corners);
    const animClass = shouldAnimate(this._config.animation) ? "animate" : "no-animations";

    // The glyph sits on this well, not on the card, so its contrast has to be
    // measured against the well — and today's row carries the accent as ink on
    // its own tint, which is the same problem one level down.
    const iconWellCss = tintOn(this, accentColor, this._config.accent_opacity, 18);
    const cssVars = buildCssVars({
      "m3p-icon-color": foregroundOn(accentColor, iconWellCss),
      "m3p-icon-bg": iconWellCss,
      "m3p-text": textColorCss,
      "m3p-secondary-text": secondaryTextColorCss,
      "wk-accent": accentColor,
      "wk-precip": precipColor,
      "wk-today-bg": tintOn(this, accentColor, this._config.accent_opacity, 14),
      "wk-today-ink": tintInk(this, accentColor, this._config.accent_opacity, 14),
      ...foregroundVars(this, {
        "m3p-icon-color": accentColor,
        "wk-accent": accentColor,
        "wk-precip": precipColor,
      }),
    });

    const items = (this._daily ?? []).slice(0, this._dayCount());
    const scale = this._weekScale(items, tempUnit, attrs);
    // Rows still draw when the integration reports no temperature at all —
    // the bars then sit on a degenerate scale and the values read "–".
    const rowScale = scale ?? { min: 0, max: 1, range: 1, tempUnit };
    const showPrecip =
      (this._config.show_precipitation ?? true) &&
      items.some((it) => this._hasNumber(it.precipitation_probability));
    const showWind = (this._config.show_wind ?? false) && items.some((it) => this._hasNumber(it.wind_speed));
    const showDate = this._config.show_date ?? true;
    const highlightToday = this._config.highlight_today ?? true;
    const rowLayout = this._config.layout === "row";

    const headerIcon =
      entity.state && entity.state !== "unavailable" && entity.state !== "unknown"
        ? weatherIcon(entity.state, isDaytime({ datetime: new Date().toISOString() }))
        : weatherIcon(items[0]?.condition, true);

    const headerHigh = this._sensorNumber("high") ?? scale?.max;
    const headerLow = this._sensorNumber("low") ?? scale?.min;
    // With an own temperature or humidity sensor the header leads with the
    // current reading; the week's high/low move to a smaller second line.
    const sensors = this._config.sensors ?? {};
    const showNow = !!(sensors.temperature || sensors.humidity);
    const nowTemp = showNow ? scale?.nowTemp : undefined;
    const rawHumidity = attrs.humidity;
    const nowHumidity = showNow
      ? (this._sensorNumber("humidity") ??
        (typeof rawHumidity === "number" && Number.isFinite(rawHumidity) ? rawHumidity : undefined))
      : undefined;
    const rangeHtml =
      headerHigh !== undefined || headerLow !== undefined
        ? html`
            <div
              class="header-range"
              aria-label=${`${headerHigh !== undefined ? `${this._formatNumber(headerHigh)}°` : ""}${
                headerHigh !== undefined && headerLow !== undefined ? " / " : ""
              }${headerLow !== undefined ? `${this._formatNumber(headerLow)}°` : ""}`}
            >
              ${headerHigh !== undefined
                ? html`<span class="range-high">${this._formatNumber(headerHigh)}°</span>`
                : nothing}
              ${headerHigh !== undefined && headerLow !== undefined ? html`<span class="range-sep">/</span>` : nothing}
              ${headerLow !== undefined
                ? html`<span class="range-low">${this._formatNumber(headerLow)}°</span>`
                : nothing}
            </div>
          `
        : undefined;
    const headerRight =
      showNow && (nowTemp !== undefined || nowHumidity !== undefined)
        ? html`
            <div class="header-now-block">
              <div class="header-now">
                ${nowTemp !== undefined
                  ? html`<span class="now-temp">${this._formatNumber(nowTemp)}°</span>`
                  : nothing}
                ${nowHumidity !== undefined
                  ? html`<span class="now-humidity"
                      ><ha-icon icon="mdi:water-percent"></ha-icon>${Math.round(nowHumidity)} %</span
                    >`
                  : nothing}
              </div>
              ${rangeHtml ?? nothing}
            </div>
          `
        : rangeHtml;

    return html`
      <ha-card style=${`${cssVars} border-radius: ${radius};`}>
        <div
          class="card-inner ${glassCardClass(this._config.glass_background)} ${animClass}"
          style=${`border-radius: ${radius};${cardBackgroundCss ? ` background: ${cardBackgroundCss};` : ""}`}
        >
          ${renderCardHeader({
            icon: headerIcon,
            name,
            subtitle: this._subtitle(items),
            onClick: isActionable(this._tapAction) ? () => this._onHeaderTap() : undefined,
            right: headerRight,
          })}

          ${this._daily === undefined
            ? nothing
            : items.length === 0
              ? html`<div class="hint-text">${this._t("weather_week_no_forecast")}</div>`
              : html`
                  ${rowLayout
                    ? this._renderStrip(items, { showPrecip, highlightToday })
                    : html`
                        <div class="week-list">
                          ${items.map((it, i) =>
                            this._renderDayRow(it, i, rowScale, {
                              showDate,
                              showPrecip,
                              showWind,
                              highlightToday,
                              windUnit,
                            }),
                          )}
                        </div>
                      `}
                  ${(this._config.show_summary ?? false) ? this._renderSummary(items, precipUnit) : nothing}
                `}
        </div>
      </ha-card>
    `;
  }

  private _hasNumber(value: number | undefined): value is number {
    return typeof value === "number" && Number.isFinite(value);
  }

  /**
   * A configured sensor's reading, or undefined when none is set, the entity
   * is missing, or it has no reading right now — the forecast's value is used
   * then, so an unavailable sensor never blanks a figure.
   */
  private _sensorNumber(key: "temperature" | "humidity" | "high" | "low"): number | undefined {
    const id = this._config?.sensors?.[key];
    if (!id) return undefined;
    const st = this.hass?.states[id];
    if (!st || isMissingState(st.state)) return undefined;
    const num = Number(st.state);
    return Number.isFinite(num) ? num : undefined;
  }

  /** The week's shared scale, or undefined while there is no temperature. */
  private _weekScale(
    items: WeatherForecastItem[],
    tempUnit: string,
    attrs: Record<string, unknown>,
  ): WeekScale | undefined {
    const highs = items.map((it) => it.temperature).filter((v): v is number => this._hasNumber(v));
    const lows = items
      .map((it) => it.templow ?? it.temperature)
      .filter((v): v is number => this._hasNumber(v));
    if (highs.length === 0 && lows.length === 0) return undefined;
    const max = highs.length ? Math.max(...highs) : Math.max(...lows);
    const min = lows.length ? Math.min(...lows) : Math.min(...highs);
    const rawNow = attrs.temperature;
    const nowTemp =
      this._sensorNumber("temperature") ??
      (typeof rawNow === "number" && Number.isFinite(rawNow) ? rawNow : undefined);
    return { min, max, range: Math.max(1, max - min), tempUnit, nowTemp };
  }

  /** "27 Nov – 3 Dec", or the one day the forecast covers. */
  private _subtitle(items: WeatherForecastItem[]): string {
    if (items.length === 0) return this._t("weather_week_title");
    const first = new Date(items[0].datetime);
    const last = new Date(items[items.length - 1].datetime);
    if (items.length === 1) return this._formatDayMonth(first);
    return `${this._formatDayMonth(first)} – ${this._formatDayMonth(last)}`;
  }

  private _renderDayRow(
    it: WeatherForecastItem,
    index: number,
    scale: WeekScale,
    opts: {
      showDate: boolean;
      showPrecip: boolean;
      showWind: boolean;
      highlightToday: boolean;
      windUnit: string;
    },
  ) {
    const high = it.temperature;
    const low = it.templow ?? it.temperature;
    const hasRange = this._hasNumber(low) && this._hasNumber(high);
    const date = new Date(it.datetime);
    const today = isSameDay(it.datetime);
    const startPct = hasRange ? ((low - scale.min) / scale.range) * 100 : 0;
    const endPct = hasRange ? ((high - scale.min) / scale.range) * 100 : 0;
    const fill = hasRange ? outdoorTemperatureGradient(low, high, scale.tempUnit) : "transparent";
    // A dot for "now" inside today's range — the one reading the day row
    // cannot otherwise show.
    const nowPct =
      hasRange && today && opts.highlightToday && scale.nowTemp !== undefined
        ? ((Math.min(high, Math.max(low, scale.nowTemp)) - scale.min) / scale.range) * 100
        : undefined;
    const pop = it.precipitation_probability;
    const wind = it.wind_speed;
    const windLabel = this._hasNumber(wind) ? `${this._formatNumber(wind)} ${opts.windUnit}`.trim() : "";

    return html`
      <div
        class="week-row ${today && opts.highlightToday ? "today" : ""}"
        style=${`animation-delay: ${index * 45}ms;`}
      >
        <div class="week-day">
          <span class="week-day-name">${today ? this._t("weather_today") : this._formatWeekday(date)}</span>
          ${opts.showDate ? html`<span class="week-date">${this._formatDayMonth(date)}</span>` : nothing}
        </div>
        <ha-icon class="week-icon" icon=${weatherIcon(it.condition, true)}></ha-icon>
        ${opts.showPrecip
          ? html`
              <span class="week-pop">
                ${this._hasNumber(pop) && pop > 0
                  ? html`<ha-icon icon="mdi:water-outline"></ha-icon>${Math.round(pop)} %`
                  : nothing}
              </span>
            `
          : nothing}
        <div class="week-range">
          <span class="week-low">${this._hasNumber(low) ? `${this._formatNumber(low)}°` : "–"}</span>
          <div class="week-track">
            ${hasRange
              ? html`<div
                  class="week-fill"
                  style=${`left: ${startPct}%; width: ${Math.max(6, endPct - startPct)}%; background: ${fill};`}
                ></div>`
              : nothing}
            ${nowPct !== undefined
              ? html`<div class="week-now" style=${`left: ${nowPct}%;`}></div>`
              : nothing}
          </div>
          <span class="week-high">${this._hasNumber(high) ? `${this._formatNumber(high)}°` : "–"}</span>
        </div>
        ${opts.showWind
          ? html`
              <span class="week-wind" title=${windLabel}>
                ${this._hasNumber(wind)
                  ? html`<ha-icon icon="mdi:weather-windy"></ha-icon>${this._formatNumber(wind)}`
                  : nothing}
              </span>
            `
          : nothing}
      </div>
    `;
  }

  /**
   * The week as one row: a column per day — the way a phone's weather app
   * shows a week at a glance. The columns divide the strip evenly while they
   * fit; beyond that the strip scrolls sideways instead of squeezing seven
   * days into unreadable slivers.
   */
  private _renderStrip(
    items: WeatherForecastItem[],
    opts: { showPrecip: boolean; highlightToday: boolean },
  ) {
    return html`
      <div class="week-strip">
        ${items.map((it, i) => {
          const date = new Date(it.datetime);
          const today = isSameDay(it.datetime);
          const high = it.temperature;
          const low = it.templow ?? it.temperature;
          const pop = it.precipitation_probability;
          return html`
            <div
              class="strip-day ${today && opts.highlightToday ? "today" : ""}"
              style=${`animation-delay: ${i * 45}ms;`}
            >
              <span class="strip-name">${today ? this._t("weather_today") : this._formatWeekday(date)}</span>
              <ha-icon class="strip-icon" icon=${weatherIcon(it.condition, true)}></ha-icon>
              ${opts.showPrecip
                ? html`
                    <span class="strip-pop">
                      ${this._hasNumber(pop) && pop > 0
                        ? html`<ha-icon icon="mdi:water-outline"></ha-icon>${Math.round(pop)} %`
                        : nothing}
                    </span>
                  `
                : nothing}
              <span class="strip-high">${this._hasNumber(high) ? `${this._formatNumber(high)}°` : "–"}</span>
              <span class="strip-low">${this._hasNumber(low) ? `${this._formatNumber(low)}°` : "–"}</span>
            </div>
          `;
        })}
      </div>
    `;
  }

  private _renderSummary(items: WeatherForecastItem[], precipUnit: string) {    const highs = items.map((it) => it.temperature).filter((v): v is number => this._hasNumber(v));
    const lows = items
      .map((it) => it.templow ?? it.temperature)
      .filter((v): v is number => this._hasNumber(v));
    const precip = items.map((it) => it.precipitation).filter((v): v is number => this._hasNumber(v));
    const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    const avgHigh = highs.length ? mean(highs) : undefined;
    const avgLow = lows.length ? mean(lows) : undefined;
    const precipTotal = precip.length ? precip.reduce((a, b) => a + b, 0) : undefined;
    const wetDays = items.filter(
      (it) => (it.precipitation_probability ?? 0) >= WEATHER_WEEK_WET_DAY_PERCENT,
    ).length;

    const chip = (icon: string, value: string, label: string) => html`
      <div class="summary-chip" title=${`${label}: ${value}`} aria-label=${`${label}: ${value}`}>
        <ha-icon icon=${icon}></ha-icon>
        <span>${value}</span>
      </div>
    `;

    return html`
      <div class="week-summary">
        ${avgHigh !== undefined
          ? chip("mdi:thermometer-high", `${this._formatNumber(avgHigh)}°`, this._t("weather_week_avg_high"))
          : nothing}
        ${avgLow !== undefined
          ? chip("mdi:thermometer-low", `${this._formatNumber(avgLow)}°`, this._t("weather_week_avg_low"))
          : nothing}
        ${precipTotal !== undefined
          ? chip(
              "mdi:weather-rainy",
              `${this._formatNumber(precipTotal, precipTotal < 10 ? 1 : 0)} ${precipUnit}`,
              this._t("weather_week_precipitation_total"),
            )
          : wetDays > 0
            ? chip(
                "mdi:umbrella",
                String(wetDays),
                this._t("weather_week_wet_days").replace("{n}", String(wetDays)),
              )
            : nothing}
      </div>
    `;
  }

  static styles = [
    glassCardStyles,
    cardHeaderStyles,
    css`
      .card-inner {
        justify-content: center;
        container: weather-week-card / inline-size;
      }

      .header-range {
        flex-shrink: 0;
        display: flex;
        align-items: baseline;
        gap: 4px;
        white-space: nowrap;
      }

      .header-now-block {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
      }

      .header-now-block .range-high {
        font-size: 15px;
      }

      .header-now {
        display: flex;
        align-items: baseline;
        gap: 8px;
        white-space: nowrap;
      }

      .now-temp {
        font-size: 22px;
        font-weight: 700;
        line-height: 1;
        color: var(--m3p-text);
      }

      .now-humidity {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        font-size: 13px;
        font-weight: 600;
        color: var(--wk-precip);
      }

      .now-humidity ha-icon {
        --mdc-icon-size: 14px;
      }

      .range-high {
        font-size: 22px;
        font-weight: 700;
        line-height: 1;
        color: var(--m3p-text);
      }

      .range-sep {
        font-size: 13px;
        color: var(--m3p-secondary-text);
        opacity: 0.45;
      }

      .range-low {
        font-size: 15px;
        font-weight: 500;
        color: var(--m3p-secondary-text);
        opacity: 0.8;
      }

      .hint-text {
        font-size: 12px;
        opacity: 0.6;
        color: var(--m3p-text);
      }

      .week-list {
        display: flex;
        flex-direction: column;
        gap: ${WEATHER_WEEK_ROW_GAP}px;
      }

      /* ---- one row, a column per day ---- */
      .week-strip {
        display: flex;
        align-items: stretch;
        gap: 2px;
        padding: 8px 6px;
        border-radius: ${WEATHER_WEEK_ROW_RADIUS}px;
        background: color-mix(
          in srgb,
          var(--primary-text-color) 5%,
          var(--ha-card-background, var(--card-background-color))
        );
        overflow-x: auto;
        overscroll-behavior-x: contain;
        scrollbar-width: none;
      }

      .week-strip::-webkit-scrollbar {
        display: none;
      }

      .strip-day {
        flex: 1 0 40px;
        min-width: 0;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        padding: 6px 2px;
        border-radius: 14px;
      }

      .strip-day.today {
        background: var(--wk-today-bg);
      }

      .card-inner.animate .strip-day {
        animation: week-row-in 420ms ${EASING} both;
      }

      .card-inner.no-animations .strip-day {
        animation: none;
      }

      .strip-name {
        max-width: 100%;
        font-size: 11px;
        font-weight: 600;
        color: var(--m3p-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .strip-day.today .strip-name {
        font-weight: 700;
        color: var(--wk-today-ink, var(--wk-accent-fg, var(--wk-accent)));
      }

      .strip-icon {
        --mdc-icon-size: 20px;
        color: var(--m3p-icon-color-fg, var(--m3p-icon-color));
        opacity: 0.85;
      }

      .strip-pop {
        display: flex;
        align-items: center;
        gap: 1px;
        min-height: 12px;
        font-size: 10px;
        font-weight: 600;
        color: var(--wk-precip-fg, var(--wk-precip));
        white-space: nowrap;
      }

      .strip-pop ha-icon {
        --mdc-icon-size: 11px;
        opacity: 0.85;
      }

      .strip-high {
        font-size: 15px;
        font-weight: 700;
        line-height: 1.1;
        color: var(--m3p-text);
      }

      .strip-low {
        font-size: 11px;
        line-height: 1;
        color: var(--m3p-secondary-text);
        opacity: 0.7;
      }

      .week-row {
        box-sizing: border-box;
        height: ${WEATHER_WEEK_ROW_HEIGHT}px;
        border-radius: ${WEATHER_WEEK_ROW_RADIUS}px;
        padding: 0 12px;
        display: flex;
        align-items: center;
        gap: 10px;
        background: color-mix(
          in srgb,
          var(--primary-text-color) 5%,
          var(--ha-card-background, var(--card-background-color))
        );
      }

      .week-row.today {
        background: var(--wk-today-bg);
      }

      .card-inner.animate .week-row {
        animation: week-row-in 420ms ${EASING} both;
      }

      .card-inner.no-animations .week-row {
        animation: none;
      }

      @keyframes week-row-in {
        from {
          opacity: 0;
          transform: translateY(6px);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .week-row,
        .strip-day {
          animation: none;
        }
      }

      .week-day {
        flex: 0 0 54px;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;
      }

      .week-day-name {
        font-size: 13px;
        font-weight: 600;
        color: var(--m3p-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .week-row.today .week-day-name {
        font-weight: 700;
        color: var(--wk-today-ink, var(--wk-accent-fg, var(--wk-accent)));
      }

      .week-date {
        font-size: 10px;
        color: var(--m3p-secondary-text);
        opacity: 0.6;
        white-space: nowrap;
      }

      .week-icon {
        flex: 0 0 22px;
        --mdc-icon-size: 20px;
        color: var(--m3p-icon-color-fg, var(--m3p-icon-color));
        opacity: 0.85;
      }

      .week-pop {
        flex: 0 0 54px;
        display: flex;
        align-items: center;
        gap: 2px;
        font-size: 11px;
        font-weight: 600;
        color: var(--wk-precip-fg, var(--wk-precip));
      }

      .week-pop ha-icon {
        --mdc-icon-size: 13px;
        opacity: 0.85;
      }

      .week-range {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .week-low {
        flex: 0 0 26px;
        font-size: 12px;
        color: var(--m3p-text);
        opacity: 0.6;
        text-align: right;
      }

      .week-high {
        flex: 0 0 26px;
        font-size: 12px;
        font-weight: 700;
        color: var(--m3p-text);
      }

      .week-track {
        position: relative;
        flex: 1 1 auto;
        min-width: 0;
        height: 5px;
        border-radius: 3px;
        background: color-mix(
          in srgb,
          var(--primary-text-color) 10%,
          var(--ha-card-background, var(--card-background-color))
        );
      }

      .week-fill {
        position: absolute;
        top: 0;
        bottom: 0;
        border-radius: 3px;
      }

      /* The ring is the row's own background, so the dot reads as sitting on
         the bar rather than as a blob stuck to it. */
      .week-now {
        position: absolute;
        top: 50%;
        width: 8px;
        height: 8px;
        margin: -4px 0 0 -4px;
        border-radius: 50%;
        background: var(--m3p-text);
        box-shadow: 0 0 0 2px var(--wk-today-bg, var(--ha-card-background, var(--card-background-color)));
      }

      .week-wind {
        flex: 0 0 42px;
        display: flex;
        align-items: center;
        gap: 2px;
        font-size: 11px;
        color: var(--m3p-secondary-text);
        opacity: 0.8;
      }

      .week-wind ha-icon {
        --mdc-icon-size: 13px;
      }

      .week-summary {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .summary-chip {
        height: 30px;
        padding: 0 10px;
        border-radius: 15px;
        background: color-mix(
          in srgb,
          var(--primary-text-color) 6%,
          var(--ha-card-background, var(--card-background-color))
        );
        color: var(--m3p-text);
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 11px;
        font-weight: 600;
        white-space: nowrap;
      }

      .summary-chip ha-icon {
        --mdc-icon-size: 14px;
        opacity: 0.75;
      }

      /* A half-width card: the date under the weekday and the wind column are
         the first things that have to go, then the row's own padding. */
      @container weather-week-card (max-width: ${unsafeCSS(WEATHER_WEEK_NARROW_WIDTH)}px) {
        .week-date {
          display: none;
        }
        .week-wind {
          display: none;
        }
        .week-row {
          gap: 8px;
          padding: 0 10px;
        }
        .week-day {
          flex-basis: 40px;
        }
        .week-pop {
          flex-basis: 44px;
        }
      }

      /* The strip has one line fewer to give: the rain chance goes first, and
         on a phone the numbers tighten rather than the columns disappear. */
      @container weather-week-card (max-width: 340px) {
        .strip-day {
          flex-basis: 34px;
          gap: 2px;
          padding: 4px 1px;
        }
        .strip-pop {
          display: none;
        }
      }

      @container weather-week-card (max-width: 270px) {
        .strip-name {
          font-size: 10px;
        }
        .strip-icon {
          --mdc-icon-size: 17px;
        }
        .strip-high {
          font-size: 13px;
        }
      }

      /* Safari gained color-mix() in 16.2, and an iPod touch 7 or an iPad Air 2
         stops at iOS 15. A plain declaration before each mix cannot serve as
         the fallback: every one of them contains var(), which defers the check
         until after substitution, where failure yields unset rather than the
         previous declaration — the tint did not fade, the fill disappeared
         entirely. This block is the one those browsers alone can see. */
      @supports not (color: color-mix(in srgb, red 50%, blue)) {
        .week-row {
          background: var(--ha-card-background, var(--card-background-color));
        }
        .week-strip {
          background: var(--ha-card-background, var(--card-background-color));
        }
        .week-track {
          background: var(--ha-card-background, var(--card-background-color));
        }
        .summary-chip {
          background: var(--ha-card-background, var(--card-background-color));
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-weather-card-week": M3WeatherCardWeek;
  }
}

const windowWithCards = window as unknown as {
  customCards: Array<Record<string, unknown>>;
};
windowWithCards.customCards = windowWithCards.customCards || [];
windowWithCards.customCards.push({
  type: "m3-weather-card-week",
  name: "M3 Slim Weekly Weather",
  description:
    "A weekly forecast, one row per day: condition, rain chance, temperature range and a week summary.",
  preview: true,
  documentationURL: "https://github.com/j0sp0r/m3-cards",
});
