import { html, css } from "lit";
import { fmt } from "../overview/base.js";

// Pictures for the Configuration view's settings cards. Each takes the card (for its entity
// helpers) and explains what the settings below it do with the pack as it is right now.

const NO_LIMIT_A = 6000; // the BMS reports 6553.5 A for "not limiting"

const v3 = (card, mV) => fmt(card.hass, mV / 1000, 3);

// ---- cell voltage window ----

function voltage(card) {
  const sMin = card.num("number:cell_voltage_soft_min");
  const wMin = card.num("number:cell_voltage_working_min");
  const wMax = card.num("number:cell_voltage_working_max");
  const sMax = card.num("number:cell_voltage_soft_max");
  if ([sMin, wMin, wMax, sMax].some((v) => v === undefined)) return "";
  const cMin = (card.num("cell_voltage_min") ?? NaN) * 1000;
  const cMax = (card.num("cell_voltage_max") ?? NaN) * 1000;
  const balStart = card.num("number:balancing_start_voltage");
  const balMin = card.num("number:minimum_balancing_voltage");
  const n = card.num("cell_count");
  const pad = Math.max(80, (sMax - sMin) * 0.12);
  const lo = Math.min(sMin, cMin || sMin) - pad;
  const hi = Math.max(sMax, cMax || sMax) + pad;
  const pct = (v) => ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * 100;
  const zone = (a, b, cls) => html`<div class="zone ${cls}" style="left:${pct(a)}%;width:${pct(b) - pct(a)}%"></div>`;
  const ordered = sMin < wMin && wMin < wMax && wMax < sMax;
  const invMin = card.num("inverter_can_voltage_limit_min");
  const invMax = card.num("inverter_can_voltage_limit_max");
  const hasCells = Number.isFinite(cMin) && Number.isFinite(cMax);
  return html`
    <div class="vw">
      <div class="vw-top">
        <span style="left:${pct(wMin)}%" class="tag">0 %<b class="num">${v3(card, wMin)}</b></span>
        <span style="left:${pct(wMax)}%" class="tag">100 %<b class="num">${v3(card, wMax)}</b></span>
      </div>
      <div class="vw-bar">
        ${zone(lo, sMin, "bad")} ${zone(sMin, wMin, "warn")} ${zone(wMin, wMax, "good")} ${zone(wMax, sMax, "warn")}
        ${zone(sMax, hi, "bad")}
        ${balMin !== undefined ? html`<div class="tick bal" style="left:${pct(balMin)}%" title="Minimum balancing voltage"></div>` : ""}
        ${balStart !== undefined ? html`<div class="tick bal" style="left:${pct(balStart)}%" title="Balancing start voltage"></div>` : ""}
        ${hasCells
          ? html`<div class="cells" style="left:${pct(cMin)}%;width:max(4px, ${pct(cMax) - pct(cMin)}%)"
              title="Cells now: ${v3(card, cMin)}–${v3(card, cMax)} V"></div>`
          : ""}
      </div>
      <div class="vw-bottom">
        <span style="left:${pct(sMin)}%" class="tag">Soft min<b class="num">${v3(card, sMin)}</b></span>
        <span style="left:${pct(sMax)}%" class="tag">Soft max<b class="num">${v3(card, sMax)}</b></span>
      </div>
      <div class="legend">
        <span><i class="sw good"></i>Working range: 0–100 % SOC</span>
        <span><i class="sw warn"></i>Beyond: current limited</span>
        <span><i class="sw bad"></i>Beyond soft limits: restoration current only; the firmware's hard limits disconnect</span>
        ${hasCells ? html`<span><i class="sw cellsw"></i>Cells now <b class="num">${v3(card, cMin)}–${v3(card, cMax)} V</b></span>` : ""}
        ${balStart !== undefined ? html`<span><i class="sw balsw"></i>Balancing thresholds</span>` : ""}
      </div>
      ${!ordered
        ? html`<div class="warnline">
            The limits should run soft min &lt; working min &lt; working max &lt; soft max. The BMS keeps the working
            limits at least 25 mV inside the soft ones.
          </div>`
        : ""}
      ${n
        ? html`<div class="facts">
            <div><span>Working range × ${fmt(card.hass, n, 0)} cells</span><b class="num">${fmt(card.hass, (wMin * n) / 1000, 1)}–${fmt(card.hass, (wMax * n) / 1000, 1)} V</b></div>
            ${invMin !== undefined
              ? html`<div><span>Sent to the inverter now</span><b class="num">${fmt(card.hass, invMin, 1)}–${fmt(card.hass, invMax, 1)} V</b></div>`
              : ""}
          </div>`
        : ""}
    </div>
  `;
}

