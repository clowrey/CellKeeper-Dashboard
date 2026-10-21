import { entitiesCard } from "../context.js";

export function logView(ctx) {
  const lines = ctx.find("sensor", /^log_\d+$/);
  if (!lines.length) return null;
  const controls = entitiesCard(ctx, {
    type: "entities",
    entities: [
      { entity: ctx.id("switch", "log_enable"), name: "Log Enable" },
      { entity: ctx.id("number", "log_update_rate"), name: "Update Rate (s)" },
    ],
  });
  return {
    title: "Log",
    panel: true,
    cards: [
      {
        type: "vertical-stack",
        cards: [
          controls && { type: "custom:cellkeeper-styled-card", style: "ha-card { max-width: 400px; }", card: controls },
          {
            type: "custom:cellkeeper-styled-card",
            style:
              "ha-card { background: #1a1a2e !important; font-family: 'Courier New', Courier, monospace; }\n" +
              "ha-markdown { padding: 16px !important; }",
            card: {
              type: "markdown",
              content:
                "## BMS Log Lines\n```\n" +
                `{% for i in range(1, ${lines.length + 1}) %}{% set s = states('sensor.${ctx.prefix}_log_%02d' | format(i)) %}` +
                "{% if s not in ['unknown', 'unavailable'] %}{{ s }}\n{% endif %}{% endfor %}```\n",
            },
          },
        ].filter(Boolean),
      },
    ],
  };
}
