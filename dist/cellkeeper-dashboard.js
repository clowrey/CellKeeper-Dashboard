/* CellKeeper Dashboard 0.1.0 - https://github.com/clowrey/CellKeeper-Dashboard */
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};

// src/context.js
function findPrefixes(hass) {
  const prefixes = /* @__PURE__ */ new Set();
  for (const id of Object.keys(hass.entities ?? hass.states)) {
    const m = id.match(/^sensor\.(\w+?)_system_state_text$/);
    if (m) prefixes.add(m[1]);
  }
  return [...prefixes].sort();
}
function entitiesCard(ctx, card) {
  const entities = card.entities.filter((row) => {
    const id = typeof row === "string" ? row : row.entity;
    return !id || ctx.has(id);
  });
  if (!entities.some((row) => typeof row === "string" ? row : row.entity)) return null;
  return { ...card, entities };
}
function entityCard(ctx, card) {
  return ctx.has(card.entity) ? card : null;
}
function gridCard(card) {
  const cards = card.cards.filter(Boolean);
  return cards.length ? { ...card, cards } : null;
}
function section(section2) {
  const cards = section2.cards.filter(Boolean);
  const dropped = cards.length < section2.cards.length;
  const content = cards.filter((c) => c.type !== "heading" && c.type !== "markdown");
  return dropped && !content.length ? null : { ...section2, cards };
}
function sections(list2) {
  return list2.map(section).filter(Boolean);
}
function numberTile(ctx, key, name) {
  return entityCard(ctx, {
    type: "tile",
    entity: ctx.id("number", key),
    name,
    features_position: "bottom",
    features: [{ type: "numeric-input", style: "buttons" }]
  });
}
function define(name, cls) {
  if (!customElements.get(name)) customElements.define(name, cls);
}
var DEFAULT_PREFIX, MAX_CELLS, EVENT_LEVELS, PackContext;
var init_context = __esm({
  "src/context.js"() {
    DEFAULT_PREFIX = "ck0";
    MAX_CELLS = 108;
    EVENT_LEVELS = ["info", "warning", "critical", "fatal"];
    PackContext = class {
      constructor(prefix, hass) {
        this.prefix = prefix;
        this.hass = hass;
      }
      // "sensor", "soc" -> "sensor.ck0_soc"
      id(domain, key) {
        return `${domain}.${this.prefix}_${key}`;
      }
      has(entityId) {
        return entityId in this.hass.states;
      }
      // Entity ids of this pack in a domain whose key matches the regex, in HA's order.
      find(domain, keyRegex) {
        const start = `${domain}.${this.prefix}_`;
        return Object.keys(this.hass.states).filter(
          (id) => id.startsWith(start) && keyRegex.test(id.slice(start.length))
        );
      }
      // Existing per-cell entities (sensor.ck0_cell_voltage_001 ...), in cell order.
      cellIds(key) {
        const ids = [];
        for (let i = 1; i <= MAX_CELLS; i++) {
          const id = this.id("sensor", `${key}_${String(i).padStart(3, "0")}`);
          if (this.has(id)) ids.push(id);
        }
        return ids;
      }
      // Friendly name without the device name ("CellKeeper0 ", "ck0 ").
      shortName(entityId) {
        const state = this.hass.states[entityId];
        let name = state?.attributes?.friendly_name ?? entityId;
        const deviceId = this.hass.entities?.[entityId]?.device_id;
        const device = deviceId && this.hass.devices?.[deviceId];
        for (const strip of [device?.name_by_user, device?.name, this.prefix, this.prefix.toUpperCase()]) {
          if (strip && name.startsWith(strip + " ")) name = name.slice(strip.length + 1);
        }
        return name.replace(/^CellKeeper\d+ /, "").trim();
      }
    };
  }
});

// src/editor.js
var editor_exports = {};
var CellKeeperDashboardStrategyEditor;
var init_editor = __esm({
  "src/editor.js"() {
    init_context();
    CellKeeperDashboardStrategyEditor = class extends HTMLElement {
      setConfig(config) {
        this._config = config;
        this._render();
      }
      set hass(hass) {
        this._hass = hass;
        this._render();
      }
      _render() {
        if (!this._hass || !this._config) return;
        if (!this._form) {
          this._form = document.createElement("ha-form");
          this._form.computeLabel = (s) => ({ prefix: "Pack prefix (entity ids start with it)", title: "Dashboard title" })[s.name] ?? s.name;
          this._form.addEventListener("value-changed", (ev) => {
            ev.stopPropagation();
            const config = { ...this._config, ...ev.detail.value };
            for (const key of ["title"]) if (!config[key]) delete config[key];
            this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
          });
          this.appendChild(this._form);
        }
        const prefixes = findPrefixes(this._hass);
        const current = this._config.prefix || DEFAULT_PREFIX;
        if (!prefixes.includes(current)) prefixes.unshift(current);
        this._form.hass = this._hass;
        this._form.data = { prefix: current, title: this._config.title ?? "" };
        this._form.schema = [
          { name: "prefix", selector: { select: { options: prefixes, custom_value: true, mode: "dropdown" } } },
          { name: "title", selector: { text: {} } }
        ];
      }
    };
    define("cellkeeper-dashboard-strategy-editor", CellKeeperDashboardStrategyEditor);
  }
});

// src/cards/styled-card.js
init_context();

// src/cards/wrapper.js
var helpersPromise;
function cardHelpers() {
  helpersPromise ??= window.loadCardHelpers();
  return helpersPromise;
}
var WrapperCard = class extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (this._card) this._card.hass = hass;
    this.hassChanged?.(hass);
  }
  get hass() {
    return this._hass;
  }
  // Replace the wrapped card with a new one built from `config`.
  async buildCard(config) {
    const token = this._buildToken = {};
    const helpers = await cardHelpers();
    if (token !== this._buildToken) return null;
    const card = helpers.createCardElement(config);
    card.addEventListener("ll-rebuild", (ev) => {
      ev.stopPropagation();
      this.buildCard(config);
    });
    if (this._hass) card.hass = this._hass;
    if (this.preview !== void 0) card.preview = this.preview;
    this._card = card;
    this.replaceChildren(card);
    return card;
  }
  // Update the wrapped card's config in place (keeps its DOM, no flicker).
  updateCard(config) {
    if (this._card?.setConfig) this._card.setConfig(config);
  }
  // Shadow root of the wrapped card once it has rendered.
  async cardRoot(card = this._card) {
    if (!card) return null;
    await customElements.whenDefined(card.localName);
    await card.updateComplete;
    return card.shadowRoot;
  }
  // Show or hide this card; sections views free the grid slot of a hidden card.
  setVisible(visible) {
    if (this.hidden === !visible) return;
    this.hidden = !visible;
    this.dispatchEvent(
      new CustomEvent("card-visibility-changed", { detail: { value: visible }, bubbles: true, composed: true })
    );
  }
  getCardSize() {
    return this._card?.getCardSize?.() ?? 1;
  }
  getGridOptions() {
    return this._card?.getGridOptions?.() ?? this._card?.getLayoutOptions?.();
  }
};

