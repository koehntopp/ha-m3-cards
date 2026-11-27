import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCardEditor, M3WeatherCardWeekConfig } from "./types";
import { DEFAULT_WEATHER_RADIUS, DEFAULT_WEATHER_WEEK_DAYS } from "./const";
import { localize, type TranslationKey } from "./localize";
import { fireEvent, colorRow, editorStyles, type SchemaEntry } from "./shared/editor-helpers";
import { radiusLabelMap } from "./shared/radius-editor";
import {
  initAppearanceState,
  radiusPresetPatch,
  cornerPresetPatch,
  renderAppearanceSection,
  type AppearanceState,
} from "./shared/appearance-editor";

@customElement("m3-weather-card-week-editor")
export class M3WeatherCardWeekEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3WeatherCardWeekConfig;
  @state() private _appearance: AppearanceState = { showCustomRadius: false, showCorners: false, cornerCustom: {} };

  public setConfig(config: M3WeatherCardWeekConfig): void {
    this._config = config;
    this._appearance = initAppearanceState(config, DEFAULT_WEATHER_RADIUS);
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _entitySchema(): SchemaEntry[] {
    return [{ name: "entity", required: true, selector: { entity: { domain: "weather" } } }];
  }

  private get _hasWeatherEntity(): boolean {
    if (!this.hass) return true;
    return Object.keys(this.hass.states).some((id) => id.startsWith("weather."));
  }

  private _contentSchema(): SchemaEntry[] {
    return [
      { name: "name", selector: { text: {} } },
      {
        name: "layout",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "list", label: this._t("editor_weather_week_layout_list") },
              { value: "row", label: this._t("editor_weather_week_layout_row") },
            ],
          },
        },
      },
      { name: "days", selector: { number: { min: 1, max: 14, step: 1, mode: "box" } } },
      { name: "decimals", selector: { number: { min: 0, max: 2, step: 1, mode: "box" } } },
      { name: "show_date", selector: { boolean: {} } },
      { name: "show_precipitation", selector: { boolean: {} } },
      { name: "show_wind", selector: { boolean: {} } },
      { name: "show_summary", selector: { boolean: {} } },
      { name: "highlight_today", selector: { boolean: {} } },
      { name: "tap_action", selector: { ui_action: {} } },
    ];
  }

  /** Own sensors for the "now" marker and the two figures in the header. */
  private _sensorSchema(): SchemaEntry[] {
    const sensor = { entity: { domain: "sensor" } };
    return [
      { name: "temperature", selector: sensor },
      { name: "humidity", selector: sensor },
      { name: "high", selector: sensor },
      { name: "low", selector: sensor },
    ];
  }

  private _sensorLabel = (schema: SchemaEntry): string => {
    const map: Record<string, TranslationKey> = {
      temperature: "editor_weather_week_sensor_temperature",
      humidity: "editor_weather_week_sensor_humidity",
      high: "editor_weather_week_sensor_high",
      low: "editor_weather_week_sensor_low",
    };
    const key = map[schema.name];
    return key ? this._t(key) : schema.name;
  };

  private _sensorsChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const value = (ev.detail.value ?? {}) as Record<string, string | undefined>;
    const sensors = Object.fromEntries(Object.entries(value).filter(([, id]) => !!id)) as NonNullable<
      M3WeatherCardWeekConfig["sensors"]
    >;
    const { sensors: _old, ...rest } = this._config;
    this._config = Object.keys(sensors).length ? { ...rest, sensors } : rest;
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _animationSchema(): SchemaEntry[] {    return [
      {
        name: "animation",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "auto", label: this._t("editor_progress_animation_auto") },
              { value: "on", label: this._t("editor_progress_animation_on") },
              { value: "off", label: this._t("editor_progress_animation_off") },
            ],
          },
        },
      },
    ];
  }

  private _computeLabel = (schema: SchemaEntry): string => {
    const labelMap: Record<string, TranslationKey> = {
      entity: "editor_entity",
      name: "editor_name",
      layout: "editor_weather_week_layout",
      days: "editor_weather_days",
      decimals: "editor_weather_decimals",
      show_date: "editor_weather_week_show_date",
      show_precipitation: "editor_weather_week_show_precipitation",
      show_wind: "editor_weather_week_show_wind",
      show_summary: "editor_weather_week_show_summary",
      highlight_today: "editor_weather_week_highlight_today",
      tap_action: "editor_tap_action",
      animation: "editor_progress_animation",
      glass_background: "editor_glass_background",
      ...radiusLabelMap,
    };
    const key = labelMap[schema.name];
    return key ? this._t(key) : schema.name;
  };

  private _entityChanged(ev: CustomEvent): void {
    if (!this._config) return;
    this._config = { ...this._config, ...ev.detail.value };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _valueChanged(ev: CustomEvent): void {
    if (!this._config) return;
    this._config = { ...this._config, ...ev.detail.value };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _colorChanged(
    field: "accent_color" | "precipitation_color" | "text_color" | "secondary_text_color" | "card_background",
    value: string,
  ): void {
    if (!this._config) return;
    if (value) {
      this._config = { ...this._config, [field]: value };
    } else {
      const { [field]: _removed, ...rest } = this._config;
      this._config = rest;
    }
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _opacityChanged(field: "accent_opacity", value: number): void {
    if (!this._config) return;
    this._config = { ...this._config, [field]: value };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _radiusPresetChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const patch = radiusPresetPatch(ev.detail.value.radius_preset as string);
    this._appearance = { ...this._appearance, showCustomRadius: patch.showCustomRadius };
    if (patch.radius !== undefined) {
      this._config = { ...this._config, radius: patch.radius };
      fireEvent(this, "config-changed", { config: this._config });
    }
  }

  private _cornersToggleChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const showCorners = ev.detail.value.use_corners as boolean;
    this._appearance = { ...this._appearance, showCorners };
    if (!showCorners) {
      const { corners: _corners, ...rest } = this._config;
      this._config = rest;
      fireEvent(this, "config-changed", { config: this._config });
    }
  }

  private _cornerPresetChanged(key: string, ev: CustomEvent): void {
    if (!this._config) return;
    const patch = cornerPresetPatch(ev.detail.value[key] as string);
    this._appearance = {
      ...this._appearance,
      cornerCustom: { ...this._appearance.cornerCustom, [key]: patch.custom },
    };
    if (patch.px !== undefined) {
      this._config = { ...this._config, corners: { ...(this._config.corners ?? {}), [key]: patch.px } };
      fireEvent(this, "config-changed", { config: this._config });
    }
  }

  private _cornerValueChanged(key: string, ev: CustomEvent): void {
    if (!this._config) return;
    const px = ev.detail.value[key] as number;
    this._config = { ...this._config, corners: { ...(this._config.corners ?? {}), [key]: px } };
    fireEvent(this, "config-changed", { config: this._config });
  }

  protected render() {
    if (!this.hass || !this._config) return nothing;

    const entityData = { entity: this._config.entity };
    const contentData = {
      name: this._config.name,
      layout: this._config.layout ?? "list",
      days: this._config.days ?? DEFAULT_WEATHER_WEEK_DAYS,
      decimals: this._config.decimals ?? 0,
      show_date: this._config.show_date ?? true,
      show_precipitation: this._config.show_precipitation ?? true,
      show_wind: this._config.show_wind ?? false,
      show_summary: this._config.show_summary ?? false,
      highlight_today: this._config.highlight_today ?? true,
      tap_action: this._config.tap_action,
    };
    const animationData = { animation: this._config.animation ?? "auto" };

    return html`
      <div class="editor">
        <ha-expansion-panel outlined .header=${this._t("editor_entities")} expanded>
          <ha-icon slot="leading-icon" icon="mdi:weather-partly-cloudy"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${entityData}
              .schema=${this._entitySchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._entityChanged}
            ></ha-form>
            ${!this._hasWeatherEntity ? html`<div class="hint">${this._t("editor_weather_no_entity_hint")}</div>` : nothing}
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_content")}>
          <ha-icon slot="leading-icon" icon="mdi:text-short"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${contentData}
              .schema=${this._contentSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_weather_week_days_helper")}</div>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_weather_sensors")}>
          <ha-icon slot="leading-icon" icon="mdi:thermometer-lines"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${this._config.sensors ?? {}}
              .schema=${this._sensorSchema()}
              .computeLabel=${this._sensorLabel}
              @value-changed=${this._sensorsChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_weather_week_sensors_hint")}</div>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_colors")}>
          <ha-icon slot="leading-icon" icon="mdi:palette-outline"></ha-icon>
          <div class="panel-content">
            ${colorRow(
              this._t("editor_weather_accent_color"),
              this._config.accent_color,
              (v) => this._colorChanged("accent_color", v),
              {
                label: this._t("editor_opacity"),
                value: this._config.accent_opacity,
                defaultValue: 18,
                onChange: (v) => this._opacityChanged("accent_opacity", v),
              },
            )}
            ${colorRow(this._t("editor_weather_precipitation_color"), this._config.precipitation_color, (v) => this._colorChanged("precipitation_color", v))}
            ${colorRow(this._t("editor_progress_text_color"), this._config.text_color, (v) => this._colorChanged("text_color", v))}
            ${colorRow(this._t("editor_progress_secondary_text_color"), this._config.secondary_text_color, (v) => this._colorChanged("secondary_text_color", v))}
            ${colorRow(this._t("editor_progress_card_background"), this._config.card_background, (v) => this._colorChanged("card_background", v))}
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_animation")}>
          <ha-icon slot="leading-icon" icon="mdi:wave"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${animationData}
              .schema=${this._animationSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_progress_animation_reduced_motion_hint")}</div>
          </div>
        </ha-expansion-panel>

        ${renderAppearanceSection({
          hass: this.hass,
          language: this._language,
          config: this._config,
          defaultRadius: DEFAULT_WEATHER_RADIUS,
          state: this._appearance,
          computeLabel: this._computeLabel,
          onValueChanged: this._valueChanged.bind(this),
          onRadiusPresetChanged: this._radiusPresetChanged.bind(this),
          onCornersToggleChanged: this._cornersToggleChanged.bind(this),
          onCornerPresetChanged: this._cornerPresetChanged.bind(this),
          onCornerValueChanged: this._cornerValueChanged.bind(this),
        })}
      </div>
    `;
  }

  static styles = [editorStyles];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-weather-card-week-editor": M3WeatherCardWeekEditor;
  }
}
