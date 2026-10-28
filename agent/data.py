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
            return sym, daily, intra
    return symbol, pd.DataFrame(), pd.DataFrame()