// src/cards/styled-card.js
var CellKeeperStyledCard = class extends WrapperCard {
  setConfig(config) {
    if (!config?.card) throw new Error("cellkeeper-styled-card needs a card");
    this._config = config;
    this.buildCard(config.card).then((card) => card && this._style(card));
  }
  async _style(card) {
    const root = await this.cardRoot(card);
    if (!root || card !== this._card) return;
    const style = document.createElement("style");
    style.textContent = this._config.style ?? "";
    root.appendChild(style);
  }
};
define("cellkeeper-styled-card", CellKeeperStyledCard);

// src/cards/state-tile.js
init_context();
function ruleColor(rules, state, ignoreCase) {
  const s = ignoreCase ? String(state).toLowerCase() : String(state);
  const norm = (t) => ignoreCase ? String(t).toLowerCase() : String(t);
  for (const rule of rules ?? []) {
    if (rule.contains !== void 0 && s.includes(norm(rule.contains))) return rule.color;
    if (rule.not !== void 0 && !rule.not.map(norm).includes(s)) return rule.color;
  }
  return void 0;
}
var CellKeeperStateTile = class extends WrapperCard {
  setConfig(config) {
    if (!config?.entity) throw new Error("cellkeeper-state-tile needs an entity");
    const { colors, ignore_case, color_text, ...tile } = config;
    this._config = config;
    this._tile = { ...tile, type: "tile" };
    this._color = this._currentColor();
    this.buildCard(this._tileConfig());
  }
  _currentColor() {
    const state = this._hass?.states[this._config.entity]?.state;
    return state === void 0 ? void 0 : ruleColor(this._config.colors, state, this._config.ignore_case);
  }
  _tileConfig() {
    return this._color ? { ...this._tile, color: this._color } : this._tile;
  }
  hassChanged() {
    if (!this._config) return;
    const color = this._currentColor();
    if (color !== this._color) {
      this._color = color;
      this.updateCard(this._tileConfig());
    }
    for (const v of ["--primary-text-color", "--secondary-text-color"]) {
      if (this._config.color_text && color) this.style.setProperty(v, color);
      else this.style.removeProperty(v);
    }
  }
};
define("cellkeeper-state-tile", CellKeeperStateTile);

// src/cards/event-grid.js
init_context();
var EVENT_COLORS = { FATAL: "#D50000", CRITICAL: "#F44336", WARNING: "#FFC107", INFO: "#2196F3" };
var PREVIOUS_COLOR = "#9C27B0";
function activeColor(entityId, state) {
  for (const [level, color] of Object.entries(EVENT_COLORS)) if (state.includes(level)) return color;
  for (const [level, color] of Object.entries(EVENT_COLORS)) if (entityId.includes(level.toLowerCase())) return color;
  return EVENT_COLORS.INFO;
}
function isActive(state) {
  return !["INACTIVE", "unknown", "unavailable"].includes(state) && !state.startsWith("INACTIVE");
}
var CellKeeperEventGrid = class extends WrapperCard {
  setConfig(config) {
    this._config = { prefix: "ck0", show: "active", columns: 2, ...config };
    this._key = void 0;
    this.setVisible(false);
    if (this._hass) this.hassChanged(this._hass);
  }
  hassChanged(hass) {
    if (!this._config) return;
    const ctx = new PackContext(this._config.prefix, hass);
    const tiles = ctx.find("sensor", /^event_(fatal|critical|warning|info)_/).map((id) => ({ id, state: hass.states[id].state, name: ctx.shortName(id) })).filter(({ state }) => this._config.show === "previous" ? state.startsWith("INACTIVE (") : isActive(state)).sort((a, b) => a.name.localeCompare(b.name)).map(({ id, state, name }) => ({
      type: "tile",
      entity: id,
      name: name.replace(/^Event (Fatal|Critical|Warning|Info) /, "").trim(),
      color: this._config.show === "previous" ? PREVIOUS_COLOR : activeColor(id, state)
    }));
    const key = JSON.stringify(tiles);
    if (key === this._key) return;
    this._key = key;
    this.setVisible(tiles.length > 0);
    if (!tiles.length) return;
    const grid = { type: "grid", title: this._config.title, columns: this._config.columns, square: false, cards: tiles };
    if (this._card) this.updateCard(grid);
    else this.buildCard(grid);
  }
  getCardSize() {
    return this.hidden ? 0 : super.getCardSize();
  }
  getGridOptions() {
    return { columns: 12 };
  }
};
define("cellkeeper-event-grid", CellKeeperEventGrid);

// src/cards/title-card.js
init_context();
var CellKeeperTitleCard = class extends HTMLElement {
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
  set hass(_hass) {
  }
  getCardSize() {
    return this._config?.subtitle ? 2 : 1;
  }
  getGridOptions() {
    return { columns: 12, rows: "auto" };
  }
};
define("cellkeeper-title-card", CellKeeperTitleCard);

// src/strategy.js
init_context();

// src/views/overview.js
init_context();
var RED = "#db4437";
var ORANGE = "#ffa600";
var GREEN = "#43a047";
var CELL_SEGMENTS = [
  { from: 2.95, color: RED },
  { from: 3, color: ORANGE },
  { from: 3.3, color: GREEN },
  { from: 4.15, color: ORANGE },
  { from: 4.2, color: RED }
];
function defaultGauges() {
  return {
    soc: { name: "SOC", unit: "%", min: 0, max: 100, needle: true, severity: { green: 30, yellow: 10, red: 0 } },
    pack_voltage: {
      name: "Pack Internal Voltage",
      min: 288,
      max: 410,
      needle: true,
      segments: [
        { from: 288, color: RED },
        { from: 300, color: ORANGE },
        { from: 330, color: GREEN },
        { from: 400, color: RED }
      ]
    },
    cell_voltage_min: { name: "Cell Voltage Min", min: 2.95, max: 4.25, needle: true, segments: CELL_SEGMENTS },
    cell_voltage_max: { name: "Cell Voltage Max", min: 2.95, max: 4.25, needle: true, segments: CELL_SEGMENTS },
    current: { name: "Current", min: -200, max: 200, needle: true, severity: { green: 0, red: -200 } },
    power: { name: "Power", unit: "W", min: -1e4, max: 1e4, needle: true, severity: { green: 0, red: -1e4 } }
  };
}
var GAUGE_ENTITIES = {
  soc: "soc",
  pack_voltage: "pack_internal_voltage",
  cell_voltage_min: "cell_voltage_min",
  cell_voltage_max: "cell_voltage_max",
  current: "current",
  power: "power_w"
};
function gauge(ctx, key, overrides) {
  const { name, ...rest } = { ...defaultGauges()[key], ...overrides?.[key] };
  return entityCard(ctx, { type: "gauge", entity: ctx.id("sensor", GAUGE_ENTITIES[key]), name, ...rest });
}
function activeEventsCard(ctx) {
  return { type: "custom:cellkeeper-event-grid", prefix: ctx.prefix, show: "active", title: "Active Events", columns: 2 };
}
function overviewView(ctx, options) {
  return {
    title: "Overview",
    type: "sections",
    max_columns: 3,
    sections: sections([
      {
        cards: [
          { type: "heading", heading: "Overview" },
          activeEventsCard(ctx),
          { type: "custom:cellkeeper-title-card", title: "BMS Status", subtitle: "Battery Management System Overview" },
          gridCard({
            type: "grid",
            columns: 2,
            square: false,
            cards: Object.keys(GAUGE_ENTITIES).map((key) => gauge(ctx, key, options.gauges))
          }),
          entitiesCard(ctx, {
            type: "entities",
            title: "System Status",
            entities: [
              { entity: ctx.id("sensor", "system_state_text"), name: "System State" },
              { entity: ctx.id("sensor", "contactor_state_text"), name: "Contactor State" },
              { entity: ctx.id("button", "run"), name: "Run BMS", icon: "mdi:play" },
              { entity: ctx.id("button", "stop"), name: "Stop BMS", icon: "mdi:stop" },
              {
                entity: ctx.id("button", "calibrate"),
                name: "Offline Calibration (Inverter Disconnected, Contactors Open)",
                icon: "mdi:wrench"
              }
            ]
          })
        ]
      }
    ])
  };
}

