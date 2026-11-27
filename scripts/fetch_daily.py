"""每日抓取台股公開資料（上市 + 上櫃），存成 data/ 底下的 JSON 快照。

資料來源（全部是官方公開資料，不需帳號密碼）：
  證交所 OpenAPI  https://openapi.twse.com.tw/
  證交所網站 JSON  三大法人 T86、融資融券 MI_MARGN
  櫃買中心 OpenAPI https://www.tpex.org.tw/openapi/
  集保結算所開放資料 股權分散表（每週）

用法：
  python scripts/fetch_daily.py            # 抓全部
  python scripts/fetch_daily.py --only prices,chips

每個來源獨立 try/except：某一個來源失敗不會讓整個流程中斷。
同一天重跑會覆寫成相同結果（冪等）。
"""
from __future__ import annotations

import argparse
import csv
import io
import time

from common import (DATA, INDUSTRY, get_json, http_get, is_stock_code, is_security, add_etf_names, log, num,
                    read_json, roc_to_iso, write_json)

TWSE = "https://openapi.twse.com.tw/v1"
TPEX = "https://www.tpex.org.tw/openapi/v1"

# 每日快照欄位（順序固定，前端也依此解讀）
DAILY_FIELDS = ["o", "h", "l", "c", "v", "chg", "pe", "dy", "pb", "fi", "it", "dl", "mb", "ss"]
IDX = {k: i for i, k in enumerate(DAILY_FIELDS)}

failures: list[str] = []


def lots(shares):
    """股數 -> 張（四捨五入）"""
    v = num(shares)
    return None if v is None else round(v / 1000)


def upsert_daily(date: str, rows: dict[str, dict]):
    """把 {code: {欄位: 值}} 合併進 data/daily/{date}.json"""
    path = DATA / "daily" / f"{date}.json"
    snap = read_json(path, {"date": date, "fields": DAILY_FIELDS, "rows": {}})
    for code, vals in rows.items():
        arr = snap["rows"].get(code) or [None] * len(DAILY_FIELDS)
        for k, v in vals.items():
            arr[IDX[k]] = v
        snap["rows"][code] = arr
    write_json(path, snap)
    return len(rows)


# ---------------------------------------------------------------- 價格 / 本益比
def fetch_prices():
    out_dates = set()
    # 上市
    q = get_json(f"{TWSE}/exchangeReport/STOCK_DAY_ALL")
    rows, date = {}, None
    add_etf_names({r["Code"].strip(): (r["Name"], "上市") for r in q})
    for r in q:
        code = r["Code"].strip()
        if not is_security(code):
            continue
        date = roc_to_iso(r["Date"])
        rows[code] = {"o": num(r["OpeningPrice"]), "h": num(r["HighestPrice"]), "l": num(r["LowestPrice"]),
                      "c": num(r["ClosingPrice"]), "v": lots(r["TradeVolume"]), "chg": num(r["Change"])}
    for r in get_json(f"{TWSE}/exchangeReport/BWIBBU_ALL"):
        code = r["Code"].strip()
        if code in rows:
            rows[code].update(pe=num(r["PEratio"]), dy=num(r["DividendYield"]), pb=num(r["PBratio"]))
    if date:
        log("上市行情", date, upsert_daily(date, rows), "檔")
        out_dates.add(date)

    # 上櫃
    q = get_json(f"{TPEX}/tpex_mainboard_daily_close_quotes")
    rows, date = {}, None
    add_etf_names({r["SecuritiesCompanyCode"].strip(): (r["CompanyName"], "上櫃") for r in q})
    for r in q:
        code = r["SecuritiesCompanyCode"].strip()
        if not is_security(code):
            continue
        date = roc_to_iso(r["Date"])
        rows[code] = {"o": num(r["Open"]), "h": num(r["High"]), "l": num(r["Low"]),
                      "c": num(r["Close"]), "v": lots(r["TradingShares"]), "chg": num(r["Change"])}
    for r in get_json(f"{TPEX}/tpex_mainboard_peratio_analysis"):
        code = r["SecuritiesCompanyCode"].strip()
        if code in rows:
            rows[code].update(pe=num(r["PriceEarningRatio"]), dy=num(r["YieldRatio"]), pb=num(r["PriceBookRatio"]))
    if date:
        log("上櫃行情", date, upsert_daily(date, rows), "檔")
        out_dates.add(date)

    # 證交所 OpenAPI 的上市行情常常隔天才更新；用證交所網站的當日行情補上最新一天
    latest = max(out_dates) if out_dates else None
    if latest and not twse_has_prices(latest):
        try:
            n = fetch_twse_mi_index(latest)
            log("上市行情（證交所當日）", latest, n, "檔")
        except Exception as e:  # noqa: BLE001
            log("上市行情（證交所當日）", latest, "尚無資料：", e)
    return out_dates


