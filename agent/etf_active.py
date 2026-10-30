"""爬蟲技師：主動式 ETF 持股追蹤 —— 找出經理人「加碼」「新買進」的股票。

做法（每一步都會印在 GitHub Actions 的執行紀錄裡，看得到過程）：
  1. 逐一連到 MoneyDJ 理財網的「ETF 持股明細」頁，抓每檔主動式 ETF 的全部持股與股數
  2. 存成當天的快照（docs/data/etf/<代號>.json，保留最近 15 個交易日）
  3. 拿最新一天和前一天比較股數：變多 = 加碼、新出現 = 新買進、變少 = 減碼、消失 = 出清
  4. 把多檔 ETF 一起加碼的股票排在最前面，輸出 docs/data/etf_changes.json

用法：
  python -m agent.etf_active
"""
from __future__ import annotations

import html
import json
import re
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

ROOT = Path(__file__).resolve().parent.parent
SNAP_DIR = ROOT / "docs" / "data" / "etf"
OUT = ROOT / "docs" / "data" / "etf_changes.json"
TPE = ZoneInfo("Asia/Taipei")
KEEP_DAYS = 15

# 台股主動式 ETF 的代號都是 00xxxA。程式會把這個範圍逐一試一遍，
# 抓不到、或主要投資海外股票的會自動略過，以後有新上市的也會自動被找到。
CANDIDATES = [f"00{n}A" for n in list(range(400, 421)) + list(range(980, 1000))]

URL = "https://www.moneydj.com/ETF/X/Basic/Basic0007B.xdjhtm?etfId={code}.TW"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                         "(KHTML, like Gecko) Chrome/130.0 Safari/537.36",
           "Accept-Language": "zh-TW,zh;q=0.9"}

ROW = re.compile(r"(.+?)\((\w+)\.(TW|TWO)\)\s+([\d.]+)\s+([\d,]+(?:\.\d+)?)")
DATE = re.compile(r"(20\d\d)[/-](\d{1,2})[/-](\d{1,2})")


LOG_LINES: list[str] = []


def log(msg: str) -> None:
    print(msg, flush=True)
    LOG_LINES.append(msg)


def text_of(fragment: str) -> str:
    t = re.sub(r"<[^>]+>", " ", fragment)
    return re.sub(r"\s+", " ", html.unescape(t)).strip()


def fetch(code: str) -> dict | None:
    url = URL.format(code=code)
    try:
        r = requests.get(url, headers=HEADERS, timeout=20)
    except Exception as e:
        log(f"  ✗ {code} 連線失敗：{e}")
        return None
    if r.status_code != 200:
        log(f"  ✗ {code} 網站回應 {r.status_code}")
        return None
    if not r.encoding or r.encoding.lower() == "iso-8859-1":
        r.encoding = r.apparent_encoding or "utf-8"
    page = r.text

    title = re.search(r"<title>(.*?)</title>", page, re.S)
    name = text_of(title.group(1)).split("-")[0].strip() if title else code
    holdings, tw_rows, other_rows = {}, 0, 0
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S | re.I):
        t = text_of(tr)
        m = ROW.match(t)
        if m:
            sname, sym, _, w, sh = m.groups()
            holdings[sym] = {"name": sname.strip(), "weight": float(w), "shares": float(sh.replace(",", ""))}
            tw_rows += 1
        elif re.search(r"\(\w+\.(US|HK|JP|KS|L|DE|PA)\)", t):
            other_rows += 1

    # 找「資料日期」：優先找持股表附近的日期
    d = None
    m = re.search(r"資料日期[^0-9]{0,20}(20\d\d[/-]\d{1,2}[/-]\d{1,2})", page)
    if m:
        d = m.group(1)
    else:
        dates = DATE.findall(page)
        if dates:
            d = "/".join(max(dates, key=lambda x: (int(x[0]), int(x[1]), int(x[2]))))
    if d:
        y, mo, da = DATE.search(d).groups()
        d = f"{y}-{int(mo):02d}-{int(da):02d}"

    if not holdings:
        log(f"  · {code} 沒有台股持股資料（{'海外型' if other_rows else '可能尚未上市'}），略過")
        return None
    if other_rows > tw_rows:
        log(f"  · {code} {name} 主要投資海外，略過")
        return None
    log(f"  ✓ {code} {name}｜資料日期 {d}｜台股持股 {len(holdings)} 檔")
    return {"code": code, "name": name, "date": d, "holdings": holdings}