// src/views/detail.js
init_context();
function list(ctx, title, keys) {
  return entitiesCard(ctx, { type: "entities", title, entities: keys.map((k) => ({ entity: ctx.id("sensor", k) })) });
}
function detailView(ctx) {
  return {
    title: "Detail",
    type: "sections",
    max_columns: 3,
    sections: sections([
      {
        cards: [
          { type: "heading", heading: "Battery Details" },
          list(ctx, "Voltage & Capacity", [
            "pack_internal_voltage",
            "pack_output_voltage",
            "pack_internal_voltage_bmb",
            "contactor_voltage_positive",
            "contactor_voltage_negative",
            "capacity",
            "charge_raw",
            "soc",
            "soc_voltage_based",
            "soc_basic_count"
          ]),
          list(ctx, "Isolation", ["pack_pos_to_chassis", "pack_neg_to_chassis", "isolation_resistance", "isolation_check_age"]),
          list(ctx, "Inverter CAN Values", [
            "inverter_can_soc",
            "inverter_can_capacity_full",
            "inverter_can_capacity_remaining",
            "inverter_can_voltage_limit_min",
            "inverter_can_voltage_limit_max",
            "current_limit_effective_charge",
            "current_limit_effective_discharge"
          ]),
          list(ctx, "Energy Stats", [
            "power_charge",
            "power_discharge",
            "energy_daily_charge",
            "energy_daily_discharge",
            "energy_daily_net"
          ])
        ]
      },
      {
        cards: [
          { type: "heading", heading: "Temperature" },
          list(ctx, "Temperature", ["module_temperature_min", "module_temperature_max"]),
          entitiesCard(ctx, {
            type: "entities",
            title: "Module Temperatures",
            entities: ctx.find("sensor", /^module_temperature_\d+$/).sort((a, b) => parseInt(a.match(/\d+$/)) - parseInt(b.match(/\d+$/))).map((entity) => ({ entity }))
          })
        ]
      }
    ])
  };
}

// src/views/cells.js
init_context();
var PARSE_CELL_RANGES = `const parse_cell_ranges = (raw, out_set) => {
    if (!raw || raw === "None" || raw === "unknown" || raw === "unavailable") {
      return;
    }
    const tokens = raw.split(",");
    for (const token of tokens) {
      const t = token.trim();
      if (!t) continue;
      const range = t.match(/^(\\d+)\\s*-\\s*(\\d+)$/);
      if (range) {
        const a = parseInt(range[1], 10);
        const b = parseInt(range[2], 10);
        if (isNaN(a) || isNaN(b)) continue;
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        for (let cell = lo; cell <= hi; cell++) out_set.add(cell);
      } else {
        const cell = parseInt(t, 10);
        if (!isNaN(cell)) out_set.add(cell);
      }
    }
  };`;
