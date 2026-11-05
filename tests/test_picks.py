"""值得研究清單的單元測試。執行：python -m unittest tests.test_picks"""
import unittest

import numpy as np
import pandas as pd

from agent import picks

CFG = {"screen": {"volume_ratio": 1.5, "max_above_ma20_pct": 10, "max_rsi": 75},
       "picks": {"weights": {"fundamental": 50, "technical": 25, "chips": 25}, "min_fundamental": 50, "top_n": 2}}


def bars(close, volume=1000.0):
    close = np.asarray(close, dtype=float)
    idx = pd.bdate_range("2026-01-01", periods=len(close))
    return pd.DataFrame({"Open": close, "High": close * 1.002, "Low": close * 0.998, "Close": close,
                         "Volume": volume}, index=idx)


def seg(*points):
    """由幾個轉折點連成價格線：seg((100, 20), (80, 30)) 表示 20 天走到 100、再 30 天走到 80。"""
    out, cur = [], points[0][0]
    for target, n in points[1:]:
        out += list(np.linspace(cur, target, n, endpoint=False))
        cur = target
    return out + [cur]


class Universe(unittest.TestCase):
    def test_filters_etf_tdr_warrant_and_sorts(self):
        twse = [{"Code": "2330", "Name": "台積電", "TradeValue": "100"}, {"Code": "0050", "Name": "ETF", "TradeValue": "999"},
                {"Code": "9103", "Name": "TDR", "TradeValue": "999"}, {"Code": "00631L", "Name": "正2", "TradeValue": "999"},
                {"Code": "2303", "Name": "無量", "TradeValue": ""}]
        tpex = [{"SecuritiesCompanyCode": "6182", "CompanyName": "合晶", "TransactionAmount": "500"},
                {"SecuritiesCompanyCode": "700001", "CompanyName": "權證", "TransactionAmount": "999"}]
        self.assertEqual([x["symbol"] for x in picks.parse_universe(twse, tpex)], ["6182.TWO", "2330.TW"])


class UniverseFallback(unittest.TestCase):
    CFG = {"picks": {"universe_top": 1}, "watchlist": {"tw": [{"symbol": "00631L.TW", "name": "ETF"}, {"symbol": "6182.TWO", "name": "合晶"}]}}
    TWSE = [{"Code": "2330", "Name": "台積電", "TradeValue": "100"}]
    TPEX = [{"SecuritiesCompanyCode": "5465", "CompanyName": "富驊", "TransactionAmount": "500"}]

    def run_with(self, twse, tpex, cache):
        self.addCleanup(setattr, picks, "_fetch_exchange", picks._fetch_exchange)
        picks._fetch_exchange = lambda url: twse if url == picks.TWSE_URL else tpex
        stocks, note = picks.build_universe(self.CFG, cache)
        return [s["symbol"] for s in stocks], note

    def test_complete_updates_list_and_skips_etf(self):
        cache = {}
        symbols, note = self.run_with(self.TWSE, self.TPEX, cache)
        self.assertEqual(symbols, ["5465.TWO", "6182.TWO"])
        self.assertNotIn("⚠️", note)
        self.assertEqual(cache["universe"][0]["symbol"], "5465.TWO")

    def test_one_market_missing_keeps_previous_list(self):
        cache = {"universe": [{"symbol": "1111.TWO", "name": "舊"}]}
        symbols, note = self.run_with(self.TWSE, [], cache)
        self.assertEqual(symbols, ["1111.TWO", "6182.TWO"])
        self.assertIn("⚠️", note)

    def test_one_market_without_previous_list_warns(self):
        symbols, note = self.run_with(self.TWSE, [], {})
        self.assertEqual(symbols, ["2330.TW", "6182.TWO"])
        self.assertIn("只抓到上市", note)

    def test_nothing_falls_back_to_watchlist(self):
        symbols, note = self.run_with([], [], {})
        self.assertEqual(symbols, ["6182.TWO"])
        self.assertIn("⚠️", note)