def twse_has_prices(date: str) -> bool:
    snap = read_json(DATA / "daily" / f"{date}.json", {})
    rows = snap.get("rows", {}) if snap else {}
    return rows.get("2330", [None] * 5)[IDX["c"]] is not None and "TAIEX" in rows


def fetch_twse_mi_index(date: str) -> int:
    d = get_json("https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX",
                 {"date": date.replace("-", ""), "type": "ALLBUT0999", "response": "json"})
    if d.get("stat") != "OK":
        raise RuntimeError(d.get("stat"))
    table = next((t for t in d.get("tables", []) if t.get("fields") and "證券代號" in t["fields"][0]), None)
    if table is None:
        raise RuntimeError("MI_INDEX 格式改變")
    f = {k: i for i, k in enumerate(table["fields"])}
    rows = {}
    add_etf_names({r[0].strip(): (r[1], "上市") for r in table["data"]})
    for r in table["data"]:
        code = r[0].strip()
        if not is_security(code):
            continue
        diff = num(r[f["漲跌價差"]], 0.0)
        sign = -1 if "-" in r[f["漲跌(+/-)"]] else 1
        rows[code] = {"o": num(r[f["開盤價"]]), "h": num(r[f["最高價"]]), "l": num(r[f["最低價"]]),
                      "c": num(r[f["收盤價"]]), "v": lots(r[f["成交股數"]]), "chg": sign * diff,
                      "pe": num(r[f["本益比"]])}
    # 加權指數（存成代號 TAIEX，只有收盤與漲跌點數）
    for t in d.get("tables", []):
        if t.get("fields") and t["fields"][0] == "指數":
            for r in t["data"]:
                if r[0].strip() == "發行量加權股價指數":
                    c = num(r[1]); pts = num(r[3], 0.0)
                    rows["TAIEX"] = {"o": c, "h": c, "l": c, "c": c, "chg": (-1 if "-" in r[2] else 1) * pts}
            break
    time.sleep(3)
    return upsert_daily(date, rows)


# ---------------------------------------------------------------- 籌碼：三大法人、融資券
def fetch_chips(dates: set[str]):
    # 上市三大法人（證交所網站 JSON，需指定日期）
    for date in sorted(dates):
        d = get_json("https://www.twse.com.tw/rwd/zh/fund/T86",
                     {"date": date.replace("-", ""), "selectType": "ALLBUT0999", "response": "json"})
        if d.get("stat") != "OK":
            log("上市三大法人", date, "尚無資料：", d.get("stat"))
            continue
        rows = {}
        for r in d["data"]:
            code = r[0].strip()
            if is_security(code):
                rows[code] = {"fi": lots(r[4]), "it": lots(r[10]), "dl": lots(r[11])}
        log("上市三大法人", date, upsert_daily(date, rows), "檔")
        time.sleep(3)  # 證交所網站有頻率限制

        # 上市融資融券
        m = get_json("https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN",
                     {"date": date.replace("-", ""), "selectType": "ALL", "response": "json"})
        if m.get("stat") != "OK":
            log("上市融資券", date, "尚無資料：", m.get("stat"))
            continue
        table = None
        for t in m.get("tables", []):
            if t.get("fields") and "代號" in t["fields"][0]:
                table = t
        if table is None:
            raise RuntimeError("MI_MARGN 格式改變，找不到個股表格")
        f = table["fields"]
        # 欄位：代號 名稱 | 融資 買進 賣出 現金償還 前日餘額 今日餘額 限額 | 融券 買進 賣出 現券償還 前日餘額 今日餘額 限額 | 資券互抵 註記
        rows = {}
        for r in table["data"]:
            code = r[0].strip()
            if is_security(code):
                rows[code] = {"mb": num(r[6]), "ss": num(r[12])}
        log("上市融資券", date, upsert_daily(date, rows), "檔", f"({len(f)} 欄)")
        time.sleep(3)

    # 上櫃三大法人
    rows, date = {}, None
    for r in get_json(f"{TPEX}/tpex_3insti_daily_trading"):
        code = r["SecuritiesCompanyCode"].strip()
        if not is_security(code):
            continue
        date = roc_to_iso(r["Date"])
        rows[code] = {"fi": lots(r["Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference"]),
                      "it": lots(r["SecuritiesInvestmentTrustCompanies-Difference"]),
                      "dl": lots(r["Dealers-Difference"])}
    if date:
        log("上櫃三大法人", date, upsert_daily(date, rows), "檔")

    # 上櫃融資券
    rows, date = {}, None
    for r in get_json(f"{TPEX}/tpex_mainboard_margin_balance"):
        code = r["SecuritiesCompanyCode"].strip()
        if not is_security(code):
            continue
        date = roc_to_iso(r["Date"])
        rows[code] = {"mb": num(r["MarginPurchaseBalance"]), "ss": num(r["ShortSaleBalance"])}
    if date:
        log("上櫃融資券", date, upsert_daily(date, rows), "檔")


