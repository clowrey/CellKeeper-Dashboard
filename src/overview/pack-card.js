import { html, svg, css, nothing } from "lit";
import { PackCard, baseStyles, fmt, fmtPower, fmtDuration } from "./base.js";
import { fetchDay } from "./history.js";
import { BATTERY } from "../icons.js";
import { define } from "../context.js";
import { dashboardUpdate } from "../update.js";
import { EVENT_COLORS, PREVIOUS_COLOR } from "../cards/event-grid.js";

// custom:cellkeeper-pack-card
//   prefix: ck0
//   event_path: event     view to open from the event banners/chips
//
// The Overview's hero: state of charge on the logo battery, what the pack is doing and what
// it is allowed to do (current against the live limits, and which limit is in force), the last
// 24 h of SOC and power, and anything the BMS is complaining about.

const IDLE_A = 0.5; // below this the pack counts as idle
const NO_LIMIT_A = 6000; // the BMS reports 6553.5 A for "not limiting"

// Components of the effective current limits, in the order they're named when several tie.
const CHARGE_LIMITS = [
  ["current_limit_hard_charge", "hard limit"],
  ["current_limit_temperature_charge", "temperature"],
  ["current_limit_cell_voltage_charge", "cell voltage"],
  ["current_limit_working_charge", "top of working range"],
  ["current_limit_delta_charge", "cell spread"],
  ["number:max_charge_current", "max charge setting"],
];
const DISCHARGE_LIMITS = [
  ["current_limit_hard_discharge", "hard limit"],
  ["current_limit_temperature_discharge", "temperature"],
  ["current_limit_cell_voltage_discharge", "cell voltage"],
  ["current_limit_working_discharge", "bottom of working range"],
  ["number:max_discharge_current", "max discharge setting"],
];

const STATE_COLORS = { OPERATING: "var(--ck-good)", FAULT: "var(--ck-bad)", CALIB: "var(--ck-info)", INIT: "var(--ck-info)" };
const SEVERE = ["FATAL", "CRITICAL", "WARNING"];
const LEVEL_ICONS = { FATAL: "mdi:alert-octagon", CRITICAL: "mdi:alert", WARNING: "mdi:alert-circle-outline" };

function socColor(soc) {
  if (soc === undefined) return "var(--ck-muted)";
  if (soc < 10) return "var(--ck-bad)";
  if (soc < 25) return "var(--ck-warn)";
  return "var(--ck-good)";
}

class CellKeeperPackCard extends PackCard {
  static properties = { ...PackCard.properties, _day: { state: true }, _hover: { state: true } };

  setConfig(config) {
    super.setConfig({ event_path: "event", ...config });
  }

  watched() {
    return [
      "soc", "current", "power_w", "pack_internal_voltage", "pack_output_voltage", "capacity", "cell_count",
      "system_state_text", "contactor_state_text", "balance_charge_status", "current_limit_effective_charge",
      "current_limit_effective_discharge", ...CHARGE_LIMITS.map(([k]) => k), ...DISCHARGE_LIMITS.map(([k]) => k),
      ...this._eventIds(),
      ...[dashboardUpdate(this.hass)?.entity_id].filter(Boolean),
    ];
  }

  _eventIds() {
    if (!this.hass) return [];
    const start = `sensor.${this.prefix}_event_`;
    return Object.keys(this.hass.states).filter((id) => id.startsWith(start) && /_(fatal|critical|warning|info)_/.test(id));
  }

  connectedCallback() {
    super.connectedCallback();
    this._timer = setInterval(() => this._loadDay(), 5 * 60 * 1000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this._timer);
  }

  updated(changed) {
    if (changed.has("hass") && !this._day && !this._loading && this.hass) this._loadDay();
  }

  async _loadDay() {
    if (!this.hass) return;
    this._loading = true;
    const ids = [this.eid("soc"), this.eid("power_w")];
    const data = await fetchDay(this.hass, ids);
    this._day = { soc: data[ids[0]], power: data[ids[1]] };
    this._loading = false;
  }

  // ---- data ----

