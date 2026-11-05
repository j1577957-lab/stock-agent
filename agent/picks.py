"""盤前「值得研究」清單：用基本面、技術面、籌碼面替股票打分數並排名（不用 AI、不花 Claude 費用）。

流程：
  1. 選範圍：證交所、櫃買中心公開資料的成交額前 N 名，加上觀察清單裡的個股（ETF 沒有財報，不評分）
  2. 技術面：Yahoo 日K（免費）
  3. 基本面：FinMind 財報和月營收存在快取，不必每天重抓
  4. 先用財報與技術面篩出候選股，只替候選股查本益比和籌碼，避免超過 FinMind 每小時上限
  5. 依 config.yaml 的比重算總分，列出前幾名

這是規則算出來的研究清單，不是買賣建議。分數高不代表一定會漲。
"""
from __future__ import annotations

import json
import math
import os
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import requests

from agent import finmind

ROOT = Path(__file__).resolve().parent.parent
# 快取放在不會上傳到公開專案的位置（FinMind 條款禁止再散布原始資料），由 GitHub Actions cache 保存
CACHE_FILE = ROOT / ".cache" / "fundamentals.json"
TWSE_URL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
TPEX_URL = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes"
DISCLAIMER = "以上為規則算出的研究清單，不是買賣建議；分數高不代表會漲，請自行判斷並控制風險。資料來源：FinMind、證交所、櫃買中心、Yahoo。"


# ---------- 小工具 ----------
def _num(x) -> float | None:
    try:
        v = float(str(x).replace(",", ""))
    except (TypeError, ValueError):
        return None
    return None if math.isnan(v) or math.isinf(v) else v


def _ratio(a, b) -> float | None:
    return a / b if a is not None and b not in (None, 0) else None


def _pct(a, b) -> float | None:
    r = _ratio(a, b)
    return None if r is None else r * 100


class Budget:
    """記錄這次還能呼叫 FinMind 幾次，避免超過每小時上限。"""

    def __init__(self, calls: int):
        self.limited = finmind.rate_limited
        self.left = 0 if self.limited else calls

    def can(self, n: int = 1) -> bool:
        return self.left >= n

    def get(self, dataset: str, sid: str, *, days: int = 30) -> list[dict]:
        self.left -= 1
        rows = finmind.get(dataset, sid, days=days)
        if finmind.rate_limited:  # 碰到上限就停，繼續呼叫只是白費
            self.limited = True
            self.left = 0
        return rows


# ---------- 選股範圍 ----------
def is_common_stock(code: str) -> bool:
    """只留一般公司股票：四碼數字、不是 ETF（00 開頭）、不是 TDR（91 開頭）。"""
    return len(code) == 4 and code.isdigit() and not code.startswith(("00", "91"))


def parse_universe(twse: list[dict], tpex: list[dict]) -> list[dict]:
    rows = []
    for r in twse:
        code = str(r.get("Code", "")).strip()
        value = _num(r.get("TradeValue"))
        if is_common_stock(code) and value:
            rows.append({"symbol": f"{code}.TW", "name": str(r.get("Name", "")).strip(), "value": value})
    for r in tpex:
        code = str(r.get("SecuritiesCompanyCode", "")).strip()
        value = _num(r.get("TransactionAmount"))
        if is_common_stock(code) and value:
            rows.append({"symbol": f"{code}.TWO", "name": str(r.get("CompanyName", "")).strip(), "value": value})
    return sorted(rows, key=lambda x: x["value"], reverse=True)


def _fetch_exchange(url: str, attempts: int = 3) -> list[dict]:
    """櫃買中心的檔案很大，偶爾會傳到一半中斷，所以失敗時重試。"""
    for i in range(attempts):
        try:
            r = requests.get(url, timeout=60, headers={"User-Agent": "stock-agent"})
            r.raise_for_status()
            r.encoding = "utf-8"
            return r.json()
        except Exception as e:
            print(f"  ! 交易所資料抓取失敗（第 {i + 1} 次）{url}：{e}")
            if i + 1 < attempts:
                time.sleep(5 * (i + 1))
    return []


def build_universe(cfg: dict, cache: dict) -> tuple[list[dict], str]:
    """回傳 (股票清單, 範圍說明)。交易所資料抓不到時用上次的名單，再不行就只看觀察清單。"""
    top_n = cfg["picks"]["universe_top"]
    twse, tpex = _fetch_exchange(TWSE_URL), _fetch_exchange(TPEX_URL)
    ranked = parse_universe(twse, tpex)
    note = f"成交額前 {top_n} 名＋觀察清單"
    if twse and tpex and ranked:
        cache["universe"] = [{"symbol": x["symbol"], "name": x["name"]} for x in ranked[:top_n]]
    elif cache.get("universe"):  # 只抓到一個市場時排名會失真，所以不更新名單
        note = "⚠️ 今天交易所資料不完整，沿用上次的成交額名單＋觀察清單"
        print("  " + note)
    elif ranked:
        cache["universe"] = [{"symbol": x["symbol"], "name": x["name"]} for x in ranked[:top_n]]
        note = f"⚠️ 今天只抓到{'上市' if twse else '上櫃'}資料：成交額前 {top_n} 名＋觀察清單"
        print("  " + note)
    else:
        note = "⚠️ 抓不到交易所資料，今天只看觀察清單"
        print("  " + note)
    stocks = {x["symbol"]: {"symbol": x["symbol"], "name": x["name"]} for x in cache.get("universe", [])}
    known_codes = {s.split(".")[0] for s in stocks}
    for s in cfg["watchlist"]["tw"]:
        code = s["symbol"].split(".")[0]
        if is_common_stock(code) and code not in known_codes:
            stocks[s["symbol"]] = {"symbol": s["symbol"], "name": s["name"]}
            known_codes.add(code)
    return list(stocks.values()), note


