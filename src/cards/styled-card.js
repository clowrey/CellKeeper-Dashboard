import { define } from "../context.js";
import { WrapperCard } from "./wrapper.js";

// custom:cellkeeper-styled-card
//   card: <any card config>
//   style: <CSS added inside that card's shadow root>
//
// Covers the static card_mod styles of the old YAML dashboard without needing card-mod.
class CellKeeperStyledCard extends WrapperCard {
  setConfig(config) {
    if (!config?.card) throw new Error("cellkeeper-styled-card needs a card");
    this._config = config;
    this.buildCard(config.card).then((card) => card && this._style(card));
  }

  async _style(card) {
    const root = await this.cardRoot(card);
    if (!root || card !== this._card) return;
    const style = document.createElement("style");
    style.textContent = this._config.style ?? "";
    root.appendChild(style);
  }
}

define("cellkeeper-styled-card", CellKeeperStyledCard);