  _events() {
    const active = [];
    const previous = [];
    for (const id of this._eventIds()) {
      const state = this.hass.states[id].state;
      const name = (this.hass.states[id].attributes.friendly_name ?? id)
        .replace(/^.*?Event (Fatal|Critical|Warning|Info) /i, "")
        .trim();
      const count = state.match(/\((\d+)\)/)?.[1];
      const level = ["FATAL", "CRITICAL", "WARNING", "INFO"].find((l) => state.includes(l));
      if (level) active.push({ id, name, level, count });
      else if (state.startsWith("INACTIVE (")) previous.push({ id, name, count });
    }
    const rank = (e) => ["FATAL", "CRITICAL", "WARNING", "INFO"].indexOf(e.level);
    active.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    return { active, previous };
  }

  // Effective limit and the component that sets it ("" when nothing reported).
  _limit(effectiveKey, components) {
    const effective = this.numIn(effectiveKey, "A");
    if (effective === undefined) return undefined;
    const values = components.map(([k, name]) => [this.numIn(k, "A"), name]).filter(([v]) => v !== undefined);
    const match = values.find(([v]) => Math.abs(v - effective) < 0.05);
    return { value: effective, reason: match?.[1] ?? "" };
  }

  // ---- render ----

  render() {
    if (!this.hass || !this._config) return nothing;
    const soc = this.num("soc");
    const current = this.numIn("current", "A");
    const voltage = this.numIn("pack_internal_voltage", "V");
    const capacity = this.num("capacity");
    const power = this.numIn("power_w", "W") ?? (current !== undefined && voltage !== undefined ? current * voltage : undefined);
    const mode = current === undefined ? "unknown" : current > IDLE_A ? "charging" : current < -IDLE_A ? "discharging" : "idle";
    const events = this._events();
    const severe = events.active.filter((e) => SEVERE.includes(e.level));

    return html`
      <ha-card>
        ${severe.map((e) => this._banner(e))}
        <div class="wrap">
          ${this._header(events)}
          <div class="grid">
            ${this._gauge(soc, mode, capacity, voltage)} ${this._flow(mode, current, power, voltage, soc, capacity)}
            ${this._chart()}
          </div>
          ${this._footer(events)}
        </div>
      </ha-card>
    `;
  }

  _banner(e) {
    return html`
      <div class="banner" style="--c:${EVENT_COLORS[e.level]}" @click=${() => this.navigateView(this._config.event_path)}>
        <ha-icon icon=${LEVEL_ICONS[e.level]}></ha-icon>
        <div><b>${e.level[0] + e.level.slice(1).toLowerCase()}:</b> ${e.name}${e.count > 1 ? html` <span class="dim">×${e.count}</span>` : ""}</div>
        <ha-icon class="chev" icon="mdi:chevron-right"></ha-icon>
      </div>
    `;
  }

  // The pack's HMI device name as the user named it, else the prefix.
  _deviceName() {
    const deviceId = this.hass.entities?.[this.eid("soc")]?.device_id;
    const device = deviceId && this.hass.devices?.[deviceId];
    return device?.name_by_user || device?.name || this.prefix.toUpperCase();
  }

  _header() {
    const state = this.str("system_state_text");
    const contactor = this.str("contactor_state_text");
    const cells = this.num("cell_count");
    const capacity = this.num("capacity");
    const balance = this.str("balance_charge_status");
    const update = dashboardUpdate(this.hass);
    return html`
      <div class="header">
        <div class="title">
          <ha-icon icon="cellkeeper:battery"></ha-icon>
          <span>${this._config.title ?? this._deviceName()}</span>
          <span class="dim">${[cells && `${cells}s`, capacity && `${fmt(this.hass, capacity, 0)} Ah`].filter(Boolean).join(" · ")}</span>
        </div>
        <div class="chips">
          ${state
            ? html`<span class="chip" style="--c:${STATE_COLORS[state] ?? "var(--ck-muted)"}" @click=${() => this.moreInfo("system_state_text")}>
                <i></i>${state[0] + state.slice(1).toLowerCase()}</span
              >`
            : ""}
          ${contactor
            ? html`<span
                class="chip"
                style="--c:${contactor === "CLOSED" ? "var(--ck-good)" : contactor === "OPEN" ? "var(--ck-muted)" : "var(--ck-info)"}"
                @click=${() => this.moreInfo("contactor_state_text")}
                ><ha-icon icon=${contactor === "CLOSED" ? "mdi:electric-switch-closed" : "mdi:electric-switch"}></ha-icon>Contactors
                ${contactor.toLowerCase()}</span
              >`
            : ""}
          ${update?.state === "on"
            ? html`<span class="chip" style="--c:var(--ck-info)" title="A new version of this dashboard is out"
                @click=${() => this.moreInfo(update.entity_id)}
                ><ha-icon icon="mdi:arrow-up-circle-outline"></ha-icon>Dashboard ${update.attributes.latest_version}</span
              >`
            : ""}
          ${balance && balance !== "Off"
            ? html`<span class="chip" style="--c:var(--ck-info)" @click=${() => this.moreInfo("balance_charge_status")}
                ><ha-icon icon="mdi:scale-balance"></ha-icon>${balance}</span
              >`
            : ""}
        </div>
      </div>
    `;
  }

