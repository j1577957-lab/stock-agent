"""爬蟲技師：抓台股、美股大盤新聞，用關鍵字判斷利多／利空。

用法：
  python -m agent.news            抓新聞，更新 docs/data/news.json
  python -m agent.news --test     不上網，用內建範例標題測試關鍵字判斷

想調整判斷方式，只要改下面 BULLISH / BEARISH 兩個關鍵字清單：
  後面的數字是「分數」，越大代表越重要。標題裡出現就加分（利多）或扣分（利空）。
完全不呼叫 AI，不花錢。
"""
from __future__ import annotations

import json
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import quote
from zoneinfo import ZoneInfo

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "data" / "news.json"
TPE = ZoneInfo("Asia/Taipei")
KEEP_HOURS = 48        # 保留最近幾小時的新聞
MAX_PER_MARKET = 80    # 每個市場最多保留幾則

# ---------- 新聞來源 ----------
def google_news(q: str) -> str:
    return f"https://news.google.com/rss/search?q={quote(q)}+when:1d&hl=zh-TW&gl=TW&ceid=TW:zh-Hant"

SOURCES = {
    "tw": [
        ("google", google_news("台股")),
        ("google", google_news("加權指數")),
        ("cnyes", "https://api.cnyes.com/media/api/v1/newslist/category/tw_stock?limit=30"),
    ],
    "us": [
        ("google", google_news("美股")),
        ("google", google_news("道瓊 OR 那斯達克 OR 標普500")),
        ("cnyes", "https://api.cnyes.com/media/api/v1/newslist/category/wd_stock?limit=30"),
    ],
}

# ---------- 關鍵字（可自行增減）----------
BULLISH = {
    "大漲": 2, "漲停": 2, "看升": 1, "翻倍": 1, "大升": 1, "飆漲": 2, "噴出": 2, "創新高": 2, "歷史新高": 2, "攻上": 1, "站上": 1, "收紅": 1,
    "反彈": 1, "止跌": 2, "齊揚": 1, "齊漲": 1, "走揚": 1, "勁揚": 1, "上漲": 1, "漲逾": 1, "續漲": 1, "多頭": 1, "強勢": 1,
    "買超": 1, "加碼": 1, "回補": 1, "資金湧入": 2, "外資買": 1,
    "優於預期": 2, "超乎預期": 2, "財報亮眼": 2, "營收創": 2, "獲利成長": 2, "年增": 1, "上修": 2,
    "調升": 1, "看好": 1, "樂觀": 1, "利多": 2, "接單": 1, "訂單滿": 2, "擴產": 1,
    "降息": 2, "寬鬆": 1, "軟著陸": 1, "通膨降溫": 2, "回購": 1, "配息": 1, "填息": 1,
}
BEARISH = {
    "大跌": 2, "跌停": 2, "回吐": 1, "蒸發": 2, "遇挫": 1, "大貶": 1, "重挫": 2, "暴跌": 2, "崩跌": 2, "崩盤": 2, "跳水": 2, "破底": 2, "失守": 2, "跌破": 1,
    "收黑": 1, "下跌": 1, "走低": 1, "跌逾": 1, "續跌": 1, "空頭": 1, "疲弱": 1, "回檔": 1, "止漲": 1, "齊跌": 1, "齊挫": 1,
    "賣超": 1, "調節": 1, "減碼": 1, "提款": 1, "資金撤": 2, "外資賣": 1,
    "低於預期": 2, "不如預期": 2, "財報差": 2, "虧損": 2, "年減": 1, "下修": 2, "調降": 1,
    "示警": 1, "悲觀": 1, "利空": 2, "砍單": 2, "衰退": 2, "裁員": 1,
    "升息": 2, "緊縮": 1, "通膨升溫": 2, "關稅": 1, "制裁": 1, "禁令": 1, "停工": 1, "違約": 2,
    "恐慌": 1, "賣壓": 1, "拋售": 2, "地緣": 1, "戰爭": 1,
}
# 這些詞出現時，代表上面的詞被「否定」了（例如「漲勢不再」），那個方向不算分
NEGATIONS = ("不再", "收斂", "縮小", "暫緩", "解除", "落空")


