"""挑選今天要分析的公司，並把該公司的數據整理成一份「給 Claude 的提示詞＋資料包」。

不呼叫 Claude、不花 token。輸出：
  work/analysis_prompt.md   完整提示詞（含資料），直接交給 Claude
  work/analysis_target.txt  報告應存放的路徑，例如 reports/2026-11-27-2330.md

挑選順序：
  1. analysis_queue.txt 裡由上而下第一個「近 60 天沒寫過」的代號（你想指定時就編這個檔）
  2. groups.json 自訂分組裡，最久沒分析的公司
  3. 全市場成交量前 300 大裡，從沒分析過、成交量最大的公司

用法：
  python scripts/prepare_analysis.py            # 自動挑
  python scripts/prepare_analysis.py --code 2330
需先執行 build_site.py（會讀 site/data）。
"""
from __future__ import annotations

import argparse
import datetime as dt
import re

from common import ROOT, SITE, log, read_json

WORK = ROOT / "work"
TZ = dt.timezone(dt.timedelta(hours=8))


def last_report_dates() -> dict[str, str]:
    out: dict[str, str] = {}
    for p in (ROOT / "reports").glob("*.md"):
        m = re.match(r"(\d{4}-\d{2}-\d{2})-(\d{4})", p.stem)
        if m:
            d, c = m.groups()
            out[c] = max(out.get(c, ""), d)
    return out


def pick(index: dict) -> tuple[str, str]:
    today = dt.datetime.now(TZ).date()
    done = last_report_dates()
    valid = {r[0] for r in index["rows"]}
    cutoff = (today - dt.timedelta(days=60)).isoformat()

    q = ROOT / "analysis_queue.txt"
    if q.exists():
        queue = [c for c in (ln.split("#")[0].strip() for ln in q.read_text(encoding="utf-8").splitlines()) if c in valid]
        for c in queue:
            if c not in done:
                return c, "研究清單中尚未研究"
        if queue:
            c = min(queue, key=lambda x: done.get(x, ""))
            return c, f"研究清單已全部完成，更新最久未更新的公司（上次 {done.get(c)}）"

    groups = read_json(ROOT / "groups.json", {}).get("groups", [])
    codes = [c for g in groups for c in g.get("codes", []) if c in valid]
    if codes:
        c = min(dict.fromkeys(codes), key=lambda x: done.get(x, ""))
        if done.get(c, "") < cutoff:
            return c, "自訂分組中最久沒分析"

    f = index["fields"]
    iv, ic = f.index("v"), f.index("code")
    rows = sorted((r for r in index["rows"] if r[iv]), key=lambda r: r[iv], reverse=True)[:300]
    for r in rows:
        if r[ic] not in done:
            return r[ic], "成交量大且從未分析"
    return min(valid, key=lambda x: done.get(x, "")), "全市場最久沒分析"


def fmt(v, d=2):
    if v is None:
        return "–"
    if isinstance(v, (int, float)):
        return f"{v:,.{d}f}"
    return str(v)


def table(head, rows):
    out = ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
    out += ["| " + " | ".join(rows_) + " |" for rows_ in rows]
    return "\n".join(out)