  _gauge(soc, mode, capacity, voltage) {
    const [cx, cy, cw, ch] = BATTERY.cavityBox;
    const level = Math.max(0, Math.min(100, soc ?? 0)) / 100;
    const fillY = cy + ch * (1 - level);
    const color = socColor(soc);
    const stored = soc !== undefined && capacity && voltage ? (capacity * soc * voltage) / 100 / 1000 : undefined;
    const ah = soc !== undefined && capacity ? (capacity * soc) / 100 : undefined;
    const hourAgo = this._valueAgo(this._day?.soc, 3600e3);
    const delta = soc !== undefined && hourAgo !== undefined ? soc - hourAgo : undefined;
    const arrow = mode === "charging" || mode === "discharging";
    return html`
      <div class="gauge clickable" @click=${() => this.moreInfo("soc")}>
        <svg viewBox=${BATTERY.viewBox} class="battery" aria-hidden="true">
          <defs>
            <clipPath id="cavity"><path d=${BATTERY.cavity}></path></clipPath>
            <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color=${color} stop-opacity="0.75"></stop>
              <stop offset="1" stop-color=${color} stop-opacity="1"></stop>
            </linearGradient>
          </defs>
          ${svg`
            <rect x=${cx} y=${cy} width=${cw} height=${ch} fill="var(--ck-track)" clip-path="url(#cavity)"></rect>
            <rect class="level" x=${cx} y=${fillY} width=${cw} height=${ch * level + 1} fill="url(#fill)" clip-path="url(#cavity)"></rect>
            <path d=${BATTERY.outline} fill="var(--primary-text-color)" fill-rule="evenodd"></path>
            ${arrow
              ? svg`<g class="arrow ${mode}" style="transform-origin:${cx + cw / 2}px ${cy + ch / 2}px">
                  <path d=${BATTERY.arrow} transform="translate(0 ${cy + ch / 2 - 35.4})"></path></g>`
              : ""}
          `}
        </svg>
        <div class="soc">
          <div class="label">State of charge</div>
          <div class="hero-num" style="color:${color}">${soc === undefined ? "–" : fmt(this.hass, soc, soc >= 99.95 ? 0 : 1)}<span class="unit">%</span></div>
          ${stored !== undefined
            ? html`<div class="sub num">≈ ${fmt(this.hass, stored, 1)} kWh · ${fmt(this.hass, ah, 0)} Ah</div>`
            : ""}
          ${delta !== undefined
            ? html`<div class="sub num">
                <ha-icon icon=${delta >= 0.05 ? "mdi:trending-up" : delta <= -0.05 ? "mdi:trending-down" : "mdi:trending-neutral"}></ha-icon>
                ${Math.abs(delta) < 0.05
                  ? "Unchanged over the last hour"
                  : html`${delta > 0 ? "+" : "−"}${fmt(this.hass, Math.abs(delta), 1)} % in the last hour`}
              </div>`
            : ""}
        </div>
      </div>
    `;
  }

  // Value `ms` ago in a [[t, v]] series (nearest point at or before), or undefined.
  _valueAgo(series, ms) {
    if (!series?.length) return undefined;
    const t = Date.now() - ms;
    let best;
    for (const [ts, v] of series) if (ts <= t) best = v;
    return best;
  }

