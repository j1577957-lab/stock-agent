"""股票 Agent 主程式。

用法：
  python -m agent.main                 自動依現在時間決定要做什麼
  python -m agent.main tw_intraday     強制執行某個模式（tw_pre / tw_intraday / tw_post / us_pre / us_intraday / us_post）
  加上 --dry-run   不呼叫 Claude（不花錢），用模擬結果測試整個流程與通知
  加上 --demo-data 不抓真實股價，用假資料測試（給開發測試用）
"""
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

from agent import clock, llm, notify
from agent.indicators import analyze

ROOT = Path(__file__).resolve().parent.parent


def load_config() -> dict:
    return yaml.safe_load((ROOT / "config.yaml").read_text(encoding="utf-8"))


def demo_fetch(symbol: str):
    import numpy as np
    import pandas as pd

    rng = np.random.default_rng(abs(hash(symbol)) % 2**32)
    idx = pd.bdate_range(end=datetime.now(ZoneInfo("UTC")).date(), periods=120)
    trend = np.linspace(100, 100 + rng.uniform(-15, 30), 120)
    close = trend + rng.normal(0, 1.5, 120).cumsum() * 0.3
    df = pd.DataFrame({"Open": close * 0.99, "High": close * 1.015, "Low": close * 0.985,
                       "Close": close, "Volume": rng.integers(1000, 3000, 120).astype(float)}, index=idx)
    df.iloc[-1, df.columns.get_loc("Volume")] *= 2.5
    return symbol, df, pd.DataFrame()


def scan(market: str, cfg: dict, *, intraday: bool, demo: bool) -> list[dict]:
    from agent import data

    today = clock.market_today(market)
    progress = clock.session_progress(market) if intraday else 1.0
    snaps = []
    for stock in cfg["watchlist"][market]:
        sym, daily, intra = (demo_fetch if demo else data.fetch)(stock["symbol"])
        base = {"symbol": sym, "name": stock["name"]}
        if daily.empty:
            print(f"  ✗ {stock['name']} {stock['symbol']} 抓不到資料")
            snaps.append({**base, "error": "抓不到資料", "candidate": False, "score": 0})
            continue
        snap = analyze(daily, intra, cfg, market_date=today, progress=progress, intraday=intraday)
        flag = "★ 通過初篩" if snap["candidate"] else ""
        print(f"  {stock['name']:<10} {snap['price']:>10} 分數 {snap['score']} {flag} {snap['blockers'] or ''}")
        snaps.append({**base, **snap})
    return snaps


