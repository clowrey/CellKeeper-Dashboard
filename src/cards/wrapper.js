// Base for cards that wrap one built-in card created with HA's card helpers.

let helpersPromise;
export function cardHelpers() {
  helpersPromise ??= window.loadCardHelpers();
  return helpersPromise;
}

export class WrapperCard extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (this._card) this._card.hass = hass;
    this.hassChanged?.(hass);
  }

  get hass() {
    return this._hass;
  }

  // Replace the wrapped card with a new one built from `config`.
  async buildCard(config) {
    const token = (this._buildToken = {});
    const helpers = await cardHelpers();
    if (token !== this._buildToken) return null;
    const card = helpers.createCardElement(config);
    card.addEventListener("ll-rebuild", (ev) => {
      ev.stopPropagation();
      this.buildCard(config);
    });
    if (this._hass) card.hass = this._hass;
    if (this.preview !== undefined) card.preview = this.preview;
    this._card = card;
    this.replaceChildren(card);
    return card;
  }

  // Update the wrapped card's config in place (keeps its DOM, no flicker).
  updateCard(config) {
    if (this._card?.setConfig) this._card.setConfig(config);
  }

  // Shadow root of the wrapped card once it has rendered.
  async cardRoot(card = this._card) {
    if (!card) return null;
    await customElements.whenDefined(card.localName);
    await card.updateComplete;
    return card.shadowRoot;
  }

  // Show or hide this card; sections views free the grid slot of a hidden card.
  setVisible(visible) {
    if (this.hidden === !visible) return;
    this.hidden = !visible;
    this.dispatchEvent(
      new CustomEvent("card-visibility-changed", { detail: { value: visible }, bubbles: true, composed: true })
    );
  }

  getCardSize() {
    return this._card?.getCardSize?.() ?? 1;
  }

  getGridOptions() {
    return this._card?.getGridOptions?.() ?? this._card?.getLayoutOptions?.();
  }
}