  _flow(mode, current, power, voltage, soc, capacity) {
    const charge = this._limit("current_limit_effective_charge", CHARGE_LIMITS);
    const discharge = this._limit("current_limit_effective_discharge", DISCHARGE_LIMITS);
    const out = this.numIn("pack_output_voltage", "V");
    const [pv, pu] = fmtPower(this.hass, power === undefined ? undefined : Math.abs(power));
    const label = { charging: "Charging", discharging: "Discharging", idle: "Idle", unknown: "–" }[mode];
    const color = { charging: "var(--ck-charge)", discharging: "var(--ck-discharge)" }[mode] ?? "var(--ck-muted)";
    let eta = "";
    if (capacity && soc !== undefined && current !== undefined && Math.abs(current) >= IDLE_A) {
      const hours = mode === "charging" ? (capacity * (100 - soc)) / 100 / current : (capacity * soc) / 100 / -current;
      if (hours < 96) eta = `${mode === "charging" ? "Full" : "Empty"} in ≈ ${fmtDuration(hours)}`;
    }
    return html`
      <div class="flow">
        <div class="label" style="color:${color}">
          <ha-icon icon=${mode === "charging" ? "mdi:battery-arrow-down" : mode === "discharging" ? "mdi:battery-arrow-up" : "mdi:battery"}></ha-icon>
          ${label}
        </div>
        <div class="power clickable" @click=${() => this.moreInfo("power_w")}>
          <span class="hero-num" style=${mode === "idle" ? "color:var(--ck-muted)" : ""}>${pv}<span class="unit">${pu}</span></span>
          ${eta ? html`<span class="eta">${eta}</span>` : ""}
        </div>
        <div class="readings">
          <div class="clickable" @click=${() => this.moreInfo("current")}>
            <div class="label">Current</div>
            <div class="mid num">${fmt(this.hass, current, Math.abs(current ?? 0) < 10 ? 2 : 1)}<span class="unit">A</span></div>
          </div>
          <div class="clickable" @click=${() => this.moreInfo("pack_internal_voltage")}>
            <div class="label">Pack</div>
            <div class="mid num">${fmt(this.hass, voltage, 1)}<span class="unit">V</span></div>
          </div>
          ${out !== undefined
            ? html`<div class="clickable" @click=${() => this.moreInfo("pack_output_voltage")}>
                <div class="label">Output</div>
                <div class="mid num">${fmt(this.hass, out, 1)}<span class="unit">V</span></div>
              </div>`
            : ""}
        </div>
        ${charge || discharge ? this._limits(current, charge, discharge) : ""}
      </div>
    `;
  }

  // Centre-zero current bar: discharge to the left, charge to the right, the allowed band
  // between the two effective limits, and a marker at the present current.
  _limits(current, charge, discharge) {
    const lim = (l) => (l && l.value < NO_LIMIT_A ? l.value : undefined);
    const c = lim(charge);
    const d = lim(discharge);
    const hard = Math.max(this.numIn("current_limit_hard_charge", "A") ?? 0, this.numIn("current_limit_hard_discharge", "A") ?? 0);
    const scale = Math.max(hard, c ?? 0, d ?? 0, Math.abs(current ?? 0), 1) * 1.05;
    const pos = (a) => 50 + (Math.max(-scale, Math.min(scale, a)) / scale) * 50;
    const marker = current === undefined ? undefined : pos(current);
    const text = (l, word) =>
      l === undefined ? html`<b>${word}</b> unlimited` : html`<b class="num">${fmt(this.hass, l.value, l.value < 10 ? 1 : 0)} A</b> ${word}${l.reason ? html`<span class="dim"> · ${l.reason}</span>` : ""}`;
    return html`
      <div class="limits">
        <div class="bar">
          <div class="side discharge" style="left:${pos(-(d ?? scale))}%;width:${50 - pos(-(d ?? scale))}%"></div>
          <div class="side charge" style="left:50%;width:${pos(c ?? scale) - 50}%"></div>
          <div class="zero"></div>
          ${marker !== undefined ? html`<div class="marker" style="left:${marker}%"></div>` : ""}
        </div>
        <div class="limit-text">
          <span class="clickable" @click=${() => this.moreInfo("current_limit_effective_discharge")}
            >${text(discharge?.value < NO_LIMIT_A ? discharge : undefined, "discharge")}</span
          >
          <span class="clickable right" @click=${() => this.moreInfo("current_limit_effective_charge")}
            >${text(charge?.value < NO_LIMIT_A ? charge : undefined, "charge")}</span
          >
        </div>
        ${charge?.value === 0 ? html`<div class="note">Charging is blocked (${charge.reason || "limit 0 A"}).</div>` : ""}
        ${discharge?.value === 0 ? html`<div class="note">Discharging is blocked (${discharge.reason || "limit 0 A"}).</div>` : ""}
      </div>
    `;
  }

