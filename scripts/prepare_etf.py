"""挑選今天要研究的 ETF，並整理「給 Claude 的提示詞＋官方數據資料包」（不呼叫 Claude、不花 token）。

輸出：
  work/etf_prompt.md   完整提示詞（ETF.md 的研究方式與格式＋資料包）
  work/etf_target.txt  報告應存放的路徑，例如 reports/2026-11-28-0056.md；今天沒有要做的就寫入空字串

挑選順序（etf_queue.txt 由上往下）：
  1. 還沒有任何報告的
  2. 全部都有報告時，最久沒更新、且上次報告已滿 90 天的（每季更新）
今天已寫過的不會再挑，所以同一天連跑兩次會得到兩檔不同的 ETF。

用法：
  python scripts/prepare_etf.py            # 自動挑
  python scripts/prepare_etf.py --code 0056
需先執行 build_site.py（會讀 site/data）。
"""
from __future__ import annotations

import argparse
import datetime as dt
import re

from common import ROOT, SITE, log, read_json
from prepare_analysis import last_report_dates

WORK = ROOT / "work"
TZ = dt.timezone(dt.timedelta(hours=8))
REFRESH_DAYS = 90


def queue() -> list[str]:
    q = ROOT / "etf_queue.txt"
    if not q.exists():
        return []
    return [c for c in (ln.split("#")[0].strip() for ln in q.read_text(encoding="utf-8").splitlines()) if c]


def pick(valid: set) -> tuple[str, str]:
    today = dt.datetime.now(TZ).date()
    done = last_report_dates()
    codes = [c for c in queue() if c in valid and done.get(c) != today.isoformat()]
    for c in codes:
        if c not in done:
            return c, "熱門清單中尚未研究"
    cutoff = (today - dt.timedelta(days=REFRESH_DAYS)).isoformat()
    old = [c for c in codes if done.get(c, "") <= cutoff]
    if old:
        c = min(old, key=lambda x: done.get(x, ""))
        return c, f"每季更新（上次 {done.get(c)}）"
    return "", ""


def f(v, d=2):
    return "–" if v is None else f"{v:,.{d}f}"


def pct_rank(vals: list, x: float) -> float:
    return sum(1 for v in vals if v <= x) / len(vals) * 100 if vals else 0


