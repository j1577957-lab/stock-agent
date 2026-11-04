"""抓股價資料（免費的 Yahoo Finance，透過 yfinance 套件）。

注意：Yahoo 的台股盤中報價大約延遲 15~20 分鐘，美股接近即時。
"""
from __future__ import annotations

import pandas as pd


def _alt_symbol(symbol: str) -> str | None:
    if symbol.endswith(".TWO"):
        return symbol[:-4] + ".TW"
    if symbol.endswith(".TW"):
        return symbol[:-3] + ".TWO"
    return None


def _history(symbol: str, period: str, interval: str) -> pd.DataFrame:
    import yfinance as yf

    df = yf.Ticker(symbol).history(period=period, interval=interval, auto_adjust=False)
    if df is None or df.empty:
        return pd.DataFrame()
    return df[["Open", "High", "Low", "Close", "Volume"]].dropna(subset=["Close"])


def _day(ts) -> str:
    return pd.Timestamp(ts).date().isoformat()


def _new_index(daily: pd.DataFrame, day: str) -> pd.Timestamp:
    ts = pd.Timestamp(day)
    tz = getattr(daily.index, "tz", None)
    return ts.tz_localize(tz) if tz is not None else ts


def fill_missing_days(symbol: str, daily: pd.DataFrame, intra: pd.DataFrame) -> pd.DataFrame:
    """Yahoo 偶爾會漏掉某一天的日K（例如 2026-11-04 台股 ETF 少了 11/03 那根），
    導致「今天漲跌幅」變成兩天的累積漲跌、持股警示誤報。
    1) 15 分K 裡有、日K 卻沒有的日子 → 用 15 分K 拼出那天的日K
    2) 台股最近 3 根日K 之間若空了平日 → 用 FinMind 日K 補（休市日 FinMind 也沒有，不會亂補）"""
    if daily is None or daily.empty:
        return daily
    have = {_day(i) for i in daily.index}
    add = {}
    if intra is not None and not intra.empty:
        days = pd.Index([_day(i) for i in intra.index])
        first = _day(daily.index[-min(len(daily), 10)])
        for d in sorted(set(days)):
            if d in have or d < first:
                continue
            bars = intra[days == d]
            add[d] = {"Open": float(bars["Open"].iloc[0]), "High": float(bars["High"].max()),
                      "Low": float(bars["Low"].min()), "Close": float(bars["Close"].iloc[-1]),
                      "Volume": float(bars["Volume"].sum())}
    if symbol.endswith(".TW") or symbol.endswith(".TWO"):
        recent = sorted(have | set(add))[-3:]
        gap = any(len(pd.bdate_range(a, b)) > 2 for a, b in zip(recent, recent[1:]))
        if gap:
            try:
                from agent import finmind
                fm = finmind.daily_prices(finmind.stock_id(symbol), days=14)
            except Exception as e:
                print(f"  ! {symbol} FinMind 補日K 失敗：{e}")
                fm = pd.DataFrame()
            for i, row in fm.iterrows():
                d = _day(i)
                if d not in have and d >= recent[0]:
                    add[d] = {k: float(row[k]) for k in ("Open", "High", "Low", "Close", "Volume")}
    if not add:
        return daily
    print(f"  (補上 {symbol} 漏掉的日K：{'、'.join(sorted(add))})")
    extra = pd.DataFrame(list(add.values()), index=[_new_index(daily, d) for d in add])
    return pd.concat([daily, extra[daily.columns]]).sort_index()


def fetch(symbol: str) -> tuple[str, pd.DataFrame, pd.DataFrame]:
    """回傳 (實際可用的代號, 日K, 15分K)。抓不到就回傳空表。"""
    for sym in filter(None, [symbol, _alt_symbol(symbol)]):
        try:
            daily = _history(sym, "1y", "1d")
        except Exception as e:  # 網路錯誤等
            print(f"  ! {sym} 日K 抓取失敗：{e}")
            daily = pd.DataFrame()
        if len(daily) >= 30:
            try:
                intra = _history(sym, "5d", "15m")
            except Exception:
                intra = pd.DataFrame()
            try:
                daily = fill_missing_days(sym, daily, intra)
            except Exception as e:  # 補資料失敗不影響原本流程
                print(f"  ! {sym} 檢查漏掉的日K 失敗：{e}")
            return sym, daily, intra
    # Yahoo 抓不到時，台股改用 FinMind 日K 備援
    from agent import finmind
    sid = finmind.stock_id(symbol)
    if sid:
        daily = finmind.daily_prices(sid)
        if len(daily) >= 30:
            print(f"  (改用 FinMind 資料：{symbol})")
            return symbol, daily, pd.DataFrame()
    return symbol, pd.DataFrame(), pd.DataFrame()
