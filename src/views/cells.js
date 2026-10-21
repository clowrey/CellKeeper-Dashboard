import { entitiesCard, MAX_CELLS } from "../context.js";

// Parses "1-4,7" style cell lists (sensor.<prefix>_cells_balancing) into a Set.
const PARSE_CELL_RANGES = `const parse_cell_ranges = (raw, out_set) => {
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

export function cellsView(ctx, plotly) {
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
              "balance_cycle_time_remaining",
            ].map((k) => ({ entity: ctx.id("sensor", k) })),
          }),
          ctx.cellIds("cell_voltage").length
            ? plotly({
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
                    marker: { color: "#3498db" },
                  },
                  {
                    entity: "",
                    type: "bar",
                    x: "$ex vars.x",
                    y: "$ex vars.balance",
                    yaxis: "y2",
                    name: "Balancing Time",
                    marker: { color: "$ex vars.balance_colors" },
                    opacity: 0.65,
                  },
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
                    range: [0, "$ex vars.balance_axis_max"],
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
                      font: { size: 12, color: "#FDD835" },
                    },
                  ],
                },
                config: { responsive: true, displayModeBar: false, scrollZoom: false },
              })
            : null,
        ].filter(Boolean),
      },
    ],
  };
}

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
