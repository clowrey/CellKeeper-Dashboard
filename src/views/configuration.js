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

// Entities shown elsewhere on the dashboard (Log view, Settings Unlock).
const SHOWN_ELSEWHERE = new Set(["number.log_update_rate", "switch.settings_unlock", "switch.log_enable"]);

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
      .filter(({ key }) => !(domain === "number" && known.has(key)) && !SHOWN_ELSEWHERE.has(`${domain}.${key}`));

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

export function configurationView(ctx) {
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
