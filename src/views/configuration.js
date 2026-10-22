import { entitiesCard, entityCard, gridCard, numberTile, sections } from "../context.js";

// Settings with a home on the Configuration view: number key -> tile name.
// Any other number/select/switch of the pack lands in "Other Settings", so settings
// added by newer firmware show up without a dashboard update.
export const SETTING_GROUPS = [
  {
    heading: "SOC and Current",
    numbers: {
      soc_set_cmd: "SOC Set Cmd",
      soc_scaling_min: "SOC Scale Min",
      soc_scaling_max: "SOC Scale Max",
      max_charge_current: "Max Chg Curr",
      max_discharge_current: "Max Dchg Curr",
    },
  },
  {
    heading: "Voltage Limits",
    numbers: {
      voltage_limit_offset_lower: "VLimit Offs Low",
      voltage_limit_offset_upper: "VLimit Offs High",
      cell_voltage_working_min: "CellV Work Min",
      cell_voltage_working_max: "CellV Work Max",
      cell_voltage_soft_min: "CellV Soft Min",
      cell_voltage_soft_max: "CellV Soft Max",
    },
  },
  {
    heading: "Balancing",
    numbers: {
      auto_balancing_period: "Auto Bal Period",
      balancing_periods_per_mv: "Bal Periods/mV",
      balance_min_offset: "Bal Min Offset",
      minimum_balancing_voltage: "Min Bal V",
      balancing_start_voltage: "Bal Start V",
    },
  },
  {
    heading: "Balance Charge",
    numbers: {
      balance_charge_interval: "Interval",
      balance_charge_start_hour: "Start Hour",
      balance_charge_duration: "Duration",
      float_offset_upper: "Float Offs High",
      balance_charge_offset_upper: "Bal Chg Offs High",
    },
  },
];

// Entities kept out of "Other settings": shown elsewhere on the dashboard (Log view, Settings
// Unlock), or not a pack setting (the HMI's audio amplifier).
const NOT_OTHER_SETTINGS = new Set([
  "number.log_update_rate",
  "switch.settings_unlock",
  "switch.log_enable",
  "switch.audio_amplifier",
]);

const GUIDE = `## BMS Configuration
Use **Settings Unlock Mode** to allow writes. When locked, values are read-only and write attempts are blocked.

### Voltage Protection Tiers
- **Working Limits**: Defines the 0% to 100% SoC range used for normal operation.
- **Soft Limits**: Triggers warning behavior and current limiting if exceeded.
- **Hard Limits**: Firmware safety limits that force immediate disconnect.

**Tip:** Set Working Min to your inverter's 0% SoC voltage point.
`;

const BALANCING_NOTE = `**Note:** \`Auto Bal Period\` is in milliseconds.
- \`0\` = balancing disabled
- \`30000\` = 30 second balancing period
`;

const BALANCE_CHARGE_NOTE =
  "Every **Interval** days (0 = off) the HMI raises **VLimit Offs High** from **Float Offs High** to " +
  "**Bal Chg Offs High** for **Duration** hours from **Start Hour**, so the cells reach the knee and balance. " +
  "A missed window waits for the next day's. Offsets are in 0.1 V. **Stop Balance Charge** ends a running one " +
  "and starts the interval again from today. While the interval isn't 0, edit those two settings instead of " +
  "VLimit Offs High, which is put back within 30 s. No unlock is needed for these.\n";

const ISOLATION_NOTE =
  "All isolation values are calculated by the BMS. At every boot, while the contactors are still open, the BMS " +
  "checks the zero: small drift is blended in, a large offset raises **Isolation Asymmetry** (possible leak) and " +
  "the zero is kept. Isolation Resistance is live with the contactors open and otherwise shows the last open " +
  "reading (see Isolation Check Age; capped at 100 Mohm). Press **Calibrate Isolation Zero** with the battery " +
  "stopped only after ruling out a leak; it overwrites the zero.\n";

const SETTINGS_STATUS_COLORS = [
  { contains: "settings applied", color: "#4CAF50" },
  { contains: "auto-locked", color: "#D50000" },
  { contains: "locked (unlock to apply)", color: "#D50000" },
  { contains: "settings unlocked", color: "#2196F3" },
  { contains: "settings locked", color: "#9E9E9E" },
];

function numberGrid(ctx, numbers) {
  return gridCard({
    type: "grid",
    columns: 2,
    square: false,
    cards: Object.entries(numbers).map(([key, name]) => numberTile(ctx, key, name)),
  });
}

function sensorRows(ctx, rows) {
  return rows.map(([key, name]) => ({ entity: ctx.id("sensor", key), name }));
}

