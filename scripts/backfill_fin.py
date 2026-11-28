"""全市場月營收與季報回補：用公開資訊觀測站的「整月／整季彙總表」，每月、每季只要幾次請求。

  python scripts/backfill_fin.py --months 36 --quarters 12

寫入 data/revenue/YYYY-MM.json 與 data/eps/YYYYQn.json（格式與每日抓取相同，已存在的公司資料會被補上、不會刪除）。
季報為年度累計數（與證交所 OpenAPI 相同口徑）。
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import re
import time
import urllib.parse
import urllib.request

from common import _CTX, DATA, UA, is_stock_code, log, num, read_json, write_json

MOPS = "https://mopsov.twse.com.tw"
TAG = re.compile(r"<[^>]+>")


def fetch(url: str, data: dict | None = None, enc: str = "utf-8") -> str:
    body = urllib.parse.urlencode(data).encode() if data else None
    for i in range(4):
        try:
            req = urllib.request.Request(url, data=body, headers={"User-Agent": UA})
            return urllib.request.urlopen(req, timeout=90, context=_CTX).read().decode(enc, "replace")
        except Exception as e:  # noqa: BLE001
            log("  重試", i + 1, e)
            time.sleep(10 * (i + 1))
    raise RuntimeError(f"抓不到 {url}")


def cells(row_html: str) -> list[str]:
    return [html.unescape(TAG.sub("", c)).strip().replace("\xa0", "") for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row_html, re.S)]


# ---------------------------------------------------------------- 月營收
def revenue_month(y: int, m: int) -> dict:
    out = {}
    for mkt in ("sii", "otc"):
        t = fetch(f"{MOPS}/nas/t21/{mkt}/t21sc03_{y - 1911}_{m}_0.html", enc="big5")
        for row in re.findall(r"<tr[^>]*>(.*?)</tr>", t, re.S):
            c = cells(row)
            # 公司代號 公司名稱 當月營收 上月營收 去年當月營收 上月比較% 去年同月% 當月累計 去年累計 前期比較% 備註
            # 百分比欄位在部分月份表格會缺一欄，改用金額自行計算，避免欄位錯位
            if len(c) >= 9 and is_stock_code(c[0]) and num(c[2]) is not None:
                rev, prev, ly = num(c[2]), num(c[3]), num(c[4])
                nums = [num(x) for x in c[5:]]
                big = [x for x in nums if x is not None and abs(x) > 1000]  # 累計營收、去年累計營收
                pct = lambda a, b: round((a / b - 1) * 100, 2) if a is not None and b else None  # noqa: E731
                out[c[0]] = [rev, pct(rev, prev), pct(rev, ly), pct(big[0], big[1]) if len(big) >= 2 else None]
        time.sleep(3)
    return out


# ---------------------------------------------------------------- 季報（綜合損益彙總表）
def pick(header: list[str], *keys) -> int | None:
    for k in keys:
        for i, h in enumerate(header):
            if k in h:
                return i
    return None


def eps_quarter(y: int, q: int) -> dict:
    out = {}
    for mkt in ("sii", "otc"):
        t = fetch(f"{MOPS}/mops/web/ajax_t163sb04", {"encodeURIComponent": 1, "step": 1, "firstin": 1, "off": 1,
                                                    "isQuery": "Y", "TYPEK": mkt, "year": str(y - 1911), "season": f"0{q}"})
        for table in re.findall(r"<table[^>]*class='hasBorder'[^>]*>(.*?)</table>", t, re.S):
            rows = re.findall(r"<tr[^>]*>(.*?)</tr>", table, re.S)
            if not rows:
                continue
            header = cells(rows[0])
            i_eps = pick(header, "基本每股盈餘")
            i_rev = pick(header, "營業收入", "收益", "收入")
            i_op = pick(header, "營業利益")
            i_ni = pick(header, "本期淨利", "本期稅後淨利", "淨利（淨損）")
            if i_eps is None:
                continue
            for row in rows[1:]:
                c = cells(row)
                if len(c) > i_eps and is_stock_code(c[0]):
                    g = lambda i: num(c[i]) if i is not None and i < len(c) else None  # noqa: E731
                    out[c[0]] = [g(i_eps), g(i_rev), g(i_op), g(i_ni)]
        time.sleep(4)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--months", type=int, default=36)
    ap.add_argument("--quarters", type=int, default=12)
    a = ap.parse_args()
    today = dt.date.today()

    y, m = today.year, today.month
    for _ in range(a.months):
        m -= 1
        if m == 0:
            y, m = y - 1, 12
        path = DATA / "revenue" / f"{y:04d}-{m:02d}.json"
        cur = read_json(path, {})
        if len(cur) > 1500:
            continue
        try:
            rows = revenue_month(y, m)
        except Exception as e:  # noqa: BLE001
            log("!! 月營收", y, m, e)
            continue
        for k, v in rows.items():
            cur.setdefault(k, v)
        write_json(path, cur)
        log("月營收", f"{y}-{m:02d}", len(rows), "家")

    # 季報公布期限：Q1 5/15、Q2 8/14、Q3 11/14、Q4 隔年 3/31
    qy, qq = today.year, (today.month - 1) // 3 + 1
    for _ in range(a.quarters + 1):
        qq -= 1
        if qq == 0:
            qy, qq = qy - 1, 4
        path = DATA / "eps" / f"{qy}Q{qq}.json"
        cur = read_json(path, {})
        if len(cur) > 1500:
            continue
        try:
            rows = eps_quarter(qy, qq)
        except Exception as e:  # noqa: BLE001
            log("!! 季報", qy, qq, e)
            continue
        if not rows:
            log("季報", f"{qy}Q{qq}", "尚未公布")
            continue
        for k, v in rows.items():
            cur.setdefault(k, v)
        write_json(path, cur)
        log("季報", f"{qy}Q{qq}", len(rows), "家")


if __name__ == "__main__":
    main()
