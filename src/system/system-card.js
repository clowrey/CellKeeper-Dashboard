import { html, css, nothing } from "lit";
import { PackCard, baseStyles, fmt, fmtDuration } from "../overview/base.js";
import { define } from "../context.js";
import { RUNNING_VERSION, dashboardUpdate, sameVersion } from "../update.js";

// custom:cellkeeper-system-card
//   prefix: ck0
//   kind: link | bms | hmi | dashboard
//
// link: BMS -> HMI -> Home Assistant, and how fresh the data is at each hop.
// bms:  the BMS board, its uptime, and its supply rails against the firmware's limits.
// hmi:  the display: firmware, Wi-Fi, health, backlight, web page and restart.
// dashboard: this dashboard's version and, when installed through HACS, its update.

// Supply rails and their limits from the firmware (bms/config/limits.h), in volts.
const RAILS = [
  { key: "supply_voltage_3v3", name: "3.3 V logic", min: 3.2, max: 3.6, event: "3v3" },
  { key: "supply_voltage_5v", name: "5 V", min: 4.4, max: 5.6, event: "5v" },
  { key: "supply_voltage_12v", name: "12 V input", min: 11, max: 16, event: "12v" },
  { key: "supply_voltage_contactor", name: "Contactor supply", min: 12, max: 16, hardMin: 10, event: "ctr_supply" },
];

// BMS board temperatures from the HMI (registers 70, 57, 58), with amber/red above these.
const BOARD_TEMPS = [
  { key: "bms_chip_temperature", name: "Controller chip", warn: 70, bad: 85, hint: "the chip's own sensor, a few °C accurate" },
  { key: "shunt_die_temperature", name: "Shunt chip", warn: 85, bad: 105, hint: "current sensor die" },
  { key: "shunt_ntc_temperature", name: "Shunt", warn: 70, bad: 90, hint: "NTC on the current shunt" },
];
// An open (unfitted) NTC reads far below anything real.
const NO_SENSOR_C = -40;

// The pack's voltages as the BMS measures them, for the BMS card.
const PACK_VOLTAGES = [
  { key: "pack_internal_voltage", name: "Pack (measured)" },
  { key: "pack_internal_voltage_bmb", name: "Sum of the cells" },
  { key: "pack_output_voltage", name: "Output" },
  { key: "contactor_voltage_positive", name: "Across + contactor" },
  { key: "contactor_voltage_negative", name: "Across − contactor" },
];

const STALE_S = 30; // a BMS reading older than this means the HMI has lost the BMS

function ageText(s) {
  if (s === undefined) return "–";
  if (s < 60) return `${Math.max(0, Math.round(s))} s ago`;
  return `${fmtDuration(s / 3600)} ago`;
}

function rssiQuality(dbm) {
  if (dbm === undefined) return { bars: 0, text: "", tone: "muted" };
  if (dbm >= -60) return { bars: 4, text: "Excellent", tone: "good" };
  if (dbm >= -70) return { bars: 3, text: "Good", tone: "good" };
  if (dbm >= -80) return { bars: 2, text: "Fair", tone: "warn" };
  return { bars: 1, text: "Weak", tone: "bad" };
}

class CellKeeperSystemCard extends PackCard {
  static properties = { ...PackCard.properties, _armed: { state: true }, _tick: { state: true }, _installing: { state: true } };

  setConfig(config) {
    if (!["link", "bms", "hmi", "dashboard"].includes(config.kind)) {
      throw new Error("cellkeeper-system-card: kind is link, bms, hmi or dashboard");
    }
    super.setConfig(config);
  }

  connectedCallback() {
    super.connectedCallback();
    // Ages tick on their own; re-render every few seconds.
    if (this._config?.kind === "link") this._timer = setInterval(() => (this._tick = Date.now()), 5000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this._timer);
  }

