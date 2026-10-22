import { html, css, nothing } from "lit";
import { PackCard, baseStyles, fmt, fmtDuration } from "./base.js";
import { define } from "../context.js";

// custom:cellkeeper-stat-card
//   prefix: ck0
//   kind: temperature | energy | isolation | inverter
//   navigate: detail      optional view path for the card's header link
//
// The Overview's small cards, one per kind: a headline number and the few readings that
// explain it, with a mini chart where it helps.

const KINDS = {
  temperature: {
    title: "Temperature",
    icon: "mdi:thermometer",
    watched: (c) => ["module_temperature_min", "module_temperature_max", ...c._moduleKeys()],
    show: (c) => c.has("module_temperature_max"),
    render: (c) => c._temperature(),
  },
  energy: {
    title: "Energy today",
    icon: "mdi:lightning-bolt",
    watched: () => ["energy_daily_charge", "energy_daily_discharge", "energy_daily_net", "capacity", "pack_internal_voltage"],
    show: (c) => c.has("energy_daily_charge"),
    render: (c) => c._energy(),
  },
  isolation: {
    title: "Isolation",
    icon: "mdi:shield-check-outline",
    watched: () => ["isolation_resistance", "pack_pos_to_chassis", "pack_neg_to_chassis", "isolation_check_age", "pack_internal_voltage", "contactor_state_text"],
    show: (c) => c.has("isolation_resistance"),
    render: (c) => c._isolation(),
  },
  inverter: {
    title: "Inverter link",
    icon: "mdi:swap-horizontal",
    watched: (c) => ["inverter_can_soc", "inverter_can_voltage_limit_min", "inverter_can_voltage_limit_max", "inverter_can_capacity_full", "inverter_can_capacity_remaining", `sensor.${c.prefix}_event_info_inverter_detected`],
    show: (c) => c.has("inverter_can_soc"),
    render: (c) => c._inverter(),
  },
};

function tempColor(t) {
  if (t === undefined) return "var(--ck-muted)";
  if (t < 5) return "var(--ck-info)";
  if (t < 40) return "var(--ck-good)";
  if (t < 50) return "var(--ck-warn)";
  return "var(--ck-bad)";
}

class CellKeeperStatCard extends PackCard {
  setConfig(config) {
    if (!KINDS[config.kind]) throw new Error(`cellkeeper-stat-card: unknown kind ${config.kind}`);
    super.setConfig(config);
  }

  get kind() {
    return KINDS[this._config.kind];
  }

  watched() {
    return this.kind.watched(this);
  }

  _moduleKeys() {
    if (!this.hass) return [];
    const start = `sensor.${this.prefix}_module_temperature_`;
    return Object.keys(this.hass.states)
      .filter((id) => id.startsWith(start) && /^\d+$/.test(id.slice(start.length)))
      .sort((a, b) => parseInt(a.slice(start.length)) - parseInt(b.slice(start.length)))
      .map((id) => id.slice("sensor.".length + this.prefix.length + 1));
  }

  render() {
    if (!this.hass || !this._config || !this.kind.show(this)) return nothing;
    const { title, icon } = this.kind;
    const nav = this._config.navigate;
    return html`
      <ha-card>
        <div class="wrap">
          <div class="head ${nav ? "clickable" : ""}" @click=${() => nav && this.navigateView(nav)}>
            <ha-icon icon=${icon}></ha-icon>
            <span class="label">${title}</span>
            ${nav ? html`<ha-icon class="chev" icon="mdi:chevron-right"></ha-icon>` : ""}
          </div>
          ${this.kind.render(this)}
        </div>
      </ha-card>
    `;
  }