def build_packet(code: str, st: dict, d: dict) -> str:
    info = d["info"]
    k = d["k"]
    closes = [x[4] for x in k]

    def ret(n):
        return f"{(closes[-1] / closes[-1 - n] - 1) * 100:+.1f}%" if len(closes) > n else "–"

    def ma(n):
        return fmt(sum(closes[-n:]) / n) if len(closes) >= n else "–"

    yr = closes[-250:]
    parts = [
        f"## 基本資料\n- {info['n']}（{code}），{info['full']}，{info['mkt']}・{info['ind']}",
        f"- 董事長：{info.get('chair') or '–'}；總經理：{info.get('gm') or '–'}；上市櫃日期：{info.get('listed') or '–'}",
        f"- 實收資本額：{fmt((info.get('cap') or 0) / 1e8)} 億元",
        "## 股價與評價（資料日 " + str(st.get("date")) + "）",
        f"- 收盤 {fmt(st.get('c'))}，當日 {fmt(st.get('pct'))}%，成交 {fmt(st.get('v'), 0)} 張",
        f"- 報酬：5日 {ret(5)}、20日 {ret(20)}、60日 {ret(60)}、240日 {ret(240)}",
        f"- 均線：MA5 {ma(5)}、MA20 {ma(20)}、MA60 {ma(60)}、MA240 {ma(240)}",
        f"- 近一年（資料內）最高 {fmt(max(yr)) if yr else '–'}、最低 {fmt(min(yr)) if yr else '–'}；K線資料共 {len(k)} 天",
        f"- 本益比 {fmt(st.get('pe'))}、股價淨值比 {fmt(st.get('pb'))}、殖利率 {fmt(st.get('dy'))}%",
    ]
    if d["chip"]:
        parts.append("## 三大法人與融資券（單位：張，近 20 日）\n" + table(
            ["日期", "外資", "投信", "自營商", "融資餘額", "融券餘額"],
            [[x[0]] + [fmt(v, 0) for v in x[1:]] for x in d["chip"][-20:]]))
        parts.append(f"- 外資 5/20 日合計 {fmt(st.get('f5'), 0)} / {fmt(st.get('f20'), 0)} 張，連續 {st.get('fS')} 天（正＝買超）；"
                     f"投信 5/20 日 {fmt(st.get('t5'), 0)} / {fmt(st.get('t20'), 0)} 張，連續 {st.get('tS')} 天；融資 5 日增減 {fmt(st.get('mb5'), 0)} 張")
    if d["tdcc"]:
        parts.append("## 集保股權分散（每週）\n" + table(
            ["資料日", "股東人數", "千張以上%", "400張以上%", "5張以下%"],
            [[x[0], fmt(x[1], 0), fmt(x[16]), fmt(sum(x[13:17])), fmt(x[2] + x[3])] for x in d["tdcc"][-6:]]))
    if d["rev"]:
        parts.append("## 月營收（億元）\n" + table(
            ["年月", "營收", "月增%", "年增%", "累計年增%"],
            [[x[0], fmt((x[1] or 0) / 1e5), fmt(x[2], 1), fmt(x[3], 1), fmt(x[4], 1)] for x in d["rev"][-13:]]))
    if d["eps"]:
        parts.append("## 每季 EPS（元）\n" + table(
            ["季度", "單季EPS", "年度累計EPS"], [[x[0], fmt(x[1]), fmt(x[2])] for x in d["eps"][-8:]]))
    if d["div"]:
        parts.append("## 股利（元/股）\n" + table(
            ["股利年度", "期別", "現金", "股票"], [[str(x[0]), str(x[1]), fmt(x[2], 2), fmt(x[3], 2)] for x in d["div"][:6]]))
    return "\n\n".join(parts)


PROMPT = """你是台股研究員。今天是 {date}。請根據下方「資料包」分析 {name}（{code}）。

只輸出一份 Markdown，第一段必須是以下 front matter（三條減號包住），前後不要加任何說明文字：

---
code: "{code}"
name: {name}
date: {date}
title: 一句話標題（20 字內）
rating: 看多 或 中性 或 看空（三選一，只寫兩個字）
tags: [標籤1, 標籤2, 標籤3]
summary: 兩句話摘要
---

接著依序寫這些段落：
## 公司概況
## 近期營運與財務
## 籌碼觀察
## 技術面
## 產業與競爭
## 風險
## 結論

規則：
- 使用繁體中文，約 800～1500 字。
- 數字只能引用資料包裡的數據，並註明期間；資料包沒有的數字不要編造，需要時寫「待確認」。
- 產業與競爭可用你的一般知識，但不要寫具體的最新新聞或你無法確定的事件。
- 最後一行固定寫：「本文由 AI 依公開資料自動產生，為個人研究紀錄，非投資建議。」

# 資料包（來源：證交所、櫃買中心、集保結算所公開資料）

{packet}
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--code", default="")
    a = ap.parse_args()
    index = read_json(SITE / "data" / "index.json")
    if not index:
        raise SystemExit("找不到 site/data/index.json，請先執行 build_site.py")
    code, why = (a.code, "手動指定") if a.code else pick(index)
    st = dict(zip(index["fields"], next(r for r in index["rows"] if r[0] == code)))
    d = read_json(SITE / "data" / "s" / f"{code}.json")
    today = dt.datetime.now(TZ).date().isoformat()
    prompt = PROMPT.format(date=today, code=code, name=st["name"], packet=build_packet(code, st, d))
    WORK.mkdir(exist_ok=True)
    (WORK / "analysis_prompt.md").write_text(prompt, encoding="utf-8")
    target = f"reports/{today}-{code}.md"
    (WORK / "analysis_target.txt").write_text(target, encoding="utf-8")
    log(f"今日分析：{code} {st['name']}（{why}）→ {target}，提示詞 {len(prompt)} 字")


if __name__ == "__main__":
    main()