# ---------- 產業分類 ----------
def refresh_industries(cache: dict, budget: Budget, pcfg: dict, today: date) -> None:
    """FinMind 的公司基本資料一次就有全市場的產業別，每月更新一次即可。抓不到時沿用舊資料。"""
    if not _stale(cache.get("industry"), today, pcfg.get("industry_cache_days", 30)) or not budget.can():
        return
    rows = budget.get("TaiwanStockInfo", None, days=20000)
    out: dict[str, list[str]] = {}
    for r in rows:
        code, cat = str(r.get("stock_id", "")), r.get("industry_category")
        if is_common_stock(code) and cat and cat not in out.get(code, []):
            out.setdefault(code, []).append(cat)
    if out:
        cache["industry"] = {"fetched": today.isoformat(), "data": out}


def classify(symbol: str, cache: dict, tech_industries: list[str]) -> tuple[str | None, bool]:
    """回傳 (顯示用的產業, 是否算科技股)。「電子工業」是大分類，中華電也在內，所以不用它判斷。"""
    cats = ((cache.get("industry") or {}).get("data") or {}).get(symbol.split(".")[0], [])
    for c in cats:
        if c in tech_industries:
            return c, True
    named = [c for c in cats if c != "電子工業"]
    return (named or cats or [None])[0], False


# ---------- 基本面 ----------
def _by_date(rows: list[dict]) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for r in rows:
        v = _num(r.get("value"))
        if v is not None:
            out.setdefault(r["date"], {})[r["type"]] = v
    return out


def compute_financials(income_rows: list[dict], balance_rows: list[dict], cash_rows: list[dict]) -> dict:
    """把三大報表算成指標。注意：損益表是「單季」數字，現金流量表是「當年累計」數字。"""
    inc, bal, cash = _by_date(income_rows), _by_date(balance_rows), _by_date(cash_rows)
    quarters = sorted(inc)
    if not quarters:
        return {}
    last_q = quarters[-1]
    q = inc[last_q]
    out: dict = {"quarter": last_q}
    last_year_q = f"{int(last_q[:4]) - 1}{last_q[4:]}"
    py = inc.get(last_year_q, {})

    out["revenue"] = q.get("Revenue")
    out["eps_q"] = q.get("EPS")
    out["eps_q_prev_year"] = py.get("EPS")
    out["gross_margin"] = _pct(q.get("GrossProfit"), q.get("Revenue"))
    out["gross_margin_prev_year"] = _pct(py.get("GrossProfit"), py.get("Revenue"))
    out["op_margin"] = _pct(q.get("OperatingIncome"), q.get("Revenue"))
    out["op_margin_prev_year"] = _pct(py.get("OperatingIncome"), py.get("Revenue"))
    # 金融業的損益表沒有毛利，也不適合用負債比評估
    out["is_financial"] = "GrossProfit" not in q and "NetInterestIncome" in q

    last4 = quarters[-4:]
    if len(last4) == 4:
        out["eps_ttm"] = round(sum(inc[d].get("EPS") or 0 for d in last4), 2)
        profits = [inc[d].get("EquityAttributableToOwnersOfParent") for d in last4]
        if all(p is not None for p in profits):
            ttm_profit = sum(profits)
            b_dates = sorted(bal)
            if b_dates:
                b = bal[b_dates[-1]]
                old = bal.get(_quarters_ago(b_dates[-1], 4), b)  # 用期初期末平均，沒有一年前資料就用期末
                avg_eq = _avg(_equity(b), _equity(old))
                avg_assets = _avg(b.get("TotalAssets"), old.get("TotalAssets"))
                out["roe"] = _pct(ttm_profit, avg_eq)
                out["roa"] = _pct(ttm_profit, avg_assets)

    b_dates = sorted(bal)
    if b_dates:
        b = bal[b_dates[-1]]
        out["debt_ratio"] = _pct(b.get("Liabilities"), b.get("TotalAssets"))
        out["current_ratio"] = _pct(b.get("CurrentAssets"), b.get("CurrentLiabilities"))

    c_dates = sorted(cash)
    if c_dates:
        c = cash[c_dates[-1]]
        out["ocf_ytd"] = c.get("CashFlowsFromOperatingActivities")
        out["icf_ytd"] = c.get("CashProvidedByInvestingActivities")
        out["financing_cf_ytd"] = c.get("CashFlowsProvidedFromFinancingActivities")
        out["cash_end"] = c.get("CashBalancesEndOfPeriod")
        year = c_dates[-1][:4]
        ytd = [inc[d].get("EquityAttributableToOwnersOfParent") for d in quarters
               if d[:4] == year and d <= c_dates[-1]]
        out["profit_ytd"] = sum(p for p in ytd if p is not None) if ytd else None
    return out


