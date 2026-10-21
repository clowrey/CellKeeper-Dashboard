// Inverter and behaviour notes, unchanged from the YAML dashboard.

const DEYE = `### Deye Notes
- \`0% SOC\` is necessary to stop Deye discharging in off-grid mode, not just \`0A\` discharge.
- \`0A\` charge will stop charging. You do **not** need to send \`100% SOC\`.
- Deye does not stop charging at \`100% SOC\`; it only follows charge \`A\` and \`V\` limits.
- The charge voltage limit is obeyed. It goes about \`1V\` above the setpoint and holds there.

#### Off-Grid
- When charge current limit is set to \`0A\`, the inverter may over-volt the AC output on load drops.
- Ideally, regulate the battery top SOC with the **Charge Voltage Limit**, not the current limit.
- Ensure the \`V Offset\` is set low enough to take effect before current limiting takes over at the top of charge regulation.
`;

const SOLAX = `### Solax Notes
- Solax needs \`100% SOC\` to stop charging.
- It will feather current at \`99% SOC\`.
- Discharge current limits are followed with reasonable error. If set to \`0A\`, it gently discharges.
- Charging current-limit following is not yet confirmed.
`;

const BALANCING = `### Cell Balancing Behavior
- Balancing runs in two phases: odd-numbered cells first, then even-numbered cells.
- Adjacent cells cannot balance at the same time.
- That means two cells next to each other (for example, \`1\` and \`2\`) are effectively sequential, while spaced cells (for example, \`1\` and \`4\`) can overlap in time.
`;

const EVENTS = `### Event Severity Levels & Safety Logic
- **INFO**: General information about system status.
- **WARNING**: Potential issues. (Repeated warnings may escalate to CRITICAL).
- **CRITICAL**: Serious issues. Will escalate to **FATAL** after a per-event leeway time (e.g., 1000ms).
- **FATAL**: Immediate action required. Opens contactors.

**Contactor Safety Protocol (Two-Step):**
1. Set current limits to zero.
2. Wait until current falls below threshold (or FORCE_OPEN after 2s for FATAL events).

**Event Settings:**
- Level: INFO / WARNING / CRITICAL / FATAL.
- Leeway: Milliseconds before escalation.
- Max Occurrences: Threshold for escalation.
`;

export function noteView() {
  return {
    title: "Note",
    type: "sections",
    max_columns: 2,
    sections: [
      { cards: [{ type: "heading", heading: "Deye" }, { type: "markdown", content: DEYE }] },
      { cards: [{ type: "heading", heading: "Solax" }, { type: "markdown", content: SOLAX }] },
      {
        type: "grid",
        cards: [{ type: "heading", heading: "Balancing", heading_style: "title" }, { type: "markdown", content: BALANCING }],
      },
      {
        type: "grid",
        cards: [{ type: "heading", heading: "Events", heading_style: "title" }, { type: "markdown", content: EVENTS }],
      },
    ],
  };
}