def classify(title: str) -> dict:
    bull = [k for k in BULLISH if k in title]
    bear = [k for k in BEARISH if k in title]
    # 「跌勢止」「利空出盡」之類：利空被否定 → 反而偏多
    if "出盡" in title:
        bear = [k for k in bear if k != "利空"]
        bull.append("利空出盡")
    score = sum(BULLISH.get(k, 2) for k in bull) - sum(BEARISH[k] for k in bear)
    if any(n in title for n in NEGATIONS):
        score = round(score * 0.5)  # 有否定詞時降低把握
    label = "利多" if score >= 2 else "利空" if score <= -2 else "偏多" if score == 1 else "偏空" if score == -1 else "中性"
    return {"label": label, "score": score, "hits": bull + bear}


# ---------- 抓取 ----------
HEADERS = {"User-Agent": "Mozilla/5.0 (stock-agent news crawler)"}


def fetch_google(url: str) -> list[dict]:
    r = requests.get(url, headers=HEADERS, timeout=20)
    r.raise_for_status()
    out = []
    for it in ET.fromstring(r.content).iter("item"):
        title = (it.findtext("title") or "").strip()
        src = (it.findtext("source") or "").strip()
        if src and title.endswith(" - " + src):  # Google 會在標題後面加「 - 媒體名」
            title = title[: -len(src) - 3].strip()
        try:
            t = parsedate_to_datetime(it.findtext("pubDate") or "")
        except Exception:
            t = datetime.now(timezone.utc)
        out.append({"title": title, "url": it.findtext("link") or "", "source": src or "Google News", "time": t})
    return out


def fetch_cnyes(url: str) -> list[dict]:
    r = requests.get(url, headers=HEADERS, timeout=20)
    r.raise_for_status()
    out = []
    for it in r.json().get("items", {}).get("data", []):
        out.append({
            "title": (it.get("title") or "").strip(),
            "url": f"https://news.cnyes.com/news/id/{it.get('newsId')}",
            "source": "鉅亨網",
            "time": datetime.fromtimestamp(int(it.get("publishAt") or 0), timezone.utc),
        })
    return out


FETCHERS = {"google": fetch_google, "cnyes": fetch_cnyes}


def norm(title: str) -> str:
    return re.sub(r"[\s\W_]+", "", title)[:40]


def crawl(market: str, old: list[dict]) -> tuple[list[dict], int]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=KEEP_HOURS)
    seen = {norm(n["title"]): n for n in old if datetime.fromisoformat(n["time"]) >= cutoff}
    new = 0
    for kind, url in SOURCES[market]:
        try:
            items = FETCHERS[kind](url)
            print(f"  ✓ {kind} 抓到 {len(items)} 則")
        except Exception as e:
            print(f"  ✗ {kind} 失敗：{e}")
            continue
        for it in items:
            key = norm(it["title"])
            if not key or key in seen or it["time"] < cutoff:
                continue
            seen[key] = {**it, "time": it["time"].isoformat(), **classify(it["title"])}
            new += 1
    items = sorted(seen.values(), key=lambda n: n["time"], reverse=True)[:MAX_PER_MARKET]
    return items, new


def main() -> str:
    try:
        old = json.loads(OUT.read_text(encoding="utf-8"))
    except Exception:
        old = {}
    data = {"updated": datetime.now(TPE).strftime("%Y-%m-%d %H:%M")}
    parts = []
    for market, name in (("tw", "台股"), ("us", "美股")):
        print(f"== {name} ==")
        items, new = crawl(market, old.get(market, []))
        data[market] = items
        bull = sum(n["label"] in ("利多", "偏多") for n in items[:30])
        bear = sum(n["label"] in ("利空", "偏空") for n in items[:30])
        parts.append(f"{name}新增 {new} 則（近 30 則 多{bull}／空{bear}）")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    summary = "新聞掃描：" + "，".join(parts)
    print(summary)
    return summary


SAMPLES = [
    "台股大漲400點 站上兩萬三創歷史新高",
    "外資賣超千億 台股重挫跌破季線",
    "美股收盤：Fed暗示降息 那斯達克勁揚",
    "輝達財報優於預期 盤後股價噴出",
    "川普宣布新關稅 道瓊跳水逾800點",
    "台積電法說會今登場 市場聚焦先進製程",
    "利空出盡 台股反彈",
    "通膨降溫 美股四大指數齊揚",
]

if __name__ == "__main__":
    if "--test" in sys.argv:
        for t in SAMPLES:
            c = classify(t)
            print(f"{c['label']:<4} {c['score']:>3}  {t}  {c['hits']}")
    else:
        main()