def _equity(sheet: dict):
    """股東權益：一般公司有「歸屬母公司」這一欄，金控只有「權益總額」。"""
    return sheet.get("EquityAttributableToOwnersOfParent", sheet.get("Equity"))


def _avg(a, b):
    return None if a is None or b is None else (a + b) / 2


def _quarters_ago(day: str, n: int) -> str:
    return f"{int(day[:4]) - n // 4}{day[4:]}"


def compute_revenue(rows: list[dict]) -> dict:
    """月營收：最近 3 個月合計比去年同期成長多少。"""
    if not rows:
        return {}
    months = {(r.get("revenue_year"), r.get("revenue_month")): _num(r.get("revenue")) for r in rows}
    keys = sorted(k for k in months if k[0] and k[1])
    if not keys:
        return {}
    recent = keys[-3:]
    now = [months[k] for k in recent]
    old = [months.get((y - 1, m)) for y, m in recent]
    out = {"latest": f"{recent[-1][0]}/{recent[-1][1]:02d}"}
    if all(v for v in now) and all(v for v in old):
        out["yoy_3m"] = round((sum(now) / sum(old) - 1) * 100, 1)
    return out


def score_fundamental(fin: dict, rev: dict, per: dict, min_coverage: int = 60) -> dict:
    """基本面 0~100 分。查不到的項目不計入滿分，但資料太少就不給分。"""
    earned, possible, good, bad = 0.0, 0.0, [], []

    def add(value, points: list[tuple], maximum: float):
        nonlocal earned, possible
        if value is None:
            return
        possible += maximum
        for test, pts, text, tone in points:
            if test(value):
                earned += pts
                if text:
                    (good if tone == "+" else bad).append(text.format(v=value, a=abs(value)))
                return

    add(fin.get("roe"), [(lambda v: v >= 15, 20, "ROE {v:.1f}% 高", "+"), (lambda v: v >= 10, 14, "ROE {v:.1f}%", "+"),
                         (lambda v: v >= 5, 7, None, "+"), (lambda v: v < 0, 0, "ROE {v:.1f}% 為負", "-"),
                         (lambda v: True, 0, None, "+")], 20)
    if not fin.get("is_financial"):
        add(fin.get("roa"), [(lambda v: v >= 7, 8, "ROA {v:.1f}%", "+"), (lambda v: v >= 3, 5, None, "+"),
                             (lambda v: True, 0, None, "+")], 8)
        add(fin.get("debt_ratio"), [(lambda v: v <= 40, 8, "負債比 {v:.0f}% 低", "+"), (lambda v: v <= 60, 5, None, "+"),
                                    (lambda v: v > 75, 0, "負債比 {v:.0f}% 偏高", "-"), (lambda v: True, 2, None, "+")], 8)

    # 獲利趨勢：和去年同一季比
    gm, gm_py = fin.get("gross_margin"), fin.get("gross_margin_prev_year")
    if gm is not None and gm_py is not None:
        add(gm - gm_py, [(lambda v: v > 0, 6, "毛利率年增 {v:.1f} 個百分點", "+"), (lambda v: v < -3, 0, "毛利率年減 {a:.1f} 個百分點", "-"),
                         (lambda v: True, 2, None, "+")], 6)
    om, om_py = fin.get("op_margin"), fin.get("op_margin_prev_year")
    if om is not None and om_py is not None:
        add(om - om_py, [(lambda v: v > 0, 8, "營益率年增 {v:.1f} 個百分點", "+"), (lambda v: True, 2, None, "+")], 8)
    eq, eq_py = fin.get("eps_q"), fin.get("eps_q_prev_year")
    if eq is not None and eq_py is not None:
        add(eq - eq_py, [(lambda v: v > 0 and eq > 0, 10, f"單季 EPS {eq} 高於去年同期 {eq_py}", "+"),
                         (lambda v: eq <= 0, 0, f"單季 EPS {eq} 虧損", "-"), (lambda v: True, 3, None, "+")], 10)
    add(rev.get("yoy_3m"), [(lambda v: v >= 20, 15, "近 3 月營收年增 {v:.0f}%", "+"), (lambda v: v >= 5, 10, "近 3 月營收年增 {v:.0f}%", "+"),
                            (lambda v: v >= 0, 5, None, "+"), (lambda v: v < -10, 0, "近 3 月營收年減 {a:.0f}%", "-"),
                            (lambda v: True, 2, None, "+")], 15)

    # 現金流：本業有沒有真的收到錢
    ocf, profit = fin.get("ocf_ytd"), fin.get("profit_ytd")
    if ocf is not None and not fin.get("is_financial"):
        possible += 10
        if ocf > 0 and profit and ocf >= profit:
            earned += 10
            good.append("營業現金流高於獲利")
        elif ocf > 0:
            earned += 6
        else:
            bad.append("今年累計營業現金流為負")

    # 評價：本益比、股價淨值比、殖利率
    pe, pb, dy = _num(per.get("PER")), _num(per.get("PBR")), _num(per.get("dividend_yield"))
    if pe is not None:
        possible += 10
        if pe <= 0:
            bad.append("本益比無法計算（近期虧損）")
        elif pe <= 15:
            earned += 10
            good.append(f"本益比 {pe:.1f} 倍偏低")
        elif pe <= 25:
            earned += 6
        elif pe <= 40:
            earned += 2
        else:
            bad.append(f"本益比 {pe:.0f} 倍偏高")
    if pb is not None:
        possible += 5
        if 0 < pb <= 2:
            earned += 5
        elif pb <= 4:
            earned += 3
        elif pb > 8:
            bad.append(f"股價淨值比 {pb:.1f} 倍偏高")
    if dy is not None:
        possible += 5
        if dy >= 4:
            earned += 5
            good.append(f"殖利率 {dy:.1f}%")
        elif dy >= 2:
            earned += 3

    # 有資料的項目滿分合計太少，就視為資料不足，不給分
    if possible < min_coverage:
        return {"score": None, "good": good, "bad": bad, "coverage": round(possible)}
    return {"score": round(earned / possible * 100), "good": good, "bad": bad, "coverage": round(possible)}


