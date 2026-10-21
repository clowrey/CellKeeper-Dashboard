import { EVENT_LEVELS } from "../context.js";
import { EVENT_COLORS, PREVIOUS_COLOR } from "../cards/event-grid.js";

// Short tile names for the events the old YAML dashboard listed, in its order.
// Events not listed here (newer firmware) follow, named from their friendly name.
const KNOWN_EVENTS = {
  info: {
    boot_normal: "Boot Normal",
    boot_watchdog: "Boot Watchdog",
    restarting: "Restarting",
    inverter_detected: "Inverter Detected",
    contactor_port_energized: "Contactor Port Energized",
    bmb_module_id_unknown: "BMB Module ID Unknown",
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
    bmb_module_id_check_failed: "BMB Module ID Check Failed",
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
    bmb_crc_mismatch: "BMB CRC Mismatch",
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
    bmb_module_id_conflict: "BMB Module ID Conflict",
  },
};

// Tile colour by event state: the level it is active at, purple once it has been active.
export const EVENT_TILE_COLORS = [
  ...Object.entries(EVENT_COLORS).map(([level, color]) => ({ contains: level, color })),
  { not: ["INACTIVE (0)", "INACTIVE"], color: PREVIOUS_COLOR },
];

const GRID_STYLE = "#root { align-content: start !important; grid-auto-rows: minmax(56px, auto) !important; }";

function eventTiles(ctx, level) {
  const known = KNOWN_EVENTS[level];
  const found = ctx.find("sensor", new RegExp(`^event_${level}_`));
  const keyOf = (id) => id.slice(`sensor.${ctx.prefix}_event_${level}_`.length);
  const ordered = [
    ...Object.keys(known).map((key) => ctx.id("sensor", `event_${level}_${key}`)).filter((id) => found.includes(id)),
    ...found.filter((id) => !(keyOf(id) in known)),
  ];
  return ordered.map((id, i) => ({
    type: "custom:cellkeeper-state-tile",
    entity: id,
    name: known[keyOf(id)] ?? ctx.shortName(id).replace(/^Event (Fatal|Critical|Warning|Info) /i, ""),
    ...(i === 0 && { vertical: false, features_position: "bottom" }),
    colors: EVENT_TILE_COLORS,
  }));
}

export function eventView(ctx) {
  const levels = [...EVENT_LEVELS]
    .map((level) => ({ level, tiles: eventTiles(ctx, level) }))
    .filter(({ tiles }) => tiles.length);
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
            columns: 2,
          },
        ],
        column_span: 5,
      },
      {
        type: "grid",
        cards: [
          { type: "heading", heading: "All Event Types", heading_style: "title" },
          ...levels.map(({ level, tiles }) => ({
            type: "custom:cellkeeper-styled-card",
            style: GRID_STYLE,
            card: { square: false, type: "grid", columns: 2, cards: tiles, title: title(level) },
          })),
        ],
        column_span: 5,
      },
    ],
  };
}
