"""把 data/ 原始快照 + reports/ 分析報告 整理成網站用的 JSON（輸出到 site/data、site/reports）。

  python scripts/build_site.py

輸出：
  site/data/index.json     全市場篩選表（每檔一列的最新指標）
  site/data/s/{代號}.json   公司頁明細（K線、籌碼、營收、EPS、股利、集保）
  site/data/reports.json   報告列表（含全文，供搜尋）
  site/data/groups.json    自訂分組
  site/data/meta.json      更新時間
  site/reports/*.md        報告原文
"""
from __future__ import annotations

import datetime as dt
import re
import shutil

from common import DATA, ROOT, SITE, log, read_json, write_json
from fetch_daily import DAILY_FIELDS, IDX

KEEP_DAYS = 500  # 公司頁保留的交易日數


# ---------------------------------------------------------------- 報告
def parse_front_matter(txt: str):
    m = re.match(r"^﻿?---\s*\n(.*?)\n---\s*\n?(.*)$", txt, re.S)
    if not m:
        return {}, txt
    meta = {}
    for line in m.group(1).splitlines():
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        k, v = k.strip(), v.strip()
        if v.startswith("[") and v.endswith("]"):
            v = [x.strip().strip("\"'") for x in v[1:-1].split(",") if x.strip()]
        else:
            v = v.strip("\"'")
        meta[k] = v
    return meta, m.group(2)


def md_to_text(md: str) -> str:
    t = re.sub(r"```.*?```", " ", md, flags=re.S)
    t = re.sub(r"[#>*_`|\-]+", " ", t)
    t = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", t)
    return re.sub(r"\s+", " ", t).strip()


def build_reports(companies):
    out_dir = SITE / "reports"
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)
    reports = []
    for p in sorted((ROOT / "reports").glob("*.md")):
        txt = p.read_text(encoding="utf-8")
        meta, body = parse_front_matter(txt)
        code = str(meta.get("code", "")).strip()
        if not code:
            m = re.search(r"(\d{4})", p.stem)
            code = m.group(1) if m else ""
        date = str(meta.get("date", "")) or p.stem[:10]
        rid = p.stem
        shutil.copy(p, out_dir / p.name)
        tags = meta.get("tags", [])
        if isinstance(tags, str):
            tags = [t.strip() for t in re.split(r"[,，、]", tags) if t.strip()]
        reports.append({
            "id": rid, "code": code,
            "name": meta.get("name") or companies.get(code, {}).get("n", ""),
            "date": date, "title": meta.get("title", rid), "rating": meta.get("rating", ""),
            "tags": tags, "summary": meta.get("summary", ""), "text": md_to_text(body)[:20000],
        })
    reports.sort(key=lambda r: (r["date"], r["id"]), reverse=True)
    write_json(SITE / "data" / "reports.json", reports)
    log("報告", len(reports), "篇")
    return reports


# ---------------------------------------------------------------- 股價 / 籌碼時間序列
def load_series(codes):
    series: dict[str, dict[str, list]] = {c: {} for c in codes}
    # 先放回補資料，再用每日快照覆蓋（官方資料優先）
    for p in (DATA / "backfill").glob("*.json"):
        bf = read_json(p, {})
        if p.stem in series:
            for date, arr in bf.get("daily", {}).items():
                series[p.stem][date] = list(arr)
    for p in sorted((DATA / "daily").glob("*.json")):
        snap = read_json(p, {})
        date = snap["date"]
        for code, arr in snap["rows"].items():
            if code not in series:
                continue
            cur = series[code].get(date) or [None] * len(DAILY_FIELDS)
            for i, v in enumerate(arr):
                if v is not None:
                    cur[i] = v
            series[code][date] = cur
    return series


def streak(vals):
    """連續買超(正)/賣超(負)天數，從最新一天往回算"""
    n = 0
    for v in reversed(vals):
        if v is None or v == 0:
            break
        if n == 0:
            n = 1 if v > 0 else -1
        elif (v > 0) == (n > 0):
            n += 1 if n > 0 else -1
        else:
            break
    return n


