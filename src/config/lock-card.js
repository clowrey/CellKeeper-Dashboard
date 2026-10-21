import { html, css, nothing } from "lit";
import { PackCard, baseStyles } from "../overview/base.js";
import { define } from "../context.js";

// custom:cellkeeper-lock-card
//   prefix: ck0
//
// The Configuration view's lock bar. BMS settings only take writes while Settings Unlock is
// on; the HMI locks again after 30 s without a change and says so in Settings Status, along
// with "Settings applied", "Clamped to hard limit" or "locked (unlock to apply)" after a write.

const UNLOCK_S = 30;

function statusTone(status) {
  const s = (status ?? "").toLowerCase();
  if (s.includes("applied")) return "good";
  if (s.includes("clamped")) return "warn";
  if (s.includes("auto-locked") || s.includes("unlock to apply")) return "bad";
  if (s.includes("unlocked")) return "info";
  return "muted";
}

class CellKeeperLockCard extends PackCard {
  watched() {
    return ["switch:settings_unlock", "settings_status"];
  }

  _toggle(unlocked) {
    this.hass.callService("switch", unlocked ? "turn_off" : "turn_on", { entity_id: this.eid("switch:settings_unlock") });
  }

  render() {
    if (!this.hass || !this._config || !this.has("switch:settings_unlock")) return nothing;
    const unlocked = this.str("switch:settings_unlock") === "on";
    const status = this.str("settings_status");
    const left = parseInt(status?.match(/\((\d+)s\)/)?.[1] ?? "", 10);
    const tone = statusTone(status);
    const frac = Number.isFinite(left) ? left / UNLOCK_S : unlocked ? 1 : 0;
    return html`
      <ha-card class=${unlocked ? "open" : ""}>
        <div class="wrap">
          <div class="ring" style="--frac:${frac}">
            <ha-icon icon=${unlocked ? "mdi:lock-open-variant" : "mdi:lock"}></ha-icon>
          </div>
          <div class="text">
            <div class="state">${unlocked ? "Settings unlocked" : "Settings locked"}</div>
            <div class="sub">
              ${unlocked
                ? html`BMS settings can be changed${Number.isFinite(left) ? html` for <b class="num">${left} s</b>` : ""}. Every
                  change restarts the ${UNLOCK_S} s window; then it locks again.`
                : html`BMS settings are read-only. Unlock for ${UNLOCK_S} s to change them; the balance charge
                  schedule doesn't need it.`}
            </div>
          </div>
          ${status && !/^settings (locked|unlocked( \(\d+s\))?)$/i.test(status)
            ? html`<div class="status ${tone} clickable" @click=${() => this.moreInfo("settings_status")}>${status}</div>`
            : ""}
          <button class=${unlocked ? "lock" : "unlock"} @click=${() => this._toggle(unlocked)}>
            <ha-icon icon=${unlocked ? "mdi:lock" : "mdi:lock-open-variant"}></ha-icon>${unlocked ? "Lock now" : "Unlock"}
          </button>
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
      ha-card {
        transition: box-shadow 0.3s, border-color 0.3s;
      }
      ha-card.open {
        border-color: color-mix(in srgb, var(--ck-info) 60%, transparent);
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--ck-info) 40%, transparent);
      }
      .wrap {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px 16px;
        padding: 14px 16px;
      }
      .ring {
        --c: var(--ck-muted);
        flex: none;
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: conic-gradient(var(--c) calc(var(--frac) * 360deg), var(--ck-track) 0);
        position: relative;
      }
      .open .ring {
        --c: var(--ck-info);
      }
      .ring::before {
        content: "";
        position: absolute;
        inset: 4px;
        border-radius: 50%;
        background: var(--card-background-color, var(--ha-card-background, #fff));
      }
      .ring ha-icon {
        position: relative;
        --mdc-icon-size: 22px;
        color: var(--c);
      }
      .text {
        flex: 1 1 260px;
        min-width: 0;
      }
      .state {
        font-size: 16px;
        font-weight: 500;
      }
      .sub {
        font-size: 13px;
        line-height: 1.4;
        color: var(--ck-muted);
        margin-top: 2px;
      }
      .status {
        padding: 4px 12px;
        border-radius: 16px;
        font-size: 13px;
        font-weight: 500;
        color: var(--c);
        background: color-mix(in srgb, var(--c) 14%, transparent);
      }
      .status.good {
        --c: var(--ck-good);
      }
      .status.warn {
        --c: var(--ck-warn);
      }
      .status.bad {
        --c: var(--ck-bad);
      }
      .status.info {
        --c: var(--ck-info);
      }
      .status.muted {
        --c: var(--ck-muted);
      }
      button {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 9px 18px 9px 14px;
        border-radius: 20px;
        border: 0;
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      }
      button ha-icon {
        --mdc-icon-size: 18px;
      }
      button.unlock {
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
      }
      button.lock {
        background: var(--ck-track);
        color: var(--primary-text-color);
      }
    `,
  ];
}

define("cellkeeper-lock-card", CellKeeperLockCard);
