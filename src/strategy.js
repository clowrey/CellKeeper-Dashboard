import { DEFAULT_PREFIX, PackContext } from "./context.js";
import { overviewView } from "./views/overview.js";
import { cellHistoryView } from "./views/cells.js";
import { configurationView } from "./views/configuration.js";
import { systemView } from "./views/system.js";
import { logView } from "./views/log.js";
import { eventView } from "./views/event.js";
import { noteView } from "./views/note.js";

// View key -> generator(ctx, options). Keys are what `hide_views` takes.
export const VIEWS = {
  overview: (ctx, options) => overviewView(ctx, options),
  event: (ctx, options) => eventView(ctx, options),
  cell_history: (ctx) => (ctx.cellIds("cell_voltage").length ? cellHistoryView(ctx) : null),
  configuration: (ctx, options) => configurationView(ctx, options),
  system: (ctx, options) => systemView(ctx, options),
  log: (ctx) => logView(ctx),
  note: () => noteView(),
};

export async function generateDashboard(config, hass) {
  const prefix = config.prefix || DEFAULT_PREFIX;
  const ctx = new PackContext(prefix, hass);

  if (!ctx.has(ctx.id("sensor", "system_state_text")) && !ctx.has(ctx.id("sensor", "soc"))) {
    return {
      title: config.title ?? "BMS Dashboard",
      views: [
        {
          title: "Overview",
          cards: [
            {
              type: "markdown",
              content:
                `No CellKeeper entities found for prefix **${prefix}** (looked for \`sensor.${prefix}_system_state_text\`).\n\n` +
                "Name the pack's HMI device so its entities start with the prefix (first pack `ck0`, then `ck1`, ...), " +
                "or set `prefix:` in this dashboard's strategy options.",
            },
          ],
        },
      ],
    };
  }

  const hidden = new Set(config.hide_views ?? []);
  const views = Object.entries(VIEWS)
    .filter(([key]) => !hidden.has(key))
    .map(([key, view]) => {
      const v = view(ctx, config);
      return v && { path: key.replace(/_/g, "-"), ...v };
    })
    .filter(Boolean);
  return { title: config.title ?? "BMS Dashboard", views };
}

export class CellKeeperDashboardStrategy extends HTMLElement {
  static async generate(config, hass) {
    return generateDashboard(config, hass);
  }

  static async getConfigElement() {
    await import("./editor.js");
    return document.createElement("cellkeeper-dashboard-strategy-editor");
  }
}
