"""技術指標與「初篩」：不用 AI，先用規則挑出可能可以買的股票。

規則（可以在 config.yaml 調整數字）：
必要條件（全部都要符合，否則直接淘汰）
  1. 股價在月線（20 日均線）之上
  2. 月線往上走（今天的月線 > 5 天前的月線）
  3. 沒有離月線太遠（避免追高）
  4. RSI 沒有過熱
加分條件（每符合一項 +1 分，達到 min_score 才交給 AI）
  A. 量能放大（盤中會依時間推估全天量）
  B. MACD 柱狀體由負轉正（近 3 天）
  C. KD 黃金交叉且 K 值在 50 以下（近 3 天，低檔轉強）
  D. 短線多頭排列：股價 > 5 日線 > 10 日線
  E. 突破前 20 日最高價
  F. 盤中站上當日均價線（VWAP）
"""
from __future__ import annotations

import math

import pandas as pd


def _rsi(close: pd.Series, n: int = 14) -> pd.Series:
    diff = close.diff()
    up = diff.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    down = (-diff.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    rs = up / down.replace(0, float("nan"))
    return (100 - 100 / (1 + rs)).fillna(100)


def _kd(df: pd.DataFrame, n: int = 9) -> tuple[pd.Series, pd.Series]:
    low_n = df["Low"].rolling(n, min_periods=1).min()
    high_n = df["High"].rolling(n, min_periods=1).max()
    rng = (high_n - low_n).replace(0, float("nan"))
    rsv = ((df["Close"] - low_n) / rng * 100).fillna(50)
    k_vals, d_vals, k, d = [], [], 50.0, 50.0
    for r in rsv:
        k = k * 2 / 3 + r / 3
        d = d * 2 / 3 + k / 3
        k_vals.append(k)
        d_vals.append(d)
    return pd.Series(k_vals, index=df.index), pd.Series(d_vals, index=df.index)


def _macd_hist(close: pd.Series) -> pd.Series:
    dif = close.ewm(span=12, adjust=False).mean() - close.ewm(span=26, adjust=False).mean()
    return dif - dif.ewm(span=9, adjust=False).mean()


def _r(x, nd=2):
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else round(float(x), nd)


def analyze(daily: pd.DataFrame, intra: pd.DataFrame, cfg: dict, *,
            market_date: str, progress: float, intraday: bool) -> dict:
    """計算指標並做初篩。progress = 盤中已過幾成時間（盤後為 1）。"""
    s = cfg["screen"]
    df = daily.copy()
    close = df["Close"]
    df["ma5"] = close.rolling(5).mean()
    df["ma10"] = close.rolling(10).mean()
    df["ma20"] = close.rolling(20).mean()
    df["ma60"] = close.rolling(60).mean()
    df["rsi"] = _rsi(close)
    df["k"], df["d"] = _kd(df)
    df["hist"] = _macd_hist(close)

    last = df.iloc[-1]
    prev = df.iloc[-2]
    last_date = pd.Timestamp(df.index[-1]).date().isoformat()
    is_today = last_date == market_date

    # 成交量倍數：今天的量 ÷ 前 20 天平均（盤中依已過時間推估全天量）
    avg_vol = df["Volume"].iloc[-21:-1].mean()
    vol = float(last["Volume"])
    if intraday and is_today:
        vol = vol / max(progress, 0.05)
    vol_ratio = vol / avg_vol if avg_vol else float("nan")

    high20_prev = df["High"].iloc[-21:-1].max()

    # 當日均價線 VWAP（用 15 分 K）
    vwap = None
    if intra is not None and not intra.empty:
        idx_dates = pd.Index([pd.Timestamp(i).date().isoformat() for i in intra.index])
        today_bars = intra[idx_dates == market_date]
        if not today_bars.empty and today_bars["Volume"].sum() > 0:
            typical = (today_bars["High"] + today_bars["Low"] + today_bars["Close"]) / 3
            vwap = float((typical * today_bars["Volume"]).sum() / today_bars["Volume"].sum())

    price = float(last["Close"])
    above_ma20_pct = (price / last["ma20"] - 1) * 100

    blockers, reasons = [], []
    if not price > last["ma20"]:
        blockers.append("股價在月線之下")
    if not last["ma20"] > df["ma20"].iloc[-6]:
        blockers.append("月線往下彎")
    if above_ma20_pct > s["max_above_ma20_pct"]:
        blockers.append(f"離月線 {above_ma20_pct:.1f}% 太遠，不追高")
    if last["rsi"] > s["max_rsi"]:
        blockers.append(f"RSI {last['rsi']:.0f} 過熱")

    # 開盤前一段時間成交量特別集中，推估全天量會失真，盤中前 15% 時間不採計量能
    if vol_ratio >= s["volume_ratio"] and not (intraday and is_today and progress < 0.15):
        reasons.append(f"量能放大 {vol_ratio:.1f} 倍")
    h = df["hist"].iloc[-4:]
    if h.iloc[-1] > 0 and (h.iloc[:-1] <= 0).any():
        reasons.append("MACD 柱翻正")
    kk, dd = df["k"].iloc[-4:], df["d"].iloc[-4:]
    crossed = any(kk.iloc[i - 1] <= dd.iloc[i - 1] and kk.iloc[i] > dd.iloc[i] for i in range(1, 4))
    if crossed and kk.iloc[-1] > dd.iloc[-1] and min(kk) < 50:
        reasons.append(f"KD 低檔黃金交叉（K={last['k']:.0f}）")
    if price > last["ma5"] > last["ma10"]:
        reasons.append("短線多頭排列（價 > 5日線 > 10日線）")
    if price > high20_prev:
        reasons.append("突破前 20 日高點")
    if intraday and vwap and price > vwap:
        reasons.append("盤中站上均價線")

    score = len(reasons)
    candidate = (not blockers) and score >= s["min_score"]
    if intraday and not is_today:
        candidate = False
        blockers.append("今天沒有交易資料（可能休市）")

    return {
        "price": _r(price),
        "change_pct": _r((price / prev["Close"] - 1) * 100),
        "date": last_date,
        "is_today": is_today,
        "ma5": _r(last["ma5"]), "ma10": _r(last["ma10"]),
        "ma20": _r(last["ma20"]), "ma60": _r(last["ma60"]),
        "above_ma20_pct": _r(above_ma20_pct, 1),
        "rsi": _r(last["rsi"], 0), "k": _r(last["k"], 0), "d": _r(last["d"], 0),
        "macd_hist": _r(last["hist"], 3),
        "vol_ratio": _r(vol_ratio),
        "high20_prev": _r(high20_prev),
        "vwap": _r(vwap),
        "score": score,
        "reasons": reasons,
        "blockers": blockers,
        "candidate": candidate,
        "recent_closes": [_r(x) for x in close.iloc[-10:].tolist()],
    }
