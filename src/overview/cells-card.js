import { html, svg, css, nothing } from "lit";
import { PackCard, baseStyles, fmt } from "./base.js";
import { define, MAX_CELLS } from "../context.js";
import { cellSet } from "../cells/history.js";

// custom:cellkeeper-cells-card
//   prefix: ck0
//   history_path: cell-history   view opened by "History"
//
// Every cell's voltage as a bar, zoomed to the spread so a few mV show up, with the lowest and
// highest cells called out, balancing cells marked (yellow = has balancing time, orange =
// discharging now), and the spread rated (≤ 20 mV good, ≤ 60 mV fair).

const BALANCE = "#FDD835";
const BALANCE_ACTIVE = "#FF9800";

class CellKeeperCellsCard extends PackCard {
  static properties = { ...PackCard.properties, _hover: { state: true } };

  setConfig(config) {
    super.setConfig({ history_path: "cell-history", ...config });
  }

  _cellKeys() {
    const n = Math.min(this.num("cell_count") ?? MAX_CELLS, MAX_CELLS);
    const keys = [];
    for (let i = 1; i <= n; i++) keys.push(`cell_voltage_${String(i).padStart(3, "0")}`);
    return keys;
  }

  watched() {
    return [
      "cell_count", "cell_voltage_min", "cell_voltage_max", "cell_voltage_delta", "cells_balancing",
      "cells_balancing_active", "cells_balancing_count", "cells_balancing_active_count",
      "balance_cycle_time_remaining", ...this._cellKeys(),
    ];
  }

