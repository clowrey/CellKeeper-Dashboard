import { entitiesCard, sections } from "../context.js";

function list(ctx, title, keys) {
  return entitiesCard(ctx, { type: "entities", title, entities: keys.map((k) => ({ entity: ctx.id("sensor", k) })) });
}

export function detailView(ctx) {
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
