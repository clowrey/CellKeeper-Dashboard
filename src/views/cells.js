import { MAX_CELLS } from "../context.js";

// History of every cell voltage, resampled to 1 min, collected into vars.data.
function cellHistory(ctx) {
  return {
    defaults: {
      entity: {
        internal: true,
        filters: [{ resample: "1m" }],
        fn: "$ex {\n    vars.data.push(ys);\n    vars.xs = xs;\n }\n",
      },
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
    entities: ctx.cellIds("cell_voltage").map((entity) => ({ entity })),
  };
}

const LOAD_WARNING = (what) =>
  `**Warning:** This ${what} view can take 30+ seconds to load while Home Assistant gathers and renders all cell history points.\n`;

export function cells3dView(ctx, plotly) {
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
                zaxis: { title: "V" },
              },
            },
            entities: [
              ...history.entities,
              {
                entity: "",
                internal: false,
                type: "surface",
                x: "$ex vars.xs",
                y: "$ex vars.data.slice(0, vars.cell_count).map((_,i)=>i+1)",
                z: "$ex vars.data.slice(0, vars.cell_count)",
              },
            ],
          }),
        ],
      },
    ],
  };
}

// Plotly markers for the cells listed in a cells_balancing style sensor over time.
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
`,
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
    marker: { color, size: 4, line: { color: "#000000", width: 1 } },
  };
}

export function cells2dView(ctx, plotly) {
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
              coloraxis: { colorbar: { title: "V" } },
            },
            config: { displayModeBar: false, scrollZoom: false },
            entities: [
              ...history.entities,
              ...(ctx.has(balancing) ? [balancingMarkers(balancing, "balance_x", "balance_y")] : []),
              ...(ctx.has(active) ? [balancingMarkers(active, "active_x", "active_y")] : []),
              {
                entity: "",
                internal: false,
                type: "heatmap",
                x: "$ex vars.xs",
                y: "$ex vars.data.slice(0, vars.cell_count).map((_,i)=>i+1)",
                z: "$ex vars.data.slice(0, vars.cell_count)",
                coloraxis: "coloraxis",
              },
              ...(ctx.has(balancing) ? [markerTrace("Balancing", "balance_x", "balance_y", "#39FF14")] : []),
              ...(ctx.has(active) ? [markerTrace("Balancing Active", "active_x", "active_y", "#AA00FF")] : []),
            ],
          }),
        ],
      },
    ],
  };
}
