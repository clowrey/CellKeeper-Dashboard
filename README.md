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

Views: **Overview** (active events, gauges, run/stop), **Detail**, **Cells** (live cell voltages and
balancing), **Cells 3D** / **Cells 2D** (24 h cell voltage history), **Configuration** (all BMS
settings), **System**, **Log**, **Event** (every event type, coloured by state) and **Note**.

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

## Options

| Option | Default | |
| --- | --- | --- |
| `prefix` | `ck0` | Pack prefix: the start of the pack's entity ids. |
| `title` | `BMS Dashboard` | Dashboard title. |
| `hide_views` | `[]` | Views to leave out: `overview`, `detail`, `cells`, `cells_3d`, `cells_2d`, `configuration`, `system`, `log`, `event`, `note`. |
| `gauges` | | Change the Overview gauges, keyed by `soc`, `pack_voltage`, `cell_voltage_min`, `cell_voltage_max`, `current`, `power`. Each takes [gauge card](https://www.home-assistant.io/dashboards/gauge/) options (`min`, `max`, `segments`, `severity`, `name`, …) that replace the defaults. |

The default gauge ranges suit a 96s NMC pack. For example, for a 16s LFP pack:

```yaml
strategy:
  type: custom:cellkeeper
  prefix: ck1
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