# ---------------------------------------------------------------- 公司基本資料
def fetch_companies():
    path = DATA / "companies.json"
    comp = read_json(path, {})
    n = 0
    for r in get_json(f"{TWSE}/opendata/t187ap03_L"):
        code = r["公司代號"].strip()
        if not is_stock_code(code):
            continue
        comp[code] = {"n": r["公司簡稱"].strip(), "full": r["公司名稱"].strip(), "mkt": "上市",
                      "ind": INDUSTRY.get(r["產業別"].strip(), r["產業別"].strip()),
                      "chair": r.get("董事長", "").strip(), "gm": r.get("總經理", "").strip(),
                      "listed": roc_to_iso(r.get("上市日期", "")), "cap": num(r.get("實收資本額")),
                      "shares": num(r.get("已發行普通股數或TDR原股發行股數")),
                      "web": r.get("網址", "").strip(), "addr": r.get("住址", "").strip()}
        n += 1
    for r in get_json(f"{TPEX}/mopsfin_t187ap03_O"):
        code = r["SecuritiesCompanyCode"].strip()
        if not is_stock_code(code):
            continue
        comp[code] = {"n": r["CompanyAbbreviation"].strip(), "full": r["CompanyName"].strip(), "mkt": "上櫃",
                      "ind": INDUSTRY.get(r["SecuritiesIndustryCode"].strip(), r["SecuritiesIndustryCode"].strip()),
                      "chair": r.get("Chairman", "").strip(), "gm": r.get("GeneralManager", "").strip(),
                      "listed": roc_to_iso(r.get("DateOfListing", "")), "cap": num(r.get("Paidin.Capital.NTDollars")),
                      "shares": num(r.get("IssueShares")), "web": (r.get("WebAddress") or "").strip(),
                      "addr": r.get("Address", "").strip()}
        n += 1
    write_json(path, comp, compact=False)
    log("公司基本資料", n, "家")


# ---------------------------------------------------------------- 月營收
def fetch_revenue():
    by_month: dict[str, dict] = {}
    for url in (f"{TWSE}/opendata/t187ap05_L", f"{TPEX}/mopsfin_t187ap05_O"):
        for r in get_json(url):
            code = r["公司代號"].strip()
            if not is_stock_code(code):
                continue
            ym = roc_to_iso(r["資料年月"])
            by_month.setdefault(ym, {})[code] = [
                num(r["營業收入-當月營收"]), num(r["營業收入-上月比較增減(%)"]),
                num(r["營業收入-去年同月增減(%)"]), num(r["累計營業收入-前期比較增減(%)"])]
    for ym, rows in by_month.items():
        path = DATA / "revenue" / f"{ym}.json"
        cur = read_json(path, {})
        cur.update(rows)
        write_json(path, cur)
        log("月營收", ym, len(rows), "家")


# ---------------------------------------------------------------- 季報 EPS
def fetch_eps():
    by_q: dict[str, dict] = {}
    for r in get_json(f"{TWSE}/opendata/t187ap14_L"):
        code = r["公司代號"].strip()
        if is_stock_code(code):
            q = f"{int(r['年度']) + 1911}Q{r['季別'].strip()}"
            by_q.setdefault(q, {})[code] = [num(r["基本每股盈餘(元)"]), num(r["營業收入"]), num(r["營業利益"]), num(r["稅後淨利"])]
    for r in get_json(f"{TPEX}/mopsfin_t187ap14_O"):
        code = r["SecuritiesCompanyCode"].strip()
        if is_stock_code(code):
            q = f"{int(r['Year']) + 1911}Q{r['季別'].strip()}"
            by_q.setdefault(q, {})[code] = [num(r["基本每股盈餘"]), num(r["營業收入"]), num(r["營業利益"]), num(r["稅後淨利"])]
    for q, rows in by_q.items():
        path = DATA / "eps" / f"{q}.json"
        cur = read_json(path, {})
        cur.update(rows)
        write_json(path, cur)
        log("季報EPS", q, len(rows), "家")