// Pack settings no group above claims, as tiles (numbers) and rows (selects/switches).
function otherSettingsSection(ctx) {
  const known = new Set(SETTING_GROUPS.flatMap((g) => Object.keys(g.numbers)));
  const prefixLen = ctx.prefix.length + 1;
  const unclaimed = (domain) =>
    ctx
      .find(domain, /.*/)
      .map((id) => ({ id, key: id.slice(domain.length + 1 + prefixLen) }))
      .filter(({ key }) => !(domain === "number" && known.has(key)) && !NOT_OTHER_SETTINGS.has(`${domain}.${key}`));

  const numbers = unclaimed("number");
  const rows = [...unclaimed("select"), ...unclaimed("switch")];
  return {
    cards: [
      { type: "heading", heading: "Other Settings" },
      numbers.length
        ? numberGrid(ctx, Object.fromEntries(numbers.map(({ key, id }) => [key, ctx.shortName(id)])))
        : null,
      rows.length ? { type: "entities", show_header_toggle: false, entities: rows.map(({ id }) => ({ entity: id, name: ctx.shortName(id) })) } : null,
    ],
  };
}

// The original tile layout, kept as `configuration: classic`.
export function classicConfigurationView(ctx) {
  const [socCurrent, voltageLimits, balancing, balanceCharge] = SETTING_GROUPS;
  return {
    title: "Configuration",
    type: "sections",
    max_columns: 4,
    sections: sections([
      {
        cards: [
          { type: "heading", heading: "Configuration Guide" },
          { type: "markdown", content: GUIDE },
        ],
      },
      {
        cards: [
          { type: "heading", heading: "Access & Write Status" },
          gridCard({
            type: "grid",
            columns: 1,
            square: false,
            cards: [
              entitiesCard(ctx, {
                type: "entities",
                title: "Settings Unlock",
                show_header_toggle: false,
                entities: [{ entity: ctx.id("switch", "settings_unlock"), name: "Settings Unlock" }],
              }),
              entityCard(ctx, {
                type: "custom:cellkeeper-state-tile",
                entity: ctx.id("sensor", "settings_status"),
                name: "Settings Status",
                colors: SETTINGS_STATUS_COLORS,
                ignore_case: true,
                color_text: true,
              }),
            ],
          }),
        ],
      },
      {
        cards: [
          { type: "heading", heading: socCurrent.heading },
          numberGrid(ctx, socCurrent.numbers),
          entitiesCard(ctx, {
            type: "entities",
            title: "Current Limit Readback",
            entities: sensorRows(ctx, [
              ["current_limit_effective_charge", "Current Limit Effective Charge"],
              ["current_limit_effective_discharge", "Current Limit Effective Discharge"],
              ["current_limit_temperature_charge", "Current Limit Temperature Charge"],
              ["current_limit_temperature_discharge", "Current Limit Temperature Discharge"],
              ["current_limit_cell_voltage_charge", "Current Limit Cell Voltage Charge"],
              ["current_limit_cell_voltage_discharge", "Current Limit Cell Voltage Discharge"],
              ["current_limit_working_charge", "Current Limit Working Charge"],
              ["current_limit_working_discharge", "Current Limit Working Discharge"],
              ["current_limit_delta_charge", "Current Limit Delta Charge"],
              ["current_limit_hard_charge", "Current Limit Hard Charge"],
              ["current_limit_hard_discharge", "Current Limit Hard Discharge"],
            ]),
          }),
        ],
      },
      {
        cards: [{ type: "heading", heading: voltageLimits.heading }, numberGrid(ctx, voltageLimits.numbers)],
      },
      {
        cards: [
          { type: "heading", heading: balancing.heading },
          { type: "markdown", content: BALANCING_NOTE },
          numberGrid(ctx, balancing.numbers),
        ],
      },
      {
        cards: [
          { type: "heading", heading: balanceCharge.heading },
          { type: "markdown", content: BALANCE_CHARGE_NOTE },
          entityCard(ctx, { type: "tile", entity: ctx.id("sensor", "balance_charge_status"), name: "Balance Charge Status" }),
          entitiesCard(ctx, {
            type: "entities",
            show_header_toggle: false,
            entities: [
              { entity: ctx.id("button", "start_balance_charge_now"), name: "Start Balance Charge Now" },
              { entity: ctx.id("button", "stop_balance_charge"), name: "Stop Balance Charge" },
            ],
          }),
          numberGrid(ctx, balanceCharge.numbers),
        ],
      },
      {
        cards: [
          { type: "heading", heading: "Isolation Calibration" },
          { type: "markdown", content: ISOLATION_NOTE },
          entitiesCard(ctx, {
            type: "entities",
            entities: [
              { entity: ctx.id("sensor", "contactor_state_text"), name: "Contactor State" },
              { entity: ctx.id("button", "calibrate_isolation_zero"), name: "Calibrate Isolation Zero" },
              ...sensorRows(ctx, [
                ["pack_pos_to_chassis", "Pack Pos to Chassis"],
                ["pack_neg_to_chassis", "Pack Neg to Chassis"],
                ["isolation_resistance", "Isolation Resistance"],
                ["isolation_check_age", "Isolation Check Age"],
              ]),
            ],
          }),
        ],
      },
      otherSettingsSection(ctx),
    ]),
  };
}