function cellVoltagesFn(p) {
  return `$ex {
  vars.x = [];
  vars.y = [];
  vars.balance = [];
  vars.balance_colors = [];
  vars.balance_timer_max = 0;
  vars.balance_timer_total_s = 0;
  vars.balance_timer_label = "Balance Cycle Time Remaining: 0 s";
  let max_single_timer_s = 0;
  let max_adjacent_pair_s = 0;
  let prev_timer_s = 0;
  ${PARSE_CELL_RANGES}
  const balancing_cells_set = new Set();
  const active_cells_set = new Set();
  const balancing_cells_raw = (hass.states['sensor.${p}_cells_balancing']?.state ?? "").toString().trim();
  const active_cells_raw = (hass.states['sensor.${p}_cells_balancing_active']?.state ?? "").toString().trim();
  parse_cell_ranges(balancing_cells_raw, balancing_cells_set);
  parse_cell_ranges(active_cells_raw, active_cells_set);

  const detected_cell_count = parseInt(hass.states['sensor.${p}_cell_count']?.state);
  const cell_count = (!isNaN(detected_cell_count) && detected_cell_count > 0)
    ? Math.min(detected_cell_count, ${MAX_CELLS})
    : ${MAX_CELLS};

  for (let j = 0; j < cell_count; j++) {
    let index = j + 1;
    let suffix = index.toString().padStart(3, '0');
    let entity_id = "sensor.${p}_cell_voltage_" + suffix;
    let timer_entity_id = "sensor.${p}_cell_balancing_time_" + suffix;
    let timer_val = 0;
    if (hass.states[timer_entity_id]) {
      let parsed_timer = parseFloat(hass.states[timer_entity_id].state);
      if (!isNaN(parsed_timer) && parsed_timer > 0) {
        timer_val = parsed_timer;
      }
    }

    if (timer_val > max_single_timer_s) {
      max_single_timer_s = timer_val;
    }
    const adjacent_sum = prev_timer_s + timer_val;
    if (adjacent_sum > max_adjacent_pair_s) {
      max_adjacent_pair_s = adjacent_sum;
    }
    prev_timer_s = timer_val;

    if (hass.states[entity_id]) {
      let val = parseFloat(hass.states[entity_id].state);
      // Only include valid values > 0 to avoid skewing the graph
      if (!isNaN(val) && val > 0.01) {
        vars.x.push(index);
        vars.y.push(val);
        vars.balance.push(timer_val);
        if (active_cells_set.has(index)) {
          vars.balance_colors.push('#FF9800'); // Actively balancing now
        } else if (balancing_cells_set.has(index) || timer_val > 0) {
          vars.balance_colors.push('#FDD835'); // Has balancing counter
        } else {
          vars.balance_colors.push('rgba(0,0,0,0)');
        }
      }
    }
  }

  if (vars.y.length > 0) {
    vars.ymin = Math.min(...vars.y) - 0.01;
    vars.ymax = Math.max(...vars.y) + 0.01;
  } else {
    vars.ymin = 0;
    vars.ymax = 5;
  }

  const axis_state_key = "${p}_cells_balance_axis_state";
  if (!globalThis[axis_state_key] || typeof globalThis[axis_state_key] !== "object") {
    globalThis[axis_state_key] = {axis_max_hold: 1, max_timer_prev: 0};
  }
  const axis_state = globalThis[axis_state_key];
  if (!isFinite(axis_state.axis_max_hold) || axis_state.axis_max_hold <= 0) {
    axis_state.axis_max_hold = 1;
  }
  if (!isFinite(axis_state.max_timer_prev) || axis_state.max_timer_prev < 0) {
    axis_state.max_timer_prev = 0;
  }
  vars.balance_axis_max = axis_state.axis_max_hold;
  if (vars.balance.length > 0 && vars.y.length > 0) {
    let max_timer = 0;
    let max_timer_idx = -1;
    for (let i = 0; i < vars.balance.length; i++) {
      if (vars.balance[i] > max_timer) {
        max_timer = vars.balance[i];
        max_timer_idx = i;
      }
    }

    if (max_timer > 0 && max_timer_idx >= 0) {
      const y_span = Math.max(vars.ymax - vars.ymin, 1e-6);
      let blue_norm = (vars.y[max_timer_idx] - vars.ymin) / y_span;
      // Keep the tallest yellow bar just under its blue bar.
      blue_norm = Math.max(blue_norm, 0.05);
      const proposed_axis_max = max_timer / (blue_norm * 0.98);
      // Only rescale when counters increase (new/reset session).
      if (max_timer > axis_state.max_timer_prev && isFinite(proposed_axis_max) && proposed_axis_max > 0) {
        axis_state.axis_max_hold = proposed_axis_max;
      }
    }
    vars.balance_timer_max = max_timer;
  }
  vars.balance_axis_max = axis_state.axis_max_hold;
  if (!isFinite(vars.balance_timer_max) || vars.balance_timer_max < 0) {
    vars.balance_timer_max = 0;
  }
  axis_state.max_timer_prev = vars.balance_timer_max;
  globalThis[axis_state_key] = axis_state;

  vars.balance_timer_total_s = Math.max(max_single_timer_s, max_adjacent_pair_s);
  vars.balance_timer_label =
    "Balance Cycle Time Remaining: " + Math.round(vars.balance_timer_total_s) + " s";
}`;
}
function cellsView(ctx, plotly) {
  const p = ctx.prefix;
  return {
    title: "Cells",
    type: "sections",
    max_columns: 4,
    sections: [
      {
        type: "grid",
        column_span: 4,
        cards: [
          entitiesCard(ctx, {
            type: "entities",
            grid_options: { columns: 12, rows: "auto" },
            title: "Cell Summary",
            entities: [
              "cell_voltage_min",
              "cell_voltage_max",
              "cell_voltage_delta",
              "cells_balancing_count",
              "cells_balancing_active_count",
              "balance_cycle_time_remaining"
            ].map((k) => ({ entity: ctx.id("sensor", k) }))
          }),
          ctx.cellIds("cell_voltage").length ? plotly({
            type: "custom:plotly-graph",
            grid_options: { columns: "full", rows: 10 },
            title: "Cell Voltages",
            raw_plotly_config: true,
            refresh_interval: 2,
            fn: cellVoltagesFn(p),
            entities: [
              {
                entity: "",
                type: "bar",
                x: "$ex vars.x",
                y: "$ex vars.y",
                texttemplate: "%{y:.3f}",
                marker: { color: "#3498db" }
              },
              {
                entity: "",
                type: "bar",
                x: "$ex vars.x",
                y: "$ex vars.balance",
                yaxis: "y2",
                name: "Balancing Time",
                marker: { color: "$ex vars.balance_colors" },
                opacity: 0.65
              }
            ],
            layout: {
              autosize: true,
              height: 600,
              barmode: "overlay",
              showlegend: false,
              dragmode: false,
              xaxis: { title: "Cell Number", type: "category", fixedrange: true },
              yaxis: { title: "Voltage (V)", fixedrange: true, range: ["$ex vars.ymin", "$ex vars.ymax"] },
              yaxis2: {
                title: "Balancing Time",
                overlaying: "y",
                side: "right",
                showgrid: false,
                visible: false,
                fixedrange: true,
                range: [0, "$ex vars.balance_axis_max"]
              },
              annotations: [
                {
                  xref: "paper",
                  yref: "paper",
                  x: 0.99,
                  y: 0.99,
                  xanchor: "right",
                  yanchor: "top",
                  showarrow: false,
                  text: "$ex vars.balance_timer_label",
                  font: { size: 12, color: "#FDD835" }
                }
              ]
            },
            config: { responsive: true, displayModeBar: false, scrollZoom: false }
          }) : null
        ].filter(Boolean)
      }
    ]
  };
}
function cellHistory(ctx) {
  return {
    defaults: {
      entity: {
        internal: true,
        filters: [{ resample: "1m" }],
        fn: "$ex {\n    vars.data.push(ys);\n    vars.xs = xs;\n }\n"
      }
    },
    fn: `$ex {
  vars.data = [];
  vars.balance_x = [];
  vars.balance_y = [];
  let detected_cell_count = parseInt(hass.states['sensor.${ctx.prefix}_cell_count']?.state);
  vars.cell_count = (!isNaN(detected_cell_count) && detected_cell_count > 0)
    ? Math.min(detected_cell_count, ${MAX_CELLS})
    : ${MAX_CELLS};
}`,
    entities: ctx.cellIds("cell_voltage").map((entity) => ({ entity }))
  };
}
var LOAD_WARNING = (what) => `**Warning:** This ${what} view can take 30+ seconds to load while Home Assistant gathers and renders all cell history points.
`;
function cells3dView(ctx, plotly) {
  const history = cellHistory(ctx);
  return {
    title: "Cells 3D",
    path: "cells-3d",
    type: "panel",
    cards: [
      {
        type: "vertical-stack",
        cards: [
          { type: "markdown", content: LOAD_WARNING("3D") },
          plotly({
            type: "custom:plotly-graph",
            title: "Cells 3D Surface",
            raw_plotly_config: true,
            hours_to_show: "1d",
            defaults: history.defaults,
            fn: history.fn,
            layout: {
              height: 1600,
              margin: { t: 0, l: 0, r: 90, b: 0 },
              scene: {
                camera: { eye: { x: 2, y: 2, z: 2 } },
                xaxis: { title: "Hour of Day", tickformat: "%H:%M:%S" },
                yaxis: { title: "Cell", tickmode: "linear", dtick: 1 },
                zaxis: { title: "V" }
              }
            },
            entities: [
              ...history.entities,
              {
                entity: "",
                internal: false,
                type: "surface",
                x: "$ex vars.xs",
                y: "$ex vars.data.slice(0, vars.cell_count).map((_,i)=>i+1)",
                z: "$ex vars.data.slice(0, vars.cell_count)"
              }
            ]
          })
        ]
      }
    ]
  };
}
function balancingMarkers(entity, xVar, yVar) {
  return {
    entity,
    internal: true,
    filters: [{ resample: "1m" }],
    fn: `$ex {
  vars.${xVar} = [];
  vars.${yVar} = [];
  const n = Math.min(xs.length, ys.length);
  for (let i = 0; i < n; i++) {
    const raw = (ys[i] ?? "").toString().trim();
    if (!raw || raw === "None" || raw === "unknown" || raw === "unavailable") {
      continue;
    }
    const tokens = raw.split(",");
    for (const token of tokens) {
      const t = token.trim();
      if (!t) continue;
      const range = t.match(/^(\\d+)\\s*-\\s*(\\d+)$/);
      if (range) {
        const a = parseInt(range[1], 10);
        const b = parseInt(range[2], 10);
        if (isNaN(a) || isNaN(b)) continue;
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        for (let cell = lo; cell <= hi; cell++) {
          if (cell > 0 && cell <= vars.cell_count) {
            vars.${xVar}.push(xs[i]);
            vars.${yVar}.push(cell);
          }
        }
      } else {
        const cell = parseInt(t, 10);
        if (!isNaN(cell) && cell > 0 && cell <= vars.cell_count) {
          vars.${xVar}.push(xs[i]);
          vars.${yVar}.push(cell);
        }
      }
    }
  }
}
`
  };
}
function markerTrace(name, xVar, yVar, color) {
  return {
    entity: "",
    internal: false,
    type: "scattergl",
    mode: "markers",
    name,
    x: `$ex vars.${xVar}`,
    y: `$ex vars.${yVar}`,
    marker: { color, size: 4, line: { color: "#000000", width: 1 } }
  };
}
function cells2dView(ctx, plotly) {
  const history = cellHistory(ctx);
  const balancing = ctx.id("sensor", "cells_balancing");
  const active = ctx.id("sensor", "cells_balancing_active");
  return {
    title: "Cells 2D",
    path: "cells-2d",
    type: "panel",
    cards: [
      {
        type: "vertical-stack",
        cards: [
          { type: "markdown", content: LOAD_WARNING("2D") },
          plotly({
            type: "custom:plotly-graph",
            title: "Cells 2D Heatmap",
            raw_plotly_config: true,
            hours_to_show: "1d",
            defaults: history.defaults,
            fn: history.fn.replace("  vars.balance_x = [];\n  vars.balance_y = [];\n", ""),
            layout: {
              height: 1200,
              margin: { t: 0, l: 0, r: 90, b: 0 },
              xaxis: { title: "Hour of Day", tickformat: "%H:%M:%S" },
              yaxis: { title: "Cell", tickmode: "linear", dtick: 1 },
              coloraxis: { colorbar: { title: "V" } }
            },
            config: { displayModeBar: false, scrollZoom: false },
            entities: [
              ...history.entities,
              ...ctx.has(balancing) ? [balancingMarkers(balancing, "balance_x", "balance_y")] : [],
              ...ctx.has(active) ? [balancingMarkers(active, "active_x", "active_y")] : [],
              {
                entity: "",
                internal: false,
                type: "heatmap",
                x: "$ex vars.xs",
                y: "$ex vars.data.slice(0, vars.cell_count).map((_,i)=>i+1)",
                z: "$ex vars.data.slice(0, vars.cell_count)",
                coloraxis: "coloraxis"
              },
              ...ctx.has(balancing) ? [markerTrace("Balancing", "balance_x", "balance_y", "#39FF14")] : [],
              ...ctx.has(active) ? [markerTrace("Balancing Active", "active_x", "active_y", "#AA00FF")] : []
            ]
          })
        ]
      }
    ]
  };
}

