import { define } from "../context.js";

// custom:cellkeeper-title-card
//   title: BMS Status
//   subtitle: Battery Management System Overview
//
// A borderless title and subtitle, styled like the mushroom title card it replaces.
class CellKeeperTitleCard extends HTMLElement {
  setConfig(config) {
    this._config = config;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const root = this.shadowRoot;
    root.innerHTML = `
      <style>
        .header { padding: 24px 12px 8px; }
        .header > * { margin: 0; white-space: pre-wrap; }
        .header > :not(:last-child) { margin-bottom: 8px; }
        .title { color: var(--primary-text-color); font-size: 24px; font-weight: normal; line-height: 32px; }
        .subtitle { color: var(--secondary-text-color); font-size: 16px; font-weight: normal; line-height: 24px; }
      </style>
      <div class="header"></div>`;
    const header = root.querySelector(".header");
    for (const cls of ["title", "subtitle"]) {
      if (!config[cls]) continue;
      const el = document.createElement(cls === "title" ? "h1" : "h2");
      el.className = cls;
      el.textContent = config[cls];
      header.appendChild(el);
    }
  }

  set hass(_hass) {}

  getCardSize() {
    return this._config?.subtitle ? 2 : 1;
  }

  getGridOptions() {
    return { columns: 12, rows: "auto" };
  }
}

define("cellkeeper-title-card", CellKeeperTitleCard);