def run(mode: str, dry: bool, demo: bool) -> str | None:
    """執行一次，回傳給指揮站通訊紀錄的一句摘要。"""
    cfg = load_config()
    if mode == "none":
        print("現在不是交易相關時段，結束。")
        return None
    market, phase = mode.split("_")
    mkt_name = "台股" if market == "tw" else "美股"
    now_local = datetime.now(clock.MARKETS[market]["tz"])
    today = now_local.date().isoformat()
    stamp = datetime.now(ZoneInfo("Asia/Taipei")).strftime("%Y-%m-%d %H:%M")
    dry = dry or not llm.has_key()
    if dry:
        print("（模擬模式：不呼叫 Claude）")

    print(f"== {mkt_name} {phase} @ {stamp}（台灣時間）==")
    snaps = scan(market, cfg, intraday=(phase == "intraday"), demo=demo)
    notify.save_scan(market, mode, stamp, snaps)
    state = notify.load_state()
    ncfg = cfg["notify"]

    if phase == "intraday":
        judged = state.setdefault("judged", {})
        for d in list(judged):  # 只保留今天
            if d != today:
                judged.pop(d)
        counts = judged.setdefault(today, {})
        results = []
        for snap in [s for s in snaps if s.get("candidate")]:
            sym = snap["symbol"]
            if counts.get(sym, 0) >= ncfg["max_judge_per_stock_per_day"]:
                print(f"  - {snap['name']} 今天已判斷過，略過")
                continue
            counts[sym] = counts.get(sym, 0) + 1
            notify.save_state(state)  # 先記錄，避免出錯後重複花錢
            stock = {"symbol": sym, "name": snap["name"]}
            if market == "tw" and not demo:
                from agent import finmind
                snap["籌碼與基本面"] = finmind.summary(finmind.stock_id(sym))
            print(f"  → 交給分析 agent：{snap['name']}")
            report = llm.analyst_report(stock, snap, market, cfg, dry)
            print(f"  → 交給判斷 agent：{snap['name']}")
            verdict = llm.judge(stock, snap, report, cfg, dry)
            sig = {"time": stamp, "market": market, "symbol": sym, "name": snap["name"],
                   "price": snap["price"], "change_pct": snap["change_pct"], "score": snap["score"],
                   "reasons": snap["reasons"], "report": report, "judge": verdict, "dry_run": dry}
            notify.save_signal(sig)
            results.append(f"{snap['name']}→{verdict['verdict']}")
            print(f"  ⇒ 判斷結果：{verdict['verdict']}（信心 {verdict.get('confidence')}）")
            if verdict["verdict"] in ncfg["push_verdicts"]:
                if ncfg["telegram"]:
                    notify.telegram(notify.format_signal(sig, as_html=True)[1])
                if ncfg["email"]:
                    subject, body = notify.format_signal(sig, as_html=False)
                    notify.email(f"[股票Agent] {subject}", body)
        notify.save_state(state)
        n_ok = sum(1 for s in snaps if not s.get('error'))
        n_c = sum(1 for s in snaps if s.get('candidate'))
        msg = f"{mkt_name}盤中掃描 {n_ok} 檔，{n_c} 檔通過初篩"
        return msg + ("；判斷：" + "、".join(results) if results else "")

    # 盤前 / 盤後
    if phase == "post" and not any(s.get("is_today") for s in snaps):
        print("今天沒有交易資料，應該是休市，不產生盤後報告。")
        state[f"{market}_post_done"] = today
        notify.save_state(state)
        return f"{mkt_name}今天休市，不產生盤後報告"

    extra = ""
    if phase == "post":
        # 抓最近 18 小時內的盤中判斷（美股收盤在台灣是隔天凌晨，所以不能只看日期）
        tpe = ZoneInfo("Asia/Taipei")
        now_tpe = datetime.now(tpe)
        todays = [s for s in notify._load("signals.json", []) if s["market"] == market and
                  (now_tpe - datetime.strptime(s["time"], "%Y-%m-%d %H:%M").replace(tzinfo=tpe)).total_seconds() < 18 * 3600]
        extra = "今天盤中 AI 判斷紀錄：" + (
            "；".join(f"{s['name']} {s['judge']['verdict']}（{s['judge'].get('summary', '')}）" for s in todays)
            or "無（沒有股票通過初篩）")

    slim = [{k: s.get(k) for k in ("name", "symbol", "price", "change_pct", "ma20", "above_ma20_pct",
                                    "rsi", "k", "d", "vol_ratio", "score", "reasons", "blockers", "error")}
            for s in snaps]
    if market == "tw" and not demo:
        from agent import finmind
        for s in slim:
            if not s.get("error"):
                s["籌碼與基本面"] = finmind.summary(finmind.stock_id(s["symbol"]))
    text = llm.brief(phase, market, slim, extra, cfg, dry)
    title = f"{'🌅' if phase == 'pre' else '🌙'} {mkt_name}{'盤前' if phase == 'pre' else '盤後'}報告 {stamp}"
    notify.save_report({"time": stamp, "market": market, "phase": phase, "title": title,
                        "text": text, "dry_run": dry})
    if ncfg["telegram"]:
        import html
        notify.telegram(f"<b>{html.escape(title)}</b>\n\n{html.escape(text)}")
    if ncfg["email"]:
        notify.email(f"[股票Agent] {title}", text)
    state[f"{market}_{phase}_done"] = today
    notify.save_state(state)
    return f"{mkt_name}{'盤前' if phase == 'pre' else '盤後'}報告已送出（Telegram／Email／儀表板）"


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    mode = args[0] if args and args[0] not in ("", "auto") else clock.detect_mode()
    from agent import status
    try:
        summary = run(mode, dry="--dry-run" in sys.argv, demo="--demo-data" in sys.argv)
    except Exception as e:
        status.done("stock", f"⚠️ {mode} 執行失敗：{str(e)[:80]}")
        raise
    if summary:
        status.done("stock", summary)
    else:
        status.set_state("stock", "idle")
