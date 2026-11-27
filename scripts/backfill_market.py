"""全市場歷史回補：用證交所、櫃買中心「依日期查詢」的公開資料，一天一次抓全部股票與 ETF。

每個交易日最多 8 次請求（上市行情＋加權指數、本益比、三大法人、融資券；上櫃行情、本益比、三大法人、融資券），
已有股票資料、只缺 ETF／指數／上櫃本益比的日子只補那幾項。請求之間會停頓，不對交易所造成負擔。
可隨時中斷，重跑會跳過已完成的日期。

  python scripts/backfill_market.py --days 1100
"""
from __future__ import annotations

import argparse
import datetime as dt
import time

from common import DATA, add_etf_names, get_json, is_security, log, num, read_json
from fetch_daily import IDX, fetch_twse_mi_index, lots, upsert_daily

TWSE_GAP, TPEX_GAP = 3.5, 1.5


def table_of(d, key="代號"):
    for t in d.get("tables", []) or []:
        if t.get("fields") and key in t["fields"][0]:
            return t
    return None


def status(date: str) -> str:
    """full＝全部都有；light＝股票都有，只缺 ETF／指數／上櫃本益比；none＝要整天重抓"""
    rows = read_json(DATA / "daily" / f"{date}.json", {}).get("rows", {})
    a, b = rows.get("2330"), rows.get("6488")
    if not (a and b and all(a[IDX[k]] is not None for k in ("c", "fi", "mb", "pb")) and b[IDX["c"]] is not None and b[IDX["fi"]] is not None):
        return "none"
    etf = rows.get("00878")
    if "TAIEX" in rows and etf and etf[IDX["c"]] is not None and etf[IDX["fi"]] is not None and b[IDX["pb"]] is not None:
        return "full"
    return "light"


def twse_mi(date: str) -> bool:
    try:
        n = fetch_twse_mi_index(date)  # 已含 ETF 與加權指數
    except RuntimeError as e:
        if any(s in str(e) for s in ("沒有符合", "查詢日期", "很抱歉")):
            return False
        raise
    time.sleep(TWSE_GAP)
    return n > 0


def twse_rest(date: str, light: bool):
    ymd = date.replace("-", "")
    if not light:
        d = get_json("https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d", {"date": ymd, "selectType": "ALL", "response": "json"})
        if d.get("stat") == "OK":
            f = {k: i for i, k in enumerate(d["fields"])}
            upsert_daily(date, {r[0].strip(): {"pe": num(r[f["本益比"]]), "dy": num(r[f["殖利率(%)"]]), "pb": num(r[f["股價淨值比"]])}
                                for r in d["data"] if is_security(r[0].strip())})
        time.sleep(TWSE_GAP)
    d = get_json("https://www.twse.com.tw/rwd/zh/fund/T86", {"date": ymd, "selectType": "ALLBUT0999", "response": "json"})
    if d.get("stat") == "OK":
        upsert_daily(date, {r[0].strip(): {"fi": lots(r[4]), "it": lots(r[10]), "dl": lots(r[11])} for r in d["data"] if is_security(r[0].strip())})
    time.sleep(TWSE_GAP)
    d = get_json("https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN", {"date": ymd, "selectType": "ALL", "response": "json"})
    t = table_of(d) if d.get("stat") == "OK" else None
    if t:
        upsert_daily(date, {r[0].strip(): {"mb": num(r[6]), "ss": num(r[12])} for r in t["data"] if is_security(r[0].strip())})
    time.sleep(TWSE_GAP)


def tpex_day(date: str, light: bool):
    sl = date.replace("-", "/")
    d = get_json("https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes", {"date": sl, "response": "json"})
    t = table_of(d)
    if t:
        f = {k: i for i, k in enumerate(t["fields"])}
        add_etf_names({r[0].strip(): (r[1], "上櫃") for r in t["data"]})
        upsert_daily(date, {r[0].strip(): {"c": num(r[f["收盤"]]), "chg": num(r[f["漲跌"]]), "o": num(r[f["開盤"]]), "h": num(r[f["最高"]]),
                                         "l": num(r[f["最低"]]), "v": lots(r[f["成交股數"]])}
                            for r in t["data"] if is_security(r[0].strip()) and num(r[f["收盤"]])})
    time.sleep(TPEX_GAP)
    d = get_json("https://www.tpex.org.tw/www/zh-tw/afterTrading/peQryDate", {"date": sl, "response": "json"})
    t = table_of(d, "股票代號")
    if t:
        f = {k: i for i, k in enumerate(t["fields"])}
        upsert_daily(date, {r[0].strip(): {"pe": num(r[f["本益比"]]), "dy": num(r[f["殖利率(%)"]]), "pb": num(r[f["股價淨值比"]])}
                            for r in t["data"] if is_security(r[0].strip())})
    time.sleep(TPEX_GAP)
    d = get_json("https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade", {"type": "Daily", "sect": "EW", "date": sl, "response": "json"})
    t = table_of(d)
    if t:  # 外資(不含自營) 2-4、外資自營 5-7、外資合計 8-10、投信 11-13、自營自行 14-16、自營避險 17-19、自營合計 20-22
        upsert_daily(date, {r[0].strip(): {"fi": lots(r[4]), "it": lots(r[13]), "dl": lots(r[22])} for r in t["data"] if is_security(r[0].strip())})
    time.sleep(TPEX_GAP)
    if not light:
        d = get_json("https://www.tpex.org.tw/www/zh-tw/margin/balance", {"date": sl, "response": "json"})
        t = table_of(d)
        if t:
            upsert_daily(date, {r[0].strip(): {"mb": num(r[6]), "ss": num(r[14])} for r in t["data"] if is_security(r[0].strip())})
        time.sleep(TPEX_GAP)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=380)
    a = ap.parse_args()
    today = dt.date.today()
    dates = [(today - dt.timedelta(days=i)).isoformat() for i in range(1, a.days + 1)]
    dates = [d for d in dates if dt.date.fromisoformat(d).weekday() < 5]
    log("檢查", len(dates), "個平日")
    done = 0
    for d in dates:
        st = status(d)
        if st == "full":
            continue
        light = st == "light"
        try:
            if not twse_mi(d):
                log(d, "休市")
                continue
            twse_rest(d, light)
            tpex_day(d, light)
            done += 1
            log(d, "補齊" if light else "完成")
        except Exception as e:  # noqa: BLE001
            log("!!", d, e, "— 等 60 秒後繼續")
            time.sleep(60)
    log("回補結束，處理", done, "天")


if __name__ == "__main__":
    main()