  watched() {
    return {
      link: ["millis", "uptime_pico", "uptime_hmi", "system_state_text", "wifi_rssi"],
      bms: ["serial", "board_revision", "board_strap_counts", "uptime_pico", "system_state_text", "bms_firmware",
        "system_state", "system_request", "system_request_text", "contactor_state", "contactor_state_text",
        ...PACK_VOLTAGES.map((v) => v.key),
        ...RAILS.map((r) => r.key), ...BOARD_TEMPS.map((t) => t.key)],
      dashboard: [dashboardUpdate(this.hass)?.entity_id].filter(Boolean),
      hmi: ["uptime_hmi", "hmi_firmware", "internal_temperature", "heap_free", "heap_max_block", "loop_time", "wifi_ssid", "wifi_ip", "wifi_rssi", "bssid", "light:display_backlight", "button:hmi_restart"],
    }[this._config.kind];
  }

  shouldUpdate(changed) {
    return changed.has("_tick") || super.shouldUpdate(changed);
  }

  get device() {
    const id = this.hass.entities?.[this.eid("soc")]?.device_id ?? this.hass.entities?.[this.eid("uptime_hmi")]?.device_id;
    return id ? { id, ...this.hass.devices?.[id] } : undefined;
  }

  // Seconds since the entity last reported, or undefined if it isn't reporting.
  _age(key) {
    const st = this.stateObj(key);
    if (!st || st.state === "unavailable" || st.state === "unknown") return undefined;
    return (Date.now() - new Date(st.last_updated).getTime()) / 1000;
  }

  render() {
    if (!this.hass || !this._config) return nothing;
    const body = {
      link: () => this._link(),
      bms: () => this._bms(),
      hmi: () => this._hmi(),
      dashboard: () => this._dashboard(),
    }[this._config.kind]();
    return body ? html`<ha-card>${body}</ha-card>` : nothing;
  }

  // ---- link ----

  _link() {
    const hmiOnline = this.str("uptime_hmi") !== undefined;
    const bmsAge = this._age("millis") ?? this._age("uptime_pico");
    const bmsOk = hmiOnline && bmsAge !== undefined && bmsAge < STALE_S;
    const rssi = this.num("wifi_rssi");
    const q = rssiQuality(rssi);
    const node = (icon, name, sub, tone, click) => html`
      <div class="node ${tone} ${click ? "clickable" : ""}" @click=${click ?? (() => {})}>
        <div class="nicon"><ha-icon icon=${icon}></ha-icon></div>
        <div class="ntext"><div class="nname">${name}</div><div class="nsub">${sub}</div></div>
      </div>`;
    const wire = (ok, label) => html`<div class="wire ${ok ? "ok" : "down"}"><span>${label}</span></div>`;
    const state = this.str("system_state_text");
    return html`
      <div class="chain">
        ${node(
          "cellkeeper:battery",
          "BMS",
          bmsOk ? state ? state[0] + state.slice(1).toLowerCase() : "Reporting" : hmiOnline ? "Not reporting" : "Unknown",
          bmsOk ? "good" : hmiOnline ? "bad" : "muted",
          () => this.moreInfo("system_state_text")
        )}
        ${wire(
          bmsOk,
          bmsOk
            ? `serial · ${ageText(bmsAge)}`
            : !hmiOnline
            ? "unknown"
            : bmsAge !== undefined
            ? `no data for ${ageText(bmsAge).replace(" ago", "")}`
            : "no data"
        )}
        ${node("mdi:monitor-dashboard", "HMI", hmiOnline ? `Up ${fmtDuration(this.numIn("uptime_hmi", "s") / 3600)}` : "Offline", hmiOnline ? "good" : "bad", () => this.moreInfo("uptime_hmi"))}
        ${wire(hmiOnline, hmiOnline ? `Wi-Fi${rssi !== undefined ? ` · ${q.text.toLowerCase()} ${fmt(this.hass, rssi, 0)} dBm` : ""}` : "offline")}
        ${node("mdi:home-assistant", "Home Assistant", "This page", "good")}
      </div>
    `;
  }

