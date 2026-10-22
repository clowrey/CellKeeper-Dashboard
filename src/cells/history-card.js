import { html, css, nothing } from "lit";
import { PackCard, baseStyles, fmt } from "../overview/base.js";
import { define } from "../context.js";
import {
  RANGES, REFRESH_MS, VOLTAGE_STOPS, balanceMarks, colorTable, columnStats, fetchBalancing, fetchCellHistory, packCells,
  percentile,
} from "./history.js";

// custom:cellkeeper-cell-history-card
//   prefix: ck0
//   range: 24h        6h, 24h, 7d or 30d to start with (the last one picked is remembered)
//   mode: voltage     voltage, or deviation: each cell against the pack's average at the time
//   balancing: false  mark balancing cells to start with
//
// Every cell's voltage over time as a heatmap drawn on a canvas from one statistics request,
// balancing cells optionally marked, the spread between the highest and lowest cell underneath, and a
// readout of the cell and time under the pointer. Refreshes every 5 minutes.

const BALANCE = "#FDD835";
const BALANCE_ACTIVE = "#FF9800";
// Below the average teal, above it pink: the colours the cells card uses for lowest and highest.
const DEVIATION_STOPS = (dark) => ["#00695c", "#4db6ac", dark ? "#2b2b2b" : "#eeeeee", "#f06292", "#ad1457"];
const STORE = "cellkeeper-cell-history";

function remembered() {
  try {
    return JSON.parse(localStorage.getItem(STORE)) ?? {};
  } catch {
    return {};
  }
}

function remember(values) {
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...remembered(), ...values }));
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
}

// Time axis ticks on whole hours or local midnights.
function timeTicks(t0, t1, hours) {
  const stepH = hours <= 6 ? 1 : hours <= 24 ? 3 : hours <= 168 ? 24 : 24 * 5;
  const d = new Date(t0);
  if (stepH < 24) d.setMinutes(0, 0, 0);
  else d.setHours(0, 0, 0, 0);
  const ticks = [];
  for (; d.getTime() <= t1; stepH < 24 ? d.setHours(d.getHours() + 1) : d.setDate(d.getDate() + 1)) {
    const t = d.getTime();
    if (t < t0) continue;
    if (stepH < 24 ? d.getHours() % stepH === 0 : Math.round((t - t0) / 86400000) % (stepH / 24) === 0) ticks.push(t);
  }
  return ticks;
}

class CellKeeperCellHistoryCard extends PackCard {
  static properties = {
    ...PackCard.properties,
    _range: { state: true },
    _mode: { state: true },
    _marks: { state: true },
    _data: { state: true },
    _error: { state: true },
    _loading: { state: true },
    _hover: { state: true },
    _width: { state: true },
  };

  setConfig(config) {
    super.setConfig({ range: "24h", mode: "voltage", balancing: false, ...config });
    const saved = remembered();
    this._range = RANGES[saved.range] ? saved.range : RANGES[this._config.range] ? this._config.range : "24h";
    this._mode = ["voltage", "deviation"].includes(saved.mode) ? saved.mode : this._config.mode;
    this._marks = typeof saved.balancing === "boolean" ? saved.balancing : !!this._config.balancing;
  }

