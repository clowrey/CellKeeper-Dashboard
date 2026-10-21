import { entitiesCard, entityCard, sections } from "../context.js";

export function systemView(ctx) {
  const rows = (rows) => rows.map(([key, name]) => ({ entity: ctx.id("sensor", key), ...(name && { name }) }));
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
              ["supply_voltage_contactor"],
            ]),
          }),
        ],
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
            features: [{ type: "light-brightness" }],
          }),
          entityCard(ctx, {
            type: "tile",
            entity: ctx.id("button", "hmi_restart"),
            name: "Reboot HMI",
            grid_options: { columns: 12 },
          }),
          entitiesCard(ctx, {
            type: "entities",
            title: "HMI Connectivity",
            entities: rows([
              ["wifi_ssid", "WiFi SSID"],
              ["wifi_ip", "WiFi IP"],
              ["wifi_rssi", "WiFi RSSI"],
            ]),
          }),
          entitiesCard(ctx, {
            type: "entities",
            title: "HMI Device Info",
            entities: rows([
              ["uptime_hmi", "Uptime HMI"],
              ["internal_temperature", "Internal Temp"],
              ["heap_free", "Heap Free"],
              ["heap_max_block", "Heap Max Block"],
              ["loop_time", "Loop Time"],
            ]),
          }),
        ],
      },
    ]),
  };
}
