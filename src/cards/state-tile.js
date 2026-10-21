import { define } from "../context.js";
import { WrapperCard } from "./wrapper.js";

// custom:cellkeeper-state-tile
//   <tile card options>
//   colors:              first matching rule sets the tile colour
//     - contains: FATAL  (state contains this text)
//       color: '#D50000'
//     - not: [INACTIVE, 'INACTIVE (0)']   (state is none of these)
//       color: '#9C27B0'
//   ignore_case: true    match rules case-insensitively
//   color_text: true     also colour the name and state text
//
// A tile whose colour follows its state text, as the card_mod templates did.
export function ruleColor(rules, state, ignoreCase) {
  const s = ignoreCase ? String(state).toLowerCase() : String(state);
  const norm = (t) => (ignoreCase ? String(t).toLowerCase() : String(t));
  for (const rule of rules ?? []) {
    if (rule.contains !== undefined && s.includes(norm(rule.contains))) return rule.color;
    if (rule.not !== undefined && !rule.not.map(norm).includes(s)) return rule.color;
  }
  return undefined;
}

class CellKeeperStateTile extends WrapperCard {
  setConfig(config) {
    if (!config?.entity) throw new Error("cellkeeper-state-tile needs an entity");
    const { colors, ignore_case, color_text, ...tile } = config;
    this._config = config;
    this._tile = { ...tile, type: "tile" };
    this._color = this._currentColor();
    this.buildCard(this._tileConfig());
  }

  _currentColor() {
    const state = this._hass?.states[this._config.entity]?.state;
    return state === undefined ? undefined : ruleColor(this._config.colors, state, this._config.ignore_case);
  }

  _tileConfig() {
    return this._color ? { ...this._tile, color: this._color } : this._tile;
  }

  hassChanged() {
    if (!this._config) return;
    const color = this._currentColor();
    if (color !== this._color) {
      this._color = color;
      this.updateCard(this._tileConfig());
    }
    for (const v of ["--primary-text-color", "--secondary-text-color"]) {
      if (this._config.color_text && color) this.style.setProperty(v, color);
      else this.style.removeProperty(v);
    }
  }
}

define("cellkeeper-state-tile", CellKeeperStateTile);
