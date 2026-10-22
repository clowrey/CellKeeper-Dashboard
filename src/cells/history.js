// Cell voltage history for the Cells 2D and 3D views. Home Assistant's long-term statistics
// already hold every cell's 5-minute and hourly means, so one request fetches all cells at once
// (about 1 s for 24 h of 96 cells) instead of each cell's raw history (30 s and more). The
// balancing sensors are text, without statistics, so their state changes come from the history.

import { MAX_CELLS } from "../context.js";

export const RANGES = {
  "6h": { hours: 6, period: "5minute", label: "6 h" },
  "24h": { hours: 24, period: "5minute", label: "24 h" },
  "7d": { hours: 168, period: "hour", label: "7 d" },
  "30d": { hours: 720, period: "hour", label: "30 d" },
};

export const REFRESH_MS = 5 * 60 * 1000;
const STEP_MS = { "5minute": 5 * 60 * 1000, hour: 3600 * 1000 };
const cache = new Map(); // request -> { at, promise }

// "1-4,7" -> Set{1,2,3,4,7}
export function cellSet(raw) {
  const out = new Set();
  if (!raw || ["None", "unknown", "unavailable"].includes(raw)) return out;
  for (const t of raw.split(",").map((s) => s.trim())) {
    const r = t.match(/^(\d+)\s*-\s*(\d+)$/);
    if (r) for (let c = Math.min(+r[1], +r[2]); c <= Math.max(+r[1], +r[2]); c++) out.add(c);
    else if (/^\d+$/.test(t)) out.add(+t);
  }
  return out;
}

// The pack's cells that exist in HA, up to its cell count: [{ n: 1, id: "sensor.ck0_cell_voltage_001" }, ...]
export function packCells(hass, prefix) {
  const count = parseInt(hass.states[`sensor.${prefix}_cell_count`]?.state, 10);
  const n = Number.isFinite(count) && count > 0 ? Math.min(count, MAX_CELLS) : MAX_CELLS;
  const cells = [];
  for (let i = 1; i <= n; i++) {
    const id = `sensor.${prefix}_cell_voltage_${String(i).padStart(3, "0")}`;
    if (id in hass.states) cells.push({ n: i, id });
  }
  return cells;
}

// Cached for 5 minutes, shared between cards; a failed request is retried next time.
function cached(key, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < REFRESH_MS) return hit.promise;
  const promise = load();
  promise.catch(() => cache.delete(key));
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

function span(range) {
  const end = new Date();
  const start = new Date(end.getTime() - RANGES[range].hours * 3600 * 1000);
  return { start_time: start.toISOString(), end_time: end.toISOString() };
}

// The cells' mean voltages over `range` on a regular time grid:
//   { t0, step, cols, end, z: [Float32Array per cell, NaN where missing] }
export function fetchCellHistory(hass, cells, range) {
  return cached(["stats", range, ...cells.map((c) => c.id)].join(","), async () => {
    const { period } = RANGES[range];
    const times = span(range);
    const stats = await hass.callWS({
      type: "recorder/statistics_during_period",
      ...times,
      statistic_ids: cells.map((c) => c.id),
      period,
      types: ["mean"],
      // In V whatever display unit the cell sensors have been given.
      units: { voltage: "V" },
    });
    const step = STEP_MS[period];
    const end = Date.parse(times.end_time);
    let first = Infinity;
    let last = -Infinity;
    for (const c of cells) {
      for (const p of stats[c.id] ?? []) {
        first = Math.min(first, p.start);
        last = Math.max(last, p.start);
      }
    }
    if (first === Infinity) return { t0: Date.parse(times.start_time), step, cols: 0, end, z: [] };
    const cols = Math.round((last - first) / step) + 1;
    const z = cells.map((c) => {
      const row = new Float32Array(cols).fill(NaN);
      for (const p of stats[c.id] ?? []) {
        if (Number.isFinite(p.mean) && p.mean > 0.01) row[Math.round((p.start - first) / step)] = p.mean;
      }
      return row;
    });
    return { t0: first, step, cols, end, z };
  });
}

// State changes of the balancing sensors over `range`: { entity id: [{ s, lu }, ...] }. These are
// text without statistics, and change often (tens of thousands of changes in 30 days), so they
// are only fetched when the heatmap marks them.
export function fetchBalancing(hass, ids, range) {
  return cached(["balancing", range, ...ids].join(","), () =>
    hass.callWS({
      type: "history/history_during_period",
      ...span(range),
      entity_ids: ids,
      minimal_response: true,
      no_attributes: true,
      significant_changes_only: false,
    })
  );
}

// marks[row * cols + col]: 1 where the cell was balancing at some point in that interval, 2
// where it was discharging, from `levels` ({ entity id: 1 or 2 }).
export function balanceMarks(data, cells, states, levels) {
  const { t0, step, cols, end } = data;
  const marks = new Uint8Array(cells.length * cols);
  const rowOf = new Map(cells.map((c, i) => [c.n, i]));
  for (const [id, level] of Object.entries(levels)) {
    const list = (states[id] ?? []).filter((e) => Number.isFinite(e.lu));
    list.forEach((e, i) => {
      const set = cellSet(e.s);
      if (!set.size) return;
      const from = Math.max(e.lu * 1000, t0);
      const to = i + 1 < list.length ? list[i + 1].lu * 1000 : end;
      const k0 = Math.max(0, Math.floor((from - t0) / step));
      const k1 = Math.min(cols - 1, Math.ceil((to - t0) / step) - 1);
      for (const n of set) {
        const r = rowOf.get(n);
        if (r === undefined) continue;
        for (let k = k0; k <= k1; k++) marks[r * cols + k] = Math.max(marks[r * cols + k], level);
      }
    });
  }
  return marks;
}

// Lowest, highest and average cell per interval, ignoring missing cells.
export function columnStats(z, cols) {
  const lo = new Float32Array(cols).fill(NaN);
  const hi = new Float32Array(cols).fill(NaN);
  const avg = new Float32Array(cols).fill(NaN);
  for (let k = 0; k < cols; k++) {
    let sum = 0;
    let count = 0;
    let a = Infinity;
    let b = -Infinity;
    for (const row of z) {
      const v = row[k];
      if (Number.isNaN(v)) continue;
      sum += v;
      count++;
      if (v < a) a = v;
      if (v > b) b = v;
    }
    if (count) {
      lo[k] = a;
      hi[k] = b;
      avg[k] = sum / count;
    }
  }
  return { lo, hi, avg };
}

// The p-th fraction of the values that are numbers (p = 0.01 -> 1st percentile).
export function percentile(values, p) {
  const sorted = Float32Array.from(values.filter((v) => !Number.isNaN(v))).sort();
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
}

// A 256-entry RGB lookup table running through the colour stops.
export function colorTable(stops) {
  const rgb = stops.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const f = (i / 255) * (rgb.length - 1);
    const j = Math.min(rgb.length - 2, Math.floor(f));
    const t = f - j;
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = rgb[j][c] + (rgb[j + 1][c] - rgb[j][c]) * t;
  }
  return lut;
}

// Navy to pale cyan: no yellow or orange, which mark balancing.
export const VOLTAGE_STOPS = ["#0d1b4c", "#1f4e9c", "#2a8fbd", "#5ec8c4", "#c7f0e3"];