// src/views/configuration.js
init_context();
var SETTING_GROUPS = [
  {
    heading: "SOC and Current",
    numbers: {
      soc_set_cmd: "SOC Set Cmd",
      soc_scaling_min: "SOC Scale Min",
      soc_scaling_max: "SOC Scale Max",
      max_charge_current: "Max Chg Curr",
      max_discharge_current: "Max Dchg Curr"
    }
  },
  {
    heading: "Voltage Limits",
    numbers: {
      voltage_limit_offset_lower: "VLimit Offs Low",
      voltage_limit_offset_upper: "VLimit Offs High",
      cell_voltage_working_min: "CellV Work Min",
      cell_voltage_working_max: "CellV Work Max",
      cell_voltage_soft_min: "CellV Soft Min",
      cell_voltage_soft_max: "CellV Soft Max"
    }
  },
  {
    heading: "Balancing",
    numbers: {
      auto_balancing_period: "Auto Bal Period",
      balancing_periods_per_mv: "Bal Periods/mV",
      balance_min_offset: "Bal Min Offset",
      minimum_balancing_voltage: "Min Bal V",
      balancing_start_voltage: "Bal Start V"
    }
  },
  {
    heading: "Balance Charge",
    numbers: {
      balance_charge_interval: "Interval",
      balance_charge_start_hour: "Start Hour",
      balance_charge_duration: "Duration",
      float_offset_upper: "Float Offs High",
      balance_charge_offset_upper: "Bal Chg Offs High"
    }
  }
];
var SHOWN_ELSEWHERE = /* @__PURE__ */ new Set(["number.log_update_rate", "switch.settings_unlock", "switch.log_enable"]);
var GUIDE = `## BMS Configuration
Use **Settings Unlock Mode** to allow writes. When locked, values are read-only and write attempts are blocked.

### Voltage Protection Tiers
- **Working Limits**: Defines the 0% to 100% SoC range used for normal operation.
- **Soft Limits**: Triggers warning behavior and current limiting if exceeded.
- **Hard Limits**: Firmware safety limits that force immediate disconnect.

**Tip:** Set Working Min to your inverter's 0% SoC voltage point.
`;
var BALANCING_NOTE = `**Note:** \`Auto Bal Period\` is in milliseconds.
- \`0\` = balancing disabled
- \`30000\` = 30 second balancing period
`;
var BALANCE_CHARGE_NOTE = "Every **Interval** days (0 = off) the HMI raises **VLimit Offs High** from **Float Offs High** to **Bal Chg Offs High** for **Duration** hours from **Start Hour**, so the cells reach the knee and balance. A missed window waits for the next day's. Offsets are in 0.1 V. **Stop Balance Charge** ends a running one and starts the interval again from today. While the interval isn't 0, edit those two settings instead of VLimit Offs High, which is put back within 30 s. No unlock is needed for these.\n";
var ISOLATION_NOTE = "All isolation values are calculated by the BMS. At every boot, while the contactors are still open, the BMS checks the zero: small drift is blended in, a large offset raises **Isolation Asymmetry** (possible leak) and the zero is kept. Isolation Resistance is live with the contactors open and otherwise shows the last open reading (see Isolation Check Age; capped at 100 Mohm). Press **Calibrate Isolation Zero** with the battery stopped only after ruling out a leak; it overwrites the zero.\n";
var SETTINGS_STATUS_COLORS = [
  { contains: "settings applied", color: "#4CAF50" },
  { contains: "auto-locked", color: "#D50000" },
  { contains: "locked (unlock to apply)", color: "#D50000" },
  { contains: "settings unlocked", color: "#2196F3" },
  { contains: "settings locked", color: "#9E9E9E" }
];
function numberGrid(ctx, numbers) {
  return gridCard({
    type: "grid",
    columns: 2,
    square: false,
    cards: Object.entries(numbers).map(([key, name]) => numberTile(ctx, key, name))
  });
}
function sensorRows(ctx, rows) {
  return rows.map(([key, name]) => ({ entity: ctx.id("sensor", key), name }));
}
function otherSettingsSection(ctx) {
  const known = new Set(SETTING_GROUPS.flatMap((g) => Object.keys(g.numbers)));
  const prefixLen = ctx.prefix.length + 1;
  const unclaimed = (domain) => ctx.find(domain, /.*/).map((id) => ({ id, key: id.slice(domain.length + 1 + prefixLen) })).filter(({ key }) => !(domain === "number" && known.has(key)) && !SHOWN_ELSEWHERE.has(`${domain}.${key}`));
  const numbers = unclaimed("number");
  const rows = [...unclaimed("select"), ...unclaimed("switch")];
  return {
    cards: [
      { type: "heading", heading: "Other Settings" },
      numbers.length ? numberGrid(ctx, Object.fromEntries(numbers.map(({ key, id }) => [key, ctx.shortName(id)]))) : null,
      rows.length ? { type: "entities", show_header_toggle: false, entities: rows.map(({ id }) => ({ entity: id, name: ctx.shortName(id) })) } : null
    ]
  };
}
function configurationView(ctx) {
  const [socCurrent, voltageLimits, balancing, balanceCharge] = SETTING_GROUPS;
  return {
    title: "Configuration",
    type: "sections",
    max_columns: 4,
    sections: sections([
      {
        cards: [
          { type: "heading", heading: "Configuration Guide" },
          { type: "markdown", content: GUIDE }
        ]
      },
      {
        cards: [
          { type: "heading", heading: "Access & Write Status" },
          gridCard({
            type: "grid",
            columns: 1,
            square: false,
            cards: [
              entitiesCard(ctx, {
                type: "entities",
                title: "Settings Unlock",
                show_header_toggle: false,
                entities: [{ entity: ctx.id("switch", "settings_unlock"), name: "Settings Unlock" }]
              }),
              entityCard(ctx, {
                type: "custom:cellkeeper-state-tile",
                entity: ctx.id("sensor", "settings_status"),
                name: "Settings Status",
                colors: SETTINGS_STATUS_COLORS,
                ignore_case: true,
                color_text: true
              })
            ]
          })
        ]
      },
      {
        cards: [
          { type: "heading", heading: socCurrent.heading },
          numberGrid(ctx, socCurrent.numbers),
          entitiesCard(ctx, {
            type: "entities",
            title: "Current Limit Readback",
            entities: sensorRows(ctx, [
              ["current_limit_effective_charge", "Current Limit Effective Charge"],
              ["current_limit_effective_discharge", "Current Limit Effective Discharge"],
              ["current_limit_temperature_charge", "Current Limit Temperature Charge"],
              ["current_limit_temperature_discharge", "Current Limit Temperature Discharge"],
              ["current_limit_cell_voltage_charge", "Current Limit Cell Voltage Charge"],
              ["current_limit_cell_voltage_discharge", "Current Limit Cell Voltage Discharge"],
              ["current_limit_working_charge", "Current Limit Working Charge"],
              ["current_limit_working_discharge", "Current Limit Working Discharge"],
              ["current_limit_delta_charge", "Current Limit Delta Charge"],
              ["current_limit_hard_charge", "Current Limit Hard Charge"],
              ["current_limit_hard_discharge", "Current Limit Hard Discharge"]
            ])
          })
        ]
      },
      {
        cards: [{ type: "heading", heading: voltageLimits.heading }, numberGrid(ctx, voltageLimits.numbers)]
      },
      {
        cards: [
          { type: "heading", heading: balancing.heading },
          { type: "markdown", content: BALANCING_NOTE },
          numberGrid(ctx, balancing.numbers)
        ]
      },
      {
        cards: [
          { type: "heading", heading: balanceCharge.heading },
          { type: "markdown", content: BALANCE_CHARGE_NOTE },
          entityCard(ctx, { type: "tile", entity: ctx.id("sensor", "balance_charge_status"), name: "Balance Charge Status" }),
          entitiesCard(ctx, {
            type: "entities",
            show_header_toggle: false,
            entities: [
              { entity: ctx.id("button", "start_balance_charge_now"), name: "Start Balance Charge Now" },
              { entity: ctx.id("button", "stop_balance_charge"), name: "Stop Balance Charge" }
            ]
          }),
          numberGrid(ctx, balanceCharge.numbers)
        ]
      },
      {
        cards: [
          { type: "heading", heading: "Isolation Calibration" },
          { type: "markdown", content: ISOLATION_NOTE },
          entitiesCard(ctx, {
            type: "entities",
            entities: [
              { entity: ctx.id("sensor", "contactor_state_text"), name: "Contactor State" },
              { entity: ctx.id("button", "calibrate_isolation_zero"), name: "Calibrate Isolation Zero" },
              ...sensorRows(ctx, [
                ["pack_pos_to_chassis", "Pack Pos to Chassis"],
                ["pack_neg_to_chassis", "Pack Neg to Chassis"],
                ["isolation_resistance", "Isolation Resistance"],
                ["isolation_check_age", "Isolation Check Age"]
              ])
            ]
          })
        ]
      },
      otherSettingsSection(ctx)
    ])
  };
}