def ssum(vals, k):
    xs = [v for v in vals[-k:] if v is not None]
    return round(sum(xs)) if xs else None


# ---------------------------------------------------------------- EPS：官方為年度累計，轉單季
def build_eps(code, official_by_q, backfill_eps):
    single, cum = {}, {}
    for q, v in backfill_eps.items():
        single[q] = v[0]
    for q, v in official_by_q.items():
        if v and v[0] is not None:
            cum[q] = v[0]
    for q in sorted(cum):
        y, n = int(q[:4]), int(q[-1])
        if n == 1:
            single[q] = cum[q]
        elif f"{y}Q{n - 1}" in cum:
            single[q] = round(cum[q] - cum[f"{y}Q{n - 1}"], 2)
        elif all(f"{y}Q{i}" in single for i in range(1, n)):
            single[q] = round(cum[q] - sum(single[f"{y}Q{i}"] for i in range(1, n)), 2)
    rows = []
    for q in sorted(set(single) | set(cum)):
        y, n = int(q[:4]), int(q[-1])
        c = cum.get(q)
        if c is None and all(f"{y}Q{i}" in single for i in range(1, n + 1)):
            c = round(sum(single[f"{y}Q{i}"] for i in range(1, n + 1)), 2)
        o = official_by_q.get(q) or [None] * 4
        rows.append([q, single.get(q), c, o[1], o[2], o[3]])
    return rows