  _chart() {
    const now = Date.now();
    const t0 = now - 24 * 3600e3;
    const soc = [...(this._day?.soc ?? [])];
    const power = [...(this._day?.power ?? [])];
    const liveSoc = this.num("soc");
    const livePower = this.numIn("power_w", "W");
    if (liveSoc !== undefined) soc.push([now, liveSoc]);
    if (livePower !== undefined) power.push([now, livePower]);
    const W = 1000;
    const H = 100;
    const x = (t) => ((t - t0) / (now - t0)) * W;
    const maxP = Math.max(100, ...power.map(([, p]) => Math.abs(p)));
    const hasNeg = power.some(([, p]) => p < -1);
    const hasPos = power.some(([, p]) => p > 1);
    // Zero line in the middle when the pack both charged and discharged, else at the edge.
    const zero = hasNeg && hasPos ? H / 2 : hasNeg ? 0 : H;
    const py = (p) => (hasNeg && hasPos ? zero - (p / maxP) * (H / 2) : hasNeg ? (-p / maxP) * H : H - (p / maxP) * H);
    const area = (sign) => {
      if (power.length < 2) return "";
      const pts = power.map(([t, p]) => `${x(t).toFixed(1)},${py(sign > 0 ? Math.max(0, p) : Math.min(0, p)).toFixed(1)}`);
      return `M${x(power[0][0]).toFixed(1)},${zero} L${pts.join(" L")} L${x(power[power.length - 1][0]).toFixed(1)},${zero}Z`;
    };
    const sy = (v) => H - 3 - (v / 100) * (H - 6);
    const socLine = soc.length > 1 ? "M" + soc.map(([t, v]) => `${x(t).toFixed(1)},${sy(v).toFixed(1)}`).join(" L") : "";
    const ticks = [24, 18, 12, 6, 0].map((h) => now - h * 3600e3);
    const hover = this._hover;
    const pick = (series, t) => {
      let best;
      for (const p of series) if (!best || Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p;
      return best?.[1];
    };
    const time = (t) => new Date(t).toLocaleTimeString(this.hass.locale?.language, { hour: "2-digit", minute: "2-digit" });
    return html`
      <div class="chart">
        <div class="chart-head">
          <span class="label">Last 24 h</span>
          <span class="legend"><i style="background:var(--primary-color)"></i>SOC</span>
          ${hasPos ? html`<span class="legend"><i style="background:var(--ck-charge)"></i>Charge</span>` : ""}
          ${hasNeg ? html`<span class="legend"><i style="background:var(--ck-discharge)"></i>Discharge</span>` : ""}
          <span class="dim num scale">±${fmtPower(this.hass, maxP).join(" ")}</span>
        </div>
        <div
          class="plot"
          @mousemove=${(ev) => {
            const r = ev.currentTarget.getBoundingClientRect();
            this._hover = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
          }}
          @mouseleave=${() => (this._hover = undefined)}
          @click=${() => this.moreInfo("soc")}
        >
          <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
            ${svg`
              ${[25, 50, 75].map((v) => svg`<line x1="0" x2=${W} y1=${sy(v)} y2=${sy(v)} class="grid-line"></line>`)}
              <path d=${area(1)} fill="var(--ck-charge)" fill-opacity="0.35"></path>
              <path d=${area(-1)} fill="var(--ck-discharge)" fill-opacity="0.35"></path>
              <path d=${socLine} fill="none" stroke="var(--primary-color)" stroke-width="2" vector-effect="non-scaling-stroke"></path>
              ${hover !== undefined ? svg`<line x1=${hover * W} x2=${hover * W} y1="0" y2=${H} class="cursor"></line>` : ""}
            `}
          </svg>
          <div class="yaxis">${[100, 50, 0].map((v) => html`<span style="top:${sy(v)}%">${v}%</span>`)}</div>
          ${!this._day ? html`<div class="loading dim">Loading history…</div>` : ""}
          ${hover !== undefined
            ? (() => {
                const t = t0 + hover * (now - t0);
                const s = pick(soc, t);
                const [p, u] = fmtPower(this.hass, pick(power, t));
                return html`<div class="tip" style="left:${hover * 100}%;${hover > 0.6 ? "transform:translateX(-100%)" : ""}">
                  <div class="dim">${time(t)}</div>
                  <div class="num">SOC ${fmt(this.hass, s, 1)} %</div>
                  <div class="num">${p} ${u}</div>
                </div>`;
              })()
            : ""}
        </div>
        <div class="ticks">${ticks.map((t, i) => html`<span>${i === 4 ? "now" : time(t)}</span>`)}</div>
      </div>
    `;
  }

  _footer({ active, previous }) {
    const info = active.filter((e) => e.level === "INFO");
    if (!info.length && !previous.length) return "";
    const go = () => this.navigateView(this._config.event_path);
    return html`
      <div class="footer">
        ${info.map(
          (e) => html`<span class="chip small" style="--c:${EVENT_COLORS.INFO}" @click=${go}><ha-icon icon="mdi:information-outline"></ha-icon>${e.name}</span>`
        )}
        ${previous.map(
          (e) => html`<span class="chip small" style="--c:${PREVIOUS_COLOR}" @click=${go} title="Was active since the last reset"
            ><ha-icon icon="mdi:history"></ha-icon>${e.name}${e.count > 1 ? ` ×${e.count}` : ""}</span
          >`
        )}
      </div>
    `;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  static styles = [
    baseStyles,
    css`
      .wrap {
        padding: 16px 20px 18px;
        container-type: inline-size;
      }
      .banner {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 20px;
        background: color-mix(in srgb, var(--c) 18%, transparent);
        border-bottom: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
        cursor: pointer;
      }
      .banner ha-icon {
        color: var(--c);
      }
      .banner div {
        flex: 1;
      }
      .banner .chev {
        color: var(--ck-muted);
      }
      .header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px 16px;
        margin-bottom: 12px;
      }
      .title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 18px;
        font-weight: 500;
      }
      .title ha-icon {
        --mdc-icon-size: 22px;
        color: var(--state-icon-color, var(--primary-color));
      }
      .title .dim {
        font-size: 14px;
        font-weight: 400;
      }
      .dim {
        color: var(--ck-muted);
      }
      .chips,
      .footer {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .footer {
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px solid var(--ck-line);
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 12px 4px 10px;
        border-radius: 16px;
        font-size: 13px;
        font-weight: 500;
        color: var(--c);
        background: color-mix(in srgb, var(--c) 14%, transparent);
        cursor: pointer;
        white-space: nowrap;
      }
      .chip i {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--c);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 25%, transparent);
      }
      .chip ha-icon {
        --mdc-icon-size: 16px;
      }
      .chip.small {
        font-size: 12px;
        padding: 2px 10px 2px 8px;
      }
      .chip.small ha-icon {
        --mdc-icon-size: 14px;
      }

      .grid {
        display: grid;
        gap: 20px 28px;
        grid-template-columns: 1fr;
      }
      @container (min-width: 560px) {
        .grid {
          grid-template-columns: minmax(230px, 0.8fr) 1fr;
        }
        .chart {
          grid-column: 1 / -1;
        }
      }
      @container (min-width: 1000px) {
        .grid {
          grid-template-columns: minmax(250px, 0.75fr) 1fr 1.3fr;
        }
        .chart {
          grid-column: auto;
        }
      }

      .gauge {
        display: flex;
        align-items: center;
        gap: 18px;
        padding: 4px;
      }
      .battery {
        width: 74px;
        flex: none;
        overflow: visible;
      }
      .battery .level {
        transition: y 0.8s ease, height 0.8s ease;
      }
      .arrow path {
        fill: var(--card-background-color, #fff);
        opacity: 0.9;
      }
      .arrow.discharging {
        transform: rotate(180deg);
      }
      .arrow.charging path {
        animation: down 2.2s ease-in-out infinite;
      }
      .arrow.discharging path {
        animation: down 2.2s ease-in-out infinite;
      }
      @keyframes down {
        0% { transform: translateY(-12px); opacity: 0; }
        30% { opacity: 0.95; }
        70% { opacity: 0.95; }
        100% { transform: translateY(14px); opacity: 0; }
      }
      @media (prefers-reduced-motion: reduce) {
        .arrow path { animation: none !important; }
      }
      .hero-num {
        font-size: 44px;
        font-weight: 400;
        line-height: 1.05;
        letter-spacing: -0.02em;
        font-variant-numeric: tabular-nums;
      }
      .hero-num .unit {
        font-size: 0.45em;
      }
      .sub {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 4px;
        font-size: 13px;
        color: var(--ck-muted);
      }
      .sub ha-icon {
        --mdc-icon-size: 16px;
      }

      .flow .label {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .flow .label ha-icon {
        --mdc-icon-size: 18px;
      }
      .power {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 4px 14px;
        margin: 2px -4px 8px;
        padding: 0 4px;
      }
      .eta {
        font-size: 13px;
        color: var(--ck-muted);
      }
      .readings {
        display: flex;
        gap: 4px 22px;
        flex-wrap: wrap;
        margin: 0 -6px 12px;
      }
      .readings > div {
        padding: 2px 6px;
      }
      .mid {
        font-size: 20px;
      }
      .limits .bar {
        position: relative;
        height: 10px;
        border-radius: 5px;
        background: var(--ck-track);
      }
      .side {
        position: absolute;
        top: 0;
        bottom: 0;
      }
      .side.discharge {
        background: color-mix(in srgb, var(--ck-discharge) 45%, transparent);
        border-radius: 5px 0 0 5px;
      }
      .side.charge {
        background: color-mix(in srgb, var(--ck-charge) 45%, transparent);
        border-radius: 0 5px 5px 0;
      }
      .zero {
        position: absolute;
        left: 50%;
        top: -3px;
        bottom: -3px;
        width: 2px;
        margin-left: -1px;
        background: var(--ck-muted);
        opacity: 0.6;
      }
      .marker {
        position: absolute;
        top: 50%;
        width: 16px;
        height: 16px;
        margin: -8px 0 0 -8px;
        border-radius: 50%;
        background: var(--primary-text-color);
        border: 3px solid var(--card-background-color, #fff);
        box-sizing: border-box;
        transition: left 0.6s ease;
      }
      .limit-text {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin: 6px -4px 0;
        font-size: 12px;
      }
      .limit-text span {
        padding: 2px 4px;
      }
      .limit-text .right {
        text-align: right;
      }
      .note {
        margin-top: 6px;
        font-size: 12px;
        color: var(--ck-warn);
      }

      .chart {
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .chart-head {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 6px;
      }
      .legend {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 12px;
        color: var(--ck-muted);
      }
      .legend i {
        width: 10px;
        height: 10px;
        border-radius: 2px;
      }
      .scale {
        margin-left: auto;
        font-size: 12px;
      }
      .plot {
        position: relative;
        cursor: crosshair;
        flex: 1;
        min-height: 130px;
        border-left: 1px solid var(--ck-line);
        border-bottom: 1px solid var(--ck-line);
      }
      .plot svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }
      .grid-line {
        stroke: var(--ck-line);
        stroke-dasharray: 4 4;
        vector-effect: non-scaling-stroke;
      }
      .cursor {
        stroke: var(--primary-text-color);
        stroke-opacity: 0.5;
        vector-effect: non-scaling-stroke;
      }
      .yaxis span {
        position: absolute;
        right: 4px;
        transform: translateY(-50%);
        font-size: 10px;
        color: var(--primary-color);
        opacity: 0.8;
        pointer-events: none;
      }
      .loading {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        font-size: 13px;
      }
      .tip {
        position: absolute;
        top: 4px;
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
      .ticks {
        display: flex;
        justify-content: space-between;
        margin-top: 4px;
        font-size: 11px;
        color: var(--ck-muted);
      }
    `,
  ];
}

define("cellkeeper-pack-card", CellKeeperPackCard);