class Financials(unittest.TestCase):
    def rows(self, day, **vals):
        return [{"date": day, "type": k, "value": v} for k, v in vals.items()]

    def test_income_is_quarterly_and_cash_flow_is_ytd(self):
        inc = []
        for d, p in [("2025-06-30", 10), ("2025-09-30", 10), ("2025-12-31", 10), ("2026-03-31", 20), ("2026-06-30", 30)]:
            inc += self.rows(d, EquityAttributableToOwnersOfParent=p, EPS=p / 10, Revenue=100, GrossProfit=p + 30, OperatingIncome=p)
        bal = self.rows("2025-06-30", EquityAttributableToOwnersOfParent=100, TotalAssets=200, Liabilities=100) + \
            self.rows("2026-06-30", EquityAttributableToOwnersOfParent=100, TotalAssets=200, Liabilities=60)
        cash = self.rows("2026-03-31", CashFlowsFromOperatingActivities=5) + self.rows("2026-06-30", CashFlowsFromOperatingActivities=70)
        f = picks.compute_financials(inc, bal, cash)
        self.assertEqual(f["eps_ttm"], 7.0)            # 1+1+2+3，只算最近四季
        self.assertEqual(f["roe"], 70.0)               # (10+10+20+30)/100
        self.assertEqual(f["debt_ratio"], 30.0)
        self.assertEqual(f["ocf_ytd"], 70)             # 累計數字直接取最新一筆，不重複加總
        self.assertEqual(f["profit_ytd"], 50)          # 今年兩季獲利加總，才能和累計現金流比
        self.assertEqual(f["gross_margin_prev_year"], 40.0)

    def test_financial_company_flagged(self):
        f = picks.compute_financials(self.rows("2026-06-30", Revenue=100, NetInterestIncome=50, EPS=1), [], [])
        self.assertTrue(f["is_financial"])

    def test_financial_company_roe_uses_total_equity(self):
        inc = []
        for d in ("2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31", "2026-06-30"):
            inc += self.rows(d, EquityAttributableToOwnersOfParent=25, EPS=1, Revenue=100, NetInterestIncome=50)
        f = picks.compute_financials(inc, self.rows("2026-06-30", Equity=1000, TotalAssets=10000, Liabilities=9000), [])
        self.assertEqual(f["roe"], 10.0)
        s = picks.score_fundamental(f, {"yoy_3m": 5}, {"PER": 12, "PBR": 1.5, "dividend_yield": 3})
        self.assertIsNotNone(s["score"])

    def test_revenue_yoy(self):
        rows = [{"revenue_year": y, "revenue_month": m, "revenue": 100 if y == 2025 else 120}
                for y in (2025, 2026) for m in (7, 8, 9)]
        self.assertEqual(picks.compute_revenue(rows), {"latest": "2026/09", "yoy_3m": 20.0})


class FundamentalScore(unittest.TestCase):
    STRONG = {"roe": 25, "roa": 12, "debt_ratio": 30, "gross_margin": 50, "gross_margin_prev_year": 45, "op_margin": 40,
              "op_margin_prev_year": 35, "eps_q": 5, "eps_q_prev_year": 3, "ocf_ytd": 200, "profit_ytd": 100}

    def test_strong_beats_weak(self):
        per = {"PER": 14, "PBR": 1.8, "dividend_yield": 4.5}
        strong = picks.score_fundamental(self.STRONG, {"yoy_3m": 30}, per)
        weak = picks.score_fundamental({"roe": -5, "roa": -2, "debt_ratio": 80, "gross_margin": 10, "gross_margin_prev_year": 20,
                                        "op_margin": -5, "op_margin_prev_year": 2, "eps_q": -1, "eps_q_prev_year": 1,
                                        "ocf_ytd": -50, "profit_ytd": -20}, {"yoy_3m": -30}, {"PER": 0, "PBR": 9, "dividend_yield": 0})
        self.assertEqual(strong["score"], 100)
        self.assertLess(weak["score"], 10)
        self.assertTrue(weak["bad"])
        self.assertIn("近 3 月營收年減 30%", weak["bad"])

    def test_not_enough_data_returns_none(self):
        self.assertIsNone(picks.score_fundamental({}, {"yoy_3m": 30}, {"PER": 14})["score"])


