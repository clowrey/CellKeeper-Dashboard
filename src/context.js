// Shared state for one generate() call: the pack prefix and what exists in HA.

export const DEFAULT_PREFIX = "ck0";
export const MAX_CELLS = 108;

export const EVENT_LEVELS = ["info", "warning", "critical", "fatal"];

export class PackContext {
  constructor(prefix, hass) {
    this.prefix = prefix;
    this.hass = hass;
  }

  // "sensor", "soc" -> "sensor.ck0_soc"
  id(domain, key) {
    return `${domain}.${this.prefix}_${key}`;
  }

  has(entityId) {
    return entityId in this.hass.states;
  }

  // Entity ids of this pack in a domain whose key matches the regex, in HA's order.
  find(domain, keyRegex) {
    const start = `${domain}.${this.prefix}_`;
    return Object.keys(this.hass.states).filter(
      (id) => id.startsWith(start) && keyRegex.test(id.slice(start.length))
    );
  }

  // Existing per-cell entities (sensor.ck0_cell_voltage_001 ...), in cell order.
  cellIds(key) {
    const ids = [];
    for (let i = 1; i <= MAX_CELLS; i++) {
      const id = this.id("sensor", `${key}_${String(i).padStart(3, "0")}`);
      if (this.has(id)) ids.push(id);
    }
    return ids;
  }

  // Friendly name without the device name ("CellKeeper0 ", "ck0 ").
  shortName(entityId) {
    const state = this.hass.states[entityId];
    let name = state?.attributes?.friendly_name ?? entityId;
    const deviceId = this.hass.entities?.[entityId]?.device_id;
    const device = deviceId && this.hass.devices?.[deviceId];
    for (const strip of [device?.name_by_user, device?.name, this.prefix, this.prefix.toUpperCase()]) {
      if (strip && name.startsWith(strip + " ")) name = name.slice(strip.length + 1);
    }
    return name.replace(/^CellKeeper\d+ /, "").trim();
  }
}

// CellKeeper prefixes found in HA: every <prefix> with a sensor.<prefix>_system_state_text.
export function findPrefixes(hass) {
  const prefixes = new Set();
  for (const id of Object.keys(hass.entities ?? hass.states)) {
    const m = id.match(/^sensor\.(\w+?)_system_state_text$/);
    if (m) prefixes.add(m[1]);
  }
  return [...prefixes].sort();
}

// --- card helpers that drop what doesn't exist ---

// Entities card with only the rows whose entity exists; null when none do.
export function entitiesCard(ctx, card) {
  const entities = card.entities.filter((row) => {
    const id = typeof row === "string" ? row : row.entity;
    return !id || ctx.has(id);
  });
  if (!entities.some((row) => (typeof row === "string" ? row : row.entity))) return null;
  return { ...card, entities };
}

// Card with a single `entity`; null when it doesn't exist.
export function entityCard(ctx, card) {
  return ctx.has(card.entity) ? card : null;
}

// Grid of cards with the missing ones removed; null when empty.
export function gridCard(card) {
  const cards = card.cards.filter(Boolean);
  return cards.length ? { ...card, cards } : null;
}

// Section with nulls removed; null when its entity cards were all dropped and only
// headings/markdown are left. Text-only sections stay.
export function section(section) {
  const cards = section.cards.filter(Boolean);
  const dropped = cards.length < section.cards.length;
  const content = cards.filter((c) => c.type !== "heading" && c.type !== "markdown");
  return dropped && !content.length ? null : { ...section, cards };
}

export function sections(list) {
  return list.map(section).filter(Boolean);
}

// Tile with a +/- number input, as used on the Configuration view.
export function numberTile(ctx, key, name) {
  return entityCard(ctx, {
    type: "tile",
    entity: ctx.id("number", key),
    name,
    features_position: "bottom",
    features: [{ type: "numeric-input", style: "buttons" }],
  });
}

// Register a custom element unless another copy of this plugin already did
// (e.g. a manual /local resource left next to the HACS one).
export function define(name, cls) {
  if (!customElements.get(name)) customElements.define(name, cls);
}