  _temperature() {
    const lo = this.num("module_temperature_min");
    const hi = this.num("module_temperature_max");
    const unit = this.tempUnit("module_temperature_max");
    const mods = this._moduleKeys().map((k) => ({ k, t: this.num(k), c: this.tempC(k), n: k.match(/\d+$/)[0] }));
    const ts = mods.map((m) => m.t).filter((t) => t !== undefined);
    const floor = Math.min(...ts, lo ?? Infinity) - 3;
    const ceil = Math.max(...ts, hi ?? -Infinity) + 1;
    return html`
      <div class="headline clickable" @click=${() => this.moreInfo("module_temperature_max")}>
        <span class="big num" style="color:${tempColor(this.tempC("module_temperature_max"))}">${fmt(this.hass, lo, 1)}–${fmt(this.hass, hi, 1)}<span class="unit">${unit}</span></span>
      </div>
      <div class="sub">Coolest to warmest module · spread ${fmt(this.hass, hi - lo, 1)} ${unit}</div>
      ${mods.length
        ? html`<div class="cols">
            ${mods.map(
              (m) => html`<div class="col clickable" title="Module ${m.n}: ${fmt(this.hass, m.t, 1)} ${unit}" @click=${() => this.moreInfo(m.k)}>
                <div class="v num">${fmt(this.hass, m.t, 0)}°</div>
                <div class="track"><div class="fill" style="height:${m.t === undefined ? 0 : ((m.t - floor) / (ceil - floor)) * 100}%;background:${tempColor(m.c)}"></div></div>
                <div class="n">${m.n}</div>
              </div>`
            )}
          </div>`
        : ""}
    `;
  }

  _energy() {
    const chg = this.num("energy_daily_charge");
    const dis = this.num("energy_daily_discharge");
    const net = this.num("energy_daily_net") ?? (chg ?? 0) - (dis ?? 0);
    const cap = this.num("capacity");
    const v = this.num("pack_internal_voltage");
    const packKwh = cap && v ? (cap * v) / 1000 : undefined;
    const max = Math.max(chg ?? 0, dis ?? 0, 0.001);
    const bar = (key, value, label, color) => html`
      <div class="ebar clickable" @click=${() => this.moreInfo(key)}>
        <div class="erow"><span>${label}</span><span class="num">${fmt(this.hass, value, 2)} kWh</span></div>
        <div class="track h"><div class="fill" style="width:${((value ?? 0) / max) * 100}%;background:${color}"></div></div>
      </div>
    `;
    return html`
      <div class="headline clickable" @click=${() => this.moreInfo("energy_daily_net")}>
        <span class="big num">${net > 0 ? "+" : ""}${fmt(this.hass, net, 2)}<span class="unit">kWh net</span></span>
      </div>
      ${bar("energy_daily_charge", chg, "Charged", "var(--ck-charge)")}
      ${bar("energy_daily_discharge", dis, "Discharged", "var(--ck-discharge)")}
      ${packKwh && dis !== undefined
        ? html`<div class="sub">≈ ${fmt(this.hass, dis / packKwh, 2)} full cycles of ${fmt(this.hass, packKwh, 1)} kWh</div>`
        : ""}
    `;
  }

  _isolation() {
    const r = this.num("isolation_resistance");
    const unit = this.unit("isolation_resistance") || "MΩ";
    const ohms = r === undefined ? undefined : r * ({ "MΩ": 1e6, "kΩ": 1e3, "Ω": 1 }[unit] ?? 1e6);
    const v = this.num("pack_internal_voltage");
    const perVolt = ohms !== undefined && v ? ohms / v : undefined;
    // IEC 61851 / ISO 6469: ≥ 500 Ω/V is healthy for DC, below 100 Ω/V is a fault.
    const rating = perVolt === undefined ? "dim" : perVolt >= 500 ? "good" : perVolt >= 100 ? "warn" : "bad";
    const ratingText = { good: "Healthy (≥ 500 Ω/V)", warn: "Low (< 500 Ω/V)", bad: "Fault (< 100 Ω/V)", dim: "" }[rating];
    const pos = this.num("pack_pos_to_chassis");
    const neg = this.num("pack_neg_to_chassis");
    const age = this.num("isolation_check_age");
    const closed = this.str("contactor_state_text") === "CLOSED";
    return html`
      <div class="headline clickable" @click=${() => this.moreInfo("isolation_resistance")}>
        <span class="big num ${rating}">${r >= 100 && unit === "MΩ" ? "≥ " : ""}${fmt(this.hass, r, r >= 10 ? 0 : 2)}<span class="unit">${unit}</span></span>
      </div>
      <div class="sub ${rating}">${ratingText}</div>
      <div class="rows">
        <div class="row clickable" @click=${() => this.moreInfo("pack_pos_to_chassis")}><span>Pack + to chassis</span><span class="num">${fmt(this.hass, pos, 1)} V</span></div>
        <div class="row clickable" @click=${() => this.moreInfo("pack_neg_to_chassis")}><span>Pack − to chassis</span><span class="num">${fmt(this.hass, neg, 1)} V</span></div>
        ${age !== undefined
          ? html`<div class="row clickable" @click=${() => this.moreInfo("isolation_check_age")}>
              <span>${closed ? "Last open-contactor check" : "Checked"}</span><span class="num">${age < 60 ? "just now" : `${fmtDuration(age / 3600)} ago`}</span>
            </div>`
          : ""}
      </div>
    `;
  }

