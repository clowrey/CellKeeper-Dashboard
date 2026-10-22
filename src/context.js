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

// A temperature in °C from a value in one of Home Assistant's temperature units. HA hands
// temperatures over in the user's unit system (or a per-entity override): °C, °F or K. No unit
// is taken as °C; any other unit gives undefined rather than a wrong number.
export function toCelsius(value, unit) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  switch ((unit ?? "").trim()) {
    case "":
    case "°C":
      return value;
    case "°F":
      return ((value - 32) * 5) / 9;
    case "K":
      return value - 273.15;
    default:
      return undefined;
  }
}

// Units Home Assistant lets a user switch a sensor to (per entity, in its settings), as factors
// to the first unit of each family.
const UNIT_FAMILIES = [
  { V: 1, mV: 1e-3, µV: 1e-6, kV: 1e3, MV: 1e6 },
  { A: 1, mA: 1e-3 },
  { W: 1, mW: 1e-3, kW: 1e3, MW: 1e6, GW: 1e9 },
  { Wh: 1, mWh: 1e-3, kWh: 1e3, MWh: 1e6, GWh: 1e9, J: 1 / 3600, kJ: 1e3 / 3600, MJ: 1e6 / 3600, GJ: 1e9 / 3600 },
  { s: 1, ms: 1e-3, µs: 1e-6, min: 60, h: 3600, d: 86400 },
  { B: 1, kB: 1e3, MB: 1e6, GB: 1e9, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3 },
  { Ω: 1, kΩ: 1e3, MΩ: 1e6, GΩ: 1e9 },
];

// value (in unit `from`, as the sensor reports it) converted to unit `to`. No unit is taken as
// already `to`; a unit that can't be converted gives undefined rather than a wrong number.
export function toUnit(value, from, to) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const f = (from ?? "").trim();
  if (f === "" || f === to) return value;
  const family = UNIT_FAMILIES.find((u) => f in u && to in u);
  return family ? (value * family[f]) / family[to] : undefined;
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