  // Firmware row: "dab3751 · 2026-10-22 00:39 UTC" from the HMI's BMS/HMI Firmware sensors.
  // missing: what to say when there is nothing to show.
  _firmware(key, missing) {
    const st = this.stateObj(key);
    const text = this.str(key);
    if (!st || !text || text === "unknown") {
      if (!missing) return "";
      return html`<div class="clickable" @click=${() => st && this.moreInfo(key)}>
        <span>Firmware</span><i class="dim">${!st ? missing.noSensor : missing.notReported}</i>
      </div>`;
    }
    const [build, time] = text.split(" · ");
    const dirty = build.endsWith("-dirty");
    return html`<div class="clickable" @click=${() => this.moreInfo(key)} title="Firmware commit and build time">
      <span>Firmware</span><b class="num mono">${dirty ? build.slice(0, -6) : build}</b>
      ${dirty ? html`<i class="tag warn">uncommitted build</i>` : ""}
      ${time ? html`<i class="dim">built ${this._buildTime(time)}</i>` : ""}
    </div>`;
  }

  // "2026-10-22 00:39 UTC" in the viewer's time zone and locale
  _buildTime(text) {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}) UTC$/.exec(text);
    if (!m) return text;
    const d = new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]));
    return d.toLocaleString(this.hass.locale?.language, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  // ---- BMS ----

  _bms() {
    const serial = this.str("serial");
    const rev = this.str("board_revision");
    const up = this.numIn("uptime_pico", "s");
    const started = up !== undefined ? new Date(Date.now() - up * 1000) : undefined;
    const rails = RAILS.filter((r) => this.has(r.key));
    return html`
      <div class="wrap">
        <div class="dhead">
          <ha-icon icon="cellkeeper:battery"></ha-icon>
          <div>
            <div class="dname">BMS controller</div>
            <div class="dsub">${["CellKeeper", rev && `board ${rev}`].filter(Boolean).join(" · ")}</div>
          </div>
          ${this.device?.id
            ? html`<a class="act right" href="/config/devices/device/${this.device.id}" title="Every sensor of this pack in Home Assistant"
                ><ha-icon icon="mdi:format-list-bulleted"></ha-icon>All sensors</a
              >`
            : ""}
        </div>
        <div class="facts">
          ${up !== undefined
            ? html`<div class="clickable" @click=${() => this.moreInfo("uptime_pico")}>
                <span>Up</span><b>${fmtDuration(up / 3600) || "under a minute"}</b>
                <i class="dim">since ${started.toLocaleString(this.hass.locale?.language, { weekday: "short", hour: "2-digit", minute: "2-digit" })}</i>
              </div>`
            : ""}
          ${this._firmware("bms_firmware", {
            noSensor: "not shown by this HMI firmware",
            notReported: "not reported by this BMS firmware",
          })}
          ${serial ? html`<div class="clickable" @click=${() => this.moreInfo("serial")}><span>Serial</span><b class="num mono">${serial}</b></div>` : ""}
          ${rev
            ? html`<div class="clickable" @click=${() => this.moreInfo("board_strap_counts")}>
                <span>Board</span><b>${rev}</b>${this.has("board_strap_counts") ? html`<i class="dim">strap reading ${fmt(this.hass, this.num("board_strap_counts"), 1)}</i>` : ""}
              </div>`
            : ""}
        </div>
        ${this._state()}
        ${this._packVoltages()}
        ${rails.length
          ? html`<div class="label sect">Supply rails</div>
              ${rails.map((r) => this._rail(r))}
              <div class="note">
                The marks are the firmware's trip points: outside the green range a supply event is raised.
              </div>`
          : ""}
        ${this._boardTemps()}
      </div>
    `;
  }

  // System and contactor state as text with the BMS's numeric code, and any pending request.
  _state() {
    const row = (label, textKey, codeKey) => {
      const text = this.str(textKey);
      const code = this.num(codeKey);
      if (text === undefined && code === undefined) return "";
      return html`<div class="clickable" @click=${() => this.moreInfo(textKey)}>
        <span>${label}</span><b>${text ?? "–"}</b>${code !== undefined ? html`<i class="dim">code ${fmt(this.hass, code, 0)}</i>` : ""}
      </div>`;
    };
    const request = this.str("system_request_text");
    const out = [row("State", "system_state_text", "system_state"), row("Contactors", "contactor_state_text", "contactor_state")];
    if (request || this.num("system_request") !== undefined) out.push(row("Request", "system_request_text", "system_request"));
    return out.some((r) => r) ? html`<div class="facts">${out}</div>` : "";
  }

  // The pack voltages the BMS measures, in V whatever unit the sensors show.
  _packVoltages() {
    const rows = PACK_VOLTAGES.map((v) => ({ ...v, value: this.numIn(v.key, "V") })).filter((v) => this.has(v.key));
    if (!rows.length) return "";
    return html`<div class="label sect">Pack voltages</div>
      <div class="kv">
        ${rows.map(
          (v) => html`<div class="clickable" @click=${() => this.moreInfo(v.key)}>
            <span>${v.name}</span><b class="num">${fmt(this.hass, v.value, v.value !== undefined && Math.abs(v.value) < 10 ? 3 : 1)} V</b>
          </div>`
        )}
      </div>`;
  }

  // Controller chip and current shunt temperatures, where the HMI reports them.
  _boardTemps() {
    const temps = BOARD_TEMPS.map((t) => ({ ...t, v: this.num(t.key), c: this.tempC(t.key), u: this.tempUnit(t.key) })).filter(
      (t) => t.v !== undefined
    );
    if (!temps.length) return "";
    return html`<div class="label sect">Board temperatures</div>
      <div class="health">
        ${temps.map((t) =>
          t.c < NO_SENSOR_C
            ? this._meter(t.key, t.name, t.v, "–", undefined, "muted", `no sensor connected (reads ${fmt(this.hass, t.v, 0)} ${t.u})`)
            : this._meter(t.key, t.name, t.v, `${fmt(this.hass, t.v, 1)} ${t.u}`,
                t.c === undefined ? undefined : Math.max(0, Math.min(1, t.c / 100)),
                t.c === undefined ? "muted" : t.c > t.bad ? "bad" : t.c > t.warn ? "warn" : "good", t.hint)
        )}
      </div>`;
  }

  _rail(r) {
    const v = this.numIn(r.key, "V");
    const lo = (r.hardMin ?? r.min) - (r.max - r.min) * 0.25;
    const hi = r.max + (r.max - r.min) * 0.25;
    const pct = (x) => ((Math.max(lo, Math.min(hi, x)) - lo) / (hi - lo)) * 100;
    const tone = v === undefined ? "muted" : v < (r.hardMin ?? r.min) || v > r.max ? "bad" : v < r.min ? "warn" : "good";
    const eventIds = Object.keys(this.hass.states).filter((id) =>
      id.startsWith(`sensor.${this.prefix}_event_`) && id.includes(`_${r.event}_`)
    );
    const active = eventIds.find((id) => /^(INFO|WARNING|CRITICAL|FATAL) /.test(this.hass.states[id].state));
    // The firmware's trip points, marked and labelled under the bar.
    const trips = [r.hardMin, r.min, r.max].filter((x) => x !== undefined);
    const digits = (x) => (Number.isInteger(x) ? 0 : Number.isInteger(x * 10) ? 1 : 2);
    return html`
      <div class="rail clickable" @click=${() => this.moreInfo(r.key)}>
        <span class="rname">${r.name}</span>
        <div class="rscale">
          ${v !== undefined ? html`<i class="tri ${tone}" style="left:${pct(v)}%"></i>` : ""}
          <div class="rbar">
            ${r.hardMin !== undefined ? html`<i class="zone warn" style="left:${pct(r.hardMin)}%;width:${pct(r.min) - pct(r.hardMin)}%"></i>` : ""}
            <i class="zone good" style="left:${pct(r.min)}%;width:${pct(r.max) - pct(r.min)}%"></i>
            ${trips.map((x) => html`<i class="trip" style="left:${pct(x)}%"></i>`)}
          </div>
          <div class="rticks">
            ${trips.map((x) => html`<span class="num" style="left:${pct(x)}%">${fmt(this.hass, x, digits(x))}</span>`)}
          </div>
        </div>
        <span class="rv num ${tone}">${fmt(this.hass, v, r.max < 6 ? 3 : 2)} V</span>
        ${active ? html`<span class="ralert">${this.hass.states[active].state}</span>` : ""}
      </div>
    `;
  }

  // ---- HMI ----

  _press() {
    if (this._armed) {
      this._armed = false;
      this.hass.callService("button", "press", { entity_id: this.eid("button:hmi_restart") });
      return;
    }
    this._armed = true;
    clearTimeout(this._armTimer);
    this._armTimer = setTimeout(() => (this._armed = false), 4000);
  }

  _hmi() {
    const d = this.device;
    const up = this.numIn("uptime_hmi", "s");
    const temp = this.num("internal_temperature");
    const tempC = this.tempC("internal_temperature");
    const free = this.numIn("heap_free", "B");
    const block = this.numIn("heap_max_block", "B");
    const loop = this.numIn("loop_time", "ms");
    const rssi = this.num("wifi_rssi");
    const q = rssiQuality(rssi);
    const ip = this.str("wifi_ip");
    const url = d?.configuration_url ?? (ip ? `http://${ip}` : undefined);
    const light = this.stateObj("light:display_backlight");
    const brightness = light?.state === "on" ? Math.round(((light.attributes.brightness ?? 255) / 255) * 100) : 0;
    const sw = d?.sw_version?.match(/^(.*?) \((ESPHome [^)]+)\)$/);
    const kb = (b) => (b === undefined ? "–" : `${fmt(this.hass, b / 1024, 1)} KB`);
    return html`
      <div class="wrap">
        <div class="dhead">
          <ha-icon icon="mdi:monitor-dashboard"></ha-icon>
          <div>
            <div class="dname">HMI display${d?.name_by_user || d?.name ? html` <span class="dim">${d.name_by_user || d.name}</span>` : ""}</div>
            <div class="dsub">${[d?.model, sw ? `CellKeeper ${sw[1]}` : d?.sw_version, sw?.[2]].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
        <div class="actions">
          ${url ? html`<a class="act" href=${url} target="_blank" rel="noreferrer"><ha-icon icon="mdi:open-in-new"></ha-icon>Web page</a>` : ""}
          ${this.has("button:hmi_restart")
            ? html`<button class="act ${this._armed ? "armed" : ""}" @click=${() => this._press()}>
                <ha-icon icon="mdi:restart"></ha-icon>${this._armed ? "Tap again to restart" : "Restart"}
              </button>`
            : ""}
        </div>
        <div class="facts">
          ${up !== undefined ? html`<div class="clickable" @click=${() => this.moreInfo("uptime_hmi")}><span>Up</span><b>${fmtDuration(up / 3600) || "under a minute"}</b></div>` : ""}
          ${this.has("hmi_firmware") ? this._firmware("hmi_firmware") : ""}
        </div>

        <div class="label sect">Wi-Fi</div>
        <div class="wifi clickable" @click=${() => this.moreInfo("wifi_rssi")}>
          <span class="bars ${q.tone}">${[1, 2, 3, 4].map((b) => html`<i class=${b <= q.bars ? "on" : ""} style="height:${b * 25}%"></i>`)}</span>
          <div>
            <div><b>${this.str("wifi_ssid") ?? "–"}</b> <span class="${q.tone}">${q.text}</span> <span class="dim num">${fmt(this.hass, rssi, 0)} dBm</span></div>
            <div class="dim small num">${[ip, this.str("bssid") && `AP ${this.str("bssid")}`].filter(Boolean).join(" · ")}</div>
          </div>
        </div>

        <div class="label sect">Health</div>
        <div class="health">
          ${this._meter("internal_temperature", "P4 temperature", temp, `${fmt(this.hass, temp, 1)} ${this.tempUnit("internal_temperature")}`,
            tempC === undefined ? undefined : tempC / 100, tempC === undefined ? "muted" : tempC > 80 ? "bad" : tempC > 65 ? "warn" : "good")}
          ${this._meter("heap_free", "Free memory", free, kb(free), undefined, free < 10240 ? "bad" : free < 20480 ? "warn" : "good",
            block !== undefined ? `largest block ${kb(block)}` : "")}
          ${this._meter("loop_time", "Loop time", loop, `${fmt(this.hass, loop, 0)} ms`, loop === undefined ? 0 : Math.min(1, loop / 100), loop > 80 ? "bad" : loop > 60 ? "warn" : "good", "time for one pass of the HMI's main loop")}
        </div>

        ${light
          ? html`<div class="label sect">Display</div>
              <div class="bl">
                <button class="toggle ${light.state === "on" ? "on" : ""}" @click=${() =>
                  this.hass.callService("light", light.state === "on" ? "turn_off" : "turn_on", { entity_id: light.entity_id })}>
                  <i></i>
                </button>
                <ha-icon icon=${light.state === "on" ? "mdi:brightness-6" : "mdi:brightness-4"}></ha-icon>
                <input type="range" min="1" max="100" .value=${String(brightness || 1)} ?disabled=${light.state !== "on"}
                  @change=${(e) => this.hass.callService("light", "turn_on", { entity_id: light.entity_id, brightness_pct: +e.target.value })} />
                <span class="num blv">${light.state === "on" ? `${brightness} %` : "Off"}</span>
              </div>`
          : ""}
      </div>
    `;
  }

  // ---- dashboard ----

  _dashboard() {
    const up = dashboardUpdate(this.hass);
    const a = up?.attributes ?? {};
    const installed = a.installed_version;
    const latest = a.latest_version;
    // The version installed when this page loaded: if HACS installs another, the page needs a reload.
    if (installed && this._installedAtLoad === undefined) this._installedAtLoad = installed;
    const updated = installed && this._installedAtLoad && installed !== this._installedAtLoad;
    const busy = a.in_progress === true || typeof a.in_progress === "number" || this._installing;
    if (this._installing && (updated || up?.state === "off")) this._installing = false;
    const available = up?.state === "on" && !updated;
    const install = async () => {
      this._installing = true;
      try {
        await this.hass.callService("update", "install", { entity_id: up.entity_id });
      } catch (err) {
        this._installing = false;
        throw err;
      }
    };
    return html`
      <div class="wrap">
        <div class="dhead">
          <ha-icon icon="mdi:view-dashboard-outline"></ha-icon>
          <div>
            <div class="dname">Dashboard</div>
            <div class="dsub">CellKeeper Dashboard${up ? " · HACS" : ""}</div>
          </div>
        </div>
        <div class="facts">
          <div class=${up ? "clickable" : ""} @click=${() => up && this.moreInfo(up.entity_id)} title=${up ? "Release notes and update" : ""}>
            <span>Version</span><b class="num mono">${installed ?? (RUNNING_VERSION ? `v${RUNNING_VERSION}` : "–")}</b>
            ${available
              ? html`<i class="tag info">${latest} available</i>`
              : updated
                ? html`<i class="tag info">updated, reload to use it</i>`
                : up
                  ? html`<i class="tag good">up to date</i>`
                  : ""}
          </div>
          ${installed && RUNNING_VERSION && !sameVersion(installed, RUNNING_VERSION) && !updated
            ? html`<div><span></span><i class="dim">this page runs v${RUNNING_VERSION}</i></div>`
            : ""}
          ${!up ? html`<div><span></span><i class="dim">Not installed through HACS, so there's no update check.</i></div>` : ""}
        </div>
        ${up
          ? html`<div class="actions">
              ${available
                ? html`<button class="act primary" ?disabled=${busy} @click=${install}>
                    <ha-icon icon=${busy ? "mdi:progress-download" : "mdi:download"}></ha-icon>${busy ? "Updating…" : `Update to ${latest}`}
                  </button>`
                : ""}
              ${updated
                ? html`<button class="act primary" @click=${() => location.reload()}>
                    <ha-icon icon="mdi:refresh"></ha-icon>Reload
                  </button>`
                : ""}
              <button class="act" @click=${() => this.moreInfo(up.entity_id)}>
                <ha-icon icon="mdi:text-box-outline"></ha-icon>Release notes
              </button>
            </div>`
          : ""}
      </div>
    `;
  }

  _meter(key, name, value, text, frac, tone, hint) {
    if (value === undefined && !this.has(key)) return "";
    return html`<div class="meter clickable" @click=${() => this.moreInfo(key)}>
      <div class="mtop"><span>${name}</span><b class="num ${tone}">${text}</b></div>
      ${frac !== undefined ? html`<div class="mbar"><i class=${tone} style="width:${Math.max(2, frac * 100)}%"></i></div>` : ""}
      ${hint ? html`<div class="dim small">${hint}</div>` : ""}
    </div>`;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  static styles = [
    baseStyles,
    css`
      .wrap {
        padding: 16px 18px 14px;
      }
      .dim {
        color: var(--ck-muted);
      }
      .small {
        font-size: 12px;
      }
      .mono {
        font-family: var(--code-font-family, monospace);
        font-size: 12px;
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
      .sect {
        margin: 16px 0 6px;
      }
      .note {
        margin-top: 6px;
        font-size: 12px;
        color: var(--ck-muted);
      }

      /* link chain */
      .chain {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px 0;
        padding: 14px 18px;
      }
      .node {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 10px 6px 6px;
        border-radius: 12px;
      }
      .nicon {
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background: color-mix(in srgb, var(--c, var(--ck-muted)) 16%, transparent);
        color: var(--c, var(--ck-muted));
      }
      .node.good {
        --c: var(--ck-good);
      }
      .node.bad {
        --c: var(--ck-bad);
      }
      .nname {
        font-size: 14px;
        font-weight: 500;
      }
      .nsub {
        font-size: 12px;
        color: var(--c, var(--ck-muted));
      }
      .wire {
        flex: 1 1 60px;
        min-width: 60px;
        position: relative;
        height: 30px;
        display: flex;
        align-items: flex-end;
        justify-content: center;
      }
      .wire::before {
        content: "";
        position: absolute;
        left: 4px;
        right: 4px;
        top: 50%;
        border-top: 2px solid var(--ck-good);
      }
      .wire.down::before {
        border-top: 2px dashed var(--ck-bad);
      }
      .wire span {
        position: relative;
        top: 2px;
        font-size: 11px;
        color: var(--ck-muted);
        white-space: nowrap;
      }
      ha-card {
        container-type: inline-size;
      }
      /* Narrow cards: the chain runs down the card instead of across it. */
      @container (max-width: 560px) {
        .chain {
          flex-direction: column;
          align-items: stretch;
          gap: 0;
        }
        .wire {
          flex: none;
          height: 28px;
          align-items: center;
          justify-content: flex-start;
          padding-left: 58px;
        }
        .wire::before {
          left: 24px;
          right: auto;
          top: 0;
          bottom: 0;
          border-top: 0;
          border-left: 2px solid var(--ck-good);
        }
        .wire.down::before {
          border-top: 0;
          border-left: 2px dashed var(--ck-bad);
        }
        .wire span {
          top: 0;
        }
      }

      /* device cards */
      .dhead {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .dhead > ha-icon {
        --mdc-icon-size: 28px;
        color: var(--state-icon-color, var(--primary-color));
      }
      .dname {
        font-size: 17px;
        font-weight: 500;
      }
      .dname .dim {
        font-weight: 400;
        font-size: 14px;
      }
      .dsub {
        font-size: 13px;
        color: var(--ck-muted);
      }
      .facts {
        margin: 12px -6px 0;
        font-size: 14px;
      }
      .facts > div {
        display: flex;
        align-items: baseline;
        gap: 10px;
        padding: 4px 6px;
      }
      .facts span {
        width: 5.5em;
        flex: none;
        color: var(--ck-muted);
      }
      .facts b {
        font-weight: 500;
      }
      .facts i {
        font-style: normal;
        font-size: 12px;
      }
      .tag {
        padding: 1px 8px;
        border-radius: 10px;
        font-weight: 500;
      }
      .tag.warn {
        color: var(--ck-warn);
        background: color-mix(in srgb, var(--ck-warn) 15%, transparent);
      }
      .tag.info {
        color: var(--ck-info);
        background: color-mix(in srgb, var(--ck-info) 15%, transparent);
      }
      .tag.good {
        color: var(--ck-good);
        background: color-mix(in srgb, var(--ck-good) 15%, transparent);
      }
      .rail {
        display: grid;
        grid-template-columns: 8.5em 1fr 5em;
        align-items: center;
        gap: 10px;
        margin: 0 -6px;
        padding: 5px 6px;
        font-size: 13px;
      }
      .rscale {
        position: relative;
        padding: 9px 0 0;
      }
      .rbar {
        position: relative;
        height: 6px;
        border-radius: 3px;
        background: color-mix(in srgb, var(--ck-bad) 25%, transparent);
      }
      .zone {
        position: absolute;
        top: 0;
        bottom: 0;
      }
      .zone.good {
        background: color-mix(in srgb, var(--ck-good) 50%, transparent);
      }
      .zone.warn {
        background: color-mix(in srgb, var(--ck-warn) 45%, transparent);
      }
      /* Pointer above the bar at the reading; amber or red when out of range. */
      .tri {
        position: absolute;
        top: 0;
        width: 0;
        height: 0;
        transform: translateX(-50%);
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 8px solid var(--primary-text-color);
      }
      .tri.warn {
        border-top-color: var(--ck-warn);
      }
      .tri.bad {
        border-top-color: var(--ck-bad);
      }
      .trip {
        position: absolute;
        top: -2px;
        bottom: -3px;
        width: 1px;
        background: var(--ck-muted);
      }
      .rticks {
        position: relative;
        height: 13px;
        margin-top: 2px;
        font-size: 10px;
        line-height: 13px;
        color: var(--ck-muted);
      }
      .rticks span {
        position: absolute;
        transform: translateX(-50%);
        white-space: nowrap;
      }
      .rv {
        text-align: right;
        font-size: 14px;
      }
      .ralert {
        grid-column: 1 / -1;
        font-size: 12px;
        color: var(--ck-warn);
      }
      .act.right {
        margin-left: auto;
        align-self: flex-start;
      }
      .kv {
        margin: 0 -6px;
        font-size: 13px;
      }
      .kv > div {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 4px 6px;
      }
      .kv span {
        color: var(--ck-muted);
      }
      .kv b {
        font-weight: 500;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 12px;
      }
      .act {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px 6px 10px;
        border-radius: 16px;
        border: 1px solid var(--ck-line);
        background: transparent;
        font: inherit;
        font-size: 13px;
        color: var(--primary-color);
        text-decoration: none;
        cursor: pointer;
      }
      .act ha-icon {
        --mdc-icon-size: 16px;
      }
      .act.primary {
        color: var(--text-primary-color, #fff);
        background: var(--primary-color);
        border-color: var(--primary-color);
      }
      .act[disabled] {
        opacity: 0.6;
        cursor: default;
      }
      .act.armed {
        color: var(--card-background-color, #fff);
        background: var(--ck-warn);
        border-color: var(--ck-warn);
      }
      .wifi {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 0 -6px;
        padding: 4px 6px;
        font-size: 14px;
      }
      .bars {
        display: flex;
        align-items: flex-end;
        gap: 2px;
        height: 20px;
        flex: none;
      }
      .bars i {
        width: 5px;
        border-radius: 1px;
        background: var(--ck-track);
      }
      .bars.good i.on {
        background: var(--ck-good);
      }
      .bars.warn i.on {
        background: var(--ck-warn);
      }
      .bars.bad i.on {
        background: var(--ck-bad);
      }
      .health {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 4px 16px;
      }
      .meter {
        margin: 0 -6px;
        padding: 4px 6px;
      }
      .mtop {
        display: flex;
        justify-content: space-between;
        font-size: 13px;
      }
      .mtop span {
        color: var(--ck-muted);
      }
      .mtop b {
        font-weight: 500;
      }
      .mbar {
        height: 6px;
        margin: 5px 0 3px;
        border-radius: 3px;
        background: var(--ck-track);
        overflow: hidden;
      }
      .mbar i {
        display: block;
        height: 100%;
        border-radius: 3px;
        background: currentColor;
      }
      .bl {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .bl ha-icon {
        color: var(--ck-muted);
      }
      .bl input {
        flex: 1;
        accent-color: var(--primary-color);
      }
      .blv {
        width: 3.5em;
        text-align: right;
        font-size: 13px;
      }
      .toggle {
        position: relative;
        flex: none;
        width: 40px;
        height: 22px;
        border-radius: 11px;
        border: 0;
        padding: 0;
        background: var(--ck-track);
        cursor: pointer;
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

define("cellkeeper-system-card", CellKeeperSystemCard);