  _inverter() {
    const soc = this.num("inverter_can_soc");
    const vmin = this.num("inverter_can_voltage_limit_min");
    const vmax = this.num("inverter_can_voltage_limit_max");
    const full = this.num("inverter_can_capacity_full");
    const rem = this.num("inverter_can_capacity_remaining");
    const detected = this.hass.states[`sensor.${this.prefix}_event_info_inverter_detected`]?.state?.includes("INFO");
    return html`
      <div class="headline clickable" @click=${() => this.moreInfo("inverter_can_soc")}>
        <span class="big num">${fmt(this.hass, soc, 0)}<span class="unit">% SOC sent</span></span>
      </div>
      <div class="sub ${detected ? "good" : ""}">${detected ? "Inverter detected on CAN" : "No inverter seen yet"}</div>
      <div class="rows">
        <div class="row clickable" @click=${() => this.moreInfo("inverter_can_voltage_limit_min")}>
          <span>Voltage window</span><span class="num">${fmt(this.hass, vmin, 1)}–${fmt(this.hass, vmax, 1)} V</span>
        </div>
        ${full !== undefined
          ? html`<div class="row clickable" @click=${() => this.moreInfo("inverter_can_capacity_remaining")}>
              <span>Capacity</span><span class="num">${fmt(this.hass, rem, 0)} / ${fmt(this.hass, full, 0)} Ah</span>
            </div>`
          : ""}
      </div>
    `;
  }

  getGridOptions() {
    return { columns: 12, rows: "auto" };
  }

  static styles = [
    baseStyles,
    css`
      .wrap {
        padding: 14px 16px 14px;
        display: flex;
        flex-direction: column;
        height: 100%;
        box-sizing: border-box;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: -4px -6px 6px;
        padding: 4px 6px;
      }
      .head ha-icon {
        --mdc-icon-size: 18px;
        color: var(--ck-muted);
      }
      .head .chev {
        margin-left: auto;
      }
      .headline {
        margin: 0 -4px;
        padding: 0 4px;
      }
      .big {
        font-size: 28px;
      }
      .sub {
        font-size: 12px;
        color: var(--ck-muted);
        margin: 2px 0 10px;
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
      .cols {
        display: flex;
        gap: 6px;
        margin-top: auto;
      }
      .col {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        padding: 2px 0;
        min-width: 0;
      }
      .col .v {
        font-size: 11px;
      }
      .col .n {
        font-size: 10px;
        color: var(--ck-muted);
      }
      .track {
        position: relative;
        width: 100%;
        max-width: 18px;
        height: 54px;
        border-radius: 4px;
        background: var(--ck-track);
        overflow: hidden;
      }
      .track .fill {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        border-radius: 4px;
        transition: height 0.6s ease, width 0.6s ease;
      }
      .track.h {
        max-width: none;
        height: 8px;
      }
      .track.h .fill {
        top: 0;
        right: auto;
      }
      .ebar {
        margin: 0 -4px 8px;
        padding: 2px 4px;
      }
      .erow {
        display: flex;
        justify-content: space-between;
        font-size: 13px;
        margin-bottom: 4px;
      }
      .rows {
        margin: 0 -6px;
      }
      .row {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        font-size: 13px;
        padding: 4px 6px;
      }
      .row span:first-child {
        color: var(--ck-muted);
      }
    `,
  ];
}

define("cellkeeper-stat-card", CellKeeperStatCard);
