# CellKeeper Dashboard

A Home Assistant dashboard for [CellKeeper](https://github.com/clowrey/CellKeeper-BMS-LCD) BMS packs.
The whole dashboard is three lines of config. Its views are generated in your browser from the
pack's entities each time the dashboard loads, so a firmware update that adds sensors, settings or
events shows up without any dashboard edits, and cards for entities your firmware doesn't have are
left out instead of showing "unknown".

```yaml
strategy:
  type: custom:cellkeeper
  prefix: ck0
```

![Overview of a 96s NMC pack discharging: battery gauge at 99.7 %, power flow against the charge and discharge limits, 24 h chart, cell voltages with balancing, temperature, energy, isolation and inverter cards](https://raw.githubusercontent.com/clowrey/CellKeeper-Dashboard/main/docs/overview-ck0.webp)

Views: **Overview** (below), **Cells** (live cell voltages and balancing), **Cells 3D** /
**Cells 2D** (24 h cell voltage history), **Configuration** (all BMS settings), **System**, **Log**,
**Event** (every event type, coloured by state) and **Note**.

### The Overview

One page that answers "is the pack OK, and what is it doing?":

- **Pack card**: state of charge on the CellKeeper battery, filled to the level and with the logo's
  arrow running in or out while it charges or discharges; stored energy and the change over the
  last hour; system and contactor state; a banner for every active warning, critical or fatal
  event.
- **Power flow**: charging/discharging power with time to full or empty, current and pack and
  output voltage, and a centre-zero bar of the current against the charge and discharge limits
  the BMS is sending the inverter, naming the limit that is in force (temperature, cell voltage,
  working range, setting, …), so "why isn't it charging?" answers itself.
- **Last 24 h**: SOC and charge/discharge power from Home Assistant's 5-minute statistics; hover for
  values, click for the full history.
- **Cells**: every cell's voltage zoomed to the spread, the highest (limits charging) and lowest
  (limits discharging) cells marked, balancing cells flagged, and the spread rated.
- **Temperature**, **Energy today**, **Isolation** (rated in Ω/V) and **Inverter link** cards, and
  Run / Stop / Calibrate buttons that ask before they act.

Everything is clickable through to the entity's history or the view with the details, and the
page reflows from phone to wide screen in light and dark themes.

The same page for a 108s LFP pack, idle and floating between balance charges:

![Overview of a 108s LFP pack: idle at 99.2 %, charge limited by cell voltage, a floating balance charge scheduled, 12 mV cell spread](https://raw.githubusercontent.com/clowrey/CellKeeper-Dashboard/main/docs/overview-ck1.webp)

### The Configuration view

Every BMS setting, grouped by what it controls, each with a line on what it does, and a picture
of what the group does to the pack right now:

- **Lock bar**: BMS settings only take writes for 30 s after Unlock (each change restarts the
  window); it shows the countdown and the BMS's answer to a write ("Settings applied", "Clamped
  to hard limit", …).
- **Cell voltage window**: soft and working limits on one scale with the cells' present range and
  the balancing thresholds, and the pack voltages they give the inverter.
- **Current limits**: every limit that goes into the charge and discharge current, with the one in
  force highlighted, next to your max current settings.
- **State of charge**: how SOC scaling maps the BMS's SOC onto what the inverter sees, the
  voltage-based and coulomb-count estimates and the charge counter, and Set SOC (asks twice).
- **Balancing**: the firmware's conditions as a checklist, so you can see why it is or isn't
  balancing.
- **Balance charge** (HMI firmware with it): the schedule on a 24 h strip and the float and
  balance-charge pack voltages; no unlock needed.
- **Isolation** readings and calibration, and any other settings newer firmware adds.

Numbers are edited with − / + (taps are grouped into one write) or by typing; values show in
readable units (V, s) and "Saving…" until the BMS reports the new value back.

### The Event view

- **Status**: "All clear", or what is active now, worst first, each with what it means, how long
  it has been active and what happens next (a warning's count against the number that turns it
  fatal; fatal events stay until the BMS restarts). Info events and events that were active
  earlier since the BMS started are listed underneath.
- **Event log**: every event raised, repeated, escalated and cleared over the last 10 days, read
  from Home Assistant's history of the event sensors, with BMS starts and HMI reconnects; bursts
  of repeats fold into one line. Info events are hidden unless you ask for them.
- **All events**: the firmware's 61 events grouped by area, with what each means, the level it
  starts at, when it turns fatal, and its count since the BMS started. Searchable.

The levels and escalation rules come from the firmware's event table (`bms/sys/events/events.h`
in bmstest1), not from the sensor names, some of which carry an older label: "Event Fatal POS
Stuck Open" is a warning that turns fatal after 20 occurrences. `python tools/make_events.py`
rebuilds `src/events/catalog.js` from that table and the HMI's `bms_core.yaml`.

### The System view

- **Link**: BMS → HMI → Home Assistant, with how fresh the BMS's data is and the Wi-Fi signal, so
  a dead link shows where it broke.
- **BMS controller**: firmware build (commit and build time, flagged when built from uncommitted
  changes), board revision, serial and uptime, system and contactor state with their codes, the
  pack voltages (measured, sum of the cells, output, across each contactor), each supply rail (3.3 V, 5 V, 12 V,
  contactor supply) on a bar against the range the firmware accepts, and the controller chip and
  current shunt temperatures.
- **HMI display**: model, firmware build, Wi-Fi network and signal quality, CPU temperature, free
  memory and loop time, the backlight, and buttons to open its web page and to restart it (tap twice). **All sensors** opens the pack's device page in Home
  Assistant, which lists every sensor the HMI publishes.

  The firmware builds come from the HMI's BMS Firmware and HMI Firmware sensors (CellKeeper-BMS-LCD
  with BMS firmware that reports its build ID, registers 68/69); with older firmware the card says
  so.

## Naming your packs

CellKeeper entity ids start with the name of the pack's HMI device. Name your first (often only)
pack **`ck0`** and further packs **`ck1`**, **`ck2`**, … so ids stay short and predictable
(`sensor.ck0_soc`, `number.ck0_max_charge_current`, …). The dashboard uses `ck0` unless you set
another `prefix`.

If your device already has another name, either use that name as the prefix or rename the device
(and its entity ids) in **Settings → Devices & services → ESPHome**.

## Install

### With HACS (recommended)

1. HACS → ⋮ → **Custom repositories** → add `https://github.com/clowrey/CellKeeper-Dashboard`,
   type **Dashboard**.
2. Search HACS for **CellKeeper Dashboard** and **Download** it. HACS adds the dashboard resource
   for you; reload the browser when it asks.
3. Also download **Plotly Graph Card** from HACS, which the Cells views need (see
   [Dependencies](#dependencies)).

HACS will offer updates when a new release is published.

### Manually

Copy `dist/cellkeeper-dashboard.js` to `/config/www/cellkeeper-dashboard/` and add it under
**Settings → Dashboards → ⋮ → Resources** as `/local/cellkeeper-dashboard/cellkeeper-dashboard.js`,
type **JavaScript module**.

## Create the dashboard

1. **Settings → Dashboards → Add dashboard → New dashboard from scratch**, give it a name
   (for example *CellKeeper 0*) and open it.
2. Pencil (edit) → ⋮ → **Raw configuration editor**, replace everything with:

   ```yaml
   strategy:
     type: custom:cellkeeper
     prefix: ck0
   ```

3. Save. For another pack make another dashboard with `prefix: ck1`, and so on.

Afterwards the pencil opens a small form where you can pick the prefix from the CellKeeper packs
Home Assistant knows about. To customise the generated dashboard by hand, use **Take control** in
that dialog; this turns it into a normal dashboard that no longer updates itself.

## Icons

The plugin adds the batteries from the CellKeeper logo as icons, for example for the dashboard's
sidebar icon (**Settings → Dashboards →** your dashboard **→ Icon**):

| Icon | |
| --- | --- |
| `cellkeeper:battery` | the logo's middle battery: four bars and the arrow |
| `cellkeeper:battery-arrow` | the left battery: three bars and the arrow |
| `cellkeeper:logo` | all three batteries (busy at sidebar size) |

Home Assistant loads dashboard plugins when you first open a dashboard, so if you load a
non-dashboard page directly (say **Settings**) the sidebar shows an empty space for these icons
until you open a dashboard. To have them everywhere, also load the plugin as a frontend module in
`configuration.yaml` and restart Home Assistant:

```yaml
frontend:
  extra_module_url:
    - /hacsfiles/CellKeeper-Dashboard/cellkeeper-dashboard.js
```

The icon paths in `src/icons.js` are generated from the logo outline in
[CellKeeper-BMS-PCB](https://github.com/clowrey/CellKeeper-BMS-PCB)
(`enclosure/cellkeeper_logo.json`) by `python tools/make_icons.py`.

## Options

| Option | Default | |
| --- | --- | --- |
| `prefix` | `ck0` | Pack prefix: the start of the pack's entity ids. |
| `title` | `BMS Dashboard` | Dashboard title. |
| `pack_name` | the HMI device's name | Name shown on the Overview's pack card. |
| `overview` | | `classic` for the original gauge Overview instead. |
| `configuration` | | `classic` for the original tile Configuration view instead. |
| `events` | | `classic` for the original tile Event view instead. |
| `system` | | `classic` for the original entities System view instead. |
| `hide_views` | `[]` | Views to leave out: `overview`, `cells`, `cells_3d`, `cells_2d`, `configuration`, `system`, `log`, `event`, `note`. |
| `gauges` | | Change the classic Overview's gauges, keyed by `soc`, `pack_voltage`, `cell_voltage_min`, `cell_voltage_max`, `current`, `power`. Each takes [gauge card](https://www.home-assistant.io/dashboards/gauge/) options (`min`, `max`, `segments`, `severity`, `name`, …) that replace the defaults. |

The classic Overview's default gauge ranges suit a 96s NMC pack. For example, for a 16s LFP pack:

```yaml
strategy:
  type: custom:cellkeeper
  prefix: ck1
  overview: classic
  hide_views: [note]
  gauges:
    pack_voltage:
      min: 40
      max: 58
      segments:
        - { from: 40, color: '#db4437' }
        - { from: 44, color: '#ffa600' }
        - { from: 48, color: '#43a047' }
        - { from: 56, color: '#db4437' }
    cell_voltage_min: &lfp_cell
      min: 2.5
      max: 3.65
      segments:
        - { from: 2.5, color: '#db4437' }
        - { from: 2.8, color: '#ffa600' }
        - { from: 3.0, color: '#43a047' }
        - { from: 3.45, color: '#ffa600' }
        - { from: 3.55, color: '#db4437' }
    cell_voltage_max: *lfp_cell
```

## Dependencies

- **Home Assistant 2025.1** or newer (sections views, tile card features).
- **[Plotly Graph Card](https://github.com/dbuezas/lovelace-plotly-graph-card)** (HACS) for the
  Cells, Cells 3D and Cells 2D views. Without it those charts show a note asking you to install it;
  the rest of the dashboard works.

Nothing else. The colour-by-state tiles, event lists and styling that used to need card-mod,
auto-entities, mushroom and decluttering-card are built into this plugin.

### Helper cards

The plugin also registers the cards the dashboard is built from; you can use them in your own
dashboards:

- `custom:cellkeeper-pack-card`, `custom:cellkeeper-cells-card`: the Overview's pack and cell
  cards. Option: `prefix`.
- `custom:cellkeeper-stat-card`: the Overview's small cards. Options: `prefix`, `kind`
  (`temperature`, `energy`, `isolation`, `inverter`), `navigate` (a view path for its header).
- `custom:cellkeeper-settings-card`, `custom:cellkeeper-lock-card`: the Configuration view's cards
  (see the comment at the top of `src/config/settings-card.js` for the options).
- `custom:cellkeeper-events-card`: the Event view's cards. Options: `prefix`, `mode` (`status`,
  `log`, `catalog`), `days` (log, default 10).
- `custom:cellkeeper-system-card`: the System view's cards. Options: `prefix`, `kind` (`link`,
  `bms`, `hmi`).
- `custom:cellkeeper-event-grid`: tiles for a pack's events that are active now
  (`show: active`) or have been active (`show: previous`); hidden when there are none.
  Options: `prefix`, `show`, `title`, `columns`.
- `custom:cellkeeper-state-tile`: a tile card whose colour follows its state text.
  Options: any tile option plus `colors` (list of `{contains: TEXT, color}` or
  `{not: [STATES], color}`, first match wins), `ignore_case`, `color_text`.
- `custom:cellkeeper-styled-card`: wraps `card` and adds the CSS in `style` inside it.
- `custom:cellkeeper-title-card`: a borderless `title` and `subtitle`.

## Development

```sh
npm install
npm run build    # writes dist/cellkeeper-dashboard.js
npm run check    # generates the dashboard from test/fixtures/ck0.json and checks it
```

`npm run watch` rebuilds on every change. To try a build, copy `dist/cellkeeper-dashboard.js` to
`/config/www/cellkeeper-dashboard/` on a test system and bump the `?v=` on its resource URL.

To release: bump `version` in `package.json`, `npm run build`, commit `dist/`, then tag `vX.Y.Z`
and publish a GitHub release; HACS picks up releases.

## License

GPL-3.0, like the rest of CellKeeper.
