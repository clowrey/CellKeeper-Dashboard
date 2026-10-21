"""Build src/events/catalog.js: every CellKeeper event with its firmware level, escalation rule and
a one-line description, keyed by the HMI entity's id suffix.

    python tools/make_events.py [path/to/bms_core.yaml] [path/to/events.h]

bms_core.yaml (CellKeeper-BMS-LCD) names each event sensor ("Event Fatal POS Stuck Open" ->
sensor.ck0_event_fatal_pos_stuck_open) after the firmware event it shows (error_contactor_pos_stuck_open
-> CONTACTOR_POS_STUCK_OPEN). The level in those names is a label only: the firmware's table in
bms/sys/events/events.h (bmstest1) says how each event starts and when it escalates, and the
sensor's state ("WARNING (2)") carries the level it is at now.
"""

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
GITHUB = HERE.parent.parent
YAML = Path(sys.argv[1]) if len(sys.argv) > 1 else GITHUB / "CellKeeper-BMS-LCD" / "bms_core.yaml"
EVENTS_H = Path(sys.argv[2]) if len(sys.argv) > 2 else GITHUB / "bmstest1" / "bms" / "sys" / "events" / "events.h"
LIMITS_H = EVENTS_H.parent.parent.parent / "config" / "limits.h"

# What each event means, from where the firmware raises it.
DESCRIPTIONS = {
    "CONTACTOR_POS_STUCK_OPEN": "The positive contactor didn't close when driven.",
    "CONTACTOR_POS_STUCK_CLOSED": "The positive contactor still conducts when it should be open (welded?).",
    "CONTACTOR_NEG_STUCK_OPEN": "The negative contactor didn't close when driven.",
    "CONTACTOR_NEG_STUCK_CLOSED": "The negative contactor still conducts when it should be open (welded?).",
    "CONTACTOR_PRE_STUCK_OPEN": "The precharge contactor didn't close when driven.",
    "CONTACTOR_PRE_STUCK_CLOSED": "The precharge contactor still conducts when it should be open.",
    "CONTACTOR_PRECHARGE_VOLTAGE_TOO_HIGH": "Precharge ended with too much voltage still across it: the load didn't charge up.",
    "CONTACTOR_PRECHARGE_CURRENT_TOO_HIGH": "Too much current flowed during precharge.",
    "CONTACTOR_POS_UNEXPECTED_OPEN": "The positive contactor opened while it should have been closed.",
    "CONTACTOR_NEG_UNEXPECTED_OPEN": "The negative contactor opened while it should have been closed.",
    "CONTACTOR_CLOSING_FAILED": "A contactor closing sequence failed a check and was abandoned.",
    "SUPPLY_VOLTAGE_STALE": "No fresh reading of the board's supply voltages.",
    "BATTERY_VOLTAGE_STALE": "No fresh pack voltage reading.",
    "BATTERY_TEMPERATURE_STALE": "No fresh module temperature readings.",
    "CURRENT_STALE": "No fresh current sensor reading.",
    "CELL_VOLTAGES_STALE": "No fresh cell voltage readings from the battery monitor boards.",
    "SUPPLY_VOLTAGE_3V3_LOW": "The board's 3.3 V supply is low.",
    "SUPPLY_VOLTAGE_3V3_HIGH": "The board's 3.3 V supply is high.",
    "SUPPLY_VOLTAGE_5V_LOW": "The board's 5 V supply is low.",
    "SUPPLY_VOLTAGE_5V_HIGH": "The board's 5 V supply is high.",
    "SUPPLY_VOLTAGE_12V_LOW": "The 12 V supply is low.",
    "SUPPLY_VOLTAGE_12V_HIGH": "The 12 V supply is high.",
    "SUPPLY_VOLTAGE_CONTACTOR_LOW": "The contactor supply is low; contactors may drop out.",
    "SUPPLY_VOLTAGE_CONTACTOR_VERY_LOW": "The contactor supply is too low to hold the contactors reliably.",
    "SUPPLY_VOLTAGE_CONTACTOR_HIGH": "The contactor supply is high.",
    "BATTERY_VOLTAGE_HIGH": "The pack voltage is above its normal range.",
    "BATTERY_VOLTAGE_VERY_HIGH": "The pack voltage is far above its normal range.",
    "BATTERY_VOLTAGE_LOW": "The pack voltage is below its normal range; a tiny discharge mustn't drain it, so this escalates after an hour.",
    "BATTERY_VOLTAGE_VERY_LOW": "The pack voltage is far below its normal range.",
    "CELL_VOLTAGE_HIGH": "A cell is above the soft max.",
    "CELL_VOLTAGE_VERY_HIGH": "A cell is above the firmware's hard max.",
    "CELL_VOLTAGE_LOW": "A cell is below the soft min.",
    "CELL_VOLTAGE_VERY_LOW": "A cell is below the firmware's hard min.",
    "SOFT_CHARGE_BUFFER_EXCEEDED": "Too much charge went in (or out) past the soft limits.",
    "OVERCURRENT_CHARGING": "Charge current stayed above the allowed limit for too long.",
    "OVERCURRENT_DISCHARGING": "Discharge current stayed above the allowed limit for too long.",
    "BATTERY_TEMPERATURE_HIGH": "A module is above the soft temperature limit.",
    "BATTERY_TEMPERATURE_VERY_HIGH": "A module is above the hard temperature limit.",
    "BATTERY_TEMPERATURE_LOW": "A module is below the soft temperature limit.",
    "BATTERY_TEMPERATURE_VERY_LOW": "A module is below the hard temperature limit.",
    "VOLTAGE_MISMATCH": "The sum of the cell voltages disagrees with the measured pack voltage.",
    "BMB_READ_ERROR": "A read from the battery monitor boards failed.",
    "BMB_CRC_MISMATCH": "Battery monitor board data failed its CRC check.",
    "CELL_VOLTAGE_GLITCH": "A cell reading jumped implausibly and was ignored.",
    "MODULE_TEMPERATURE_GLITCH": "A module temperature jumped implausibly and was ignored.",
    "INVERTER_DETECTED": "The inverter is talking to the BMS on CAN.",
    "ESTOP_PRESSED": "The emergency stop input is active.",
    "BOOT_NORMAL": "The BMS started normally.",
    "BOOT_WATCHDOG": "The BMS restarted after a watchdog reset: it had hung.",
    "LOOP_OVERRUN": "The control loop overran its time slot.",
    "RESTARTING": "The BMS is restarting.",
    "LINK_VOLTAGE_MISMATCH": "With the link contactors closed, the link rail doesn't follow the pack voltage: one may have dropped out.",
    "FUSE_VOLTAGE_DROP_HIGH": "With current flowing there is a large drop across the fuse or jumper: blown, or an open connection.",
    "ISOLATION_ASYMMETRY": "The boot-time isolation zero check found a large offset: a possible leak to chassis.",
    "CONTACTOR_PORT_ENERGIZED": "The inverter held the battery port live with the contactors open, so the BMS precharged onto it instead of the weld test.",
    "BOARD_MISMATCH": "The PCB revision strap doesn't match the firmware build.",
    "SUPERVISOR_NOT_ENABLED": "Closing is held off: the supervisor isn't enabling the contactor drivers.",
    "SUPERVISOR_DISABLED_CONTACTORS": "The supervisor cut the contactor drivers while they were being driven.",
    "BMB_MODULE_ID_CHECK_FAILED": "A battery monitor board's module ID failed its CRC or check bits.",
    "BMB_MODULE_ID_UNKNOWN": "A module ID isn't in the BMS's pack type table.",
    "BMB_MODULE_ID_CONFLICT": "The module IDs don't fit any pack type this BMS is built for.",
}

