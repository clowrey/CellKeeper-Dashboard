import { entitiesCard, entityCard, gridCard, sections } from "../context.js";

const RED = "#db4437";
const ORANGE = "#ffa600";
const GREEN = "#43a047";

const CELL_SEGMENTS = [
  { from: 2.95, color: RED },
  { from: 3, color: ORANGE },
  { from: 3.3, color: GREEN },
  { from: 4.15, color: ORANGE },
  { from: 4.2, color: RED },
];

// Gauges keyed by the names users can override with the `gauges` option.
export function defaultGauges() {
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
        { from: 400, color: RED },
      ],
    },
    cell_voltage_min: { name: "Cell Voltage Min", min: 2.95, max: 4.25, needle: true, segments: CELL_SEGMENTS },
    cell_voltage_max: { name: "Cell Voltage Max", min: 2.95, max: 4.25, needle: true, segments: CELL_SEGMENTS },
    current: { name: "Current", min: -200, max: 200, needle: true, severity: { green: 0, red: -200 } },
    power: { name: "Power", unit: "W", min: -10000, max: 10000, needle: true, severity: { green: 0, red: -10000 } },
  };
}

const GAUGE_ENTITIES = {
  soc: "soc",
  pack_voltage: "pack_internal_voltage",
  cell_voltage_min: "cell_voltage_min",
  cell_voltage_max: "cell_voltage_max",
  current: "current",
  power: "power_w",
};

function gauge(ctx, key, overrides) {
  const { name, ...rest } = { ...defaultGauges()[key], ...overrides?.[key] };
  return entityCard(ctx, { type: "gauge", entity: ctx.id("sensor", GAUGE_ENTITIES[key]), name, ...rest });
}

export function activeEventsCard(ctx) {
  return { type: "custom:cellkeeper-event-grid", prefix: ctx.prefix, show: "active", title: "Active Events", columns: 2 };
}

export function overviewView(ctx, options) {
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
            cards: Object.keys(GAUGE_ENTITIES).map((key) => gauge(ctx, key, options.gauges)),
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
                icon: "mdi:wrench",
              },
            ],
          }),
        ],
      },
    ]),
  };
}