# ---------- 技術面 ----------
def pivots(df: pd.DataFrame, order: int = 5) -> tuple[list[tuple[int, float]], list[tuple[int, float]]]:
    """找轉折高點、低點：比前後各 order 根都高（低）的那一根。"""
    hi, lo = df["High"].tolist(), df["Low"].tolist()
    highs, lows = [], []
    for i in range(order, len(df) - order):
        if hi[i] == max(hi[i - order:i + order + 1]):
            if not highs or i - highs[-1][0] > 1:
                highs.append((i, hi[i]))
        if lo[i] == min(lo[i - order:i + order + 1]):
            if not lows or i - lows[-1][0] > 1:
                lows.append((i, lo[i]))
    return highs, lows


def support_resistance(df: pd.DataFrame) -> tuple[float | None, float | None]:
    """支撐：現價下方最近的轉折低點；壓力：現價上方最近的轉折高點。"""
    price = float(df["Close"].iloc[-1])
    recent = df.iloc[-130:]
    highs, lows = pivots(recent)
    below = [p for _, p in lows if p < price]
    above = [p for _, p in highs if p > price]
    return (round(max(below), 2) if below else None, round(min(above), 2) if above else None)


def _near(a: float, b: float, tol: float = 0.03) -> bool:
    return abs(a - b) / max(a, b) <= tol


def detect_patterns(df: pd.DataFrame) -> list[dict]:
    """用轉折點偵測常見型態（只算已經確認突破或跌破頸線的）。程式判讀較粗略，只當輔助。"""
    d = df.iloc[-130:]
    if len(d) < 40:
        return []
    highs, lows = pivots(d)
    price = float(d["Close"].iloc[-1])
    n = len(d)
    window = 40  # 確認點要在最近 40 根內才算還有意義
    found = []

    if len(highs) >= 3:
        (_, a), (i, b), (j, c) = highs[-3:]
        necks = [p for k, p in lows if highs[-3][0] < k < j]
        if b > a * 1.02 and b > c * 1.02 and _near(a, c, 0.05) and necks and price < min(necks) and j >= n - window:
            found.append({"name": "頭肩頂", "bias": "-"})
    if len(lows) >= 3:
        (_, a), (i, b), (j, c) = lows[-3:]
        necks = [p for k, p in highs if lows[-3][0] < k < j]
        if b < a * 0.98 and b < c * 0.98 and _near(a, c, 0.05) and necks and price > max(necks) and j >= n - window:
            found.append({"name": "頭肩底", "bias": "+"})
    if len(highs) >= 2 and not any(f["name"] == "頭肩頂" for f in found):
        (i, a), (j, b) = highs[-2:]
        necks = [p for k, p in lows if i < k < j]
        if _near(a, b) and j - i >= 10 and necks and min(necks) < min(a, b) * 0.95 and price < min(necks) and j >= n - window:
            found.append({"name": "雙重頂", "bias": "-"})
    if len(lows) >= 2 and not any(f["name"] == "頭肩底" for f in found):
        (i, a), (j, b) = lows[-2:]
        necks = [p for k, p in highs if i < k < j]
        if _near(a, b) and j - i >= 10 and necks and max(necks) > max(a, b) * 1.05 and price > max(necks) and j >= n - window:
            found.append({"name": "雙重底", "bias": "+"})

    # 杯柄：左右杯緣差不多高、中間跌 12%~40%，右緣後小幅拉回形成杯柄，現價突破杯緣
    if len(highs) >= 2:
        (i, left), (j, right) = highs[-2:]
        bottom = float(d["Low"].iloc[i:j + 1].min())
        depth = 1 - bottom / max(left, right)
        after = d["Low"].iloc[j + 1:]
        if j - i >= 20 and _near(left, right, 0.05) and 0.12 <= depth <= 0.4 and len(after) >= 3:
            handle = 1 - float(after.min()) / right
            if 0.01 <= handle <= depth / 2 and price > max(left, right) and n - j <= window:
                found.append({"name": "杯柄", "bias": "+"})
    return found


