// Cells 2D and Cells 3D: every cell's voltage history, from one statistics request each.

export function cells3dView(ctx, plotly) {
  return {
    title: "Cells 3D",
    path: "cells-3d",
    type: "panel",
    cards: [plotly({ type: "custom:cellkeeper-cells-3d-card", prefix: ctx.prefix })],
  };
}

// Drawn by the dashboard itself; doesn't need Plotly Graph Card.
export function cells2dView(ctx) {
  return {
    title: "Cells 2D",
    path: "cells-2d",
    type: "panel",
    cards: [{ type: "custom:cellkeeper-cell-history-card", prefix: ctx.prefix }],
  };
}