// ---- current limits ----

const CHARGE = [
  ["number:max_charge_current", "Max charge setting"],
  ["current_limit_hard_charge", "Hard limit"],
  ["current_limit_temperature_charge", "Temperature"],
  ["current_limit_cell_voltage_charge", "Cell voltage"],
  ["current_limit_working_charge", "Working range"],
  ["current_limit_delta_charge", "Cell spread"],
];
const DISCHARGE = [
  ["number:max_discharge_current", "Max discharge setting"],
  ["current_limit_hard_discharge", "Hard limit"],
  ["current_limit_temperature_discharge", "Temperature"],
  ["current_limit_cell_voltage_discharge", "Cell voltage"],
  ["current_limit_working_discharge", "Working range"],
];

function limitStack(card, title, effectiveKey, parts, color) {
  const effective = card.num(effectiveKey);
  const items = parts.map(([k, name]) => ({ k, name, v: card.num(k) })).filter((i) => i.v !== undefined);
  if (effective === undefined && !items.length) return "";
  const finite = items.map((i) => i.v).filter((v) => v < NO_LIMIT_A);
  const scale = Math.max(1, ...finite);
  const binding = items.find((i) => effective !== undefined && Math.abs(i.v - effective) < 0.05);
  return html`
    <div class="stack">
      <div class="stack-head clickable" @click=${() => card.moreInfo(effectiveKey)}>
        <span class="label">${title}</span>
        <span class="big num" style="color:${color}">${effective === undefined ? "–" : effective >= NO_LIMIT_A ? "∞" : fmt(card.hass, effective, effective < 10 ? 1 : 0)}<span class="unit">A</span></span>
      </div>
      ${items.map(
        (i) => html`
          <div class="lim ${i === binding ? "binding" : ""} clickable" @click=${() => card.moreInfo(i.k)}>
            <span class="lim-name">${i.name}</span>
            <span class="lim-track"
              >${i.v < NO_LIMIT_A
                ? html`<i style="width:${(i.v / scale) * 100}%;background:${i === binding ? color : "var(--ck-muted)"}"></i>`
                : html`<i class="none"></i>`}</span
            >
            <span class="lim-v num">${i.v >= NO_LIMIT_A ? "no limit" : `${fmt(card.hass, i.v, i.v < 10 ? 1 : 0)} A`}</span>
          </div>
        `
      )}
    </div>
  `;
}

function limits(card) {
  const c = limitStack(card, "Charge allowed", "current_limit_effective_charge", CHARGE, "var(--ck-charge)");
  const d = limitStack(card, "Discharge allowed", "current_limit_effective_discharge", DISCHARGE, "var(--ck-discharge)");
  if (!c && !d) return "";
  return html`<div class="stacks">${c}${d}</div>
    <div class="note">The lowest limit wins (highlighted). The two settings below cap the current; the BMS clamps them to the hard limit.</div>`;
}

// ---- SOC scaling ----

