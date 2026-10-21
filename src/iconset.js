import { ICONS } from "./icons.js";

// The cellkeeper: icon set, usable anywhere HA takes an icon (e.g. a dashboard's sidebar icon):
//   cellkeeper:battery        the logo's middle battery (4 bars, arrow)
//   cellkeeper:battery-arrow  the logo's left battery (3 bars, arrow)
//   cellkeeper:logo           all three batteries
window.customIcons ??= {};
window.customIcons.cellkeeper ??= {
  getIcon: async (name) => (name in ICONS ? { path: ICONS[name], viewBox: "0 0 24 24" } : undefined),
  getIconList: async () => Object.keys(ICONS).map((name) => ({ name, keywords: ["cellkeeper", "battery", "bms"] })),
};

// Dashboard resources load after the sidebar has drawn, so its cellkeeper: icons were looked up
// before this set existed and came out blank (ha-icon's legacy fallback, which it doesn't clear on
// a later lookup). Make those icons look themselves up again.
async function refreshIcon(el) {
  const icon = el.icon;
  el.icon = undefined;
  await el.updateComplete;
  el.icon = icon;
  await el.updateComplete;
  el._legacy = false;
}

function refreshIcons(root) {
  for (const el of root.querySelectorAll("*")) {
    if (el.localName === "ha-icon" && el.icon?.startsWith("cellkeeper:")) refreshIcon(el);
    if (el.shadowRoot) refreshIcons(el.shadowRoot);
  }
}

refreshIcons(document);