// src/views/system.js
init_context();
function systemView(ctx) {
  const rows = (rows2) => rows2.map(([key, name]) => ({ entity: ctx.id("sensor", key), ...name && { name } }));
  return {
    title: "System",
    type: "sections",
    max_columns: 2,
    sections: sections([
      {
        cards: [
          { type: "heading", heading: "BMS" },
          entitiesCard(ctx, {
            type: "entities",
            title: "BMS Device Info",
            entities: rows([
              ["serial", "Serial"],
              ["board_revision", "Board Revision"],
              ["uptime_pico", "Uptime Pico"],
              ["supply_voltage_3v3"],
              ["supply_voltage_5v"],
              ["supply_voltage_12v"],
              ["supply_voltage_contactor"]
            ])
          })
        ]
      },
      {
        cards: [
          { type: "heading", heading: "HMI" },
          entityCard(ctx, {
            type: "tile",
            entity: ctx.id("light", "display_backlight"),
            name: "LCD Backlight",
            grid_options: { columns: 12 },
            features_position: "bottom",
            features: [{ type: "light-brightness" }]
          }),
          entityCard(ctx, {
            type: "tile",
            entity: ctx.id("button", "hmi_restart"),
            name: "Reboot HMI",
            grid_options: { columns: 12 }
          }),
          entitiesCard(ctx, {
            type: "entities",
            title: "HMI Connectivity",
            entities: rows([
              ["wifi_ssid", "WiFi SSID"],
              ["wifi_ip", "WiFi IP"],
              ["wifi_rssi", "WiFi RSSI"]
            ])
          }),
          entitiesCard(ctx, {
            type: "entities",
            title: "HMI Device Info",
            entities: rows([
              ["uptime_hmi", "Uptime HMI"],
              ["internal_temperature", "Internal Temp"],
              ["heap_free", "Heap Free"],
              ["heap_max_block", "Heap Max Block"],
              ["loop_time", "Loop Time"]
            ])
          })
        ]
      }
    ])
  };
}