class Chips(unittest.TestCase):
    def inst(self, name, nets):
        return [{"date": f"2026-11-0{i + 1}", "name": name, "buy": max(n, 0) * 1000, "sell": max(-n, 0) * 1000}
                for i, n in enumerate(nets)]

    def test_groups_and_streak_in_lots(self):
        rows = self.inst("Foreign_Investor", [100, 100, -50, 100, 100]) + self.inst("Foreign_Dealer_Self", [1, 1, 1, 1, 1]) + \
            self.inst("Investment_Trust", [10, 10, 10, 10, 10])
        c = picks.compute_chips(rows, [])
        self.assertEqual(c["外資"], 355)
        self.assertEqual(c["外資連買"], 2)
        self.assertEqual(c["投信連買"], 5)

    def test_tiny_buying_does_not_score(self):
        base = picks.score_chips({"外資": 0, "投信": 0, "自營商": 0}, 10000)["score"]
        tiny = picks.score_chips({"外資": 5, "投信": 5, "自營商": 0}, 10000)["score"]
        big = picks.score_chips({"外資": 3000, "投信": 2000, "自營商": 0, "投信連買": 4}, 10000)["score"]
        self.assertEqual(base, tiny)
        self.assertGreater(big, base)

    def test_margin_surge_penalised(self):
        calm = picks.score_chips({"外資": 0, "投信": 0, "融資餘額": 1000, "融資5日增減": 0}, 1000)["score"]
        surge = picks.score_chips({"外資": 0, "投信": 0, "融資餘額": 1500, "融資5日增減": 500}, 1000)["score"]
        self.assertLess(surge, calm)

    def test_no_data(self):
        self.assertIsNone(picks.score_chips({}, 1000)["score"])


class Technical(unittest.TestCase):
    def test_uptrend_beats_downtrend(self):
        up = picks.score_technical(bars(np.linspace(100, 130, 120) + np.sin(np.arange(120)) * 0.5), CFG)
        down = picks.score_technical(bars(np.linspace(130, 100, 120) + np.sin(np.arange(120)) * 0.5), CFG)
        self.assertGreater(up["score"], down["score"])
        self.assertIn("在季線之下", down["bad"])

    def test_support_below_and_resistance_above_price(self):
        close = seg((100, 0), (120, 25), (100, 25), (130, 25), (110, 25), (118, 10))
        sup, res = picks.support_resistance(bars(close))
        price = close[-1]
        self.assertLess(sup, price)
        self.assertGreater(res, price)


class Patterns(unittest.TestCase):
    def names(self, close):
        return [p["name"] for p in picks.detect_patterns(bars(close))]

    def test_double_bottom(self):
        self.assertIn("雙重底", self.names(seg((120, 0), (100, 25), (112, 15), (100, 15), (116, 20))))

    def test_double_top(self):
        self.assertIn("雙重頂", self.names(seg((100, 0), (120, 25), (108, 15), (120, 15), (104, 20))))

    def test_head_and_shoulders_top(self):
        self.assertIn("頭肩頂", self.names(seg((90, 0), (110, 20), (100, 10), (125, 15), (100, 15), (110, 10), (95, 12))))

    def test_inverse_head_and_shoulders(self):
        self.assertIn("頭肩底", self.names(seg((110, 0), (90, 20), (100, 10), (75, 15), (100, 15), (90, 10), (105, 12))))

    def test_cup_and_handle(self):
        self.assertIn("杯柄", self.names(seg((100, 0), (120, 15), (95, 25), (120, 25), (115, 7), (124, 6))))

    def test_steady_trend_has_no_pattern(self):
        self.assertEqual(self.names(np.linspace(100, 150, 120)), [])