  connectedCallback() {
    super.connectedCallback();
    this._timer = setInterval(() => this._load(), REFRESH_MS);
    this._resize = new ResizeObserver(([entry]) => (this._width = Math.round(entry.contentRect.width)));
    this._observed = undefined;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this._timer);
    this._resize?.disconnect();
  }

  // Balancing sensors this pack has: { entity id: mark level }.
  _balancing() {
    const levels = {};
    if (this.has("cells_balancing")) levels[this.eid("cells_balancing")] = 1;
    if (this.has("cells_balancing_active")) levels[this.eid("cells_balancing_active")] = 2;
    return levels;
  }

  async _load() {
    if (!this.hass) return;
    const range = this._range;
    const marks = this._marks;
    const cells = packCells(this.hass, this.prefix);
    const levels = this._balancing();
    this._loadedRange = range;
    this._loading = true;
    try {
      const [data, states] = await Promise.all([
        fetchCellHistory(this.hass, cells, range),
        marks && Object.keys(levels).length ? fetchBalancing(this.hass, Object.keys(levels), range) : undefined,
      ]);
      if (range !== this._range) return;
      this._data = {
        ...data,
        cells,
        range,
        ...columnStats(data.z, data.cols),
        marks: states ? balanceMarks(data, cells, states, levels) : undefined,
      };
      this._error = undefined;
    } catch (err) {
      if (range === this._range) this._error = err?.message ?? String(err);
    } finally {
      if (range === this._range) this._loading = false;
    }
  }

  updated(changed) {
    const area = this.renderRoot.querySelector(".area");
    if (area && area !== this._observed) {
      this._resize.observe(area);
      this._observed = area;
    }
    if (this.hass && (this._loadedRange !== this._range || (this._marks && this._data && !this._data.marks && !this._loading))) {
      this._load();
    }
    if (changed.has("_data") || changed.has("_mode") || changed.has("_marks") || changed.has("_width")) this._draw();
  }

  // Colour scale for the current mode: { lut, lo, hi, value(row, col) }.
  _scale() {
    const d = this._data;
    if (this._mode === "deviation") {
      const devs = [];
      d.z.forEach((row) => row.forEach((v, k) => devs.push(Math.abs(v - d.avg[k]))));
      const span = Math.max(percentile(devs, 0.99) || 0, 0.005);
      return {
        lut: colorTable(DEVIATION_STOPS(this.hass.themes?.darkMode)),
        stops: DEVIATION_STOPS(this.hass.themes?.darkMode),
        lo: -span,
        hi: span,
        value: (r, k) => d.z[r][k] - d.avg[k],
      };
    }
    const all = [];
    d.z.forEach((row) => row.forEach((v) => all.push(v)));
    const lo = percentile(all, 0.01);
    const hi = percentile(all, 0.99);
    return { lut: colorTable(VOLTAGE_STOPS), stops: VOLTAGE_STOPS, lo, hi: hi > lo ? hi : lo + 0.01, value: (r, k) => d.z[r][k] };
  }

  _draw() {
    const d = this._data;
    const canvas = this.renderRoot.querySelector("canvas.map");
    const strip = this.renderRoot.querySelector("canvas.spread");
    if (!d || !d.cols || !canvas || !this._width) return;
    const rows = d.cells.length;
    const dpr = window.devicePixelRatio || 1;
    const w = this._width;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    // One pixel per cell and interval, scaled up without smoothing.
    const scale = (this._scaleNow = this._scale());
    const img = new ImageData(d.cols, rows);
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < d.cols; k++) {
        const v = scale.value(r, k);
        if (Number.isNaN(v)) continue;
        const i = Math.round(Math.min(1, Math.max(0, (v - scale.lo) / (scale.hi - scale.lo))) * 255) * 3;
        const p = (r * d.cols + k) * 4;
        img.data[p] = scale.lut[i];
        img.data[p + 1] = scale.lut[i + 1];
        img.data[p + 2] = scale.lut[i + 2];
        img.data[p + 3] = 255;
      }
    }
    const tiles = new OffscreenCanvas(d.cols, rows);
    tiles.getContext("2d").putImageData(img, 0, 0);
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, w, h);
    g.drawImage(tiles, 0, 0, w, h);

    // Balancing: a small mark in the middle of each tile, discharging in orange.
    const cw = w / d.cols;
    const ch = h / rows;
    const mw = Math.max(1, Math.min(cw * 0.5, 4));
    const mh = Math.max(1, Math.min(ch * 0.35, 4));
    for (let r = 0; r < (this._marks && d.marks ? rows : 0); r++) {
      for (let k = 0; k < d.cols; k++) {
        const m = d.marks[r * d.cols + k];
        if (!m) continue;
        g.fillStyle = m === 2 ? BALANCE_ACTIVE : BALANCE;
        g.fillRect((k + 0.5) * cw - mw / 2, (r + 0.5) * ch - mh / 2, mw, mh);
      }
    }

    // Spread between the highest and lowest cell.
    if (strip) {
      const sh = strip.clientHeight;
      strip.width = Math.round(w * dpr);
      strip.height = Math.round(sh * dpr);
      const s = strip.getContext("2d");
      s.setTransform(dpr, 0, 0, dpr, 0, 0);
      s.clearRect(0, 0, w, sh);
      const spread = Array.from(d.hi, (v, k) => v - d.lo[k]);
      const peak = Math.max(0.005, ...spread.filter((v) => !Number.isNaN(v)));
      this._peak = peak;
      const color = getComputedStyle(this).getPropertyValue("--primary-color").trim() || "#03a9f4";
      s.fillStyle = color;
      s.globalAlpha = 0.35;
      spread.forEach((v, k) => {
        if (Number.isNaN(v)) return;
        const y = sh - (v / peak) * (sh - 2);
        s.fillRect(k * cw, y, Math.ceil(cw), sh - y);
      });
      s.globalAlpha = 1;
      s.strokeStyle = color;
      s.lineWidth = 1.5;
      s.beginPath();
      let pen = false;
      spread.forEach((v, k) => {
        if (Number.isNaN(v)) return (pen = false);
        const x = (k + 0.5) * cw;
        const y = sh - (v / peak) * (sh - 2);
        pen ? s.lineTo(x, y) : s.moveTo(x, y);
        pen = true;
      });
      s.stroke();
    }
    this.requestUpdate();
  }

  _pick(ev, withRow) {
    const d = this._data;
    if (!d?.cols) return;
    const r = ev.currentTarget.getBoundingClientRect();
    const k = Math.floor(((ev.clientX - r.left) / r.width) * d.cols);
    const row = withRow ? Math.floor(((ev.clientY - r.top) / r.height) * d.cells.length) : undefined;
    if (k < 0 || k >= d.cols) return (this._hover = undefined);
    this._hover = { k, row: row !== undefined && row >= 0 && row < d.cells.length ? row : undefined };
  }

  _setRange(range) {
    this._range = range;
    this._hover = undefined;
    remember({ range });
  }

  _toggleMarks() {
    this._marks = !this._marks;
    remember({ balancing: this._marks });
  }

  _setMode(mode) {
    this._mode = mode;
    remember({ mode });
  }

  _when(t) {
    const locale = this.hass?.locale?.language ?? navigator.language;
    const hours = RANGES[this._data.range].hours;
    return new Date(t).toLocaleString(locale, {
      ...(hours > 24 ? { weekday: "short", day: "numeric", month: "short" } : {}),
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  _tip() {
    const d = this._data;
    const hv = this._hover;
    if (!d || !hv) return "";
    const t = d.t0 + hv.k * d.step;
    const spreadMv = (d.hi[hv.k] - d.lo[hv.k]) * 1000;
    const cell = hv.row !== undefined ? d.cells[hv.row] : undefined;
    const v = cell ? d.z[hv.row][hv.k] : NaN;
    const mark = cell && this._marks && d.marks ? d.marks[hv.row * d.cols + hv.k] : 0;
    const right = hv.k > d.cols * 0.6;
    return html`<div class="tip" style="left:${((hv.k + 0.5) / d.cols) * 100}%;${right ? "transform:translateX(-100%)" : ""}">
      <div class="dim">${this._when(t)} – ${this._when(t + d.step)}</div>
      ${cell
        ? html`<b>Cell ${cell.n}</b>
            <div class="num">
              ${Number.isNaN(v)
                ? "no data"
                : html`${fmt(this.hass, v, 3)} V
                    <span class="dim">(${v >= d.avg[hv.k] ? "+" : ""}${fmt(this.hass, (v - d.avg[hv.k]) * 1000, 1)} mV)</span>`}
            </div>
            ${mark === 2
              ? html`<div style="color:${BALANCE_ACTIVE}">Balancing, discharging</div>`
              : mark === 1
                ? html`<div style="color:${BALANCE}">Balancing</div>`
                : ""}`
        : ""}
      <div class="num">Spread ${Number.isNaN(spreadMv) ? "–" : html`${fmt(this.hass, spreadMv, 0)} mV`}</div>
    </div>`;
  }

  render() {
    if (!this.hass || !this._config) return nothing;
    const d = this._data;
    const rows = d?.cells.length ?? packCells(this.hass, this.prefix).length;
    const height = Math.min(720, Math.max(240, rows * 6));
    const scale = d?.cols ? this._scaleNow : undefined;
    const hours = RANGES[this._range].hours;
    const t1 = d ? d.t0 + d.cols * d.step : 0;
    const tickEvery = rows > 60 ? 12 : rows > 24 ? 8 : 4;
    const hv = this._hover;
    const units = this._mode === "deviation" ? "mV" : "V";
    const label = (v) => (this._mode === "deviation" ? `${v > 0 ? "+" : ""}${fmt(this.hass, v * 1000, 0)}` : fmt(this.hass, v, 3));

    return html`
      <ha-card>
        <div class="wrap">
          <div class="head">
            <div class="label">Cell history</div>
            <div class="dim">
              ${rows} cells · ${RANGES[this._range].period === "hour" ? "hourly" : "5-minute"} averages
            </div>
            <span class="spacer"></span>
            <div class="seg">
              ${[["voltage", "Voltage"], ["deviation", "From average"]].map(
                ([m, name]) => html`<button class=${m === this._mode ? "on" : ""} @click=${() => this._setMode(m)}>${name}</button>`
              )}
            </div>
            ${Object.keys(this._balancing()).length
              ? html`<div class="seg">
                  <button class=${this._marks ? "on" : ""} @click=${() => this._toggleMarks()}>Balancing</button>
                </div>`
              : ""}
            <div class="seg">
              ${Object.entries(RANGES).map(
                ([r, { label: name }]) =>
                  html`<button class=${r === this._range ? "on" : ""} @click=${() => this._setRange(r)}>${name}</button>`
              )}
            </div>
          </div>
          <div class="plot">
            <div class="yaxis" style="height:${height}px">
              ${(d?.cells ?? []).map((c, i) =>
                c.n === 1 || c.n % tickEvery === 0
                  ? html`<span style="top:${((i + 0.5) / rows) * 100}%">${c.n}</span>`
                  : ""
              )}
            </div>
            <div class="area ${this._loading && d ? "stale" : ""}">
              <canvas
                class="map"
                style="height:${height}px"
                @pointermove=${(ev) => this._pick(ev, true)}
                @pointerleave=${() => (this._hover = undefined)}
                @click=${() => hv?.row !== undefined && this.moreInfo(d.cells[hv.row].id)}
              ></canvas>
              ${hv && d
                ? html`<i class="guide" style="left:${(hv.k / d.cols) * 100}%;width:${100 / d.cols}%"></i>
                    ${hv.row !== undefined
                      ? html`<i class="cellbox" style="top:${(hv.row / rows) * 100}%;height:${100 / rows}%"></i>`
                      : ""}`
                : ""}
              ${this._tip()}
              ${!d && !this._error ? html`<div class="msg">Loading…</div>` : ""}
              ${this._error ? html`<div class="msg">Couldn't load the cell statistics: ${this._error}</div>` : ""}
              ${d && !d.cols && !this._error
                ? html`<div class="msg">No statistics for these cells in this range yet.</div>`
                : ""}
            </div>
          </div>
          <div class="plot">
            <div class="yaxis"></div>
            <div class="xaxis">
              ${d?.cols
                ? timeTicks(d.t0, t1, hours).map((t) => {
                    const at = (t - d.t0) / (t1 - d.t0);
                    const locale = this.hass.locale?.language ?? navigator.language;
                    const text = new Date(t).toLocaleString(
                      locale,
                      hours > 24 ? { day: "numeric", month: "short" } : { hour: "2-digit", minute: "2-digit" }
                    );
                    return at < 0.97 ? html`<span style="left:${at * 100}%">${text}</span>` : "";
                  })
                : ""}
            </div>
          </div>
          <div class="plot">
            <div class="yaxis side">Spread</div>
            <div class="area">
              <canvas class="spread" @pointermove=${(ev) => this._pick(ev, false)} @pointerleave=${() => (this._hover = undefined)}></canvas>
              ${hv && d ? html`<i class="guide" style="left:${(hv.k / d.cols) * 100}%;width:${100 / d.cols}%"></i>` : ""}
              ${this._peak && d?.cols ? html`<span class="peak num">peak ${fmt(this.hass, this._peak * 1000, 0)} mV</span>` : ""}
            </div>
          </div>
          <div class="foot">
            ${scale
              ? html`<span class="bar">
                  <span class="num">${label(scale.lo)}</span>
                  <i class="ramp" style="background:linear-gradient(to right, ${scale.stops.join(",")})"></i>
                  <span class="num">${label(scale.hi)} ${units}</span>
                </span>`
              : ""}
            ${this._marks && d?.marks?.some((m) => m === 1)
              ? html`<span><i class="sw" style="background:${BALANCE}"></i>Balancing</span>`
              : ""}
            ${this._marks && d?.marks?.some((m) => m === 2)
              ? html`<span><i class="sw" style="background:${BALANCE_ACTIVE}"></i>Discharging</span>`
              : ""}
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
      .wrap {
        padding: 16px 20px 14px;
      }
      .head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 10px;
        margin-bottom: 12px;
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
      .plot {
        display: flex;
      }
      .yaxis {
        position: relative;
        flex: 0 0 34px;
        font-size: 10px;
        color: var(--ck-muted);
      }
      .yaxis span {
        position: absolute;
        right: 6px;
        transform: translateY(-50%);
      }
      .yaxis.side {
        font-size: 10px;
        writing-mode: vertical-rl;
        transform: rotate(180deg);
        text-align: center;
        flex-basis: 34px;
      }
      .area {
        position: relative;
        flex: 1;
        min-width: 0;
        transition: opacity 0.2s;
      }
      .area.stale {
        opacity: 0.5;
      }
      canvas {
        display: block;
        width: 100%;
        cursor: crosshair;
        touch-action: pan-y;
      }
      canvas.spread {
        height: 56px;
        border-top: 1px solid var(--ck-line);
      }
      .guide {
        position: absolute;
        top: 0;
        bottom: 0;
        min-width: 1px;
        background: var(--primary-text-color);
        opacity: 0.25;
        pointer-events: none;
      }
      .cellbox {
        position: absolute;
        left: 0;
        right: 0;
        min-height: 1px;
        outline: 1px solid var(--primary-text-color);
        pointer-events: none;
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
      .peak {
        position: absolute;
        top: 2px;
        right: 4px;
        font-size: 10px;
        color: var(--ck-muted);
        pointer-events: none;
      }
      .xaxis {
        position: relative;
        flex: 1;
        height: 18px;
        margin-top: 2px;
        font-size: 10px;
        color: var(--ck-muted);
      }
      .xaxis span {
        position: absolute;
        white-space: nowrap;
        transform: translateX(-50%);
      }
      .tip {
        position: absolute;
        top: 4px;
        margin: 0 10px;
        padding: 6px 10px;
        border-radius: 8px;
        font-size: 12px;
        line-height: 1.5;
        white-space: nowrap;
        pointer-events: none;
        background: var(--card-background-color, #fff);
        border: 1px solid var(--ck-line);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        z-index: 1;
      }
      .foot {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px 16px;
        margin: 10px 0 0 34px;
        font-size: 12px;
        color: var(--ck-muted);
      }
      .foot span {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .ramp {
        width: 120px;
        height: 10px;
        border-radius: 2px;
      }
      .sw {
        width: 10px;
        height: 10px;
        border-radius: 2px;
      }
    `,
  ];
}

define("cellkeeper-cell-history-card", CellKeeperCellHistoryCard);