# Group for the catalogue.
def area(t):
    if t.startswith("CONTACTOR_") or t.startswith("SUPERVISOR_") or t == "SUPPLY_VOLTAGE_CONTACTOR_VERY_LOW" or t in ("LINK_VOLTAGE_MISMATCH", "FUSE_VOLTAGE_DROP_HIGH", "ESTOP_PRESSED"):
        return "Contactors"
    if t.startswith("CELL_") or t.startswith("BATTERY_VOLTAGE") or t in ("SOFT_CHARGE_BUFFER_EXCEEDED", "VOLTAGE_MISMATCH"):
        return "Voltage"
    if "TEMPERATURE" in t:
        return "Temperature"
    if t.startswith("OVERCURRENT") or t == "CURRENT_STALE":
        return "Current"
    if t.startswith("BMB_"):
        return "Monitor boards"
    if t.startswith("SUPPLY_VOLTAGE"):
        return "Supplies"
    return "System"


def slug(text):
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def main():
    limits = dict(re.findall(r"#define (\w+_ESCALATION_MS) (\d+)", LIMITS_H.read_text()))
    body = EVENTS_H.read_text().split("#define EVENT_TYPES(X)")[1].split("typedef enum")[0]
    firmware = {}
    for index, (name, level, after) in enumerate(re.findall(r"X\((\w+), LEVEL_(\w+), ([^)]*?)\)", body)):
        after = re.sub(r"/\*.*?\*/", "", after).strip()
        after = int(limits.get(after, after))
        firmware[name] = (index, level, after)

    catalog = {}
    for yid, label in re.findall(r"(error_\w+): \{ name: \"([^\"]+)\" \}", YAML.read_text()):
        t = yid[len("error_"):].upper()
        if t not in firmware:
            raise SystemExit(f"{yid} has no firmware event {t}")
        index, level, after = firmware[t]
        key = slug(label)[len("event_"):]
        escalate = None
        if level == "WARNING" and after:
            escalate = {"count": after}
        elif level == "CRITICAL":
            escalate = {"ms": after}
        catalog[key] = {
            "type": t,
            "id": index,
            "name": re.sub(r"^Event (Fatal|Critical|Warning|Info) ", "", label),
            "level": level,
            **({"escalate": escalate} if escalate else {}),
            "area": area(t),
            "desc": DESCRIPTIONS[t],
        }
    missing = set(firmware) - {c["type"] for c in catalog.values()}
    if missing:
        print("firmware events without an HMI sensor:", ", ".join(sorted(missing)))

    out = HERE.parent / "src" / "events" / "catalog.js"
    out.parent.mkdir(exist_ok=True)
    out.write_text(
        "// Generated by tools/make_events.py from CellKeeper-BMS-LCD/bms_core.yaml and the firmware's\n"
        "// bms/sys/events/events.h. Do not edit.\n"
        "//\n"
        "// Keyed by the event sensor's id after sensor.<prefix>_event_. level is the firmware's starting\n"
        "// level; escalate is {count} (a warning turns fatal after that many occurrences) or {ms}\n"
        "// (a critical turns fatal after being active that long).\n"
        f"export const EVENT_CATALOG = {json.dumps(catalog, indent=2, ensure_ascii=False)};\n",
        encoding="utf-8",
    )
    print(f"wrote {out.name}: {len(catalog)} events")


if __name__ == "__main__":
    main()
