import { entitiesCard, sections } from "../context.js";

function list(ctx, title, keys) {
  return entitiesCard(ctx, { type: "entities", title, entities: keys.map((k) => ({ entity: ctx.id("sensor", k) })) });
}

// The original layout, kept as `detail: classic`.
export function classicDetailView(ctx) {
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
            "soc_basic_count",
          ]),
          list(ctx, "Isolation", ["pack_pos_to_chassis", "pack_neg_to_chassis", "isolation_resistance", "isolation_check_age"]),
          list(ctx, "Inverter CAN Values", [
            "inverter_can_soc",
            "inverter_can_capacity_full",
            "inverter_can_capacity_remaining",
            "inverter_can_voltage_limit_min",
            "inverter_can_voltage_limit_max",
            "current_limit_effective_charge",
            "current_limit_effective_discharge",
          ]),
          list(ctx, "Energy Stats", [
            "power_charge",
            "power_discharge",
            "energy_daily_charge",
            "energy_daily_discharge",
            "energy_daily_net",
          ]),
        ],
      },
      {
        cards: [
          { type: "heading", heading: "Temperature" },
          list(ctx, "Temperature", ["module_temperature_min", "module_temperature_max"]),
          entitiesCard(ctx, {
            type: "entities",
            title: "Module Temperatures",
            entities: ctx
              .find("sensor", /^module_temperature_\d+$/)
              .sort((a, b) => parseInt(a.match(/\d+$/)) - parseInt(b.match(/\d+$/)))
              .map((entity) => ({ entity })),
          }),
        ],
      },
    ]),
  };
}

// ---- the Detail view: every pack sensor, grouped ----
//
// Each group lists its sensors in this order (whether or not another view shows them too), then
// any other sensor whose key matches `match`, so sensors from newer firmware land next to their
// relatives; what matches no group goes to "Other sensors". Sensors with a view of their own
// (per-cell voltages and balancing times, log lines, events) are left out.

const GROUPS = [
  {
    section: "Battery",
    title: "State of charge",
    keys: ["soc", "soc_voltage_based", "soc_basic_count", "capacity", "charge_raw"],
    match: /^soc|^capacity|^charge/,
  },
  {
    section: "Battery",
    title: "Pack voltages",
    keys: ["pack_internal_voltage", "pack_internal_voltage_bmb", "pack_output_voltage", "contactor_voltage_positive", "contactor_voltage_negative"],
    match: /^pack_.*voltage|^contactor_voltage|^link_voltage|^fuse/,
  },
  {
    section: "Battery",
    title: "Current & power",
    keys: ["current", "power_w", "power", "power_charge", "power_discharge"],
    match: /^current(?!_limit)|^power/,
  },
  { section: "Battery", title: "Energy today", keys: ["energy_daily_charge", "energy_daily_discharge", "energy_daily_net"], match: /^energy/ },
  { section: "Cells", title: "Cells", keys: ["cell_count", "cell_voltage_min", "cell_voltage_max", "cell_voltage_delta"], match: /^cell_/ },
  {
    section: "Cells",
    title: "Balancing",
    keys: [
      "cells_balancing", "cells_balancing_active", "cells_balancing_count", "cells_balancing_active_count",
      "balance_cycle_time_remaining", "balance_cycle_time_remaining_seconds", "balance_charge_status",
    ],
    match: /^cells_balancing|^balanc/,
  },
  {
    section: "Cells",
    title: "Module temperatures",
    keys: ["module_temperature_min", "module_temperature_max"],
    match: /^module_temperature/,
    numbered: true,
  },
  {
    section: "Limits & inverter",
    title: "Current limits",
    keys: [
      "current_limit_effective_charge", "current_limit_effective_discharge",
      "current_limit_hard_charge", "current_limit_hard_discharge",
      "current_limit_temperature_charge", "current_limit_temperature_discharge",
      "current_limit_cell_voltage_charge", "current_limit_cell_voltage_discharge",
      "current_limit_working_charge", "current_limit_working_discharge", "current_limit_delta_charge",
    ],
    match: /^current_limit_/,
  },
  {
    section: "Limits & inverter",
    title: "Inverter (CAN)",
    keys: [
      "inverter_can_soc", "inverter_can_voltage_limit_min", "inverter_can_voltage_limit_max",
      "inverter_can_capacity_full", "inverter_can_capacity_remaining",
    ],
    match: /^inverter/,
  },
  {
    section: "Limits & inverter",
    title: "Isolation",
    keys: ["isolation_resistance", "pack_pos_to_chassis", "pack_neg_to_chassis", "isolation_check_age"],
    match: /^isolation|_to_chassis$/,
  },
  {
    section: "Limits & inverter",
    title: "State",
    keys: [
      "system_state_text", "system_state", "system_request_text", "system_request", "contactor_state_text",
      "contactor_state", "settings_status", "last_event_text", "event_history",
    ],
    match: /^system_|^contactor_state|^settings_|event/,
  },
  {
    section: "Hardware",
    title: "BMS board",
    keys: [
      "bms_firmware", "serial", "board_revision", "board_strap_counts", "uptime_pico", "millis",
      "supply_voltage_3v3", "supply_voltage_5v", "supply_voltage_12v", "supply_voltage_contactor",
    ],
    match: /^supply_voltage|^board_|^uptime_pico|^millis|^serial|^bms_/,
  },
  {
    section: "Hardware",
    title: "Board temperatures",
    keys: ["bms_chip_temperature", "shunt_die_temperature", "shunt_ntc_temperature"],
    match: /^shunt_|chip_temperature/,
  },
  {
    section: "Hardware",
    title: "HMI",
    keys: [
      "hmi_firmware", "uptime_hmi", "internal_temperature", "heap_free", "heap_max_block", "loop_time",
      "wifi_ssid", "wifi_ip", "wifi_rssi", "bssid",
    ],
    match: /^hmi_|^uptime_hmi|^internal_temperature|^heap|^loop|^wifi|^bssid/,
  },
];