def score_technical(daily: pd.DataFrame, cfg: dict) -> dict:
    """技術面 0~100 分：趨勢、動能、量價、布林通道、型態。"""
    from agent.indicators import _kd, _macd_hist, _rsi

    df = daily.copy()
    close = df["Close"]
    price = float(close.iloc[-1])
    ma20 = close.rolling(20).mean()
    ma60 = close.rolling(60).mean()
    m20, m60 = float(ma20.iloc[-1]), float(ma60.iloc[-1])
    rsi = float(_rsi(close).iloc[-1])
    k, d = _kd(df)
    hist = _macd_hist(close)
    std20 = close.rolling(20).std()
    upper, lower = float(ma20.iloc[-1] + 2 * std20.iloc[-1]), float(ma20.iloc[-1] - 2 * std20.iloc[-1])
    avg_vol = df["Volume"].iloc[-21:-1].mean()
    vol_ratio = float(df["Volume"].iloc[-1] / avg_vol) if avg_vol else None
    high20 = float(df["High"].iloc[-21:-1].max())
    above = (price / m20 - 1) * 100

    s = 0
    good, bad = [], []
    if price > m20:
        s += 15
        good.append("站上月線")
    else:
        bad.append("在月線之下")
    if m20 > float(ma20.iloc[-6]):
        s += 10
    if price > m60:
        s += 15
        good.append("站上季線")
    else:
        bad.append("在季線之下")
    if m20 > m60:
        s += 10
    if 50 <= rsi <= 70:
        s += 10
    if float(k.iloc[-1]) > float(d.iloc[-1]):
        s += 10
    if float(hist.iloc[-1]) > 0:
        s += 10
        good.append("MACD 柱為正")
    if vol_ratio is not None and vol_ratio >= cfg["screen"]["volume_ratio"]:
        s += 5
        good.append(f"量增 {vol_ratio:.1f} 倍")
    if price > high20:
        s += 5
        good.append("突破前 20 日高點")
    if m20 <= price <= upper:
        s += 10

    # 過熱扣分（和盤中初篩用同一組門檻）
    if above > cfg["screen"]["max_above_ma20_pct"]:
        s -= 15
        bad.append(f"離月線 {above:.0f}% 偏遠")
    if rsi > cfg["screen"]["max_rsi"]:
        s -= 15
        bad.append(f"RSI {rsi:.0f} 過熱")
    if price > upper:
        bad.append("超出布林上軌")

    patterns = detect_patterns(df)
    for p in patterns:
        if p["bias"] == "+":
            s += 5
            good.append(f"{p['name']}型態（程式判讀）")
        else:
            s -= 10
            bad.append(f"{p['name']}型態（程式判讀）")

    support, resistance = support_resistance(df)
    return {"score": int(max(0, min(100, s))), "good": good, "bad": bad, "price": round(price, 2),
            "date": pd.Timestamp(df.index[-1]).date().isoformat(), "ma20": round(m20, 2), "ma60": round(m60, 2),
            "rsi": round(rsi), "k": round(float(k.iloc[-1])), "d": round(float(d.iloc[-1])),
            "boll_upper": round(upper, 2), "boll_lower": round(lower, 2), "vol_ratio": round(vol_ratio, 2) if vol_ratio else None,
            "support": support, "resistance": resistance, "patterns": [p["name"] for p in patterns],
            "avg_vol_lots": round(avg_vol / 1000) if avg_vol else None}


# ---------- 籌碼面 ----------
GROUPS = {"外資": ("Foreign_Investor", "Foreign_Dealer_Self"), "投信": ("Investment_Trust",),
          "自營商": ("Dealer_self", "Dealer_Hedging")}


def compute_chips(inst_rows: list[dict], margin_rows: list[dict]) -> dict:
    out: dict = {}
    dates = sorted({r["date"] for r in inst_rows})[-5:]
    if dates:
        daily: dict[str, dict[str, float]] = {}
        for r in inst_rows:
            if r["date"] not in dates:
                continue
            for group, names in GROUPS.items():
                if r.get("name") in names:
                    row = daily.setdefault(r["date"], {})
                    row[group] = row.get(group, 0) + ((r.get("buy") or 0) - (r.get("sell") or 0)) / 1000
        for group in GROUPS:
            values = [daily.get(d, {}).get(group, 0) for d in dates]
            out[group] = round(sum(values))
            streak = 0
            for v in reversed(values):
                if v > 0:
                    streak += 1
                else:
                    break
            out[group + "連買"] = streak
    margin = sorted(margin_rows, key=lambda r: r["date"])
    if len(margin) >= 2:
        a, b = margin[-6] if len(margin) >= 6 else margin[0], margin[-1]
        out["融資餘額"] = b.get("MarginPurchaseTodayBalance")
        out["融資5日增減"] = (b.get("MarginPurchaseTodayBalance") or 0) - (a.get("MarginPurchaseTodayBalance") or 0)
        out["融券餘額"] = b.get("ShortSaleTodayBalance")
    return out