class Ranking(unittest.TestCase):
    def test_weights_and_missing_chips(self):
        self.assertEqual(picks.total_score(80, 40, 40, CFG), 60.0)
        self.assertEqual(picks.total_score(90, 30, None, CFG), 70.0)   # 籌碼缺資料：基本 2 比技術 1
        self.assertIsNone(picks.total_score(None, 80, 80, CFG))

    def test_fundamental_gate_and_top_n(self):
        rows = [{"total": 90, "fundamental": 40}, {"total": 80, "fundamental": 60}, {"total": 70, "fundamental": 50},
                {"total": 60, "fundamental": 90}, {"total": None, "fundamental": None}]
        self.assertEqual([r["total"] for r in picks.rank(rows, CFG)], [80, 70])

    def test_report_mentions_disclaimer_and_empty_case(self):
        meta = {"scope": "測試", "weights": CFG["picks"]["weights"], "universe": 0, "screened": 0, "scored": 0,
                "unscored": 0, "data_date": "-"}
        text = picks.format_report([], meta)
        self.assertIn("不是買賣建議", text)
        self.assertIn("沒有股票達到", text)

    def test_report_warns_when_rate_limited(self):
        meta = {"scope": "測試", "weights": CFG["picks"]["weights"], "universe": 10, "screened": 10, "scored": 5,
                "unscored": 0, "data_date": "-", "limited": True}
        self.assertIn("額度用完", picks.format_report([], meta))

    def test_candidates_keep_highest_and_skip_missing(self):
        prelims = [{"prelim": 50}, {"prelim": None}, {"prelim": 90}, {"prelim": 70}]
        self.assertEqual([p["prelim"] for p in picks.select_candidates(prelims, 2)], [90, 70])


