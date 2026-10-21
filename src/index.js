import "./cards/styled-card.js";
import "./cards/state-tile.js";
import "./cards/event-grid.js";
import "./cards/title-card.js";
import { CellKeeperDashboardStrategy } from "./strategy.js";
import { define } from "./context.js";

define("ll-strategy-dashboard-cellkeeper", CellKeeperDashboardStrategy);

console.info(`%c CELLKEEPER-DASHBOARD %c ${__VERSION__} `, "color: white; background: #2e7d32", "");
