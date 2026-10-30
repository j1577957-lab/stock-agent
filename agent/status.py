"""更新指揮站的 docs/status.json（技師狀態＋通訊紀錄）。只用 Python 內建功能。

指令用法：
  python agent/status.py busy stock                  把策略技師設成作業中
  python agent/status.py busy stock tw_intraday      作業中，並在頭上泡泡顯示「台股盤中掃描」
  python agent/status.py idle stock "掃描完成"        設回待命，並在通訊紀錄加一筆
  python agent/status.py idle stock "⚠️ 執行失敗"     訊息以 ⚠️ 開頭 → 技師改成「故障」，走去維修角
技師代號：eng 賽車工程師 / cal 行程技師 / mail 信件技師 / stock 策略技師 / shop 電商技師 / crawl 爬蟲技師
狀態：idle 待命 / busy 作業中 / error 故障 / off 未上線

status.json 結構（網頁每 60 秒讀一次）：
  crew   每位技師目前狀態
  meta   每位技師的細節：task 正在做什麼、since 開始時間、last_done 上次完成時間、last_msg 上次結果
  radio  通訊紀錄
  updated 最後一次更新時間
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
STATES = ("idle", "busy", "error", "off")
MAX_RADIO = 100  # 通訊紀錄最多保留幾筆
TZ = ZoneInfo("Asia/Taipei")

# 排程代號 → 泡泡裡顯示的中文
TASK_NAMES = {
    "tw_pre": "台股盤前報告", "tw_intraday": "台股盤中掃描", "tw_post": "台股盤後報告",
    "us_pre": "美股盤前報告", "us_intraday": "美股盤中掃描", "us_post": "美股盤後報告",
    "tw_scan": "台股價格更新", "us_scan": "美股價格更新",
    "news": "抓台股、美股新聞",
}


def _now() -> str:
    return datetime.now(TZ).isoformat(timespec="seconds")


def _load() -> dict:
    try:
        d = json.loads(FILE.read_text(encoding="utf-8"))
    except Exception:
        d = {}
    d.setdefault("crew", {k: ("off" if k == "shop" else "idle") for k in NAMES})
    d.setdefault("meta", {})
    d.setdefault("radio", [])
    return d


def _save(d: dict) -> None:
    d["updated"] = _now()
    FILE.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def set_state(tech: str, st: str, task: str | None = None) -> None:
    assert tech in NAMES and st in STATES
    d = _load()
    d["crew"][tech] = st
    m = d["meta"].setdefault(tech, {})
    if st == "busy":
        m["since"] = _now()
        m["task"] = TASK_NAMES.get(task or "", task or "")
    else:
        m.pop("since", None)
        m.pop("task", None)
    _save(d)


def add_radio(tech: str, msg: str) -> None:
    d = _load()
    seq = (d["radio"][-1].get("id", 0) if d["radio"] else 0) + 1
    stamp = datetime.now(TZ).strftime("%m/%d %H:%M")
    d["radio"].append({"id": seq, "who": NAMES.get(tech, tech), "tech": tech, "msg": f"{stamp}｜{msg}"})
    d["radio"] = d["radio"][-MAX_RADIO:]
    m = d["meta"].setdefault(tech, {})
    m["last_done"] = _now()
    m["last_msg"] = msg
    _save(d)


def done(tech: str, msg: str) -> None:
    """任務結束：訊息以 ⚠️ 開頭代表失敗，技師改成「故障」。"""
    set_state(tech, "error" if msg.strip().startswith("⚠") else "idle")
    add_radio(tech, msg)


if __name__ == "__main__":
    st, tech = sys.argv[1], sys.argv[2]
    extra = sys.argv[3] if len(sys.argv) > 3 else ""
    if st == "busy":
        set_state(tech, "busy", extra)
    elif extra and st == "idle":
        done(tech, extra)
    else:
        set_state(tech, st)
        if extra:
            add_radio(tech, extra)
    print(f"{NAMES[tech]} → {_load()['crew'][tech]}")
