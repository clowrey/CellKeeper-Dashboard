import { html, css, nothing } from "lit";
import { PackCard, baseStyles } from "../overview/base.js";
import { define } from "../context.js";
import { RANGES, VOLTAGE_STOPS, fetchCellHistory, packCells, percentile } from "./history.js";

// custom:cellkeeper-cells-3d-card
//   prefix: ck0
//   range: 24h       6h, 24h, 7d or 30d to start with
//   height: 700      plot height in px
//
// Every cell's voltage over time as a 3D surface. The data comes from one statistics request
// (see history.js) and is handed to Plotly Graph Card as plain arrays, so the card only draws.

class CellKeeperCells3dCard extends PackCard {
  static properties = { ...PackCard.properties, _range: { state: true }, _status: { state: true } };

  setConfig(config) {
    super.setConfig({ range: "24h", height: 700, ...config });
    this._range = RANGES[this._config.range] ? this._config.range : "24h";
  }

  updated() {
    if (this.hass && this._shown !== this._range) this._show();
  }

  async _show() {
    const range = (this._shown = this._range);
    this._status = "Loading…";
    try {
      const cells = packCells(this.hass, this.prefix);
      const [d, helpers] = await Promise.all([fetchCellHistory(this.hass, cells, range), window.loadCardHelpers()]);
      if (range !== this._range) return;
      if (!d.cols) {
        this._status = "No statistics for these cells in this range yet.";
        return;
      }
      const all = [];
      d.z.forEach((row) => row.forEach((v) => all.push(v)));
      const card = helpers.createCardElement({
        type: "custom:plotly-graph",
        raw_plotly_config: true,
        hours_to_show: range,
        entities: [
          {
            entity: "",
            type: "surface",
            x: Array.from({ length: d.cols }, (_, k) => new Date(d.t0 + k * d.step)),
            y: cells.map((c) => c.n),
            z: d.z.map((row) => Array.from(row, (v) => (Number.isNaN(v) ? null : v))),
            colorscale: VOLTAGE_STOPS.map((c, i) => [i / (VOLTAGE_STOPS.length - 1), c]),
            cmin: percentile(all, 0.01),
            cmax: percentile(all, 0.99),
            colorbar: { title: { text: "V" } },
            hovertemplate: "Cell %{y}<br>%{x|%a %H:%M}<br>%{z:.3f} V<extra></extra>",
          },
        ],
        layout: {
          height: this._config.height,
          margin: { t: 0, l: 0, r: 0, b: 0 },
          scene: {
            // Time runs left to right across a wide, low surface.
            aspectmode: "manual",
            aspectratio: { x: 2.2, y: 1.1, z: 0.6 },
            camera: { eye: { x: 0.6, y: -2.1, z: 1.1 } },
            xaxis: { title: { text: "Time" } },
            yaxis: { title: { text: "Cell" } },
            zaxis: { title: { text: "V" } },
          },
        },
        config: { displayModeBar: false },
      });
      card.hass = this.hass;
      this.renderRoot.querySelector(".plot").replaceChildren(card);
      this._status = undefined;
    } catch (err) {
      if (range === this._range) this._status = `Couldn't load the cell statistics: ${err?.message ?? err}`;
    }
  }

  render() {
    if (!this.hass || !this._config) return nothing;
    return html`
      <ha-card>
        <div class="head">
          <div class="label">Cells 3D</div>
          <div class="dim">${RANGES[this._range].period === "hour" ? "hourly" : "5-minute"} averages · drag to turn</div>
          <span class="spacer"></span>
          <div class="seg">
            ${Object.entries(RANGES).map(
              ([r, { label }]) =>
                html`<button class=${r === this._range ? "on" : ""} @click=${() => (this._range = r)}>${label}</button>`
            )}
          </div>
        </div>
        <div class="body" style="min-height:${this._config.height}px">
          <div class="plot ${this._status ? "stale" : ""}"></div>
          ${this._status ? html`<div class="msg">${this._status}</div>` : ""}
        </div>
      </ha-card>
    `;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  static styles = [
    baseStyles,
    css`
      .head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 10px;
        padding: 16px 20px 8px;
      }
      .head .dim {
        font-size: 13px;
        color: var(--ck-muted);
      }
      .spacer {
        flex: 1;
      }
      .seg {
        display: inline-flex;
        border: 1px solid var(--ck-line);
        border-radius: 8px;
        overflow: hidden;
      }
      .seg button {
        font: inherit;
        font-size: 12px;
        padding: 4px 10px;
        border: 0;
        background: none;
        color: var(--primary-text-color);
        cursor: pointer;
      }
      .seg button + button {
        border-left: 1px solid var(--ck-line);
      }
      .seg button.on {
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
      }
      .body {
        position: relative;
      }
      /* Plotly Graph Card brings its own ha-card; flatten it into this one. */
      .plot {
        --ha-card-box-shadow: none;
        --ha-card-border-width: 0;
        transition: opacity 0.2s;
      }
      .plot.stale {
        opacity: 0.4;
      }
      .msg {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--ck-muted);
        font-size: 14px;
      }
    `,
  ];
}

define("cellkeeper-cells-3d-card", CellKeeperCells3dCard);
