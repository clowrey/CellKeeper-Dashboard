import { html, css, nothing } from "lit";
import { PackCard, baseStyles, fmt } from "../overview/base.js";
import { define } from "../context.js";
import { VISUALS, visualStyles } from "./visuals.js";

// custom:cellkeeper-settings-card
//   prefix: ck0
//   title: Cell voltage window
//   icon: mdi:sine-wave
//   description: what this group of settings does
//   needs_unlock: true          rows can only be changed while Settings Unlock is on
//   visual: voltage | limits | soc | balancing | balance_charge   (optional picture above the rows)
//   rows:
//     - key: number:cell_voltage_soft_min      a number: − / value / + editor
//       name: Soft min
//       help: one line under the name
//       factor: 0.1, unit: V, digits: 1        show and edit in other units (value × factor)
//       confirm: true                          ask again before writing
//     - key: button:calibrate_isolation_zero   a button, pressed after a second tap
//     - key: switch:audio_amplifier            a toggle
//     - key: sensor:isolation_check_age        a read-only value
//
// Settings that can't be written while locked show their value with a lock until the pack is
// unlocked; a write shows "Saving…" until the BMS reports the new value back.

const SAVE_TIMEOUT_MS = 5000;
const CONFIRM_MS = 4000;

function decimals(step) {
  if (!step || step >= 1) return 0;
  return Math.min(4, Math.ceil(-Math.log10(step) - 1e-9));
}

class CellKeeperSettingsCard extends PackCard {
  static properties = { ...PackCard.properties, _pending: { state: true }, _armed: { state: true }, _drafts: { state: true } };

  constructor() {
    super();
    this._pending = {};
    this._drafts = {};
    this._draftTimers = {};
    this._armed = undefined;
  }

  // +/− taps adjust a draft and write it once they stop, so five taps are one write.
  _nudge(row, st, base, delta) {
    const id = st.entity_id;
    const value = (this._drafts[id] ?? base) + delta;
    this._drafts = { ...this._drafts, [id]: value };
    clearTimeout(this._draftTimers[id]);
    this._draftTimers[id] = setTimeout(() => {
      const { [id]: v, ...rest } = this._drafts;
      this._drafts = rest;
      this._write(row, v);
    }, 700);
  }

  setConfig(config) {
    if (!config.rows && !config.visual) throw new Error("cellkeeper-settings-card needs rows or a visual");
    super.setConfig({ rows: [], ...config });
  }

  get unlocked() {
    return this.str("switch:settings_unlock") === "on";
  }

  watched() {
    const visual = VISUALS[this._config.visual];
    return [
      "switch:settings_unlock",
      ...this._config.rows.map((r) => r.key),
      ...(visual ? visual.watched(this) : []),
    ];
  }

  updated(changed) {
    super.updated?.(changed);
    // Clear "Saving…" once the BMS reports the value we wrote.
    for (const [id, p] of Object.entries(this._pending)) {
      if (p.done) continue;
      const v = parseFloat(this.hass.states[id]?.state);
      if (Math.abs(v - p.value) < (p.tolerance ?? 1e-6)) this._finish(id, "saved");
    }
  }

  _finish(id, result) {
    clearTimeout(this._pending[id]?.timer);
    this._pending = { ...this._pending, [id]: { ...this._pending[id], done: result } };
    setTimeout(() => {
      const { [id]: _, ...rest } = this._pending;
      this._pending = rest;
    }, result === "saved" ? 1500 : 4000);
  }

  // Two-step confirm: the first tap arms the row for a few seconds, the second acts.
  _confirm(rowKey, act) {
    if (this._armed === rowKey) {
      this._armed = undefined;
      act();
      return;
    }
    this._armed = rowKey;
    clearTimeout(this._armTimer);
    this._armTimer = setTimeout(() => (this._armed = undefined), CONFIRM_MS);
  }

  async _write(row, shownValue) {
    const st = this.stateObj(row.key);
    if (!st) return;
    const factor = row.factor ?? 1;
    const { min, max, step = 1 } = st.attributes;
    let value = Math.round(shownValue / factor / step) * step;
    if (min !== undefined) value = Math.max(min, value);
    if (max !== undefined) value = Math.min(max, value);
    value = parseFloat(value.toFixed(decimals(step)));
    const id = st.entity_id;
    clearTimeout(this._pending[id]?.timer);
    const timer = setTimeout(() => this._finish(id, "failed"), SAVE_TIMEOUT_MS);
    this._pending = { ...this._pending, [id]: { value, timer, tolerance: step / 2 } };
    try {
      await this.hass.callService("number", "set_value", { entity_id: id, value });
    } catch (e) {
      this._finish(id, "failed");
    }
  }

  _toggleLock() {
    this.hass.callService("switch", this.unlocked ? "turn_off" : "turn_on", {
      entity_id: this.eid("switch:settings_unlock"),
    });
  }

