import { VOLTAGE_STOPS, percentile } from "./history.js";

// Plotly Graph Card config drawing the cell history (from fetchCellHistory) as a 3D surface.
// The data goes in as plain arrays, so the card only draws.
export function surfaceConfig(d, range, height) {
  const all = [];
  d.z.forEach((row) => row.forEach((v) => all.push(v)));
  return {
    type: "custom:plotly-graph",
    raw_plotly_config: true,
    hours_to_show: range,
    entities: [
      {
        entity: "",
        type: "surface",
        x: Array.from({ length: d.cols }, (_, k) => new Date(d.t0 + k * d.step)),
        y: d.cells.map((c) => c.n),
        z: d.z.map((row) => Array.from(row, (v) => (Number.isNaN(v) ? null : v))),
        colorscale: VOLTAGE_STOPS.map((c, i) => [i / (VOLTAGE_STOPS.length - 1), c]),
        cmin: percentile(all, 0.01),
        cmax: percentile(all, 0.99),
        colorbar: { title: { text: "V" } },
        hovertemplate: "Cell %{y}<br>%{x|%a %H:%M}<br>%{z:.3f} V<extra></extra>",
      },
    ],
    layout: {
      height,
      margin: { t: 0, l: 0, r: 0, b: 0 },
      scene: {
        // Time runs left to right across a wide, low surface.
        aspectmode: "manual",
        aspectratio: { x: 2.2, y: 1.1, z: 0.6 },
        camera: { eye: { x: 0.6, y: -2.1, z: 1.1 } },
        xaxis: { title: { text: "Time" } },
        yaxis: { title: { text: "Cell" } },
        zaxis: { title: { text: "V" } },
      },
    },
    config: { displayModeBar: false },
  };
}