function soc(card) {
  const s = card.num("soc");
  const min = card.num("number:soc_scaling_min");
  const max = card.num("number:soc_scaling_max");
  if (s === undefined || min === undefined || max === undefined) return "";
  const sent = card.num("inverter_can_soc");
  const span = max > min ? max - min : 100;
  const lo = max > min ? min : 0;
  return html`
    <div class="socmap">
      <div class="socrow">
        <span class="label">BMS</span>
        <div class="sbar">
          <div class="win" style="left:${lo}%;width:${span}%"></div>
          <div class="pin" style="left:${s}%"></div>
        </div>
        <span class="num sv">${fmt(card.hass, s, 1)} %</span>
      </div>
      <svg class="fan" viewBox="0 0 100 10" preserveAspectRatio="none">
        <polygon points="${lo},0 ${lo + span},0 100,10 0,10"></polygon>
      </svg>
      <div class="socrow">
        <span class="label">Inverter</span>
        <div class="sbar">
          <div class="win" style="left:0;width:100%"></div>
          ${sent !== undefined ? html`<div class="pin" style="left:${sent}%"></div>` : ""}
        </div>
        <span class="num sv">${sent === undefined ? "–" : `${fmt(card.hass, sent, 0)} %`}</span>
      </div>
      <div class="note">
        ${max > min && (min > 0 || max < 100)
          ? html`The inverter sees ${fmt(card.hass, min, 0)}–${fmt(card.hass, max, 0)} % of the BMS's SOC as 0–100 %.`
          : html`No scaling: the inverter sees the BMS's SOC.`}
        It is sent as 100 % while charging is blocked and 0 % while discharging is blocked, so inverters that
        go by SOC stop too.
      </div>
    </div>
  `;
}

// ---- balancing ----

function balancing(card) {
  const period = card.num("number:auto_balancing_period");
  const start = card.num("number:balancing_start_voltage");
  const minBal = card.num("number:minimum_balancing_voltage");
  const sMax = card.num("number:cell_voltage_soft_max");
  const cMin = card.num("cell_voltage_min");
  const cMax = card.num("cell_voltage_max");
  if (period === undefined) return "";
  const mv = (v) => (v === undefined ? undefined : v * 1000);
  const checks = [
    { ok: period > 0, text: period > 0 ? `Enabled, a session every ${fmt(card.hass, period / 1000, 0)} s` : "Off: the period is 0" },
    start !== undefined && cMax !== undefined && {
      ok: mv(cMax) >= start,
      text: html`Highest cell <b class="num">${v3(card, mv(cMax))} V</b> ${mv(cMax) >= start ? "≥" : "<"} start voltage
        <b class="num">${v3(card, start)} V</b>`,
    },
    minBal !== undefined && cMin !== undefined && {
      ok: mv(cMin) >= minBal,
      text: html`Lowest cell <b class="num">${v3(card, mv(cMin))} V</b> ${mv(cMin) >= minBal ? "≥" : "<"} minimum
        <b class="num">${v3(card, minBal)} V</b>`,
    },
    sMax !== undefined && cMax !== undefined && {
      ok: mv(cMax) <= sMax,
      text: mv(cMax) <= sMax ? "No cell above the soft max" : "A cell is above the soft max",
    },
  ].filter(Boolean);
  const all = checks.every((c) => c.ok);
  const count = card.num("cells_balancing_count");
  const active = card.num("cells_balancing_active_count");
  return html`
    <div class="checks">
      ${checks.map(
        (c) => html`<div class="check ${c.ok ? "ok" : "no"}">
          <ha-icon icon=${c.ok ? "mdi:check-circle" : "mdi:close-circle"}></ha-icon><span>${c.text}</span>
        </div>`
      )}
      <div class="verdict ${all ? "ok" : "no"}">
        ${all
          ? count
            ? html`Balancing ${fmt(card.hass, count, 0)} cells${active ? html`, ${fmt(card.hass, active, 0)} discharging now` : ""}`
            : "Balancing allowed; no cell is far enough above the lowest"
          : "Not balancing until every check passes"}
      </div>
    </div>
  `;
}

// ---- balance charge ----

function balanceCharge(card) {
  const interval = card.num("number:balance_charge_interval");
  const startH = card.num("number:balance_charge_start_hour");
  const dur = card.num("number:balance_charge_duration");
  if (interval === undefined || startH === undefined || dur === undefined) return "";
  const status = card.str("balance_charge_status");
  const floatOff = card.num("number:float_offset_upper");
  const balOff = card.num("number:balance_charge_offset_upper");
  const wMax = card.num("number:cell_voltage_working_max");
  const n = card.num("cell_count");
  const end = Math.min(24, startH + dur);
  const now = new Date();
  const nowH = now.getHours() + now.getMinutes() / 60;
  const hh = (h) => `${String(Math.floor(h) % 24).padStart(2, "0")}:00`;
  const pack = (off) => (wMax !== undefined && n && off !== undefined ? (wMax * n) / 1000 + off / 10 : undefined);
  const fPack = pack(floatOff);
  const bPack = pack(balOff);
  const running = status?.startsWith("Balance charging");
  return html`
    <div class="bc">
      <div class="bc-status ${running ? "run" : interval > 0 ? "on" : ""}">
        <ha-icon icon=${running ? "mdi:battery-charging-high" : interval > 0 ? "mdi:calendar-clock" : "mdi:calendar-remove"}></ha-icon>
        <span>${status ?? (interval > 0 ? "Scheduled" : "Off")}</span>
      </div>
      <div class="bc-line">
        ${interval > 0
          ? html`Every <b>${fmt(card.hass, interval, 0)} ${interval === 1 ? "day" : "days"}</b>, ${hh(startH)}–${end >= 24 ? "24:00" : hh(end)}`
          : "Off: interval 0 leaves Voltage Limit Offset Upper to you"}
      </div>
      <div class="day">
        <div class="win ${interval > 0 ? "" : "off"}" style="left:${(startH / 24) * 100}%;width:${((end - startH) / 24) * 100}%"></div>
        <div class="now" style="left:${(nowH / 24) * 100}%" title="Now"></div>
      </div>
      <div class="day-ticks"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
      ${fPack !== undefined && bPack !== undefined
        ? html`<div class="facts">
            <div><span>Float</span><b class="num">≈ ${fmt(card.hass, fPack, 1)} V · ${v3(card, (fPack / n) * 1000)} V/cell</b></div>
            <div><span>Balance charge</span><b class="num">≈ ${fmt(card.hass, bPack, 1)} V · ${v3(card, (bPack / n) * 1000)} V/cell</b></div>
          </div>
          <div class="note">Working max × cells + offset, before the cell-spread correction; the inverter holds about 1 V above.</div>`
        : ""}
    </div>
  `;
}

const CELL_KEYS = ["cell_voltage_min", "cell_voltage_max", "cell_count"];

export const VISUALS = {
  voltage: {
    watched: () => [
      "number:cell_voltage_soft_min", "number:cell_voltage_working_min", "number:cell_voltage_working_max",
      "number:cell_voltage_soft_max", "number:balancing_start_voltage", "number:minimum_balancing_voltage",
      "inverter_can_voltage_limit_min", "inverter_can_voltage_limit_max", ...CELL_KEYS,
    ],
    render: voltage,
  },
  limits: {
    watched: () => ["current_limit_effective_charge", "current_limit_effective_discharge", ...CHARGE.map(([k]) => k), ...DISCHARGE.map(([k]) => k)],
    render: limits,
  },
  soc: {
    watched: () => ["soc", "inverter_can_soc", "number:soc_scaling_min", "number:soc_scaling_max"],
    render: soc,
  },
  balancing: {
    watched: () => [
      "number:auto_balancing_period", "number:balancing_start_voltage", "number:minimum_balancing_voltage",
      "number:cell_voltage_soft_max", "cells_balancing_count", "cells_balancing_active_count", ...CELL_KEYS,
    ],
    render: balancing,
  },
  balance_charge: {
    watched: () => [
      "number:balance_charge_interval", "number:balance_charge_start_hour", "number:balance_charge_duration",
      "number:float_offset_upper", "number:balance_charge_offset_upper", "number:cell_voltage_working_max",
      "balance_charge_status", "cell_count",
    ],
    render: balanceCharge,
  },
};

export const visualStyles = css`
  .note,
  .warnline {
    font-size: 12px;
    line-height: 1.45;
    color: var(--ck-muted);
    margin: 8px 0 6px;
  }
  .warnline {
    color: var(--ck-warn);
  }
  .facts {
    margin: 10px 0 4px;
    font-size: 13px;
  }
  .facts > div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 3px 0;
  }
  .facts span {
    color: var(--ck-muted);
  }
  .facts b {
    font-weight: 500;
  }

  /* voltage window */
  .vw {
    margin: 4px 0 6px;
  }
  .vw-top,
  .vw-bottom {
    position: relative;
    height: 30px;
  }
  .tag {
    position: absolute;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: 11px;
    line-height: 1.25;
    color: var(--ck-muted);
    white-space: nowrap;
  }
  .tag b {
    font-size: 12px;
    font-weight: 500;
    color: var(--primary-text-color);
  }
  .vw-bottom .tag {
    flex-direction: column-reverse;
  }
  .vw-bar {
    position: relative;
    height: 16px;
    border-radius: 8px;
    overflow: visible;
  }
  .zone {
    position: absolute;
    top: 0;
    bottom: 0;
  }
  .zone:first-child {
    border-radius: 8px 0 0 8px;
  }
  .zone:nth-child(5) {
    border-radius: 0 8px 8px 0;
  }
  .zone.good,
  .sw.good {
    background: color-mix(in srgb, var(--ck-good) 55%, transparent);
  }
  .zone.warn,
  .sw.warn {
    background: color-mix(in srgb, var(--ck-warn) 45%, transparent);
  }
  .zone.bad,
  .sw.bad {
    background: color-mix(in srgb, var(--ck-bad) 40%, transparent);
  }
  .tick {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 0;
    border-left: 2px dashed #fdd835;
  }
  .cells {
    position: absolute;
    top: -5px;
    bottom: -5px;
    margin-left: -2px;
    border-radius: 3px;
    background: var(--primary-text-color);
    box-shadow: 0 0 0 2px var(--card-background-color, #fff);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin-top: 4px;
    font-size: 12px;
    color: var(--ck-muted);
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .legend b {
    color: var(--primary-text-color);
    font-weight: 500;
  }
  .sw {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    flex: none;
  }
  .sw.cellsw {
    width: 4px;
    background: var(--primary-text-color);
  }
  .sw.balsw {
    width: 0;
    border-left: 2px dashed #fdd835;
  }

  /* limit stacks */
  .stacks {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 8px 24px;
    margin: 4px 0;
  }
  .stack-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin: 0 -4px 4px;
    padding: 0 4px;
  }
  .stack .big {
    font-size: 26px;
  }
  .lim {
    display: grid;
    grid-template-columns: 7.5em 1fr 4.5em;
    align-items: center;
    gap: 8px;
    margin: 0 -4px;
    padding: 3px 4px;
    font-size: 12px;
    color: var(--ck-muted);
  }
  .lim.binding {
    color: var(--primary-text-color);
    font-weight: 500;
  }
  .lim-track {
    position: relative;
    height: 6px;
    border-radius: 3px;
    background: var(--ck-track);
    overflow: hidden;
  }
  .lim-track i {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    border-radius: 3px;
    opacity: 0.8;
  }
  .lim-track i.none {
    right: 0;
    background: repeating-linear-gradient(90deg, var(--ck-line) 0 4px, transparent 4px 8px);
  }
  .lim-v {
    text-align: right;
  }

  /* SOC mapping */
  .socmap {
    margin: 4px 0;
  }
  .socrow {
    display: grid;
    grid-template-columns: 5.5em 1fr 4em;
    align-items: center;
    gap: 10px;
  }
  .sbar {
    position: relative;
    height: 12px;
    border-radius: 6px;
    background: var(--ck-track);
  }
  .sbar .win {
    position: absolute;
    top: 0;
    bottom: 0;
    border-radius: 6px;
    background: color-mix(in srgb, var(--primary-color) 40%, transparent);
  }
  .sbar .pin {
    position: absolute;
    top: -4px;
    bottom: -4px;
    width: 4px;
    margin-left: -2px;
    border-radius: 2px;
    background: var(--primary-text-color);
  }
  .sv {
    text-align: right;
    font-size: 13px;
  }
  .fan {
    display: block;
    width: calc(100% - 5.5em - 4em - 20px);
    margin-left: calc(5.5em + 10px);
    height: 14px;
  }
  .fan polygon {
    fill: color-mix(in srgb, var(--primary-color) 15%, transparent);
  }

  /* balancing checks */
  .checks {
    margin: 4px 0 8px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    padding: 3px 0;
  }
  .check ha-icon {
    --mdc-icon-size: 18px;
    flex: none;
  }
  .check.ok ha-icon {
    color: var(--ck-good);
  }
  .check.no ha-icon {
    color: var(--ck-bad);
  }
  .check b {
    font-weight: 500;
  }
  .verdict {
    margin-top: 6px;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
  }
  .verdict.ok {
    background: color-mix(in srgb, var(--ck-good) 14%, transparent);
    color: var(--ck-good);
  }
  .verdict.no {
    background: color-mix(in srgb, var(--ck-warn) 14%, transparent);
    color: var(--ck-warn);
  }

  /* balance charge */
  .bc {
    margin: 4px 0 6px;
  }
  .bc-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px 4px 10px;
    border-radius: 16px;
    font-size: 13px;
    font-weight: 500;
    color: var(--ck-muted);
    background: var(--ck-track);
  }
  .bc-status ha-icon {
    --mdc-icon-size: 16px;
  }
  .bc-status.on {
    color: var(--ck-info);
    background: color-mix(in srgb, var(--ck-info) 14%, transparent);
  }
  .bc-status.run {
    color: var(--ck-charge);
    background: color-mix(in srgb, var(--ck-charge) 14%, transparent);
  }
  .bc-line {
    margin: 10px 0 6px;
    font-size: 14px;
  }
  .day {
    position: relative;
    height: 12px;
    border-radius: 6px;
    background: var(--ck-track);
  }
  .day .win {
    position: absolute;
    top: 0;
    bottom: 0;
    border-radius: 6px;
    background: color-mix(in srgb, var(--ck-charge) 55%, transparent);
  }
  .day .win.off {
    background: repeating-linear-gradient(90deg, var(--ck-line) 0 4px, transparent 4px 8px);
  }
  .day .now {
    position: absolute;
    top: -4px;
    bottom: -4px;
    width: 2px;
    margin-left: -1px;
    background: var(--primary-text-color);
  }
  .day-ticks {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--ck-muted);
    margin-top: 3px;
  }
`;