class TechPriority(unittest.TestCase):
    CFG = {"picks": {"min_fundamental": 50, "top_n": 10, "tech_quota": 7}}

    @staticmethod
    def rows(n_tech, n_other):
        tech = [{"id": f"t{i}", "is_tech": True, "fundamental": 60, "total": 60 - i} for i in range(n_tech)]
        other = [{"id": f"o{i}", "is_tech": False, "fundamental": 60, "total": 90 - i} for i in range(n_other)]
        return tech + other

    def test_keeps_seven_tech_even_if_others_score_higher(self):
        top = picks.rank(self.rows(9, 9), self.CFG)
        self.assertEqual(len(top), 10)
        self.assertEqual(sum(r["is_tech"] for r in top), 7)
        self.assertEqual([r["id"] for r in top[:3]], ["o0", "o1", "o2"])  # 依總分排序

    def test_other_slots_are_open_to_high_scoring_tech(self):
        rows = self.rows(9, 0) + [{"id": "o0", "is_tech": False, "fundamental": 60, "total": 1}]
        top = picks.rank(rows, self.CFG)
        self.assertEqual(sum(r["is_tech"] for r in top), 9)

    def test_fills_with_others_when_tech_is_short(self):
        top = picks.rank(self.rows(2, 12), self.CFG)
        self.assertEqual(len(top), 10)
        self.assertEqual(sum(r["is_tech"] for r in top), 2)

    def test_low_fundamental_tech_is_not_forced_in(self):
        rows = self.rows(0, 3) + [{"id": "t", "is_tech": True, "fundamental": 49, "total": 99}]
        self.assertNotIn("t", [r["id"] for r in picks.rank(rows, self.CFG)])

    def test_candidates_reserve_tech_slots(self):
        prelims = [{"prelim": 90 - i, "is_tech": False} for i in range(5)] + [{"prelim": 10 + i, "is_tech": True} for i in range(3)]
        chosen = picks.select_candidates(prelims, 4, tech_n=2)
        self.assertEqual(len(chosen), 4)
        self.assertEqual(sum(p["is_tech"] for p in chosen), 2)
        self.assertEqual(chosen[0]["prelim"], 90)

    def test_classify_uses_detailed_industry_only(self):
        cache = {"industry": {"data": {"2412": ["通信網路業", "電子工業"], "3533": ["電子工業", "電子零組件業"], "2603": ["航運業"]}}}
        tech = ["半導體業", "電子零組件業"]
        self.assertEqual(picks.classify("2412.TW", cache, tech), ("通信網路業", False))
        self.assertEqual(picks.classify("3533.TW", cache, tech), ("電子零組件業", True))
        self.assertEqual(picks.classify("2603.TW", cache, tech), ("航運業", False))
        self.assertEqual(picks.classify("9999.TW", cache, tech), (None, False))

    def test_refresh_keeps_old_data_when_download_fails(self):
        self.addCleanup(setattr, picks.finmind, "get", picks.finmind.get)
        picks.finmind.get = lambda *a, **k: []
        old = {"fetched": "2020-01-01", "data": {"2330": ["半導體業"]}}
        cache = {"industry": old}
        picks.refresh_industries(cache, picks.Budget(5), {}, picks.date(2026, 11, 5))
        self.assertIs(cache["industry"], old)

    def test_refresh_skips_etf_and_merges_categories(self):
        self.addCleanup(setattr, picks.finmind, "get", picks.finmind.get)
        picks.finmind.get = lambda *a, **k: [{"stock_id": "2412", "industry_category": "通信網路業"},
                                             {"stock_id": "2412", "industry_category": "電子工業"},
                                             {"stock_id": "0050", "industry_category": "ETF"}]
        cache = {}
        picks.refresh_industries(cache, picks.Budget(5), {}, picks.date(2026, 11, 5))
        self.assertEqual(cache["industry"]["data"], {"2412": ["通信網路業", "電子工業"]})

    def test_report_states_tech_count_and_failure(self):
        meta = {"scope": "測試", "weights": CFG["picks"]["weights"], "universe": 1, "screened": 1, "scored": 1,
                "unscored": 0, "data_date": "-", "tech_quota": 7, "tech_ok": True}
        self.assertIn("今天榜上有 0 檔科技股", picks.format_report([], meta))
        meta["tech_ok"] = False
        self.assertIn("抓不到產業分類", picks.format_report([], meta))


class BudgetLimit(unittest.TestCase):
    def setUp(self):
        self.addCleanup(setattr, picks.finmind, "get", picks.finmind.get)
        self.addCleanup(setattr, picks.finmind, "rate_limited", False)
        picks.finmind.rate_limited = False

    def test_stops_after_hitting_upper_limit(self):
        def fake_get(*a, **k):
            picks.finmind.rate_limited = True
            return []
        picks.finmind.get = fake_get
        b = picks.Budget(100)
        self.assertEqual(b.get("TaiwanStockPER", "2330"), [])
        self.assertTrue(b.limited)
        self.assertFalse(b.can())

    def test_starts_empty_if_already_limited(self):
        picks.finmind.rate_limited = True
        b = picks.Budget(100)
        self.assertTrue(b.limited)
        self.assertEqual(b.left, 0)

    def test_refresh_respects_reserve(self):
        calls = []
        picks.finmind.get = lambda dataset, sid, days=30: calls.append(dataset) or []
        cfg = {"picks": {"revenue_cache_days": 7, "financial_cache_days": 14}}
        picks.refresh_fundamentals([{"symbol": "2330.TW", "name": "x"}], {}, picks.Budget(5), cfg,
                                   picks.date(2026, 11, 5), reserve=3)
        self.assertEqual(calls, ["TaiwanStockMonthRevenue"])  # 5 次只能花 2 次；財報要 3 次所以不抓


if __name__ == "__main__":
    unittest.main()