  render() {
    if (!this.hass || !this._config) return nothing;
    const cells = this._cellKeys()
      .map((k, i) => ({ n: i + 1, v: this.numIn(k, "V") }))
      .filter((c) => c.v !== undefined && c.v > 0.01);
    if (!cells.length) return nothing;
    const balancing = cellSet(this.str("cells_balancing"));
    const active = cellSet(this.str("cells_balancing_active"));
    const vs = cells.map((c) => c.v);
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    const mean = vs.reduce((a, b) => a + b, 0) / vs.length;
    const minCell = cells.find((c) => c.v === lo);
    const maxCell = cells.find((c) => c.v === hi);
    const spreadMv = (this.numIn("cell_voltage_delta", "V") ?? hi - lo) * 1000;
    const rating = spreadMv <= 20 ? "good" : spreadMv <= 60 ? "warn" : "bad";
    // Zoom to the spread, but never tighter than 20 mV so a balanced pack looks flat.
    const span = Math.max(hi - lo, 0.02) * 1.25;
    const mid = (hi + lo) / 2;
    const y0 = mid - span / 2;
    const W = cells.length * 10;
    const H = 100;
    const y = (v) => H - ((v - y0) / span) * H;
    const hover = this._hover !== undefined ? cells[this._hover] : undefined;
    const remaining = this.str("balance_cycle_time_remaining");
    const nBal = this.num("cells_balancing_count") ?? balancing.size;
    const nActive = this.num("cells_balancing_active_count") ?? active.size;
    const tickEvery = cells.length > 60 ? 12 : cells.length > 24 ? 8 : 4;

    return html`
      <ha-card>
        <div class="wrap">
          <div class="head">
            <div class="label">Cells</div>
            <div class="dim">${cells.length} in series</div>
            <span class="spacer"></span>
            <span class="link clickable" @click=${() => this.navigateView(this._config.history_path)}
              >History <ha-icon icon="mdi:chevron-right"></ha-icon
            ></span>
          </div>
          <div class="stats">
            <div class="clickable" @click=${() => this.moreInfo("cell_voltage_min")}>
              <div class="label"><i class="dot" style="background:var(--ck-discharge)"></i>Lowest · #${minCell.n}</div>
              <div class="mid num">${fmt(this.hass, lo, 3)}<span class="unit">V</span></div>
            </div>
            <div class="clickable" @click=${() => this.moreInfo("cell_voltage_max")}>
              <div class="label"><i class="dot" style="background:var(--ck-charge)"></i>Highest · #${maxCell.n}</div>
              <div class="mid num">${fmt(this.hass, hi, 3)}<span class="unit">V</span></div>
            </div>
            <div class="clickable" @click=${() => this.moreInfo("cell_voltage_delta")}>
              <div class="label">Spread</div>
              <div class="mid num ${rating}">${fmt(this.hass, spreadMv, 0)}<span class="unit">mV</span></div>
            </div>
            <div class="clickable" @click=${() => this.moreInfo("cells_balancing_count")}>
              <div class="label">Balancing</div>
              <div class="mid num">
                ${nBal ? html`${fmt(this.hass, nBal, 0)}<span class="unit">cells</span>` : html`<span class="dim">none</span>`}
              </div>
            </div>
          </div>
          <div
            class="plot"
            @mousemove=${(ev) => {
              const r = ev.currentTarget.getBoundingClientRect();
              this._hover = Math.max(0, Math.min(cells.length - 1, Math.floor(((ev.clientX - r.left) / r.width) * cells.length)));
            }}
            @mouseleave=${() => (this._hover = undefined)}
            @click=${() => hover && this.moreInfo(`cell_voltage_${String(hover.n).padStart(3, "0")}`)}
          >
            <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
              ${svg`
                ${cells.map((c, i) => {
                  const top = y(c.v);
                  const cls = c === minCell ? "bar min" : c === maxCell ? "bar max" : "bar";
                  const mark = active.has(c.n) ? BALANCE_ACTIVE : balancing.has(c.n) ? BALANCE : undefined;
                  return svg`
                    <rect class=${cls} x=${i * 10 + 1.5} y=${top} width="7" height=${H - top} opacity=${this._hover === i ? 1 : 0.85}></rect>
                    ${mark ? svg`<rect x=${i * 10 + 1.5} y=${Math.max(0, top - 5)} width="7" height="4" fill=${mark}></rect>` : ""}`;
                })}
                <line x1="0" x2=${W} y1=${y(mean)} y2=${y(mean)} class="mean"></line>
              `}
            </svg>
            ${hover
              ? html`<div class="tip" style="left:${((this._hover + 0.5) / cells.length) * 100}%;${this._hover > cells.length * 0.6 ? "transform:translateX(-100%)" : ""}">
                  <b>Cell ${hover.n}</b>
                  <div class="num">${fmt(this.hass, hover.v, 3)} V
                    <span class="dim">(${hover.v >= mean ? "+" : ""}${fmt(this.hass, (hover.v - mean) * 1000, 1)} mV)</span></div>
                  ${active.has(hover.n) ? html`<div style="color:${BALANCE_ACTIVE}">Balancing now</div>` : balancing.has(hover.n) ? html`<div style="color:${BALANCE}">Balancing</div>` : ""}
                </div>`
              : ""}
          </div>
          <div class="axis">
            ${cells.map((c, i) =>
              c.n === 1 || c.n % tickEvery === 0
                ? html`<span style="left:${((i + 0.5) / cells.length) * 100}%">${c.n}</span>`
                : ""
            )}
          </div>
          <div class="foot">
            <span><i class="sw" style="background:var(--ck-cell)"></i>Cell voltage</span>
            <span><i class="sw line"></i>Average ${fmt(this.hass, mean, 3)} V</span>
            ${nBal ? html`<span><i class="sw" style="background:${BALANCE}"></i>Balancing</span>` : ""}
            ${nActive ? html`<span><i class="sw" style="background:${BALANCE_ACTIVE}"></i>Discharging now (${fmt(this.hass, nActive, 0)})</span>` : ""}
            ${remaining && nBal ? html`<span class="dim">Cycle ends in ${remaining.replace(/^0d |(?<=\s|^)0h /g, "")}</span>` : ""}
          </div>
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
      :host {
        --ck-cell: #3498db;
      }
      .wrap {
        padding: 16px 20px 14px;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
      }
      .head .dim {
        font-size: 13px;
      }
      .dim {
        color: var(--ck-muted);
      }
      .spacer {
        flex: 1;
      }
      .link {
        display: inline-flex;
        align-items: center;
        font-size: 13px;
        color: var(--primary-color);
        padding: 2px 2px 2px 8px;
      }
      .link ha-icon {
        --mdc-icon-size: 18px;
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
        gap: 4px 12px;
        margin: 0 -6px 12px;
      }
      .stats > div {
        padding: 2px 6px;
      }
      .mid {
        font-size: 22px;
      }
      .good {
        color: var(--ck-good);
      }
      .warn {
        color: var(--ck-warn);
      }
      .bad {
        color: var(--ck-bad);
      }
      .plot {
        position: relative;
        height: 150px;
        cursor: crosshair;
      }
      .plot svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }
      .bar {
        fill: var(--ck-cell);
      }
      /* The highest cell limits charging, the lowest limits discharging. */
      .bar.min {
        fill: var(--ck-discharge);
      }
      .bar.max {
        fill: var(--ck-charge);
      }
      .dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-right: 4px;
      }
      .mean {
        stroke: var(--primary-text-color);
        stroke-opacity: 0.55;
        stroke-dasharray: 6 4;
        vector-effect: non-scaling-stroke;
      }
      .tip {
        position: absolute;
        top: 0;
        margin: 0 8px;
        padding: 6px 10px;
        border-radius: 8px;
        font-size: 12px;
        line-height: 1.5;
        white-space: nowrap;
        pointer-events: none;
        background: var(--card-background-color, #fff);
        border: 1px solid var(--ck-line);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      }
      .axis {
        position: relative;
        height: 16px;
        margin-top: 2px;
        font-size: 10px;
        color: var(--ck-muted);
      }
      .axis span {
        position: absolute;
        transform: translateX(-50%);
      }
      .foot {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 16px;
        margin-top: 6px;
        font-size: 12px;
        color: var(--ck-muted);
      }
      .foot span {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .sw {
        width: 10px;
        height: 10px;
        border-radius: 2px;
      }
      .sw.line {
        height: 0;
        border-top: 2px dashed var(--primary-text-color);
        opacity: 0.6;
      }
    `,
  ];
}

define("cellkeeper-cells-card", CellKeeperCellsCard);
