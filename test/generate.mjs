// Offline check: generate the dashboard from a pack's entity list and verify that every
// entity the config references exists. `node test/generate.mjs [prefix] [--print]`
// prints the generated config as JSON with --print.
import { readFileSync } from "node:fs";

globalThis.HTMLElement = class {};
globalThis.customElements = { define() {}, get() {} };

const { generateDashboard } = await import("../src/strategy.js");

const fixture = JSON.parse(readFileSync(new URL("./fixtures/ck0.json", import.meta.url), "utf8"));
const prefix = process.argv.find((a, i) => i > 1 && !a.startsWith("--")) ?? "ck0";

// Fake hass with the fixture's entities renamed to the requested prefix.
function fakeHass(dropKeys = []) {
  const states = {};
  const entities = {};
  for (const [id, name] of fixture.entities) {
    const pid = id.replace(/^(\w+)\.ck0_/, `$1.${prefix}_`);
    if (dropKeys.some((k) => pid.endsWith(`_${k}`))) continue;
    states[pid] = { entity_id: pid, state: "1", attributes: { friendly_name: `${prefix} ${name}` } };
    entities[pid] = { entity_id: pid, device_id: "dev", platform: "esphome" };
  }
  return { states, entities, devices: { dev: { name: prefix.toUpperCase(), name_by_user: prefix } } };
}

function referencedEntities(node, out = new Set()) {
  if (Array.isArray(node)) node.forEach((n) => referencedEntities(n, out));
  else if (node && typeof node === "object") {
    if (typeof node.entity === "string" && node.entity) out.add(node.entity);
    Object.values(node).forEach((n) => referencedEntities(n, out));
  }
  return out;
}

let failed = false;
function check(label, ok) {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failed = true;
}

const hass = fakeHass();
const config = await generateDashboard({ prefix }, hass);
if (process.argv.includes("--print")) {
  console.log(JSON.stringify(config, null, 2));
  process.exit(0);
}

const missing = [...referencedEntities(config)].filter((id) => !(id in hass.states));
check(`all referenced entities exist (${missing.join(", ") || "none missing"})`, missing.length === 0);
check(
  "views",
  JSON.stringify(config.views.map((v) => v.title)) ===
    JSON.stringify(["Overview", "Detail", "Cells", "Cells 3D", "Cells 2D", "Configuration", "System", "Log", "Event", "Note"])
);
check("every entity id uses the prefix", [...referencedEntities(config)].every((id) => id.split(".")[1].startsWith(`${prefix}_`)));

// Older firmware: no balance charge, no isolation, no module ID events.
const old = await generateDashboard(
  { prefix },
  fakeHass(["balance_charge_status", "balance_charge_interval", "balance_charge_start_hour", "balance_charge_duration",
    "float_offset_upper", "balance_charge_offset_upper", "start_balance_charge_now", "stop_balance_charge",
    "event_info_bmb_module_id_unknown", "event_warning_bmb_module_id_check_failed", "event_fatal_bmb_module_id_conflict"])
);
const oldText = JSON.stringify(old);
check("older firmware: no balance charge card", !oldText.includes("balance_charge"));
check("older firmware: no module ID event tiles", !oldText.includes("module_id"));

const custom = await generateDashboard(
  { prefix, overview: "classic", hide_views: ["note", "cells_3d"], gauges: { pack_voltage: { min: 40, max: 58 } } },
  hass
);
const packGauge = JSON.stringify(custom.views[0]).match(/"entity":"sensor\.\w+_pack_internal_voltage"[^}]*/)[0];
check("classic overview: gauges option overrides min/max", packGauge.includes('"min":40') && packGauge.includes('"max":58'));
check("hide_views drops views", !custom.views.some((v) => v.title === "Note" || v.title === "Cells 3D"));

const overviewTypes = JSON.stringify(config.views[0]);
check(
  "overview has pack, cells and stat cards",
  ["cellkeeper-pack-card", "cellkeeper-cells-card", "cellkeeper-stat-card"].every((t) => overviewTypes.includes(t))
);
check("views have paths", config.views.every((v) => v.path));
check("no audio amplifier on the dashboard", !JSON.stringify(config).includes("audio_amplifier"));
check(
  "classic configuration: no audio amplifier",
  !JSON.stringify(await generateDashboard({ prefix, configuration: "classic" }, hass)).includes("audio_amplifier")
);

const none = await generateDashboard({ prefix: "nope" }, hass);
check("unknown prefix: one view explaining it", none.views.length === 1 && JSON.stringify(none).includes("No CellKeeper entities"));

process.exit(failed ? 1 : 0);
