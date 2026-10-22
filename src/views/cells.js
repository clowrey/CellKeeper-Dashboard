// Cell History: every cell's voltage over time, as a heatmap or a 3D surface, from one statistics
// request.
export function cellHistoryView(ctx) {
  return {
    title: "Cell History",
    type: "panel",
    cards: [{ type: "custom:cellkeeper-cell-history-card", prefix: ctx.prefix }],
  };
}