// Raw BMB temperature registers: debug values, last and on their own.
const RAW = /^raw_temp_/;
// Sensors with a view of their own.
const ELSEWHERE = /^cell_voltage_\d+$|^cell_balancing_time_\d+$|^log(_\d+)?$|^event_(info|warning|critical|fatal)_/;

const sensorKey = (ctx, id) => id.slice(id.indexOf(".") + 1 + ctx.prefix.length + 1);
const numberOf = (key) => parseInt(key.match(/(\d+)$/)?.[1] ?? "0", 10);

export function detailView(ctx, options = {}) {
  if (options.detail === "classic") return classicDetailView(ctx);
  const all = [...ctx.find("sensor", /.*/), ...ctx.find("binary_sensor", /.*/)];
  const byKey = new Map(all.map((id) => [sensorKey(ctx, id), id]));
  const claimed = new Set();
  const take = (key) => {
    const id = byKey.get(key);
    if (!id || claimed.has(key)) return [];
    claimed.add(key);
    return [id];
  };

  // Listed keys first, so a key matching two groups' patterns stays where it was put.
  const groups = GROUPS.map((g) => ({ ...g, ids: g.keys.flatMap(take) }));
  const free = [...byKey.keys()].filter((k) => !claimed.has(k) && !ELSEWHERE.test(k) && !RAW.test(k));
  for (const g of groups) {
    const extra = free.filter((k) => !claimed.has(k) && g.match.test(k));
    if (g.numbered) extra.sort((a, b) => numberOf(a) - numberOf(b));
    g.ids.push(...extra.flatMap(take));
  }
  const other = free.filter((k) => !claimed.has(k)).flatMap(take);
  const raw = [...byKey.keys()]
    .filter((k) => RAW.test(k))
    .sort((a, b) => parseInt(a.slice(9), 16) - parseInt(b.slice(9), 16))
    .flatMap(take);

  const card = (title, ids) =>
    ids.length ? { type: "entities", title, entities: ids.map((entity) => ({ entity, name: ctx.shortName(entity) })) } : null;
  const sectionCards = (name) => groups.filter((g) => g.section === name).map((g) => card(g.title, g.ids));

  return {
    title: "Detail",
    type: "sections",
    max_columns: 4,
    sections: sections([
      ...["Battery", "Cells", "Limits & inverter"].map((name) => ({
        cards: [{ type: "heading", heading: name }, ...sectionCards(name)],
      })),
      {
        cards: [
          { type: "heading", heading: "Hardware" },
          ...sectionCards("Hardware"),
          card("Other sensors", other),
          card("Raw temperature registers", raw),
        ],
      },
    ]),
  };
}