  render() {
    if (!this.hass || !this._config) return nothing;
    const rows = this._config.rows.filter((r) => this.has(r.key));
    const visual = VISUALS[this._config.visual];
    const visualOut = visual ? visual.render(this) : "";
    if (!rows.length && !visualOut) return nothing;
    const lockable = this._config.needs_unlock && rows.some((r) => r.key.startsWith("number:"));
    const locked = lockable && !this.unlocked;
    return html`
      <ha-card>
        <div class="wrap">
          <div class="head">
            ${this._config.icon ? html`<ha-icon icon=${this._config.icon}></ha-icon>` : ""}
            <span class="title">${this._config.title}</span>
            <span class="spacer"></span>
            ${lockable
              ? html`<button class="lockbtn ${locked ? "" : "open"}" @click=${() => this._toggleLock()}>
                  <ha-icon icon=${locked ? "mdi:lock" : "mdi:lock-open-variant"}></ha-icon>${locked ? "Unlock to edit" : "Unlocked"}
                </button>`
              : this._config.needs_unlock === false && rows.some((r) => r.key.startsWith("number:"))
              ? html`<span class="nolock"><ha-icon icon="mdi:lock-open-outline"></ha-icon>No unlock needed</span>`
              : ""}
          </div>
          ${this._config.description ? html`<div class="desc">${this._config.description}</div>` : ""}
          ${visualOut}
          ${rows.length ? html`<div class="rows">${rows.map((r) => this._row(r, locked))}</div>` : ""}
        </div>
      </ha-card>
    `;
  }

  _row(row, locked) {
    const [domain] = row.key.split(":");
    const st = this.stateObj(row.key);
    const name = row.name ?? st.attributes.friendly_name;
    let control;
    if (domain === "number") control = this._numberControl(row, st, locked);
    else if (domain === "button") control = this._buttonControl(row, st);
    else if (domain === "switch") control = this._switchControl(row, st);
    else control = this._valueControl(row, st);
    return html`
      <div class="row ${domain === "sensor" ? "compact" : ""}">
        <div class="text clickable" @click=${() => this.moreInfo(st.entity_id)}>
          <div class="name">${name}</div>
          ${row.help ? html`<div class="help">${row.help}</div>` : ""}
        </div>
        <div class="ctl">${control}</div>
      </div>
    `;
  }

  _numberControl(row, st, locked) {
    const factor = row.factor ?? 1;
    const step = (st.attributes.step ?? 1) * factor;
    const digits = row.digits ?? decimals(step);
    const unit = row.unit ?? st.attributes.unit_of_measurement ?? "";
    const raw = parseFloat(st.state);
    const value = Number.isFinite(raw) ? raw * factor : undefined;
    const draft = this._drafts[st.entity_id];
    const pending = this._pending[st.entity_id];
    const status = pending
      ? html`<span class="status ${pending.done ?? "saving"}"
          >${pending.done === "saved" ? "Saved" : pending.done === "failed" ? "Not applied" : "Saving…"}</span
        >`
      : "";
    // Show what was asked for until the BMS confirms it.
    const shown = draft ?? (pending && !pending.done ? pending.value * factor : value);
    if (locked || value === undefined) {
      return html`${status}<span class="value num">${fmt(this.hass, value, digits)}<span class="unit">${unit}</span></span>
        <ha-icon class="lock" icon="mdi:lock-outline"></ha-icon>`;
    }
    const armed = this._armed === row.key;
    const apply = (v) => (row.confirm ? this._confirm(row.key, () => this._write(row, v)) : this._write(row, v));
    return html`
      ${status}
      <div class="stepper ${armed ? "armed" : ""}">
        <button aria-label="Decrease" @click=${() => this._nudge(row, st, value, -step)} ?hidden=${row.confirm}>−</button>
        <input
          type="number"
          inputmode="decimal"
          step=${step}
          class=${shown !== value ? "draft" : ""}
          .value=${shown.toFixed(digits)}
          @change=${(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) apply(v);
            else e.target.value = value.toFixed(digits);
          }}
          @keydown=${(e) => e.key === "Enter" && e.target.blur()}
        />
        <span class="unit">${unit}</span>
        <button aria-label="Increase" @click=${() => this._nudge(row, st, value, step)} ?hidden=${row.confirm}>+</button>
      </div>
      ${armed ? html`<span class="confirm">Enter again to set</span>` : ""}
    `;
  }

  _buttonControl(row, st) {
    const armed = this._armed === row.key;
    const press = () =>
      this.hass.callService("button", "press", { entity_id: st.entity_id });
    return html`<button
      class="action ${armed ? "armed" : ""} ${row.danger ? "danger" : ""}"
      @click=${() => (row.confirm === false ? press() : this._confirm(row.key, press))}
    >
      ${armed ? "Tap again to confirm" : row.label ?? "Press"}
    </button>`;
  }

  _switchControl(row, st) {
    const on = st.state === "on";
    return html`<button
      class="toggle ${on ? "on" : ""}"
      role="switch"
      aria-checked=${on}
      @click=${() => this.hass.callService("switch", on ? "turn_off" : "turn_on", { entity_id: st.entity_id })}
    >
      <i></i>
    </button>`;
  }