// ---- the Configuration view ----

const V = { unit: "V", factor: 0.1, digits: 1 }; // 0.1 V offsets shown in volts

function settingsCard(ctx, card) {
  return { type: "custom:cellkeeper-settings-card", prefix: ctx.prefix, ...card };
}

// Pack numbers/switches no card shows, so newer firmware's settings appear here.
function otherSettings(ctx, claimed) {
  const rows = [];
  for (const domain of ["number", "switch"]) {
    for (const id of ctx.find(domain, /.*/)) {
      const key = id.slice(domain.length + 1 + ctx.prefix.length + 1);
      if (claimed.has(`${domain}:${key}`) || NOT_OTHER_SETTINGS.has(`${domain}.${key}`)) continue;
      rows.push({ key: `${domain}:${key}`, name: ctx.shortName(id) });
    }
  }
  return rows;
}

export function configurationView(ctx, options = {}) {
  if (options.configuration === "classic") return classicConfigurationView(ctx);
  const balanceCharge = ctx.has(ctx.id("number", "balance_charge_interval"));
  const cards = [
    settingsCard(ctx, {
      title: "Cell voltage window",
      icon: "mdi:arrow-expand-horizontal",
      needs_unlock: true,
      description:
        "The working range is 0–100 % SOC and sets the voltage limits sent to the inverter. Past it the BMS " +
        "limits current; past the soft limits only a small restoration current is allowed.",
      visual: "voltage",
      rows: [
        { key: "number:cell_voltage_soft_max", name: "Soft max", help: "Above this only a low-current restoration discharge is allowed." },
        { key: "number:cell_voltage_working_max", name: "Working max", help: "100 % SOC. The inverter's charge voltage limit is this × cells." },
        { key: "number:cell_voltage_working_min", name: "Working min", help: "0 % SOC; set it to your inverter's 0 % point. Its low voltage limit is this × cells." },
        { key: "number:cell_voltage_soft_min", name: "Soft min", help: "Below this only a low-current restoration charge is allowed." },
        {
          key: "number:voltage_limit_offset_upper",
          name: "Charge voltage offset",
          help: balanceCharge
            ? "Added to the charge voltage sent to the inverter. While a balance charge schedule is on, it sets this; change Float and Balance charge offset instead."
            : "Added to the charge voltage sent to the inverter, for a difference between its voltage reading and the BMS's.",
          ...V,
        },
        {
          key: "number:voltage_limit_offset_lower",
          name: "Low voltage offset",
          help: "Added to the low voltage limit sent to the inverter.",
          ...V,
        },
      ],
    }),
    settingsCard(ctx, {
      title: "Current limits",
      icon: "mdi:current-dc",
      needs_unlock: true,
      description: "What the BMS allows the inverter right now, and every limit that goes into it.",
      visual: "limits",
      rows: [
        { key: "number:max_charge_current", name: "Max charge current", help: "Your cap on charging; the BMS clamps it to the hard limit." },
        { key: "number:max_discharge_current", name: "Max discharge current", help: "Your cap on discharging; the BMS clamps it to the hard limit." },
      ],
    }),
    settingsCard(ctx, {
      title: "State of charge",
      icon: "mdi:battery-sync",
      needs_unlock: true,
      visual: "soc",
      rows: [
        { key: "sensor:soc_voltage_based", name: "Voltage-based estimate", help: "From the cells' open-circuit voltage.", digits: 1 },
        { key: "sensor:soc_basic_count", name: "Coulomb-count estimate", help: "Counted down from the last full charge.", digits: 1 },
        { key: "sensor:charge_raw", name: "Charge counter", help: "The current sensor's running charge total.", digits: 2 },
        { key: "number:soc_scaling_min", name: "Inverter 0 % at", help: "The BMS SOC the inverter is told is 0 %." },
        { key: "number:soc_scaling_max", name: "Inverter 100 % at", help: "The BMS SOC the inverter is told is 100 %." },
        {
          key: "number:soc_set_cmd",
          name: "Set SOC",
          help: "Overwrites the BMS's SOC estimate, e.g. after a full charge or a capacity test. Enter the value twice to set it.",
          confirm: true,
        },
      ],
    }),
    settingsCard(ctx, {
      title: "Balancing",
      icon: "mdi:scale-balance",
      needs_unlock: true,
      description:
        "Balancing runs odd then even cells (neighbours never together) and bleeds each cell for a time " +
        "proportional to how far it sits above the lowest one.",
      visual: "balancing",
      rows: [
        { key: "number:auto_balancing_period", name: "Session interval", help: "Time between balancing sessions; 0 turns balancing off.", unit: "s", factor: 0.001, digits: 0 },
        { key: "number:balancing_start_voltage", name: "Start voltage", help: "Balancing starts once the highest cell reaches this." },
        { key: "number:minimum_balancing_voltage", name: "Minimum cell voltage", help: "No balancing while any cell is below this." },
        { key: "number:balance_min_offset", name: "Dead band", help: "Cells less than this above the lowest cell aren't balanced." },
        { key: "number:balancing_periods_per_mv", name: "Periods per mV", help: "Balancing time per mV a cell sits above the lowest plus the dead band." },
      ],
    }),
    balanceCharge
      ? settingsCard(ctx, {
          title: "Balance charge",
          icon: "mdi:calendar-sync",
          needs_unlock: false,
          description:
            "Keeping LFP at 100 % ages it, so the pack floats lower and every few days the HMI raises the charge " +
            "voltage for a while so the cells reach the knee, balance, and the SOC gets a full point.",
          visual: "balance_charge",
          rows: [
            { key: "number:balance_charge_interval", name: "Every", help: "Days between balance charges; 0 is off." },
            { key: "number:balance_charge_start_hour", name: "Start hour", help: "When the day's window opens. A missed window waits for the next day's." },
            { key: "number:balance_charge_duration", name: "Duration", help: "Hours at the higher voltage; the window ends at midnight at the latest." },
            { key: "number:float_offset_upper", name: "Float offset", help: "Charge voltage offset between balance charges.", ...V },
            { key: "number:balance_charge_offset_upper", name: "Balance charge offset", help: "Charge voltage offset during a balance charge.", ...V },
            { key: "button:start_balance_charge_now", name: "Start now", help: "Runs one now for the full duration; it counts as this interval's.", label: "Start" },
            { key: "button:stop_balance_charge", name: "Stop", help: "Ends a running one and floats; the next is a full interval away.", label: "Stop" },
          ],
        })
      : null,
    settingsCard(ctx, {
      title: "Isolation",
      icon: "mdi:shield-check-outline",
      description:
        "The BMS measures isolation with the contactors open: live while they are, otherwise the last open " +
        "reading (capped at 100 MΩ). At every boot it checks the zero; a large offset raises Isolation " +
        "Asymmetry (a possible leak) and keeps the old zero.",
      rows: [
        { key: "sensor:contactor_state_text", name: "Contactors" },
        { key: "sensor:isolation_resistance", name: "Isolation resistance", digits: 1 },
        { key: "sensor:pack_pos_to_chassis", name: "Pack + to chassis" },
        { key: "sensor:pack_neg_to_chassis", name: "Pack − to chassis" },
        { key: "sensor:isolation_check_age", name: "Last open-contactor check", base: "s", unit: "h", factor: 1 / 3600 },
        { key: "button:calibrate_isolation_zero", name: "Calibrate isolation zero", help: "Battery stopped, leak ruled out.", label: "Calibrate", danger: true },
      ],
    }),
  ].filter(Boolean);
  const claimed = new Set(cards.flatMap((c) => c.rows.map((r) => r.key)));
  const other = otherSettings(ctx, claimed);
  if (other.length) cards.push(settingsCard(ctx, { title: "Other settings", icon: "mdi:tune-variant", rows: other }));

  // The lock bar across the top, then the cards in two wide columns of about equal height
  // (rows plus a few for a picture), in order.
  const weight = (c) => c.rows.length + (c.visual ? 4 : 0) + 2;
  const total = cards.reduce((a, c) => a + weight(c), 0);
  const left = [];
  let acc = 0;
  for (const c of cards) {
    if (left.length && acc + weight(c) / 2 > total / 2) break;
    left.push(c);
    acc += weight(c);
  }
  return {
    title: "Configuration",
    type: "sections",
    max_columns: 2,
    sections: [
      ctx.has(ctx.id("switch", "settings_unlock"))
        ? { column_span: 2, cards: [{ type: "custom:cellkeeper-lock-card", prefix: ctx.prefix }] }
        : null,
      { cards: left },
      { cards: cards.slice(left.length) },
    ].filter((sec) => sec && sec.cards.length),
  };
}
