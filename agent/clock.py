"""判斷「現在該做什麼」：盤前 / 盤中 / 盤後 / 什麼都不做。

只用 Python 內建功能（不需要安裝套件），讓 GitHub 在非交易時段可以幾秒內就結束，省免費額度。
直接執行時會把結果寫到 GITHUB_OUTPUT，例如：mode=tw_intraday
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, time
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
STATE_FILE = ROOT / "docs" / "data" / "state.json"

MARKETS = {
    "tw": {
        "tz": ZoneInfo("Asia/Taipei"),
        "pre": (time(8, 0), time(8, 59)),
        "intraday": (time(9, 0), time(13, 35)),
        "post": (time(13, 45), time(15, 59)),
        "open": time(9, 0),
        "close": time(13, 30),
    },
    "us": {
        "tz": ZoneInfo("America/New_York"),
        "pre": (time(8, 0), time(9, 29)),
        "intraday": (time(9, 30), time(16, 5)),
        "post": (time(16, 10), time(17, 59)),
        "open": time(9, 30),
        "close": time(16, 0),
    },
}


def load_state() -> dict:
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def market_today(market: str, now_utc: datetime | None = None) -> str:
    now_utc = now_utc or datetime.now(ZoneInfo("UTC"))
    return now_utc.astimezone(MARKETS[market]["tz"]).date().isoformat()


def detect_mode(now_utc: datetime | None = None, state: dict | None = None) -> str:
    """回傳例如 'tw_pre'、'us_intraday'，沒事做就回傳 'none'。"""
    now_utc = now_utc or datetime.now(ZoneInfo("UTC"))
    state = load_state() if state is None else state
    for market, m in MARKETS.items():
        local = now_utc.astimezone(m["tz"])
        if local.weekday() >= 5:  # 週六日
            continue
        t = local.time()
        today = local.date().isoformat()
        for phase in ("pre", "intraday", "post"):
            start, end = m[phase]
            if start <= t <= end:
                # 盤前、盤後一天只做一次
                if phase != "intraday" and state.get(f"{market}_{phase}_done") == today:
                    return "none"
                return f"{market}_{phase}"
    return "none"


def session_progress(market: str, now_utc: datetime | None = None) -> float:
    """盤中已經過了幾成（0~1），用來估算全天成交量。"""
    now_utc = now_utc or datetime.now(ZoneInfo("UTC"))
    m = MARKETS[market]
    local = now_utc.astimezone(m["tz"])
    o = local.replace(hour=m["open"].hour, minute=m["open"].minute, second=0, microsecond=0)
    c = local.replace(hour=m["close"].hour, minute=m["close"].minute, second=0, microsecond=0)
    frac = (local - o).total_seconds() / (c - o).total_seconds()
    return min(max(frac, 0.05), 1.0)


if __name__ == "__main__":
    forced = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] not in ("", "auto") else None
    mode = forced or detect_mode()
    print(f"mode={mode}")
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"mode={mode}\n")
