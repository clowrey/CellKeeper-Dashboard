import { LitElement, css } from "lit";
import { toCelsius, toUnit } from "../context.js";

// Base for the Overview cards: pack prefix, entity helpers, and re-rendering only when an entity
// the card shows has changed (hass changes many times a second across the whole house).
export class PackCard extends LitElement {
  static properties = { hass: { attribute: false }, _config: { state: true } };

  setConfig(config) {
    this._config = { prefix: "ck0", ...config };
  }

  get prefix() {
    return this._config.prefix;
  }

  // "soc" -> "sensor.ck0_soc"; "number:max_charge_current" -> "number.ck0_max_charge_current"
  eid(key) {
    const [domain, name] = key.includes(":") ? key.split(":") : ["sensor", key];
    return `${domain}.${this.prefix}_${name}`;
  }

  stateObj(key) {
    return this.hass?.states[this.eid(key)];
  }

  has(key) {
    return !!this.stateObj(key);
  }

  // Numeric state, or undefined when missing/unavailable.
  num(key) {
    const v = parseFloat(this.stateObj(key)?.state);
    return Number.isFinite(v) ? v : undefined;
  }

  str(key) {
    const s = this.stateObj(key)?.state;
    return s === undefined || s === "unknown" || s === "unavailable" ? undefined : s;
  }

  unit(key) {
    return this.stateObj(key)?.attributes.unit_of_measurement ?? "";
  }

  // Temperatures arrive in the user's unit system (HA converts them), so show them in their
  // own unit, and judge them in °C, which is what the limits are written in.
  tempC(key) {
    return toCelsius(this.num(key), this.unit(key));
  }

  // Numeric state converted to `unit` (V, A, W, kWh, s, …) from whatever display unit the
  // sensor has been switched to in HA; undefined if missing or not convertible.
  numIn(key, unit) {
    return toUnit(this.num(key), this.unit(key), unit);
  }

  tempUnit(key) {
    return this.unit(key) || "°C";
  }

  // Entities this card renders; it only re-renders when one of them changes.
  watched() {
    return [];
  }

  shouldUpdate(changed) {
    if (changed.size !== 1 || !changed.has("hass")) return true;
    const old = changed.get("hass");
    if (!old) return true;
    return this.watched().some((key) => {
      const id = key.includes(".") ? key : this.eid(key);
      return old.states[id] !== this.hass.states[id];
    });
  }

  moreInfo(key) {
    const entityId = key.includes(".") ? key : this.eid(key);
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }

  // Go to another view of this dashboard by its path.
  navigateView(path) {
    const base = location.pathname.split("/").slice(0, 2).join("/");
    history.pushState(null, "", `${base}/${path}`);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }

  getCardSize() {
    return 4;
  }
}

// Number formatting in the user's locale.
export function fmt(hass, value, digits = 1) {
  if (value === undefined || value === null || !Number.isFinite(value)) return "–";
  const locale = hass?.locale?.language ?? navigator.language;
  return value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// Watts as W or kW.
export function fmtPower(hass, w) {
  if (w === undefined) return ["–", "W"];
  return Math.abs(w) >= 1000 ? [fmt(hass, w / 1000, 2), "kW"] : [fmt(hass, w, 0), "W"];
}

// "3 h 10 min", "45 min", "2 d 4 h"
export function fmtDuration(hours) {
  if (!Number.isFinite(hours) || hours <= 0) return "";
  const m = Math.round(hours * 60);
  if (m < 60) return `${m} min`;
  if (m < 48 * 60) return `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim();
  return `${Math.floor(m / 1440)} d ${Math.round((m % 1440) / 60)} h`;
}

// Shared look: card padding, small caps labels, big numbers.
export const baseStyles = css`
  :host {
    --ck-charge: var(--energy-battery-in-color, #f06292);
    --ck-discharge: var(--energy-battery-out-color, #4db6ac);
    --ck-good: var(--success-color, #43a047);
    --ck-warn: var(--warning-color, #ffa600);
    --ck-bad: var(--error-color, #db4437);
    --ck-info: var(--info-color, #039be5);
    --ck-muted: var(--secondary-text-color);
    --ck-line: var(--divider-color, rgba(127, 127, 127, 0.25));
    --ck-track: rgba(127, 127, 127, 0.18);
    display: block;
  }
  ha-card {
    height: 100%;
    box-sizing: border-box;
    overflow: hidden;
  }
  .label {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ck-muted);
  }
  .big {
    font-size: 32px;
    font-weight: 400;
    line-height: 1.1;
    letter-spacing: -0.01em;
    font-variant-numeric: tabular-nums;
  }
  .unit {
    font-size: 0.55em;
    color: var(--ck-muted);
    margin-left: 2px;
  }
  .num {
    font-variant-numeric: tabular-nums;
  }
  .clickable {
    cursor: pointer;
    border-radius: 8px;
  }
  .clickable:hover {
    background: rgba(127, 127, 127, 0.08);
  }
`;
