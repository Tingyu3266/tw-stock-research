"""用 ETF 成分股權重算「加權本益比」與歷史位置（只用網站官方資料，不花 token）。

  python scripts/etf_pe.py work/holdings.csv

holdings.csv 每行「代號,權重%」或「代號,名稱,權重%」（從投信官網或公開說明書查到的持股權重，例如 2330,59.81）。
非台股（海外股票、現金、期貨）不用列；輸出會說明涵蓋了多少權重。

算法：加權本益比用調和平均 = Σw / Σ(w/PE)；虧損或沒有本益比的成分股不計入並列出。
歷史位置用「今天的權重」套回過去每天的本益比（有贏家偏誤，報告要寫出這個限制）。
"""
from __future__ import annotations

import csv
import sys

from common import SITE, read_json


def pct(sorted_vals: list, p: float) -> float:
    i = (len(sorted_vals) - 1) * p
    lo = int(i)
    hi = min(lo + 1, len(sorted_vals) - 1)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (i - lo)


def weighted(w: dict, pe: dict) -> tuple[float | None, float]:
    num = den = 0.0
    for c, x in w.items():
        v = pe.get(c)
        if v and v > 0:
            num += x
            den += x / v
    return (num / den if den else None), num


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "work/holdings.csv"
    w: dict[str, float] = {}
    for row in csv.reader(open(path, encoding="utf-8-sig")):
        if len(row) < 2 or not row[0].strip() or row[0].startswith("#"):
            continue
        for x in row[1:]:  # 代號後第一個數字欄位當權重（容許中間夾公司名稱）
            try:
                w[row[0].strip()] = float(x.replace("%", ""))
                break
            except ValueError:
                continue
    if not w:
        raise SystemExit("holdings.csv 沒有資料")
    total = sum(w.values())
    vals: dict[str, dict[str, float]] = {}  # 日期 → {代號: PE}
    dys: dict[str, float] = {}
    missing = []
    for c in w:
        d = read_json(SITE / "data" / "s" / f"{c}.json")
        if not d or not d.get("val"):
            missing.append(c)
            continue
        for row in d["val"][-750:]:
            vals.setdefault(row[0], {})[c] = row[1]
        last = d["val"][-1]
        if last[2] is not None:
            dys[c] = last[2]
    dates = sorted(vals)
    if not dates:
        raise SystemExit("找不到任何成分股的本益比資料")
    today = dates[-1]
    now, cov = weighted(w, vals[today])
    top = max(w, key=w.get)
    ex, _ = weighted({c: x for c, x in w.items() if c != top}, vals[today])
    no_pe = [c for c in w if c not in missing and not (vals[today].get(c) or 0) > 0]

    hist = []
    for d in dates:
        v, c = weighted(w, vals[d])
        if v and c >= cov * 0.9:  # 涵蓋權重不足的日子（成分股當時未上市等）不計
            hist.append((d, v))
    s = sorted(v for _, v in hist)
    rank = sum(1 for v in s if v <= (now or 0)) / len(s) * 100 if s else 0
    lo = min(hist, key=lambda x: x[1])
    hi = max(hist, key=lambda x: x[1])
    dy = sum(w[c] * dys[c] for c in dys) / sum(w[c] for c in dys) if dys else None

    print(f"資料日 {today}；輸入權重合計 {total:.2f}%，有正本益比的成分股權重 {cov:.2f}%")
    print(f"加權本益比（調和平均）：{now:.2f} 倍")
    print(f"扣掉最大持股 {top}（{w[top]:.2f}%）後：{ex:.2f} 倍" if ex else f"扣掉 {top} 後無法計算")
    if dy is not None:
        print(f"成分股加權殖利率（依個股殖利率，非 ETF 實際配息）：{dy:.2f}%")
    print(f"歷史（{hist[0][0]}～{hist[-1][0]}，{len(hist)} 個交易日，用今天權重回推）：")
    print(f"  最低 {lo[1]:.2f}（{lo[0]}）、第 10 百分位 {pct(s, .1):.2f}、第 20 百分位 {pct(s, .2):.2f}、"
          f"中位數 {pct(s, .5):.2f}、第 80 百分位 {pct(s, .8):.2f}、最高 {hi[1]:.2f}（{hi[0]}）")
    print(f"  目前約在第 {rank:.0f} 百分位")
    if missing:
        print("網站沒有資料的代號（可能是海外股票或代號錯誤）：", ", ".join(missing))
    if no_pe:
        print("虧損或無本益比、未計入的成分股：", ", ".join(no_pe))


if __name__ == "__main__":
    main()
