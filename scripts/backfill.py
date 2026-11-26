"""一次性回補歷史資料（K線、法人、融資券、本益比、月營收、EPS），來源 FinMind 公開 API。

每日排程只會「往後累積」，新加入網站時沒有過去的 K 線；用這支補齊。
預設回補：groups.json 自選清單 + reports/ 裡出現過的公司。

用法：
  python scripts/backfill.py                    # 預設清單，近 400 天
  python scripts/backfill.py --codes 2330,2454 --days 730
  python scripts/backfill.py --all              # 全市場（很慢，建議設 FINMIND_TOKEN）

FinMind 免註冊每小時約 300 次請求；到 https://finmindtrade.com 免費註冊取得 token
並設成環境變數 FINMIND_TOKEN，可提高到每小時 600 次。每檔約 6 次請求。
"""
from __future__ import annotations

import argparse
import datetime as dt
import re
import time

from common import DATA, FINMIND_TOKEN, ROOT, get_json, log, read_json, write_json
from fetch_daily import DAILY_FIELDS, IDX

API = "https://api.finmindtrade.com/api/v4/data"


def fm(dataset: str, code: str, start: str):
    params = {"dataset": dataset, "data_id": code, "start_date": start}
    if FINMIND_TOKEN:
        params["token"] = FINMIND_TOKEN
    for attempt in range(3):
        d = get_json(API, params)
        if d.get("status") == 200:
            return d.get("data", [])
        if d.get("status") == 402:  # 超過頻率
            log("FinMind 頻率上限，等 10 分鐘…")
            time.sleep(600)
            continue
        raise RuntimeError(f"FinMind {dataset} {code}: {d.get('msg')}")
    return []


def default_codes() -> list[str]:
    codes: list[str] = []
    g = read_json(ROOT / "groups.json", {})
    for grp in g.get("groups", []):
        codes += grp.get("codes", [])
    for p in (ROOT / "reports").glob("*.md"):
        m = re.search(r"^code:\s*\"?(\d{4})", p.read_text(encoding="utf-8"), re.M)
        if m:
            codes.append(m.group(1))
    return sorted(set(codes))


def backfill(code: str, days: int):
    start = (dt.date.today() - dt.timedelta(days=days)).isoformat()
    daily: dict[str, list] = {}

    def put(date, **kv):
        arr = daily.setdefault(date, [None] * len(DAILY_FIELDS))
        for k, v in kv.items():
            arr[IDX[k]] = v

    for r in fm("TaiwanStockPrice", code, start):
        if r["close"]:
            put(r["date"], o=r["open"], h=r["max"], l=r["min"], c=r["close"],
                v=round(r["Trading_Volume"] / 1000), chg=r["spread"])
    time.sleep(1)
    for r in fm("TaiwanStockPER", code, start):
        put(r["date"], pe=r.get("PER"), dy=r.get("dividend_yield"), pb=r.get("PBR"))
    time.sleep(1)
    inst: dict[str, dict] = {}
    for r in fm("TaiwanStockInstitutionalInvestorsBuySell", code, start):
        net = (r["buy"] - r["sell"]) / 1000
        k = {"Foreign_Investor": "fi", "Investment_Trust": "it",
             "Dealer_self": "dl", "Dealer_Hedging": "dl"}.get(r["name"])
        if k:
            inst.setdefault(r["date"], {"fi": 0, "it": 0, "dl": 0})[k] += net
    for date, v in inst.items():
        put(date, **{k: round(x) for k, x in v.items()})
    time.sleep(1)
    for r in fm("TaiwanStockMarginPurchaseShortSale", code, start):
        put(r["date"], mb=r["MarginPurchaseTodayBalance"], ss=r["ShortSaleTodayBalance"])
    time.sleep(1)

    revenue: dict[str, list] = {}
    rows = sorted(fm("TaiwanStockMonthRevenue", code, (dt.date.today() - dt.timedelta(days=days + 400)).isoformat()),
                  key=lambda r: (r["revenue_year"], r["revenue_month"]))
    by_ym = {f"{r['revenue_year']:04d}-{r['revenue_month']:02d}": r["revenue"] / 1000 for r in rows}
    for ym, rev in by_ym.items():
        y, m = map(int, ym.split("-"))
        prev = by_ym.get(f"{y if m > 1 else y - 1:04d}-{m - 1 if m > 1 else 12:02d}")
        last_y = by_ym.get(f"{y - 1:04d}-{m:02d}")
        revenue[ym] = [round(rev), round((rev / prev - 1) * 100, 2) if prev else None,
                       round((rev / last_y - 1) * 100, 2) if last_y else None, None]
    time.sleep(1)

    eps: dict[str, list] = {}
    for r in fm("TaiwanStockFinancialStatements", code, (dt.date.today() - dt.timedelta(days=days + 400)).isoformat()):
        if r["type"] == "EPS":
            y, mth = int(r["date"][:4]), int(r["date"][5:7])
            eps[f"{y}Q{(mth - 1) // 3 + 1}"] = [r["value"], None, None, None]

    write_json(DATA / "backfill" / f"{code}.json", {"daily": daily, "revenue": revenue, "eps": eps})
    log(code, "K線", len(daily), "天，月營收", len(revenue), "月，EPS", len(eps), "季")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--codes", default="")
    ap.add_argument("--days", type=int, default=400)
    ap.add_argument("--all", action="store_true")
    a = ap.parse_args()
    if a.all:
        codes = sorted(read_json(DATA / "companies.json", {}))
    elif a.codes:
        codes = [c.strip() for c in a.codes.split(",") if c.strip()]
    else:
        codes = default_codes()
    log("回補", len(codes), "檔：", ",".join(codes[:20]), "…" if len(codes) > 20 else "")
    for c in codes:
        try:
            backfill(c, a.days)
        except Exception as e:  # noqa: BLE001
            log("!! 失敗", c, e)


if __name__ == "__main__":
    main()
