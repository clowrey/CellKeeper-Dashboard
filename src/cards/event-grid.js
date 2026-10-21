import { WrapperCard } from "./wrapper.js";
import { PackContext, define } from "../context.js";

// custom:cellkeeper-event-grid
//   prefix: ck0
//   show: active | previous   events active now, or active earlier ("INACTIVE (n)")
//   title: Active Events
//   columns: 2
//
// A grid of tiles for the pack's event sensors in that state; hidden when there are none.
// Replaces the auto-entities template cards.

export const EVENT_COLORS = { FATAL: "#D50000", CRITICAL: "#F44336", WARNING: "#FFC107", INFO: "#2196F3" };
export const PREVIOUS_COLOR = "#9C27B0";

function activeColor(entityId, state) {
  for (const [level, color] of Object.entries(EVENT_COLORS)) if (state.includes(level)) return color;
  for (const [level, color] of Object.entries(EVENT_COLORS)) if (entityId.includes(level.toLowerCase())) return color;
  return EVENT_COLORS.INFO;
}

function isActive(state) {
  return !["INACTIVE", "unknown", "unavailable"].includes(state) && !state.startsWith("INACTIVE");
}

class CellKeeperEventGrid extends WrapperCard {
  setConfig(config) {
    this._config = { prefix: "ck0", show: "active", columns: 2, ...config };
    this._key = undefined;
    this.setVisible(false);
    if (this._hass) this.hassChanged(this._hass);
  }

  hassChanged(hass) {
    if (!this._config) return;
    const ctx = new PackContext(this._config.prefix, hass);
    const tiles = ctx
      .find("sensor", /^event_(fatal|critical|warning|info)_/)
      .map((id) => ({ id, state: hass.states[id].state, name: ctx.shortName(id) }))
      .filter(({ state }) => (this._config.show === "previous" ? state.startsWith("INACTIVE (") : isActive(state)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ id, state, name }) => ({
        type: "tile",
        entity: id,
        name: name.replace(/^Event (Fatal|Critical|Warning|Info) /, "").trim(),
        color: this._config.show === "previous" ? PREVIOUS_COLOR : activeColor(id, state),
      }));

    const key = JSON.stringify(tiles);
    if (key === this._key) return;
    this._key = key;
    this.setVisible(tiles.length > 0);
    if (!tiles.length) return;
    const grid = { type: "grid", title: this._config.title, columns: this._config.columns, square: false, cards: tiles };
    if (this._card) this.updateCard(grid);
    else this.buildCard(grid);
  }

  getCardSize() {
    return this.hidden ? 0 : super.getCardSize();
  }

  getGridOptions() {
    return { columns: 12 };
  }
}

define("cellkeeper-event-grid", CellKeeperEventGrid);