def main():
    companies = read_json(DATA / "companies.json", {})
    codes = sorted(companies)
    reports = build_reports(companies)
    rep_by_code: dict[str, list] = {}
    for r in reports:
        rep_by_code.setdefault(r["code"], []).append(r)

    series = load_series(codes)

    rev_months = sorted(p.stem for p in (DATA / "revenue").glob("*.json"))
    revenue = {ym: read_json(DATA / "revenue" / f"{ym}.json", {}) for ym in rev_months}
    eps_qs = sorted(p.stem for p in (DATA / "eps").glob("*.json"))
    eps_all = {q: read_json(DATA / "eps" / f"{q}.json", {}) for q in eps_qs}
    dividends = read_json(DATA / "dividends.json", {})
    tdcc_dates = sorted(p.stem for p in (DATA / "tdcc").glob("*.json"))[-60:]
    tdcc = {d: read_json(DATA / "tdcc" / f"{d}.json", {}) for d in tdcc_dates}

    s_dir = SITE / "data" / "s"
    if s_dir.exists():
        shutil.rmtree(s_dir)
    s_dir.mkdir(parents=True)

    index_fields = ["code", "name", "mkt", "ind", "date", "c", "chg", "pct", "v", "r20", "ma20", "ma60",
                    "pe", "dy", "pb", "f1", "f5", "f20", "fS", "t5", "t20", "tS", "d5", "mb", "mb5", "ss",
                    "revYm", "rev", "revMoM", "revYoY", "revCum", "epsQ", "eps", "eps4", "cash",
                    "b1000", "b1000w", "b400", "holders", "rDate", "rating", "nRep"]
    index_rows = []
    latest_date = ""

    for code in codes:
        info = companies[code]
        ser = series[code]
        dates = sorted(ser)[-KEEP_DAYS:]
        rows = [ser[d] for d in dates]
        bf = read_json(DATA / "backfill" / f"{code}.json", {}) or {}

        k = [[d] + [r[IDX[f]] for f in ("o", "h", "l", "c", "v")] for d, r in zip(dates, rows) if r[IDX["c"]]]
        chip = [[d] + [r[IDX[f]] for f in ("fi", "it", "dl", "mb", "ss")] for d, r in zip(dates, rows)
                if any(r[IDX[f]] is not None for f in ("fi", "it", "dl", "mb"))]
        val = [[d, r[IDX["pe"]], r[IDX["dy"]], r[IDX["pb"]]] for d, r in zip(dates, rows) if r[IDX["pb"]] is not None]

        rev = {}
        for ym, v in bf.get("revenue", {}).items():
            rev[ym] = v
        for ym in rev_months:
            if code in revenue[ym]:
                rev[ym] = revenue[ym][code]
        rev_rows = [[ym] + v for ym, v in sorted(rev.items())]

        eps_rows = build_eps(code, {q: eps_all[q].get(code) for q in eps_qs if code in eps_all[q]}, bf.get("eps", {}))
        div = dividends.get(code, [])
        td = [[d] + tdcc[d][code] for d in tdcc_dates if code in tdcc[d]]

        write_json(s_dir / f"{code}.json", {
            "code": code, "info": info, "k": k, "chip": chip, "val": val, "rev": rev_rows,
            "eps": eps_rows, "div": div, "tdcc": td,
            "reports": [r["id"] for r in rep_by_code.get(code, [])],
        })

        # ---- 篩選表指標
        closes = [x[4] for x in k]
        last = rows[-1] if rows else [None] * len(DAILY_FIELDS)
        lk = k[-1] if k else None
        c = lk[4] if lk else None
        chg = None
        if lk:
            lr = ser[lk[0]]
            chg = lr[IDX["chg"]]
        pct = round(chg / (c - chg) * 100, 2) if (c and chg is not None and c != chg) else None
        ma = lambda n: round(sum(closes[-n:]) / n, 2) if len(closes) >= n else None  # noqa: E731
        r20 = round((closes[-1] / closes[-21] - 1) * 100, 2) if len(closes) >= 21 else None
        fi = [x[1] for x in chip]
        it = [x[2] for x in chip]
        dl = [x[3] for x in chip]
        mbs = [x[4] for x in chip if x[4] is not None]
        lv = val[-1] if val else [None] * 4
        lrev = rev_rows[-1] if rev_rows else [None] * 5
        leps = next((e for e in reversed(eps_rows) if e[1] is not None or e[2] is not None), None)
        singles = [e[1] for e in eps_rows if e[1] is not None]
        eps4 = round(sum(singles[-4:]), 2) if len(singles) >= 4 else None
        cash = div[0][2] if div else None
        b1000 = b1000w = b400 = holders = None
        if td:
            b1000 = td[-1][16]
            b400 = round(sum(td[-1][13:17]), 2)
            holders = td[-1][1]
            if len(td) >= 2:
                b1000w = round(td[-1][16] - td[-2][16], 2)
        reps = rep_by_code.get(code, [])
        if lk and lk[0] > latest_date:
            latest_date = lk[0]
        index_rows.append([
            code, info["n"], info["mkt"], info["ind"], lk[0] if lk else None, c, chg, pct, lk[5] if lk else None,
            r20, ma(20), ma(60), lv[1], lv[2], lv[3],
            fi[-1] if fi else None, ssum(fi, 5), ssum(fi, 20), streak(fi), ssum(it, 5), ssum(it, 20), streak(it), ssum(dl, 5),
            mbs[-1] if mbs else None, round(mbs[-1] - mbs[-6]) if len(mbs) >= 6 else None, last[IDX["ss"]],
            lrev[0], lrev[1], lrev[2], lrev[3], lrev[4],
            leps[0] if leps else None, (leps[2] if leps[2] is not None else leps[1]) if leps else None, eps4, cash,
            b1000, b1000w, b400, holders,
            reps[0]["date"] if reps else None, reps[0]["rating"] if reps else None, len(reps),
        ])

    write_json(SITE / "data" / "index.json", {"fields": index_fields, "rows": index_rows})
    groups = read_json(ROOT / "groups.json", {"groups": []})
    write_json(SITE / "data" / "groups.json", groups.get("groups", []))
    write_json(SITE / "data" / "meta.json", {
        "built": dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).strftime("%Y-%m-%d %H:%M"),
        "latest": latest_date, "stocks": len(index_rows), "reports": len(reports),
        "tdcc": tdcc_dates[-1] if tdcc_dates else None, "revenue": rev_months[-1] if rev_months else None,
    })
    log("網站資料完成：", len(index_rows), "檔股票，最新交易日", latest_date)


if __name__ == "__main__":
    main()