// src/views/log.js
init_context();
function logView(ctx) {
  const lines = ctx.find("sensor", /^log_\d+$/);
  if (!lines.length) return null;
  const controls = entitiesCard(ctx, {
    type: "entities",
    entities: [
      { entity: ctx.id("switch", "log_enable"), name: "Log Enable" },
      { entity: ctx.id("number", "log_update_rate"), name: "Update Rate (s)" }
    ]
  });
  return {
    title: "Log",
    panel: true,
    cards: [
      {
        type: "vertical-stack",
        cards: [
          controls && { type: "custom:cellkeeper-styled-card", style: "ha-card { max-width: 400px; }", card: controls },
          {
            type: "custom:cellkeeper-styled-card",
            style: "ha-card { background: #1a1a2e !important; font-family: 'Courier New', Courier, monospace; }\nha-markdown { padding: 16px !important; }",
            card: {
              type: "markdown",
              content: `## BMS Log Lines
\`\`\`
{% for i in range(1, ${lines.length + 1}) %}{% set s = states('sensor.${ctx.prefix}_log_%02d' | format(i)) %}{% if s not in ['unknown', 'unavailable'] %}{{ s }}
{% endif %}{% endfor %}\`\`\`
`
            }
          }
        ].filter(Boolean)
      }
    ]
  };
}

// src/views/event.js
init_context();
var KNOWN_EVENTS = {
  info: {
    boot_normal: "Boot Normal",
    boot_watchdog: "Boot Watchdog",
    restarting: "Restarting",
    inverter_detected: "Inverter Detected",
    contactor_port_energized: "Contactor Port Energized",
    bmb_module_id_unknown: "BMB Module ID Unknown"
  },
  warning: {
    battery_voltage_high: "Batt Voltage High",
    battery_voltage_low: "Batt Voltage Low",
    cell_voltage_high: "Cell Voltage High",
    cell_voltage_low: "Cell Voltage Low",
    cell_voltage_glitch: "Cell Voltage Glitch",
    module_temperature_glitch: "Module Temp Glitch",
    soft_charge_exceeded: "Soft Charge Exceeded",
    "5v_low": "5V Low",
    "5v_high": "5V High",
    "12v_low": "12V Low",
    "12v_high": "12V High",
    ctr_supply_high: "Ctr Supply High",
    supply_voltage_stale: "Supply Voltage Stale",
    battery_voltage_stale: "Batt Voltage Stale",
    battery_temperature_stale: "Batt Temp Stale",
    current_stale: "Current Stale",
    cell_voltages_stale: "Cell Voltages Stale",
    battery_temperature_high: "Batt Temp High",
    battery_temperature_low: "Batt Temp Low",
    loop_overrun: "Loop Overrun",
    link_voltage_mismatch: "Link Voltage Mismatch",
    fuse_voltage_drop_high: "Fuse Voltage Drop High",
    isolation_asymmetry: "Isolation Asymmetry",
    supervisor_not_enabled: "Supervisor Not Enabled",
    bmb_module_id_check_failed: "BMB Module ID Check Failed"
  },
  critical: {
    battery_voltage_very_high: "Batt Voltage Very High",
    battery_voltage_very_low: "Batt Voltage Very Low",
    cell_voltage_very_high: "Cell Voltage Very High",
    cell_voltage_very_low: "Cell Voltage Very Low",
    voltage_mismatch: "Voltage Mismatch",
    overcurrent_charging: "Overcurrent Charging",
    overcurrent_discharging: "Overcurrent Discharging",
    "3v3_low": "3V3 Low",
    "3v3_high": "3V3 High",
    ctr_supply_low: "Ctr Supply Low",
    pre_voltage_high: "PRE Voltage High",
    pre_current_high: "PRE Current High",
    pos_unexpected_open: "POS Unexpected Open",
    neg_unexpected_open: "NEG Unexpected Open",
    closing_failed: "Closing Failed",
    battery_temperature_very_high: "Batt Temp Very High",
    battery_temperature_very_low: "Batt Temp Very Low",
    bmb_read_error: "BMB Read Error",
    bmb_crc_mismatch: "BMB CRC Mismatch"
  },
  fatal: {
    ctr_supply_very_low: "Ctr Supply Very Low",
    pos_stuck_open: "POS Stuck Open",
    pos_stuck_closed: "POS Stuck Closed",
    neg_stuck_open: "NEG Stuck Open",
    neg_stuck_closed: "NEG Stuck Closed",
    pre_stuck_open: "PRE Stuck Open",
    pre_stuck_closed: "PRE Stuck Closed",
    e_stop_pressed: "E-Stop Pressed",
    board_mismatch: "Board Mismatch",
    supervisor_disabled_contactors: "Supervisor Disabled Contactors",
    bmb_module_id_conflict: "BMB Module ID Conflict"
  }
};
var EVENT_TILE_COLORS = [
  ...Object.entries(EVENT_COLORS).map(([level, color]) => ({ contains: level, color })),
  { not: ["INACTIVE (0)", "INACTIVE"], color: PREVIOUS_COLOR }
];
var GRID_STYLE = "#root { align-content: start !important; grid-auto-rows: minmax(56px, auto) !important; }";
function eventTiles(ctx, level) {
  const known = KNOWN_EVENTS[level];
  const found = ctx.find("sensor", new RegExp(`^event_${level}_`));
  const keyOf = (id) => id.slice(`sensor.${ctx.prefix}_event_${level}_`.length);
  const ordered = [
    ...Object.keys(known).map((key) => ctx.id("sensor", `event_${level}_${key}`)).filter((id) => found.includes(id)),
    ...found.filter((id) => !(keyOf(id) in known))
  ];
  return ordered.map((id, i) => ({
    type: "custom:cellkeeper-state-tile",
    entity: id,
    name: known[keyOf(id)] ?? ctx.shortName(id).replace(/^Event (Fatal|Critical|Warning|Info) /i, ""),
    ...i === 0 && { vertical: false, features_position: "bottom" },
    colors: EVENT_TILE_COLORS
  }));
}
function eventView(ctx) {
  const levels = [...EVENT_LEVELS].map((level) => ({ level, tiles: eventTiles(ctx, level) })).filter(({ tiles }) => tiles.length);
  if (!levels.length) return null;
  const title = (level) => `${level[0].toUpperCase()}${level.slice(1)} Events`;
  return {
    title: "Event",
    type: "sections",
    max_columns: 5,
    sections: [
      {
        cards: [
          { type: "heading", heading: "Status", heading_style: "title" },
          { type: "custom:cellkeeper-event-grid", prefix: ctx.prefix, show: "active", title: "Active Events", columns: 2 },
          {
            type: "custom:cellkeeper-event-grid",
            prefix: ctx.prefix,
            show: "previous",
            title: "Previously Active Events",
            columns: 2
          }
        ],
        column_span: 5
      },
      {
        type: "grid",
        cards: [
          { type: "heading", heading: "All Event Types", heading_style: "title" },
          ...levels.map(({ level, tiles }) => ({
            type: "custom:cellkeeper-styled-card",
            style: GRID_STYLE,
            card: { square: false, type: "grid", columns: 2, cards: tiles, title: title(level) }
          }))
        ],
        column_span: 5
      }
    ]
  };
}