def save_snapshot(info: dict) -> dict:
    SNAP_DIR.mkdir(parents=True, exist_ok=True)
    f = SNAP_DIR / f"{info['code']}.json"
    try:
        hist = json.loads(f.read_text(encoding="utf-8"))
    except Exception:
        hist = {"code": info["code"], "name": info["name"], "days": {}}
    hist["name"] = info["name"]
    hist["days"][info["date"]] = info["holdings"]
    keep = sorted(hist["days"])[-KEEP_DAYS:]
    hist["days"] = {k: hist["days"][k] for k in keep}
    f.write_text(json.dumps(hist, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return hist


def diff(hist: dict) -> dict | None:
    days = sorted(hist["days"])
    if len(days) < 2:
        return None
    prev, cur = days[-2], days[-1]
    a, b = hist["days"][prev], hist["days"][cur]
    out = {"code": hist["code"], "name": hist["name"], "from": prev, "to": cur, "changes": []}
    for sym in set(a) | set(b):
        sa = a.get(sym, {}).get("shares", 0)
        sb = b.get(sym, {}).get("shares", 0)
        if abs(sb - sa) < 1000 and sa and sb:  # 不到 1 張的差異視為雜訊（股數四捨五入）
            continue
        kind = "新買進" if sa == 0 else "出清" if sb == 0 else "加碼" if sb > sa else "減碼"
        nm = (b.get(sym) or a.get(sym))["name"]
        out["changes"].append({"symbol": sym, "name": nm, "kind": kind, "before": sa, "after": sb,
                               "delta": sb - sa, "weight": b.get(sym, {}).get("weight", 0)})
    out["changes"].sort(key=lambda c: -abs(c["delta"]))
    return out


SEED_URL = "https://xiaoyu-etf.pages.dev/etf/{code}"
# 欄位：# 代號 名稱 權重 張數 市值 日增減(張) 股價漲跌
SEED_ROW = re.compile(r"^\d+\s+(\w+)\s+(.+?)\s+([\d.]+)%\s+([\d,]+)\s+(\S+)\s+([+-]?[\d,]+)\s")


def prev_business_day(d: str) -> str:
    from datetime import date, timedelta
    x = date.fromisoformat(d) - timedelta(days=1)
    while x.weekday() >= 5:
        x -= timedelta(days=1)
    return x.isoformat()


def fetch_prev_from_seed(code: str, cur_date: str, cur: dict) -> tuple[str, dict] | None:
    """第一次執行時沒有「前一天」可以比：從籌碼小宇網站讀「張數」和「日增減」，
    倒推出前一個交易日的持股（前一天張數 = 今天張數 − 日增減）。
    會先確認它的今天張數和 MoneyDJ 抓到的一致，才採用。"""
    try:
        r = requests.get(SEED_URL.format(code=code), headers=HEADERS, timeout=20)
        r.raise_for_status()
        r.encoding = "utf-8"
    except Exception as e:
        log(f"    ✗ 補抓 {code} 失敗：{e}")
        return None
    rows = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", r.text, re.S | re.I):
        m = SEED_ROW.match(text_of(tr))
        if m:
            sym, nm, w, z, _, chg, = m.groups()
            rows.append((sym, nm.replace("清空", "").strip(), float(w),
                         float(z.replace(",", "")), float(chg.replace(",", "").replace("+", ""))))
    if not rows:
        log(f"    · {code} 補抓來源讀不到持股表")
        return None
    same = sum(1 for sym, _, _, z, _ in rows if z > 0 and sym in cur and round(cur[sym]["shares"] / 1000) == z)
    held = sum(1 for r_ in rows if r_[3] > 0)
    if held == 0 or same / held < 0.8:
        log(f"    · {code} 補抓來源的持股日期和 MoneyDJ 不同（{same}/{held} 檔張數一致），不採用")
        return None
    d = prev_business_day(cur_date)
    holdings = {}
    for sym, nm, w, z, chg in rows:
        before = z - chg
        if before > 0:
            # 今天張數和日增減沒變的，直接沿用 MoneyDJ 的精確股數，避免四捨五入誤差
            shares = cur[sym]["shares"] if (chg == 0 and sym in cur) else before * 1000
            holdings[sym] = {"name": nm, "weight": w if chg == 0 else 0, "shares": shares}
    log(f"    ✓ 補抓 {code} 前一交易日（{d}）持股 {len(holdings)} 檔｜來源：籌碼小宇「日增減」，{same}/{held} 檔張數與 MoneyDJ 核對一致")
    return d, holdings


def lots(n: float) -> str:
    z = n / 1000  # 1 張 = 1000 股
    return f"{z:+,.0f} 張"


def main() -> str:
    now = datetime.now(TPE).strftime("%Y-%m-%d %H:%M")
    log(f"== 主動式 ETF 持股爬蟲 @ {now}（台灣時間）==")
    log(f"資料來源：MoneyDJ 理財網 ETF 持股明細（各投信每日公告的持股）")
    log(f"要檢查的代號：{len(CANDIDATES)} 個（{CANDIDATES[0]}～{CANDIDATES[-1]}）\n")

    log("【步驟 1】逐檔抓持股")
    found = []
    for code in CANDIDATES:
        info = fetch(code)
        if info:
            found.append(info)
        time.sleep(0.8)  # 放慢速度，不要給網站太大負擔
    log(f"\n找到 {len(found)} 檔台股主動式 ETF\n")

    log("【步驟 2】存快照並和前一天比較")
    diffs, no_prev = [], []
    for info in found:
        if not info["date"]:
            log(f"  ? {info['code']} 找不到資料日期，略過比較")
            continue
        hist = save_snapshot(info)
        if len(hist["days"]) < 2:
            seed = fetch_prev_from_seed(info["code"], info["date"], info["holdings"])
            time.sleep(0.8)
            if seed:
                hist["days"][seed[0]] = seed[1]
                hist["days"] = dict(sorted(hist["days"].items()))
                (SNAP_DIR / f"{info['code']}.json").write_text(
                    json.dumps(hist, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        d = diff(hist)
        if d is None:
            no_prev.append(info["code"])
            log(f"  · {info['code']} 只有 {info['date']} 一天的資料，下次執行才能比較")
        else:
            n = {k: sum(c["kind"] == k for c in d["changes"]) for k in ("加碼", "新買進", "減碼", "出清")}
            log(f"  ✓ {info['code']} {d['from']} → {d['to']}｜加碼 {n['加碼']}、新買進 {n['新買進']}、減碼 {n['減碼']}、出清 {n['出清']}")
            diffs.append(d)

    # 步驟 3：彙總「哪些股票被加碼」
    log("\n【步驟 3】彙總加碼股票（被越多檔 ETF 加碼的排越前面）")
    agg: dict[str, dict] = {}
    for d in diffs:
        for c in d["changes"]:
            if c["kind"] not in ("加碼", "新買進"):
                continue
            g = agg.setdefault(c["symbol"], {"symbol": c["symbol"], "name": c["name"], "etfs": []})
            g["etfs"].append({"code": d["code"], "etf": d["name"], "kind": c["kind"], "delta": c["delta"],
                              "weight": c["weight"], "date": d["to"]})
    buys = sorted(agg.values(), key=lambda g: (-len(g["etfs"]), -sum(e["delta"] for e in g["etfs"])))
    for g in buys[:30]:
        who = "、".join(f"{e['code']}{'(新)' if e['kind'] == '新買進' else ''} {lots(e['delta'])}" for e in g["etfs"])
        log(f"  ▲ {g['name']}（{g['symbol']}）× {len(g['etfs'])} 檔：{who}")
    if not buys:
        log("  （還沒有可以比較的資料）")

    OUT.write_text(json.dumps({"updated": now, "etfs": [{"code": i["code"], "name": i["name"], "date": i["date"]} for i in found],
                               "buys": buys, "diffs": diffs, "waiting": no_prev},
                              ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    top = "、".join(f"{g['name']}×{len(g['etfs'])}" for g in buys[:5])
    summary = (f"主動ETF：{len(found)} 檔，被加碼 {len(buys)} 檔股票" + (f"（{top}）" if top else "")
               if diffs else f"主動ETF：已記錄 {len(found)} 檔持股快照，下次執行開始比對加碼")
    log("\n" + summary)
    (ROOT / "docs" / "data" / "etf_log.txt").write_text("\n".join(LOG_LINES) + "\n", encoding="utf-8")
    return summary


if __name__ == "__main__":
    main()
