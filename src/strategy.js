import { DEFAULT_PREFIX, PackContext } from "./context.js";
import { overviewView } from "./views/overview.js";
import { detailView } from "./views/detail.js";
import { cellsView, cells3dView, cells2dView } from "./views/cells.js";
import { configurationView } from "./views/configuration.js";
import { systemView } from "./views/system.js";
import { logView } from "./views/log.js";
import { eventView } from "./views/event.js";
import { noteView } from "./views/note.js";

// View key -> generator(ctx, options, plotly). Keys are what `hide_views` takes.
export const VIEWS = {
  overview: (ctx, options) => overviewView(ctx, options),
  detail: (ctx) => detailView(ctx),
  cells: (ctx, _o, plotly) => cellsView(ctx, plotly),
  cells_3d: (ctx, _o, plotly) => (ctx.cellIds("cell_voltage").length ? cells3dView(ctx, plotly) : null),
  cells_2d: (ctx, _o, plotly) => (ctx.cellIds("cell_voltage").length ? cells2dView(ctx, plotly) : null),
  configuration: (ctx) => configurationView(ctx),
  system: (ctx) => systemView(ctx),
  log: (ctx) => logView(ctx),
  event: (ctx) => eventView(ctx),
  note: () => noteView(),
};

const PLOTLY_HINT = {
  type: "markdown",
  content:
    "This chart needs **Plotly Graph Card**. Install it from HACS (search for *plotly*), " +
    "then reload this dashboard.",
};

// Wait briefly for plotly-graph: dashboard resources load in parallel with this one.
async function plotlyInstalled() {
  if (customElements.get("plotly-graph")) return true;
  const timeout = new Promise((resolve) => setTimeout(() => resolve(false), 3000));
  return Promise.race([customElements.whenDefined("plotly-graph").then(() => true), timeout]);
}

export async function generateDashboard(config, hass, { hasPlotly = true } = {}) {
  const prefix = config.prefix || DEFAULT_PREFIX;
  const ctx = new PackContext(prefix, hass);
  const plotly = (card) => (hasPlotly ? card : PLOTLY_HINT);

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
      const v = view(ctx, config, plotly);
      return v && { path: key.replace(/_/g, "-"), ...v };
    })
    .filter(Boolean);
  return { title: config.title ?? "BMS Dashboard", views };
}

export class CellKeeperDashboardStrategy extends HTMLElement {
  static async generate(config, hass) {
    return generateDashboard(config, hass, { hasPlotly: await plotlyInstalled() });
  }

  static async getConfigElement() {
    await import("./editor.js");
    return document.createElement("cellkeeper-dashboard-strategy-editor");
  }
}