# ---------------------------------------------------------------- 股利
def fetch_dividends():
    path = DATA / "dividends.json"
    div = read_json(path, {})

    def add(code, year, period, cash, stock, board):
        lst = div.setdefault(code, [])
        key = (year, period)
        lst[:] = [x for x in lst if (x[0], x[1]) != key]
        lst.append([year, period, round(cash or 0, 4), round(stock or 0, 4), board])
        lst.sort(key=lambda x: (x[0], str(x[1])), reverse=True)

    for r in get_json(f"{TWSE}/opendata/t187ap45_L"):
        code = r["公司代號"].strip()
        if not is_stock_code(code):
            continue
        cash = sum(num(r.get(k), 0) for k in ("股東配發-盈餘分配之現金股利(元/股)", "股東配發-法定盈餘公積發放之現金(元/股)", "股東配發-資本公積發放之現金(元/股)"))
        stock = sum(num(r.get(k), 0) for k in ("股東配發-盈餘轉增資配股(元/股)", "股東配發-法定盈餘公積轉增資配股(元/股)", "股東配發-資本公積轉增資配股(元/股)"))
        add(code, int(r["股利年度"]) + 1911, r.get("股利所屬年(季)度", "年度").strip() + r.get("期別", "").strip(), cash, stock,
            roc_to_iso(r.get("董事會（擬議）股利分派日", "")))
    for r in get_json(f"{TPEX}/mopsfin_t187ap39_O"):
        code = r["公司代號"].strip()
        if not is_stock_code(code):
            continue
        cash = sum(num(r.get(k), 0) for k in ("股東配發內容-盈餘分配之現金股利(元/股)", "股東配發內容-法定盈餘公積、資本公積發放之現金(元/股)"))
        stock = sum(num(r.get(k), 0) for k in ("股東配發內容-盈餘轉增資配股(元/股)", "股東配發內容-法定盈餘公積、資本公積轉增資配股(元/股)"))
        add(code, int(r["股利年度"]) + 1911, "期" + r.get("期別", "").strip(), cash, stock,
            roc_to_iso(r.get("董事會決議通過股利分派日", "")))
    write_json(path, div)
    log("股利", len(div), "家")


# ---------------------------------------------------------------- 集保股權分散（每週）
def fetch_tdcc():
    txt = http_get("https://opendata.tdcc.com.tw/getOD.ashx?id=1-5", timeout=120)
    rd = csv.reader(io.StringIO(txt))
    next(rd, None)
    by_code: dict[str, list] = {}
    date = None
    for row in rd:
        if len(row) < 6:
            continue
        d, code, lvl = row[0].strip(), row[1].strip(), int(row[2])
        if not is_stock_code(code):
            continue
        date = roc_to_iso(d)
        arr = by_code.setdefault(code, [0] + [0.0] * 15)
        if 1 <= lvl <= 15:
            arr[lvl] = num(row[5], 0.0)
        elif lvl == 17:
            arr[0] = int(num(row[3], 0))
    if date:
        write_json(DATA / "tdcc" / f"{date}.json", by_code)
        log("集保股權分散", date, len(by_code), "檔")


SOURCES = {
    "companies": fetch_companies,
    "prices": None,  # 特殊處理（回傳日期）
    "chips": None,
    "revenue": fetch_revenue,
    "eps": fetch_eps,
    "dividends": fetch_dividends,
    "tdcc": fetch_tdcc,
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="逗號分隔：" + ",".join(SOURCES))
    args = ap.parse_args()
    only = set(filter(None, args.only.split(","))) or set(SOURCES)

    def run(name, fn, *a):
        if name not in only:
            return None
        try:
            return fn(*a)
        except Exception as e:  # noqa: BLE001
            failures.append(f"{name}: {e}")
            log("!! 失敗", name, e)
            return None

    run("companies", fetch_companies)
    dates = run("prices", fetch_prices) or set()
    if not dates and "chips" in only:
        # 只抓籌碼時，用最新一份快照的日期
        files = sorted((DATA / "daily").glob("*.json"))
        if files:
            dates = {files[-1].stem}
    run("chips", fetch_chips, dates)
    run("revenue", fetch_revenue)
    run("eps", fetch_eps)
    run("dividends", fetch_dividends)
    run("tdcc", fetch_tdcc)

    if failures:
        log("完成，但有", len(failures), "個來源失敗：")
        for f in failures:
            log("   ", f)
    else:
        log("全部完成")


if __name__ == "__main__":
    main()