def packet(code: str, st: dict, d: dict) -> str:
    k = d["k"]
    closes = [x[4] for x in k]
    c = closes[-1]

    def ret(n, label):
        return f"- 報酬（不含息）{label}：{(c / closes[-1 - n] - 1) * 100:+.1f}%" if len(closes) > n else f"- 報酬（不含息）{label}：資料不足"

    def ma(n):
        return sum(closes[-n:]) / n if len(closes) >= n else None

    yr = closes[-250:]
    out = [f"# {st['name']}（{code}）官方數據資料包（來源：證交所／櫃買中心、集保結算所；資料日 {k[-1][0]}）",
           "注意：價格已自動還原分割／反分割（前後兩日收盤比為整數倍時視為分割）。報酬不含配息。",
           f"- 收盤 {f(c)}；MA20 {f(ma(20))}、MA60 {f(ma(60))}、MA120 {f(ma(120))}、MA240 {f(ma(240))}",
           f"- 近一年最高 {f(max(yr))}、最低 {f(min(yr))}；資料內（{k[0][0]} 起，{len(k)} 個交易日）最高 {f(max(closes))}、最低 {f(min(closes))}",
           ret(20, "1 個月"), ret(60, "3 個月"), ret(120, "半年"), ret(240, "1 年"),
           ret(len(closes) - 1, f"資料內全期（約 {len(closes) / 243:.1f} 年）")]
    if len(closes) >= 480:
        dev = [(closes[i] / (sum(closes[i - 239:i + 1]) / 240) - 1) * 100 for i in range(239, len(closes))][-490:]
        now = dev[-1]
        s = sorted(dev)
        q = lambda p: s[int((len(s) - 1) * p)]  # noqa: E731
        out.append(f"- 股價相對年線乖離：目前 {now:+.1f}%，近兩年乖離百分位 {pct_rank(dev, now):.0f}（20/50/80 百分位 {q(.2):.1f}/{q(.5):.1f}/{q(.8):.1f}%）")
    ye: dict[str, float] = {}
    for row in k:
        ye[row[0][:4]] = row[4]
    out.append("- 各年度最後收盤：" + "、".join(f"{y} {f(v)}" for y, v in ye.items()))
    vol20 = sum(x[5] for x in k[-20:]) / 20
    out.append(f"- 近 20 日平均成交 {f(vol20, 0)} 張（約 {vol20 * c / 1e5:,.1f} 億元／日）")
    ch = d.get("chip") or []
    if ch:
        last = ch[-20:]
        s = lambda i: sum((x[i] or 0) for x in last)  # noqa: E731
        out.append(f"- 近 20 日（{last[0][0]}～{last[-1][0]}）外資合計 {f(s(1), 0)} 張、投信 {f(s(2), 0)} 張、自營商 {f(s(3), 0)} 張（正＝買超）；"
                   f"融資餘額 {f(last[-1][4], 0)} 張")
        out.append("  ETF 的法人買賣超常包含造市與申購買回的避險部位，解讀時要小心，不宜單獨當方向訊號。")
    td = d.get("tdcc") or []
    if td:
        a, b = td[-1], td[0]
        out.append(f"- 集保受益人數 {f(a[1], 0)}（{a[0]}）；{b[0]} 為 {f(b[1], 0)}（資料內最早一週）")
        if len(td) >= 2:
            out.append(f"  前一週 {f(td[-2][1], 0)}；千張以上大戶持有 {f(a[16])}%")
    else:
        out.append("- 集保受益人數：網站資料沒有這檔，請上網查（投信官網或集保）")
    out.append("\n## 可自行計算的工具（只用官方資料，不花 token）")
    out.append("- 成分股加權本益比與 3 年歷史位置：把查到的持股權重存成 `work/holdings.csv`（每行「代號,權重%」，只列台股），"
               "執行 `python3 scripts/etf_pe.py work/holdings.csv`。會印出加權本益比（調和平均）、扣掉最大持股後的本益比、歷史百分位。")
    out.append("- 個股明細：`site/data/s/代號.json`（k＝K 線、val＝[日期, 本益比, 殖利率, 股價淨值比]）；全市場欄位：`site/data/index.json`。")
    return "\n".join(out)


def etf_sections() -> str:
    txt = (ROOT / "ETF.md").read_text(encoding="utf-8")
    m = re.search(r"(## 步驟二：研究.*?)(?=## 步驟四)", txt, re.S)
    return m.group(1).strip() if m else txt


PROMPT = """今天是 {date}。請研究 {name}（{code}），依下方方式寫一篇 ETF 報告，讓有一點點投資經驗的人看懂這檔 ETF 並能做自己的判斷。
只輸出報告本身（第一行就是 ---）。front matter 的 code 填 "{code}"、name 填 {name}、date 填 {date}、type 填 etf。

{sections}

{packet}
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--code", default="")
    a = ap.parse_args()
    index = read_json(SITE / "data" / "index.json")
    if not index:
        raise SystemExit("找不到 site/data/index.json，請先執行 build_site.py")
    valid = {r[0] for r in index["rows"]}
    code, why = (a.code, "手動指定") if a.code else pick(valid)
    WORK.mkdir(exist_ok=True)
    if not code:
        (WORK / "etf_target.txt").write_text("", encoding="utf-8")
        log("今天沒有要研究的 ETF（清單都已在 90 天內更新過）")
        return
    st = dict(zip(index["fields"], next(r for r in index["rows"] if r[0] == code)))
    d = read_json(SITE / "data" / "s" / f"{code}.json")
    today = dt.datetime.now(TZ).date().isoformat()
    prompt = PROMPT.format(date=today, code=code, name=st["name"], sections=etf_sections(), packet=packet(code, st, d))
    (WORK / "etf_prompt.md").write_text(prompt, encoding="utf-8")
    target = f"reports/{today}-{code}.md"
    (WORK / "etf_target.txt").write_text(target, encoding="utf-8")
    log(f"今日 ETF：{code} {st['name']}（{why}）→ {target}，提示詞 {len(prompt)} 字")


if __name__ == "__main__":
    main()
