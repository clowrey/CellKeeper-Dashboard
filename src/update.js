// The dashboard's own update, through HACS: HACS makes an update entity for each repository it
// installed (update.cellkeeper_dashboard_update, named after the repository), which knows the
// installed and the latest version and can install the latest.

/* global __VERSION__ */
// The version of the file this page is running, from package.json at build time.
export const RUNNING_VERSION = typeof __VERSION__ === "undefined" ? "" : __VERSION__;

let cachedId; // the entity found last time, checked again on each call

// The update entity's state object, or undefined when the dashboard wasn't installed through HACS.
export function dashboardUpdate(hass) {
  if (!hass?.states) return undefined;
  if (cachedId && hass.states[cachedId]) return hass.states[cachedId];
  cachedId = undefined;
  for (const [id, entity] of Object.entries(hass.entities ?? {})) {
    if (entity.platform !== "hacs" || !id.startsWith("update.")) continue;
    const url = hass.states[id]?.attributes.release_url ?? "";
    if (/cellkeeper_dashboard/.test(id) || /\/CellKeeper-Dashboard\b/i.test(url)) {
      cachedId = id;
      return hass.states[id];
    }
  }
  return undefined;
}

// "v0.11.6" and "0.11.6" are the same version.
export const sameVersion = (a, b) => !!a && !!b && a.replace(/^v/, "") === b.replace(/^v/, "");