def score_chips(chips: dict, avg_vol_lots: float | None) -> dict:
    """籌碼面 0~100 分。買賣超要有一定規模才算（避免冷門股買幾張就加分）。"""
    if "外資" not in chips:
        return {"score": None, "good": [], "bad": []}
    base = max(avg_vol_lots or 0, 1)
    s, good, bad = 20, [], []  # 基本分 20，沒有明顯方向時落在中低段
    big = lambda v: abs(v) >= base * 0.05  # 5 日合計超過日均量 5%

    foreign, trust, dealer = chips.get("外資", 0), chips.get("投信", 0), chips.get("自營商", 0)
    if foreign > 0 and big(foreign):
        s += 25
        good.append(f"外資 5 日買超 {foreign:,} 張")
    elif foreign < 0 and big(foreign):
        s -= 15
        bad.append(f"外資 5 日賣超 {abs(foreign):,} 張")
    if trust > 0 and big(trust):
        s += 25
        good.append(f"投信 5 日買超 {trust:,} 張")
    elif trust < 0 and big(trust):
        s -= 10
        bad.append(f"投信 5 日賣超 {abs(trust):,} 張")
    if chips.get("投信連買", 0) >= 3:
        s += 10
        good.append(f"投信連買 {chips['投信連買']} 天")
    if chips.get("外資連買", 0) >= 3:
        s += 5
    if dealer > 0 and big(dealer):
        s += 5

    # 融資是散戶指標：減少代表籌碼較穩，暴增常被當成反向訊號
    change, balance = chips.get("融資5日增減"), chips.get("融資餘額")
    if change is not None and balance:
        rate = change / max(balance - change, 1) * 100
        if rate <= -3:
            s += 15
            good.append(f"融資 5 日減 {abs(rate):.0f}%")
        elif rate >= 10:
            s -= 15
            bad.append(f"融資 5 日增 {rate:.0f}%，散戶追價")
        elif rate <= 3:
            s += 5
    return {"score": int(max(0, min(100, s))), "good": good, "bad": bad}


# ---------- 快取與資料抓取 ----------
def load_cache() -> dict:
    try:
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_cache(cache: dict) -> None:
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")


def _stale(entry: dict | None, today: date, days: int) -> bool:
    if not entry or not entry.get("fetched"):
        return True
    return (today - date.fromisoformat(entry["fetched"])).days >= days


def refresh_fundamentals(stocks: list[dict], cache: dict, budget: Budget, cfg: dict, today: date,
                         reserve: int = 0) -> None:
    """更新財報與月營收快取。先保留候選股每天必抓項目（法人、融資、本益比）的額度，剩下的才拿來補快取；
    最久沒更新的優先，所以就算第一天補不完，幾天內也會補齊。"""
    pcfg = cfg["picks"]
    store = cache.setdefault("stocks", {})

    def age(s):
        return (store.get(s["symbol"], {}).get("fin") or {}).get("fetched") or ""

    for s in sorted(stocks, key=age):
        sid = s["symbol"].split(".")[0]
        entry = store.setdefault(s["symbol"], {})
        if _stale(entry.get("rev"), today, pcfg["revenue_cache_days"]) and budget.left - 1 >= reserve:
            rows = budget.get("TaiwanStockMonthRevenue", sid, days=500)
            if rows:
                entry["rev"] = {"fetched": today.isoformat(), "data": compute_revenue(rows)}
        if _stale(entry.get("fin"), today, pcfg["financial_cache_days"]) and budget.left - 3 >= reserve:
            days = 800  # 需要至少 5 季才能算近四季與去年同期
            inc = budget.get("TaiwanStockFinancialStatements", sid, days=days)
            bal = budget.get("TaiwanStockBalanceSheet", sid, days=days)
            cash = budget.get("TaiwanStockCashFlowsStatement", sid, days=days)
            if inc:
                entry["fin"] = {"fetched": today.isoformat(), "data": compute_financials(inc, bal, cash)}


# ---------- 主流程 ----------
def total_score(fund: int | None, tech: int | None, chip: int | None, cfg: dict) -> float | None:
    """加權總分。基本面或技術面缺資料就不排名；籌碼面缺資料時把比重分給另外兩面。"""
    w = cfg["picks"]["weights"]
    if fund is None or tech is None:
        return None
    if chip is None:
        base = w["fundamental"] + w["technical"]
        return round((fund * w["fundamental"] + tech * w["technical"]) / base, 1)
    base = w["fundamental"] + w["technical"] + w["chips"]
    return round((fund * w["fundamental"] + tech * w["technical"] + chip * w["chips"]) / base, 1)


