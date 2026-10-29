"""更新指揮站的 docs/status.json（技師狀態＋通訊紀錄）。只用 Python 內建功能。

指令用法：
  python agent/status.py busy stock                 把策略技師設成作業中
  python agent/status.py idle stock "掃描完成"       設回待命，並在通訊紀錄加一筆
技師代號：eng 賽車工程師 / cal 行程技師 / mail 信件技師 / stock 策略技師 / shop 電商技師 / crawl 爬蟲技師
"""
from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

FILE = Path(__file__).resolve().parent.parent / "docs" / "status.json"
NAMES = {"eng": "賽車工程師", "cal": "行程技師", "mail": "信件技師",
         "stock": "策略技師", "shop": "電商技師", "crawl": "爬蟲技師"}
MAX_RADIO = 100  # 通訊紀錄最多保留幾筆


def _load() -> dict:
    try:
        d = json.loads(FILE.read_text(encoding="utf-8"))
    except Exception:
        d = {}
    d.setdefault("crew", {k: ("off" if k == "shop" else "idle") for k in NAMES})
    d.setdefault("radio", [])
    return d


def _save(d: dict) -> None:
    FILE.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def set_state(tech: str, st: str) -> None:
    assert tech in NAMES and st in ("idle", "busy", "off")
    d = _load()
    d["crew"][tech] = st
    _save(d)


def add_radio(tech: str, msg: str) -> None:
    d = _load()
    seq = (d["radio"][-1].get("id", 0) if d["radio"] else 0) + 1
    stamp = datetime.now(ZoneInfo("Asia/Taipei")).strftime("%m/%d %H:%M")
    d["radio"].append({"id": seq, "who": NAMES.get(tech, tech), "msg": f"{stamp}｜{msg}"})
    d["radio"] = d["radio"][-MAX_RADIO:]
    _save(d)


def done(tech: str, msg: str) -> None:
    set_state(tech, "idle")
    add_radio(tech, msg)


if __name__ == "__main__":
    st, tech = sys.argv[1], sys.argv[2]
    set_state(tech, st)
    if len(sys.argv) > 3:
        add_radio(tech, sys.argv[3])
    print(f"{NAMES[tech]} → {st}")
