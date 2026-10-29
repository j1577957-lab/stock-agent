"""FinMind 台股資料（https://finmindtrade.com）

需要在 GitHub Secrets 放 FINMIND_TOKEN（免費註冊就有，每小時 600 次）。沒放也能用，但次數較少。
提供給 AI 的「籌碼面＋基本面」摘要：三大法人、融資融券、本益比/殖利率、月營收、新聞。
"""
from __future__ import annotations

import os
from datetime import date, timedelta

import requests

API = "https://api.finmindtrade.com/api/v4/data"


def get(dataset: str, data_id: str | None = None, days: int = 30, start: str | None = None) -> list[dict]:
    token = os.environ.get("FINMIND_TOKEN", "")
    params = {"dataset": dataset, "start_date": start or (date.today() - timedelta(days=days)).isoformat()}
    if data_id:
        params["data_id"] = data_id
    if token:
        params["token"] = token
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        r = requests.get(API, params=params, headers=headers, timeout=20)
        d = r.json()
    except Exception as e:
        print(f"  ! FinMind {dataset} {data_id} 失敗：{e}")
        return []
    if d.get("status") != 200:
        print(f"  ! FinMind {dataset} {data_id}：{d.get('msg')}")
        return []
    return d.get("data", [])


def stock_id(symbol: str) -> str | None:
    """5465.TWO → 5465；美股回傳 None"""
    if symbol.endswith(".TW") or symbol.endswith(".TWO"):
        return symbol.split(".")[0]
    return None


def daily_prices(sid: str, days: int = 400):
    """FinMind 日K（給 Yahoo 抓不到時備用），回傳和 yfinance 一樣欄位的 DataFrame"""
    import pandas as pd

    rows = get("TaiwanStockPrice", sid, days=days)
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    df = df.rename(columns={"open": "Open", "max": "High", "min": "Low", "close": "Close",
                            "Trading_Volume": "Volume"})
    df.index = pd.to_datetime(df["date"])
    df = df[["Open", "High", "Low", "Close", "Volume"]].astype(float)
    return df[df["Close"] > 0]


def _sum(rows, key="buy", key2="sell"):
    return sum((r.get(key, 0) or 0) - (r.get(key2, 0) or 0) for r in rows)


def summary(sid: str) -> dict:
    """一檔台股的籌碼面＋基本面摘要（約 6 次 API 呼叫）"""
    out: dict = {}

    # 三大法人：近 5 個交易日買賣超（張）
    inst = get("TaiwanStockInstitutionalInvestorsBuySell", sid, days=14)
    if inst:
        dates = sorted({r["date"] for r in inst})[-5:]
        recent = [r for r in inst if r["date"] in dates]
        group = {"外資": ("Foreign_Investor", "Foreign_Dealer_Self"), "投信": ("Investment_Trust",),
                 "自營商": ("Dealer_self", "Dealer_Hedging")}
        out["法人近5日買賣超(張)"] = {
            k: round(_sum([r for r in recent if r["name"] in names]) / 1000)
            for k, names in group.items()}
        last = [r for r in inst if r["date"] == dates[-1]]
        out["法人最新一日(張)"] = {k: round(_sum([r for r in last if r["name"] in names]) / 1000)
                             for k, names in group.items()}

    # 融資融券
    margin = get("TaiwanStockMarginPurchaseShortSale", sid, days=14)
    if len(margin) >= 2:
        a, b = margin[-6] if len(margin) >= 6 else margin[0], margin[-1]
        out["融資餘額(張)"] = b.get("MarginPurchaseTodayBalance")
        out["融資5日增減(張)"] = (b.get("MarginPurchaseTodayBalance", 0) or 0) - (a.get("MarginPurchaseTodayBalance", 0) or 0)
        out["融券餘額(張)"] = b.get("ShortSaleTodayBalance")

    # 本益比、股價淨值比、殖利率
    per = get("TaiwanStockPER", sid, days=10)
    if per:
        p = per[-1]
        out["本益比"], out["股價淨值比"], out["殖利率%"] = p.get("PER"), p.get("PBR"), p.get("dividend_yield")

    # 月營收（近 3 個月）
    rev = get("TaiwanStockMonthRevenue", sid, days=500)
    if rev:
        def key(r):
            return (r.get("revenue_year"), r.get("revenue_month"))
        rev = sorted(rev, key=key)
        by = {key(r): r.get("revenue", 0) for r in rev}
        lines = []
        for r in rev[-3:]:
            y, m = key(r)
            last_year = by.get((y - 1, m)) if y else None
            yoy = f"{(r['revenue'] / last_year - 1) * 100:+.1f}%" if last_year else "-"
            lines.append(f"{y}/{m:02d} 營收 {r['revenue'] / 1e8:.2f} 億（年增 {yoy}）")
        out["月營收"] = lines

    # 新聞標題（近 3 天，最多 5 則）
    news = get("TaiwanStockNews", sid, days=3)
    if news:
        out["近期新聞"] = [n.get("title") for n in news[-5:]]

    return out