def prelim_stock(stock: dict, cache: dict, cfg: dict, fetch_daily) -> dict | None:
    """第一階段：只用免費股價和快取的財報打初步分數，不花 FinMind 額度。抓不到股價就回傳 None。"""
    symbol, daily, _ = fetch_daily(stock["symbol"])
    if daily is None or len(daily) < 60:
        return None
    tech = score_technical(daily, cfg)
    entry = cache.get("stocks", {}).get(stock["symbol"], {})
    fin = (entry.get("fin") or {}).get("data") or {}
    rev = (entry.get("rev") or {}).get("data") or {}
    fund = score_fundamental(fin, rev, {}, min_coverage=30)
    return {"stock": stock, "symbol": symbol, "tech": tech, "fin": fin, "rev": rev,
            "prelim": total_score(fund["score"], tech["score"], None, cfg)}


def select_candidates(prelims: list[dict], n: int, tech_n: int = 0) -> list[dict]:
    """初步分數最高的前 n 檔才查本益比和籌碼；財報資料不足的不列入。
    tech_n 個名額先留給科技股，這樣最後的科技股名額才選得出來。"""
    ok = sorted((p for p in prelims if p["prelim"] is not None), key=lambda p: p["prelim"], reverse=True)
    tech = [p for p in ok if p.get("is_tech")][:tech_n]
    chosen = {id(p) for p in tech}
    rest = [p for p in ok if id(p) not in chosen][:max(n - len(tech), 0)]
    return sorted(tech + rest, key=lambda p: p["prelim"], reverse=True)


def analyze_stock(p: dict, budget: Budget, cfg: dict) -> dict:
    """第二階段：查候選股的本益比與籌碼，算出三面分數與總分。"""
    stock, symbol, tech, fin, rev = p["stock"], p["symbol"], p["tech"], p["fin"], p["rev"]
    sid = symbol.split(".")[0]

    per = {}
    if budget.can():
        rows = budget.get("TaiwanStockPER", sid, days=10)
        per = rows[-1] if rows else {}
    fund = score_fundamental(fin, rev, per)
    inst, margin = [], []
    if budget.can(2):
        inst = budget.get("TaiwanStockInstitutionalInvestorsBuySell", sid, days=14)
        margin = budget.get("TaiwanStockMarginPurchaseShortSale", sid, days=14)
    chips = compute_chips(inst, margin)
    chip = score_chips(chips, tech["avg_vol_lots"])
    return {"symbol": symbol, "name": stock["name"], "sector": p.get("sector"), "is_tech": bool(p.get("is_tech")),
            "total": total_score(fund["score"], tech["score"], chip["score"], cfg),
            "fundamental": fund["score"], "technical": tech["score"], "chips": chip["score"],
            "price": tech["price"], "date": tech["date"], "support": tech["support"], "resistance": tech["resistance"],
            "rsi": tech["rsi"], "ma20": tech["ma20"], "ma60": tech["ma60"], "boll_upper": tech["boll_upper"],
            "patterns": tech["patterns"], "quarter": fin.get("quarter"), "revenue_month": rev.get("latest"),
            "roe": _round(fin.get("roe")), "roa": _round(fin.get("roa")), "eps_ttm": fin.get("eps_ttm"),
            "gross_margin": _round(fin.get("gross_margin")), "debt_ratio": _round(fin.get("debt_ratio")),
            "revenue_yoy_3m": rev.get("yoy_3m"), "per": _num(per.get("PER")), "pbr": _num(per.get("PBR")),
            "dividend_yield": _num(per.get("dividend_yield")),
            "institutional": {k: chips.get(k) for k in GROUPS}, "margin_change": chips.get("融資5日增減"),
            "good": fund["good"][:4] + chip["good"][:2] + tech["good"][:2],
            "bad": fund["bad"][:2] + chip["bad"][:2] + tech["bad"][:2]}


def _round(x, nd=1):
    return None if x is None else round(x, nd)


def rank(results: list[dict], cfg: dict) -> list[dict]:
    """基本面沒過門檻的不列入。先選分數最高的科技股（tech_quota 檔），
    其餘名額不分產業取高分；科技股不夠時由其他高分股補上。最後依總分排序。"""
    p = cfg["picks"]
    ok = [r for r in results if r["total"] is not None and r["fundamental"] >= p["min_fundamental"]]
    ok.sort(key=lambda r: r["total"], reverse=True)
    tech = [r for r in ok if r.get("is_tech")][:p.get("tech_quota", 0)]
    chosen = {id(r) for r in tech}
    rest = [r for r in ok if id(r) not in chosen][:max(p["top_n"] - len(tech), 0)]
    return sorted(tech + rest, key=lambda r: r["total"], reverse=True)