  _valueControl(row, st) {
    const raw = parseFloat(st.state);
    const unit = row.unit ?? st.attributes.unit_of_measurement ?? "";
    const text = Number.isFinite(raw) ? fmt(this.hass, raw * (row.factor ?? 1), row.digits ?? 1) : st.state;
    return html`<span class="value num">${text}<span class="unit">${unit}</span></span>`;
  }

  getGridOptions() {
    return { columns: 12, rows: "auto" };
  }

  static styles = [
    baseStyles,
    visualStyles,
    css`
      .wrap {
        padding: 14px 16px 10px;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 32px;
      }
      .head > ha-icon {
        --mdc-icon-size: 20px;
        color: var(--state-icon-color, var(--primary-color));
      }
      .title {
        font-size: 16px;
        font-weight: 500;
      }
      .spacer {
        flex: 1;
      }
      .desc {
        margin: 4px 0 10px;
        font-size: 13px;
        line-height: 1.45;
        color: var(--ck-muted);
      }
      button {
        font: inherit;
        color: inherit;
        cursor: pointer;
      }
      .lockbtn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 12px 5px 10px;
        border-radius: 16px;
        border: 1px solid var(--ck-line);
        background: transparent;
        font-size: 13px;
        font-weight: 500;
        white-space: nowrap;
      }
      .lockbtn ha-icon,
      .nolock ha-icon {
        --mdc-icon-size: 16px;
      }
      .lockbtn.open {
        color: var(--ck-info);
        border-color: color-mix(in srgb, var(--ck-info) 50%, transparent);
        background: color-mix(in srgb, var(--ck-info) 12%, transparent);
      }
      .nolock {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        color: var(--ck-muted);
      }
      .rows {
        margin: 4px -16px 0;
      }
      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 52px;
        padding: 6px 16px;
        border-top: 1px solid var(--ck-line);
      }
      .row.compact {
        min-height: 36px;
        padding-top: 2px;
        padding-bottom: 2px;
      }
      .text {
        min-width: 0;
        flex: 1;
        margin: -4px -6px;
        padding: 4px 6px;
      }
      .name {
        font-size: 14px;
      }
      .help {
        font-size: 12px;
        line-height: 1.35;
        color: var(--ck-muted);
        margin-top: 2px;
      }
      .ctl {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: none;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .value {
        font-size: 15px;
      }
      .lock {
        --mdc-icon-size: 16px;
        color: var(--ck-muted);
      }
      .stepper {
        display: flex;
        align-items: center;
        border: 1px solid var(--ck-line);
        border-radius: 10px;
        overflow: hidden;
        background: var(--secondary-background-color, rgba(127, 127, 127, 0.06));
      }
      .stepper.armed {
        border-color: var(--ck-warn);
      }
      .stepper button {
        width: 34px;
        height: 34px;
        border: 0;
        background: transparent;
        font-size: 18px;
        line-height: 1;
      }
      .stepper button:hover {
        background: rgba(127, 127, 127, 0.15);
      }
      .stepper input {
        width: 72px;
        height: 34px;
        border: 0;
        padding: 0 2px;
        background: transparent;
        color: var(--primary-text-color);
        font: inherit;
        font-size: 15px;
        text-align: right;
        font-variant-numeric: tabular-nums;
        -moz-appearance: textfield;
      }
      .stepper input::-webkit-outer-spin-button,
      .stepper input::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      .stepper input.draft {
        color: var(--ck-info);
      }
      .stepper input:focus {
        outline: none;
        background: rgba(127, 127, 127, 0.12);
      }
      .stepper .unit {
        min-width: 22px;
        padding-right: 4px;
      }
      .status {
        font-size: 12px;
      }
      .status.saving {
        color: var(--ck-muted);
      }
      .status.saved {
        color: var(--ck-good);
      }
      .status.failed {
        color: var(--ck-bad);
      }
      .confirm {
        font-size: 12px;
        color: var(--ck-warn);
      }
      .action {
        padding: 7px 14px;
        border-radius: 18px;
        border: 1px solid var(--ck-line);
        background: transparent;
        font-size: 13px;
        font-weight: 500;
        color: var(--primary-color);
        white-space: nowrap;
      }
      .action:hover {
        background: rgba(127, 127, 127, 0.1);
      }
      .action.armed {
        color: var(--card-background-color, #fff);
        background: var(--ck-warn);
        border-color: var(--ck-warn);
      }
      .action.danger.armed {
        background: var(--ck-bad);
        border-color: var(--ck-bad);
      }
      .toggle {
        position: relative;
        width: 40px;
        height: 22px;
        border-radius: 11px;
        border: 0;
        background: var(--ck-track);
        padding: 0;
      }
      .toggle i {
        position: absolute;
        top: 3px;
        left: 3px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--primary-text-color);
        opacity: 0.7;
        transition: left 0.2s;
      }
      .toggle.on {
        background: color-mix(in srgb, var(--primary-color) 55%, transparent);
      }
      .toggle.on i {
        left: 21px;
        background: var(--primary-color);
        opacity: 1;
      }
    `,
  ];
}

define("cellkeeper-settings-card", CellKeeperSettingsCard);
