import { DEFAULT_PREFIX, define, findPrefixes } from "./context.js";

// Strategy options form: pick the pack prefix from the CellKeeper packs found in HA.
class CellKeeperDashboardStrategyEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) =>
        ({ prefix: "Pack prefix (entity ids start with it)", title: "Dashboard title" })[s.name] ?? s.name;
      this._form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        const config = { ...this._config, ...ev.detail.value };
        for (const key of ["title"]) if (!config[key]) delete config[key];
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    const prefixes = findPrefixes(this._hass);
    const current = this._config.prefix || DEFAULT_PREFIX;
    if (!prefixes.includes(current)) prefixes.unshift(current);
    this._form.hass = this._hass;
    this._form.data = { prefix: current, title: this._config.title ?? "" };
    this._form.schema = [
      { name: "prefix", selector: { select: { options: prefixes, custom_value: true, mode: "dropdown" } } },
      { name: "title", selector: { text: {} } },
    ];
  }
}

define("cellkeeper-dashboard-strategy-editor", CellKeeperDashboardStrategyEditor);