def format_report(top: list[dict], meta: dict) -> str:
    lines = [f"🔎 今日值得研究清單（{meta['scope']}）",
             f"評分比重：基本面 {meta['weights']['fundamental']}%、技術面 {meta['weights']['technical']}%、籌碼面 {meta['weights']['chips']}%",
             f"先用財報與技術面從 {meta['screened']} 檔篩出候選，其中 {meta['scored']} 檔完成三面評分；"
             f"{meta['unscored']} 檔資料不足未列入。股價為 {meta['data_date']} 收盤。"]
    if meta.get("tech_quota"):
        if meta.get("tech_ok"):
            n_tech = sum(1 for r in top if r.get("is_tech"))
            lines.append(f"科技股（硬體與半導體）優先保留 {meta['tech_quota']} 個名額，其餘不分產業取高分；今天榜上有 {n_tech} 檔科技股。")
        else:
            lines.append("⚠️ 今天抓不到產業分類，所以沒有優先選科技股，直接依總分排名。")
    if meta["unscored"] > meta["universe"] / 4:
        lines.append("⚠️ 財報資料還在分批補齊，今天排名只涵蓋部分股票。")
    if meta.get("limited"):
        lines.append("⚠️ FinMind 今天這一小時的額度用完，部分股票缺本益比或籌碼資料，排名僅供參考。")
    if not top:
        lines.append("今天沒有股票達到基本面門檻。")
    for i, r in enumerate(top, 1):
        chip = "—" if r["chips"] is None else r["chips"]
        lines += ["",
                  f"{i}. {r['name']}（{r['symbol'].split('.')[0]}）{'・' + r['sector'] + ' ' if r.get('sector') else ''}{r['price']}｜總分 {r['total']}",
                  f"   基本 {r['fundamental']}／技術 {r['technical']}／籌碼 {chip}"]
        if r["good"]:
            lines.append("   ✅ " + "、".join(r["good"][:5]))
        if r["bad"]:
            lines.append("   ⚠️ " + "、".join(r["bad"][:3]))
        sr = [f"支撐 {r['support']}" if r["support"] else "", f"壓力 {r['resistance']}" if r["resistance"] else ""]
        if any(sr):
            lines.append("   📍 " + "、".join(x for x in sr if x))
    lines += ["", "籌碼面暫不含大戶持股（FinMind 付費資料）。" + DISCLAIMER]
    return "\n".join(lines)


def run(cfg: dict, *, fetch_daily=None, stocks: list[dict] | None = None, seed: bool = False) -> dict:
    """算出今天的清單並回傳 {report, picks, meta}。seed=True 時把額度用來補快取。"""
    from agent import data

    fetch_daily = fetch_daily or data.fetch
    today = datetime.now(ZoneInfo("Asia/Taipei")).date()
    cache = load_cache()
    pcfg = cfg["picks"]
    universe, scope = build_universe(cfg, cache) if stocks is None else (stocks, "指定股票")
    budget = Budget(pcfg["seed_budget"] if seed else pcfg["daily_budget"])
    print(f"  選股範圍 {len(universe)} 檔，FinMind 額度 {budget.left} 次")
    # 每檔候選股每天要查 3 次（本益比、法人、融資），補資料模式不查所以不保留
    reserve = 0 if seed else 3 * min(pcfg["candidate_n"], len(universe))
    refresh_industries(cache, budget, pcfg, today)
    refresh_fundamentals(universe, cache, budget, cfg, today, reserve=reserve)
    save_cache(cache)  # 先存，後面出錯也不會白抓

    if seed:
        have = sum(1 for s in universe if (cache.get("stocks", {}).get(s["symbol"], {}).get("fin") or {}).get("fetched"))
        print(f"  補快取完成：{have}/{len(universe)} 檔有財報資料，剩餘額度 {budget.left}")
        return {"report": "", "picks": [], "meta": {"seed_have": have, "universe": len(universe), "limited": budget.limited}}

    tech_industries = pcfg.get("tech_industries", [])
    prelims = []
    for s in universe:
        try:
            p = prelim_stock(s, cache, cfg, fetch_daily)
        except Exception as e:  # 單檔出錯不影響其他股票
            print(f"  ! {s['name']} 初步評分失敗：{e}")
            p = None
        if p is not None:
            p["sector"], p["is_tech"] = classify(p["symbol"], cache, tech_industries)
            prelims.append(p)
    candidates = select_candidates(prelims, pcfg["candidate_n"], pcfg.get("tech_candidates", 0))
    print(f"  初步評分 {len(prelims)} 檔，{len(candidates)} 檔進入候選（科技股 {sum(1 for p in candidates if p['is_tech'])} 檔）")

    results = []
    for p in candidates:
        try:
            results.append(analyze_stock(p, budget, cfg))
        except Exception as e:
            print(f"  ! {p['stock']['name']} 評分失敗：{e}")
    ranked_ok = [r for r in results if r["total"] is not None]
    dates = sorted(p["tech"]["date"] for p in prelims)
    n_prelim_ok = sum(1 for p in prelims if p["prelim"] is not None)
    meta = {"scope": scope, "weights": pcfg["weights"], "universe": len(universe), "screened": n_prelim_ok,
            "scored": len(ranked_ok), "unscored": len(universe) - n_prelim_ok,
            "data_date": dates[-1] if dates else "-", "budget_left": budget.left, "limited": budget.limited,
            "tech_quota": pcfg.get("tech_quota", 0), "tech_ok": bool((cache.get("industry") or {}).get("data"))}
    top = rank(results, cfg)
    print(f"  評分完成：{len(ranked_ok)} 檔有總分，{meta['unscored']} 檔資料不足，FinMind 剩餘額度 {budget.left}")
    return {"report": format_report(top, meta), "picks": top, "all": sorted(ranked_ok, key=lambda r: r["total"], reverse=True),
            "meta": meta}