// src/views/note.js
var DEYE = `### Deye Notes
- \`0% SOC\` is necessary to stop Deye discharging in off-grid mode, not just \`0A\` discharge.
- \`0A\` charge will stop charging. You do **not** need to send \`100% SOC\`.
- Deye does not stop charging at \`100% SOC\`; it only follows charge \`A\` and \`V\` limits.
- The charge voltage limit is obeyed. It goes about \`1V\` above the setpoint and holds there.

#### Off-Grid
- When charge current limit is set to \`0A\`, the inverter may over-volt the AC output on load drops.
- Ideally, regulate the battery top SOC with the **Charge Voltage Limit**, not the current limit.
- Ensure the \`V Offset\` is set low enough to take effect before current limiting takes over at the top of charge regulation.
`;
var SOLAX = `### Solax Notes
- Solax needs \`100% SOC\` to stop charging.
- It will feather current at \`99% SOC\`.
- Discharge current limits are followed with reasonable error. If set to \`0A\`, it gently discharges.
- Charging current-limit following is not yet confirmed.
`;
var BALANCING = `### Cell Balancing Behavior
- Balancing runs in two phases: odd-numbered cells first, then even-numbered cells.
- Adjacent cells cannot balance at the same time.
- That means two cells next to each other (for example, \`1\` and \`2\`) are effectively sequential, while spaced cells (for example, \`1\` and \`4\`) can overlap in time.
`;
var EVENTS = `### Event Severity Levels & Safety Logic
- **INFO**: General information about system status.
- **WARNING**: Potential issues. (Repeated warnings may escalate to CRITICAL).
- **CRITICAL**: Serious issues. Will escalate to **FATAL** after a per-event leeway time (e.g., 1000ms).
- **FATAL**: Immediate action required. Opens contactors.

**Contactor Safety Protocol (Two-Step):**
1. Set current limits to zero.
2. Wait until current falls below threshold (or FORCE_OPEN after 2s for FATAL events).

**Event Settings:**
- Level: INFO / WARNING / CRITICAL / FATAL.
- Leeway: Milliseconds before escalation.
- Max Occurrences: Threshold for escalation.
`;
function noteView() {
  return {
    title: "Note",
    type: "sections",
    max_columns: 2,
    sections: [
      { cards: [{ type: "heading", heading: "Deye" }, { type: "markdown", content: DEYE }] },
      { cards: [{ type: "heading", heading: "Solax" }, { type: "markdown", content: SOLAX }] },
      {
        type: "grid",
        cards: [{ type: "heading", heading: "Balancing", heading_style: "title" }, { type: "markdown", content: BALANCING }]
      },
      {
        type: "grid",
        cards: [{ type: "heading", heading: "Events", heading_style: "title" }, { type: "markdown", content: EVENTS }]
      }
    ]
  };
}

// src/strategy.js
var VIEWS = {
  overview: (ctx, options) => overviewView(ctx, options),
  detail: (ctx) => detailView(ctx),
  cells: (ctx, _o, plotly) => cellsView(ctx, plotly),
  cells_3d: (ctx, _o, plotly) => ctx.cellIds("cell_voltage").length ? cells3dView(ctx, plotly) : null,
  cells_2d: (ctx, _o, plotly) => ctx.cellIds("cell_voltage").length ? cells2dView(ctx, plotly) : null,
  configuration: (ctx) => configurationView(ctx),
  system: (ctx) => systemView(ctx),
  log: (ctx) => logView(ctx),
  event: (ctx) => eventView(ctx),
  note: () => noteView()
};
var PLOTLY_HINT = {
  type: "markdown",
  content: "This chart needs **Plotly Graph Card**. Install it from HACS (search for *plotly*), then reload this dashboard."
};
async function plotlyInstalled() {
  if (customElements.get("plotly-graph")) return true;
  const timeout = new Promise((resolve) => setTimeout(() => resolve(false), 3e3));
  return Promise.race([customElements.whenDefined("plotly-graph").then(() => true), timeout]);
}
async function generateDashboard(config, hass, { hasPlotly = true } = {}) {
  const prefix = config.prefix || DEFAULT_PREFIX;
  const ctx = new PackContext(prefix, hass);
  const plotly = (card) => hasPlotly ? card : PLOTLY_HINT;
  if (!ctx.has(ctx.id("sensor", "system_state_text")) && !ctx.has(ctx.id("sensor", "soc"))) {
    return {
      title: config.title ?? "BMS Dashboard",
      views: [
        {
          title: "Overview",
          cards: [
            {
              type: "markdown",
              content: `No CellKeeper entities found for prefix **${prefix}** (looked for \`sensor.${prefix}_system_state_text\`).

Name the pack's HMI device so its entities start with the prefix (first pack \`ck0\`, then \`ck1\`, ...), or set \`prefix:\` in this dashboard's strategy options.`
            }
          ]
        }
      ]
    };
  }
  const hidden = new Set(config.hide_views ?? []);
  const views = Object.entries(VIEWS).filter(([key]) => !hidden.has(key)).map(([, view]) => view(ctx, config, plotly)).filter(Boolean);
  return { title: config.title ?? "BMS Dashboard", views };
}
var CellKeeperDashboardStrategy = class extends HTMLElement {
  static async generate(config, hass) {
    return generateDashboard(config, hass, { hasPlotly: await plotlyInstalled() });
  }
  static async getConfigElement() {
    await Promise.resolve().then(() => (init_editor(), editor_exports));
    return document.createElement("cellkeeper-dashboard-strategy-editor");
  }
};

// src/index.js
init_context();
define("ll-strategy-dashboard-cellkeeper", CellKeeperDashboardStrategy);
console.info(`%c CELLKEEPER-DASHBOARD %c ${"0.1.0"} `, "color: white; background: #2e7d32", "");
