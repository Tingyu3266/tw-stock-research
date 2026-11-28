/* 公司頁改版（v2 樣板）：依「公司頁改版整合規格 v1.0」計算首屏 5 格、估值三把尺、風險旗標等。
 * 報告才有的欄位（fin、mix、consensus、scenarios、watch、peers）目前報告尚未提供，
 * 2454 以 DEMO 物件呈現，畫面上一律標示「樣板示意資料」。
 * 對外只暴露 window.Revamp，由 app.js 的公司頁呼叫。
 */
"use strict";
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isNum = (v) => typeof v === "number" && isFinite(v);
  const fmt = (v, d = 2) => (isNum(v) ? v.toLocaleString("zh-TW", { minimumFractionDigits: d, maximumFractionDigits: d }) : "–");
  const fint = (v) => fmt(v, 0);
  const sgn = (v, d = 1, suf = "") => (isNum(v) ? `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt(Math.abs(v), d)}${suf}` : "–");
  const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  const median = (a) => { const s = a.filter(isNum).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const quant = (a, p) => { const s = a.slice().sort((x, y) => x - y); const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.min(lo + 1, s.length - 1); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
  const stdev = (a) => { const m = avg(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
  const md = (iso) => { const [, m, d] = iso.split("-"); return `${+m}/${+d}`; };
  const ymd = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
  async function getJ(u) { const r = await fetch(u, { cache: "no-cache" }); if (!r.ok) throw new Error(u); return r.json(); }

  const DEMO_TAG = `<span class="demo-tag">樣板示意資料</span>`;
  const REP_TAG = (t = "取自報告文字") => `<span class="src-rep">${esc(t)}</span>`;
  const demoBox = (inner) => `<div class="demo">${DEMO_TAG}${inner}</div>`;

  /* ---------------- 報告 data 區塊（規格 4.2）的示意版：只有 2454 有。_rep＝數字可在報告文字中找到 */
  const DEMOS = {
    2454: {
      schema: 1, asOf: "2026-11-26",
      fin: {
        source: "公司 2026Q3 財報／法說會簡報",
        rows: [
          { period: "2025Q4", grossMargin: 47.1, opMargin: 14.6, roe: 22.0, debtRatio: 45.0, ocf: 260, capex: 25 },
          { period: "2026Q1", grossMargin: 47.6, opMargin: 15.2, roe: 21.0, debtRatio: 46.0, ocf: 190, capex: 30 },
          { period: "2026Q2", grossMargin: 46.9, opMargin: 15.0, roe: 20.0, debtRatio: 47.0, ocf: 210, capex: 28 },
          { period: "2026Q3", grossMargin: 46.3, opMargin: 16.1, roe: null, debtRatio: null, ocf: null, capex: null, _rep: true },
        ],
      },
      mix: {
        period: "2026Q3", basis: "產品線", source: "2026/10/30 法說會（經濟日報、鉅亨網報導）",
        items: [{ name: "智慧邊緣平台（含 AI ASIC）", pct: 58 }, { name: "手機", pct: 37 }, { name: "電源管理 IC", pct: 5 }],
        yoy: [{ name: "智慧邊緣平台", pct: 63 }, { name: "電源管理 IC", pct: 18 }, { name: "手機", pct: -17 }],
      },
      consensus: { date: "2026-11-02", source: "今周刊", eps: [{ year: 2027, low: 146.97, high: 186.75, n: 3 }], target: { low: 5500, high: 7300 } },
      scenarios: [
        { name: "保守", eps: 146.97, epsYear: 2027, pe: 22, basis: "三家外資 2027 年 EPS 預估中最低的一家 × 外資常用本益比打折", _rep: true },
        { name: "基準", eps: 160, epsYear: 2027, pe: 24, basis: "三家外資預估的中間值附近 × 折價本益比（示意數字）" },
        { name: "樂觀", eps: 186.75, epsYear: 2027, pe: 25, basis: "三家外資 2027 年 EPS 預估中最高的一家 × 外資常用本益比下緣", _rep: true },
      ],
      watch: [
        { metric: "revYoY", op: "<", value: 0, months: 2, meaning: "月營收連 2 個月年減，成長假設需要重新檢查" },
        { metric: "event", date: "2027-01-10", event: "12 月營收", meaning: "看 AI ASIC 放量是否反映在營收" },
        { metric: "event", date: "2027-02-05", event: "第四季法說會（示意日期）", meaning: "看 2027 年 AI 加速器營收目標有無更新" },
      ],
      peers: { codes: ["2379", "3034", "3661"], note: "手機與 ASIC 晶片設計同業" },
      /* 以下為報告 Markdown 內文的重點（真實文字），正式版由報告段落提供 */
      chain: { at: 0, items: [["上游（IC 設計／矽智財）", "聯發科：設計晶片，不自己蓋晶圓廠"], ["中游（晶圓代工）", "台積電等，依設計圖製造晶片"], ["下游（封裝測試）", "封測廠完成封裝與測試，再出貨給手機、電視、網通、車用品牌與雲端業者"]] },
      plain: "它賣的是<b>手機、電視、網通、車用與 AI 伺服器的主控晶片</b>給<b>品牌廠與雲端業者</b>，靠<b>出售晶片（加上整套軟體與工程支援）</b>收錢；製造交給晶圓代工廠。",
      risks: [
        { t: "AI ASIC 執行風險", watch: "每季法說會的 AI 加速器營收是否接近 25 億美元／季；有無客戶延後或轉單的公告。" },
        { t: "手機市場疲弱", watch: "Counterpoint 每季市占（目前 31%）；手機業務年增率是否回正。" },
        { t: "毛利率稀釋與高評價", watch: "單季毛利率是否守在公司指引 43.5%～46.5%；營益率是否隨營收成長上升。" },
      ],
      invalid: [
        "收盤跌破年線（MA240，約 3,093 元）且一週內無法站回，代表長期趨勢轉弱，需要重新檢查原本的假設。",
        "2026 年第四季營收未達公司指引下緣 2,101 億元，或 AI 加速器季營收明顯低於約 25 億美元。",
        "第四季毛利率低於指引下緣 43.5%（45% − 1.5 個百分點）。",
        "月營收年增率連續轉負，或傳出主要 ASIC 客戶延後、轉單。",
      ],
      industry: [
        "AI ASIC：公司指出 2027 年可服務市場規模約 800 億美元，市占目標 15%～20%（2026/7/31 法說；10 月後媒體報導上修至約 20%）。",
        "手機 SoC：2026Q2 全球出貨市占約 31%，整體手機出貨受記憶體缺貨影響年減（Counterpoint）。",
      ],
      cycleNote: "手機需求仍在低檔（記憶體缺貨壓抑出貨），AI 資料中心需求處於擴張期。理由：手機業務 2026Q3 年減 17%，智慧邊緣平台年增 63%。",
    },
  };

  /* ================================================================== 計算 */
  const quarterKey = (q) => ({ y: +q.slice(0, 4), q: +q.slice(-1) });
  const qDeadline = (q) => { const { y, q: n } = quarterKey(q); return n === 4 ? `${y + 1}-03-31` : `${y}-${["", "05-15", "08-14", "11-14"][n]}`; };

  /* 單季：Q1 直接用累計；Q2～Q4 用本季累計 − 上季累計；缺上一季時用今年累計並標明 */
  function singleQ(eps, i) {
    const e = eps[i];
    if (!e || !isNum(e[3]) || !isNum(e[4])) return null;
    const { y, q } = quarterKey(e[0]);
    if (q === 1) return { period: e[0], rev: e[3], op: e[4], net: e[5], mode: "single" };
    const p = eps.find((x) => x[0] === `${y}Q${q - 1}`);
    if (p && isNum(p[3]) && isNum(p[4]) && isNum(p[5])) return { period: e[0], rev: e[3] - p[3], op: e[4] - p[4], net: e[5] - p[5], mode: "single" };
    return { period: e[0], rev: e[3], op: e[4], net: e[5], mode: "cum", label: `${y} 前 ${q} 季累計` };
  }

  function checkpoints(today, isFin, watch) {
    const t = new Date(today + "T00:00:00");
    const lim = new Date(t); lim.setDate(lim.getDate() + 92);
    const out = [];
    let y = t.getFullYear(), m = t.getMonth() + 1;
    if (t.getDate() > 10) { m++; if (m > 12) { m = 1; y++; } }
    for (let i = 0; i < 3; i++) {
      out.push({ date: `${y}-${String(m).padStart(2, "0")}-10`, event: `${m === 1 ? 12 : m - 1} 月營收`, kind: "legal", rev: true, within: true });
      m++; if (m > 12) { m = 1; y++; }
    }
    if (!isFin) {
      const y0 = t.getFullYear();
      [[`${y0}-03-31`, `${y0 - 1} 年報（第四季）`], [`${y0}-05-15`, `${y0} 第一季財報`], [`${y0}-08-14`, `${y0} 第二季財報`], [`${y0}-11-14`, `${y0} 第三季財報`], [`${y0 + 1}-03-31`, `${y0} 年報（第四季）`]]
        .forEach(([dt, ev]) => { const x = new Date(dt + "T00:00:00"); if (x >= t) out.push({ date: dt, event: ev, kind: "legal", within: x <= lim }); });
    }
    (watch || []).filter((w) => w.metric === "event" && w.date && w.date >= today).forEach((w) => {
      const same = out.findIndex((x) => x.kind === "legal" && x.date === w.date);
      if (same >= 0) out.splice(same, 1, { ...out[same], kind: "report", meaning: w.meaning, event: w.event });
      else out.push({ date: w.date, event: w.event, kind: "report", meaning: w.meaning, within: true });
    });
    out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === "report" ? -1 : 1));
    return out;
  }

  function compute(code, d, rows, tx, peerD, rep, demo) {
    const C = { code, d, demo, rows };
    const st = rows.find((r) => r.code === code);
    const k = d.k;
    if (!st || !k || !k.length) return null;
    C.st = st;
    const close = k[k.length - 1][4];
    C.close = close; C.date = k[k.length - 1][0];
    C.isFin = /金融|保險/.test(d.info.ind || "");

    /* 成長 */
    const yoy = (d.rev || []).filter((r) => isNum(r[3])).map((r) => ({ ym: r[0], v: r[3] }));
    C.yoy = yoy;
    const g = { n: yoy.length };
    if (yoy.length) g.latest = yoy[yoy.length - 1];
    if (yoy.length >= 3) {
      const l3 = yoy.slice(-3);
      g.avg3 = avg(l3.map((x) => x.v));
      g.hi3 = l3.reduce((a, b) => (b.v > a.v ? b : a)); g.lo3 = l3.reduce((a, b) => (b.v < a.v ? b : a));
      if (yoy.length >= 12) { g.base = avg(yoy.slice(-12).map((x) => x.v)); g.baseLabel = "近 12 個月平均"; g.baseFrom = yoy.slice(-12)[0].ym; }
      else if (yoy.length >= 6) { g.base = avg(yoy.slice(-6, -3).map((x) => x.v)); g.baseLabel = "前 3 個月平均（資料未滿 12 個月）"; g.baseFrom = yoy.slice(-6)[0].ym; }
      if (isNum(g.base)) {
        g.accel = g.avg3 - g.base;
        g.dir = g.accel >= 5 ? "up" : g.accel <= -5 ? "down" : "flat";
        if (g.dir === "up" && g.base < -20) g.dir = "rebound";
      }
    }
    C.g = g;

    /* EPS */
    const eps = d.eps || [];
    const eL = eps[eps.length - 1];
    if (eL) {
      const { y, q } = quarterKey(eL[0]);
      const ly = eps.find((x) => x[0] === `${y - 1}Q${q}`);
      const pv = eps[eps.length - 2];
      C.epsL = { q: eL[0], v: eL[1], ly: ly && ly[1], lyQ: ly && ly[0], yoy: ly && ly[1] > 0 ? (eL[1] / ly[1] - 1) * 100 : null, prev: pv && pv[1] };
      const last4 = eps.slice(-4).map((x) => x[1]), prev4 = eps.slice(-8, -4).map((x) => x[1]);
      C.eps4 = last4.length === 4 && last4.every(isNum) ? last4.reduce((a, b) => a + b, 0) : st.eps4;
      C.eps4Prev = prev4.length === 4 && prev4.every(isNum) ? prev4.reduce((a, b) => a + b, 0) : null;
      C.eps4Yoy = isNum(C.eps4) && C.eps4Prev > 0 ? (C.eps4 / C.eps4Prev - 1) * 100 : null;
    } else C.eps4 = st.eps4;

    /* 獲利品質 */
    const sq = singleQ(eps, eps.length - 1);
    if (sq && sq.rev > 0) {
      sq.opm = (sq.op / sq.rev) * 100;
      sq.npm = isNum(sq.net) ? (sq.net / sq.rev) * 100 : null;
      sq.ratio = sq.op > 0 && isNum(sq.net) ? sq.net / sq.op : null;
      if (sq.mode === "single") {
        const { y, q } = quarterKey(sq.period);
        const li = eps.findIndex((x) => x[0] === `${y - 1}Q${q}`);
        const ls = li >= 0 ? singleQ(eps, li) : null;
        if (ls && ls.mode === "single" && ls.rev > 0) sq.opmLy = (ls.op / ls.rev) * 100;
      }
      C.sq = sq;
    } else C.sq = null;
    C.epsCumN = eps.filter((x) => isNum(x[3])).length;
    const v = (d.val || []).length ? d.val[d.val.length - 1] : [C.date, st.pe, st.dy, st.pb];
    C.valNow = { pe: v[1], dy: v[2], pb: v[3] };
    C.roe = isNum(v[1]) && v[1] > 0 && isNum(v[3]) ? (v[3] / v[1]) * 100 : null;
    C.bvps = isNum(v[3]) && v[3] > 0 ? close / v[3] : null;

    /* 估值三把尺 */
    const V = (d.val || []).slice(-750);
    C.valDays = V.length; C.valYears = V.length / 252; C.valFrom = V[0] && V[0][0];
    const mk = (key, i, filt) => {
      const a = V.map((x) => x[i]).filter(filt);
      const r = { key, n: a.length, now: v[i] };
      if (a.length >= 250 && isNum(r.now)) { r.pct = (a.filter((x) => x <= r.now).length / a.length) * 100; r.p20 = quant(a, 0.2); r.p50 = quant(a, 0.5); r.p80 = quant(a, 0.8); }
      return r;
    };
    const R = { pe: mk("pe", 1, (x) => isNum(x) && x > 0), pb: mk("pb", 3, (x) => isNum(x) && x > 0), dy: mk("dy", 2, (x) => isNum(x)) };
    C.R = R;

    /* 景氣循環型 */
    const y24 = yoy.slice(-24).map((x) => x.v);
    const cyc = { n: y24.length };
    if (y24.length >= 12) { cyc.negN = y24.filter((x) => x < 0).length; cyc.negShare = (cyc.negN / y24.length) * 100; cyc.sd = stdev(y24); cyc.a = cyc.negShare >= 25 && cyc.sd >= 20; }
    const q12 = eps.slice(-12).map((x) => x[1]);
    cyc.b = q12.some((x, i) => i > 0 && q12[i - 1] > 0 && x < 0);
    cyc.is = !!(cyc.a || cyc.b);
    C.cyc = cyc;
    let main, why;
    if (!(C.eps4 > 0) || !(isNum(v[1]) && v[1] > 0)) { main = "pb"; why = "虧損型：近四季 EPS ≤ 0 或交易所本益比空白"; C.type = "loss"; }
    else if (C.isFin) { main = "pb"; why = "金融保險業"; C.type = "fin"; }
    else if (cyc.is) { main = "pb"; why = "景氣循環型"; C.type = "cyc"; }
    else { main = "pe"; why = "一般型：近四季獲利為正、非金融、未符合景氣循環條件"; C.type = "normal"; }
    C.main = main; C.mainWhy = why;
    C.divYears = [...new Set((d.div || []).filter((x) => x[2] > 0).map((x) => x[0]))];
    const yNow = +C.date.slice(0, 4);
    C.dyRuler = [yNow, yNow - 1, yNow - 2].every((y) => C.divYears.includes(y));

    /* 同業中位數 */
    const peerStat = (list) => ({
      n: list.length, pe: median(list.map((r) => r.pe).filter((x) => isNum(x) && x > 0)), peN: list.filter((r) => isNum(r.pe) && r.pe > 0).length,
      pb: median(list.map((r) => r.pb)), dy: median(list.map((r) => r.dy)), rev: median(list.map((r) => r.revYoY)), revN: list.filter((r) => isNum(r.revYoY)).length,
    });
    C.indPeers = peerStat(rows.filter((r) => r.ind === d.info.ind && r.code !== code && !/ETF|指數/.test(r.ind)));
    const plist = demo ? demo.peers.codes.map((c) => rows.find((r) => r.code === c)).filter(Boolean) : [];
    C.peerRows = plist.map((r) => {
      const pd = peerD[r.code]; let opm = null, opmLabel = "";
      if (pd) { const s = singleQ(pd.eps, pd.eps.length - 1); if (s && s.rev > 0) { opm = (s.op / s.rev) * 100; opmLabel = s.mode === "single" ? "單季" : "今年累計"; } }
      return { ...r, opm, opmLabel };
    });
    C.listPeers = peerStat(plist); C.listPeers.opm = median(C.peerRows.map((r) => r.opm));
    C.useList = plist.length >= 3;
    C.peer = C.useList ? C.listPeers : C.indPeers;
    C.peerOk = C.useList || C.indPeers.n >= 5;

    /* 價值陷阱 */
    const mr = R[main];
    const trap = { pre: isNum(mr.pct) ? mr.pct <= 30 : null, items: [] };
    trap.items.push({ t: "近 3 個月平均營收年增 < 0", v: isNum(g.avg3) ? `${sgn(g.avg3)}%` : "資料不足", on: isNum(g.avg3) ? g.avg3 < 0 : null });
    trap.items.push({ t: "營收加速度 ≤ −5 個百分點", v: isNum(g.accel) ? `${sgn(g.accel)} 個百分點` : "資料不足", on: isNum(g.accel) ? g.accel <= -5 : null });
    trap.items.push({ t: "最新單季 EPS 年減 > 20%", v: C.epsL && isNum(C.epsL.yoy) ? `${sgn(C.epsL.yoy)}%` : "資料不足", on: C.epsL && isNum(C.epsL.yoy) ? C.epsL.yoy < -20 : null });
    trap.items.push({ t: "單季營益率比去年同季少 > 3 個百分點", v: C.sq && isNum(C.sq.opmLy) ? `${sgn(C.sq.opm - C.sq.opmLy)} 個百分點` : "資料累積中（缺去年同季單季營益率）", on: C.sq && isNum(C.sq.opmLy) ? C.sq.opm - C.sq.opmLy < -3 : null });
    const t5 = isNum(C.eps4Yoy) && C.epsL && isNum(C.epsL.prev);
    trap.items.push({ t: "近四季 EPS 年增 > 50%，且最新單季 EPS 比前一季下滑", v: t5 ? `近四季 EPS 年增 ${sgn(C.eps4Yoy)}%；最新單季 ${fmt(C.epsL.v)} 元 vs 前一季 ${fmt(C.epsL.prev)} 元` : "資料不足", on: t5 ? C.eps4Yoy > 50 && C.epsL.v < C.epsL.prev : null });
    trap.hit = trap.pre === true && trap.items.some((x) => x.on === true);
    C.trap = trap;

    /* 下檔試算 */
    let down = null;
    if (main === "pb") { if (isNum(R.pb.p20) && C.bvps) down = { px: C.bvps * R.pb.p20, f: `每股淨值 ${fmt(C.bvps, 1)} 元 × 股價淨值比 20 百分位 ${fmt(R.pb.p20)} 倍`, spread: R.pb.p80 / R.pb.p20, key: "pb" }; }
    else if (isNum(R.pe.p50) && C.eps4 > 0) down = { px: C.eps4 * 0.7 * R.pe.p50, f: `近四季 EPS ${fmt(C.eps4)} 元 × 0.7 × 本益比中位數 ${fmt(R.pe.p50)} 倍`, spread: R.pe.p80 / R.pe.p20, key: "pe" };
    if (down && down.px > 0) { down.gap = (down.px / close - 1) * 100; down.volatile = down.spread > 2; } else down = null;
    C.down = down;

    /* 風險旗標 */
    const flags = [];
    const last3 = yoy.slice(-3).map((x) => x.v);
    flags.push({ t: "營收連續年減", c: "最近 3 個月營收年增都 < 0", on: last3.length === 3 ? last3.every((x) => x < 0) : null, v: last3.length === 3 ? `近 3 個月年增 ${last3.map((x) => sgn(x) + "%").join("、")}` : `資料累積中（目前 ${last3.length} 期）` });
    flags.push({ t: "營益率下滑", c: "單季營益率連續 2 季低於去年同季", on: null, v: `資料累積中（有累計損益的季數目前 ${C.epsCumN} 期，需要 6 季）` });
    flags.push({ t: "業外占比高", c: "稅後淨利 ÷ 營業利益 > 1.3", on: C.sq && isNum(C.sq.ratio) ? C.sq.ratio > 1.3 : null, v: C.sq && isNum(C.sq.ratio) ? `目前 ${fmt(C.sq.ratio)}（${C.sq.mode === "cum" ? C.sq.label : C.sq.period + " 單季"}）` : C.sq && C.sq.op <= 0 ? "本業虧損" : "資料不足" });
    flags.push({ t: "虧損", c: "近四季 EPS ≤ 0", on: isNum(C.eps4) ? C.eps4 <= 0 : null, v: isNum(C.eps4) ? `近四季 EPS ${fmt(C.eps4)} 元` : "資料不足" });
    flags.push({ t: "配息超過獲利", c: "配息率 > 100%（能算時才判斷）", on: null, v: "配息率資料語意確認中，暫不判斷" });
    const ch = (d.chip || []).filter((x) => isNum(x[4]));
    if (ch.length > 20) {
      const a = ch[ch.length - 21], b = ch[ch.length - 1];
      const ka = k.find((x) => x[0] === a[0]);
      const mg = a[4] > 0 ? (b[4] / a[4] - 1) * 100 : null, pxg = ka ? (close / ka[4] - 1) * 100 : null;
      flags.push({ t: "融資大增且股價下跌", c: "融資餘額 20 日增加 > 20%，且同期股價下跌", on: isNum(mg) && isNum(pxg) ? mg > 20 && pxg < 0 : null, v: `融資 20 日 ${sgn(mg)}%、股價 ${sgn(pxg)}%` });
    } else flags.push({ t: "融資大增且股價下跌", c: "融資餘額 20 日增加 > 20%，且同期股價下跌", on: null, v: "資料不足" });
    const ma = (n) => (k.length >= n ? avg(k.slice(-n).map((x) => x[4])) : null);
    C.ma240 = ma(240);
    flags.push({ t: "跌破年線", c: "收盤 < 240 日均線", on: isNum(C.ma240) ? close < C.ma240 : null, v: isNum(C.ma240) ? `收盤 ${fmt(close)} 元、年線 ${fmt(C.ma240)} 元` : `資料不足（目前 ${k.length} 日）` });
    C.flags = flags; C.flagN = flags.filter((f) => f.on === true).length;
    const yr = k.slice(-250).map((x) => x[4]);
    C.hi1 = Math.max(...yr); C.lo1 = Math.min(...yr);

    /* 市場事實 */
    if (tx && tx.k && k.length > 60) {
      const k0 = k[k.length - 61];
      const t0 = tx.k.filter((x) => x[0] <= k0[0]).pop(), t1 = tx.k.filter((x) => x[0] <= C.date).pop();
      if (t0 && t1) { const r = close / k0[4] - 1, m = t1[4] / t0[4] - 1; C.rel = { r: r * 100, m: m * 100, rel: ((1 + r) / (1 + m) - 1) * 100, from: k0[0] }; }
    }
    const c20 = (d.chip || []).slice(-20);
    C.f20 = c20.reduce((s, x) => s + (x[1] || 0), 0); C.t20 = c20.reduce((s, x) => s + (x[2] || 0), 0); C.inst20 = C.f20 + C.t20;
    const vol20 = k.slice(-20).reduce((s, x) => s + (x[5] || 0), 0);
    C.instShare = vol20 ? (Math.abs(C.inst20) / vol20) * 100 : null;
    C.instDir = !c20.length ? null : C.instShare != null && C.instShare < 3 ? "不明顯" : C.inst20 > 0 ? "淨買" : "淨賣";

    /* 驗證點、報告 */
    C.today = ymd(new Date());
    C.checks = checkpoints(C.today, C.isFin, demo && demo.watch);
    C.rep = rep || null;
    if (rep) {
      C.repAge = daysBetween(rep.date, C.today);
      C.repStale = eps.some((x) => qDeadline(x[0]) > rep.date && qDeadline(x[0]) <= C.today) || C.repAge > 180;
      C.outlook = { 看多: "正向", 中性: "中性", 看空: "保守" }[rep.rating] || rep.outlook || null;
    }
    return C;
  }

  /* ================================================================== 畫面 */
  const DIR = { up: "↑ 加速", down: "↓ 放緩", flat: "→ 持平", rebound: "↗ 低基期回升" };
  const RN = { pe: "本益比", pb: "股價淨值比", dy: "殖利率" };
  const RU = { pe: " 倍", pb: " 倍", dy: "%" };
  const periodTxt = (C) => `近 ${fmt(C.valYears, 1)} 年（${C.valFrom}～${C.date}，${C.valDays} 個交易日）`;
  const pctSentence = (C, key) => {
    const r = C.R[key];
    if (!isNum(r.pct)) return `歷史不足一年（目前 ${r.n} 日），暫不計百分位`;
    if (key === "dy") return `殖利率高於過去 ${fmt(C.valYears, 1)} 年中 ${fmt(r.pct, 0)}% 的日子（殖利率越高，代表股價相對股利越低）`;
    return `目前${RN[key]}高於過去 ${fmt(C.valYears, 1)} 年中 ${fmt(r.pct, 0)}% 的日子`;
  };
  const stTag = (on, yes = "觸發", no = "未觸發") => `<span class="st ${on === true ? "on" : on === false ? "off" : "na"}">${on === true ? yes : on === false ? no : "無法判斷"}</span>`;
  const ask = (qs) => `<div class="ask"><b>你可以問自己</b><ul>${qs.map((q) => `<li>${esc(q)}</li>`).join("")}</ul></div>`;
  const plain = (h) => `<p class="plain">${h}</p>`;

  function infoBox(rows) {
    return `<details class="sc-i"><summary aria-label="計算方式與來源" title="計算方式與來源">ⓘ</summary><dl class="sc-i-body">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl></details>`;
  }
  function card({ name, warn, value, unit, dir, say, subs = [], extra = "", moreLabel = "", info }) {
    return `<article class="sc${warn ? " warn" : ""}">
      <div class="sc-h">${esc(name)}${warn ? `<span class="warn-tag">警訊</span>` : ""}</div>
      <div class="sc-v"><b>${value}</b>${unit ? `<span class="unit">${unit}</span>` : ""}${dir ? `<span class="dir">${dir}</span>` : ""}</div>
      <p class="sc-say">${say}</p>
      ${subs.filter(Boolean).map((s) => `<p class="sc-sub">${s}</p>`).join("")}
      ${extra ? `<button class="sc-more" type="button" aria-expanded="false">${moreLabel} ▾</button><div class="sc-extra">${extra}</div>` : ""}
      ${infoBox(info)}
    </article>`;
  }

  function badgeHTML(C) {
    return C.flagN ? `<button class="risk-badge" type="button" data-risk title="${C.flagN} 項自動風險旗標觸發，點了看明細">⚠ ${C.flagN}</button>`
      : `<button class="risk-badge zero" type="button" data-risk title="正式版 N＝0 時不顯示角標">⚠ 0（正式版不顯示）</button>`;
  }

  function headExtraHTML(C) {
    const rep = C.rep;
    const first = rep ? (rep.summary || "").split("。")[0] + "。" : `${C.d.info.ind}公司，尚未深入研究。`;
    return `<div class="meta-row">
        ${rep ? `<span class="rep-chip">研究報告 ${esc(rep.date)}（${C.repAge} 天前）${C.repStale ? `<span class="stale">可能過期</span>` : ""}</span>` : ""}
        ${C.outlook ? `<span class="rep-chip">長期前景：${esc(C.outlook)}</span>` : ""}
      </div>
      <p class="oneliner">${esc(first)}<small>${rep ? `摘自 ${esc(rep.date)} 研究報告摘要第一句` : "尚無研究報告，不使用 AI 生成描述"}</small></p>`;
  }

  function cardsHTML(C) {
    const g = C.g, sq = C.sq, R = C.R, main = C.main, mr = R[main], pr = C.peer;
    const out = [];
    /* 1 成長 */
    if (isNum(g.avg3)) {
      const say = !isNum(g.base) ? `近 3 個月營收比去年同期${g.avg3 >= 0 ? "多" : "少"} ${fmt(Math.abs(g.avg3), 1)}%（資料累積中，暫不判斷方向）。`
        : g.dir === "rebound" ? `近 3 個月營收年增 ${sgn(g.avg3)}%，過去一年基期很低（平均 ${sgn(g.base)}%），屬於從低基期回升，不視為加速。`
        : `近 3 個月營收比去年同期${g.avg3 >= 0 ? "多" : "少"} ${fmt(Math.abs(g.avg3), 1)}%，${g.dir === "up" ? "比過去一年平均快，成長在加速" : g.dir === "down" ? "比過去一年平均慢，成長在放緩" : "和過去一年平均差不多"}。`;
      out.push(card({
        name: "成長", value: `${sgn(g.avg3)}%`, unit: "近 3 月營收年增", dir: g.dir ? DIR[g.dir] : "", say,
        subs: [isNum(g.base) ? `${g.baseLabel} ${sgn(g.base)}%，差 ${sgn(g.accel)} 個百分點` : "",
          `近 3 個月單月年增：最高 ${sgn(g.hi3.v)}%（${+g.hi3.ym.slice(5)} 月）、最低 ${sgn(g.lo3.v)}%（${+g.lo3.ym.slice(5)} 月）`,
          C.epsL && isNum(C.epsL.yoy) ? `最新單季 EPS 年增 ${sgn(C.epsL.yoy)}%（${C.epsL.q} ${fmt(C.epsL.v)} 元 vs ${C.epsL.lyQ} ${fmt(C.epsL.ly)} 元）` : "單季 EPS 年增：資料不足"],
        info: [["計算式", "avg3＝近 3 個月營收年增率平均；和近 12 個月平均（avg12）比，差 ≥ +5 個百分點為加速、≤ −5 為放緩；avg12 < −20% 時改寫「從低基期回升」"],
          ["期間", `${C.yoy.slice(-3)[0].ym}～${g.latest.ym}（avg3）${g.baseFrom ? `；${g.baseFrom}～${g.latest.ym}（比較基準）` : ""}`], ["來源", "公開資訊觀測站 月營收、季報 EPS"]],
      }));
    } else out.push(card({ name: "成長", value: g.latest ? `${sgn(g.latest.v)}%` : "未取得", unit: g.latest ? `${g.latest.ym} 營收年增` : "", say: `資料累積中（目前 ${g.n} 期）`, info: [["來源", "公開資訊觀測站 月營收"]] }));

    /* 2 獲利品質 */
    if (sq) {
      const single = sq.mode === "single";
      const warn = isNum(sq.ratio) && sq.ratio > 1.3;
      out.push(card({
        name: "獲利品質", warn, value: `${fmt(sq.opm, 1)}%`, unit: single ? `${sq.period} 單季營益率` : `今年累計營益率（${sq.label}）`,
        dir: single && isNum(sq.opmLy) ? (sq.opm - sq.opmLy >= 1 ? "↑ 比去年同季高" : sq.opm - sq.opmLy <= -1 ? "↓ 比去年同季低" : "→ 和去年同季相近") : "去年同季：資料累積中",
        say: `每賣 100 元，本業賺 ${fmt(sq.opm, 1)} 元${single && isNum(sq.opmLy) ? `，比去年同期${sq.opm >= sq.opmLy ? "多" : "少"} ${fmt(Math.abs(sq.opm - sq.opmLy), 1)} 元` : ""}。`,
        subs: [isNum(C.roe) ? `推估 ROE ${fmt(C.roe, 1)}%（股東每投入 100 元，一年約賺 ${fmt(C.roe, 0)} 元）` : "推估 ROE：本益比空白，不計算",
          isNum(sq.ratio) ? `稅後淨利 ÷ 營業利益 ${fmt(sq.ratio)}${warn ? "：獲利含較多業外" : "，以本業為主"}` : "本業虧損"],
        info: [["計算式", "單季營益率：Q1＝累計營業利益 ÷ 累計營收；Q2～Q4＝(本季累計 − 上季累計) 相除。缺上一季累計時改用今年累計並標明。推估 ROE＝股價淨值比 ÷ 本益比 ×100%"],
          ["期間", `${single ? sq.period + " 單季" : sq.label}；ROE 用 ${C.date} 交易所評價`], ["來源", "公開資訊觀測站 季報；證交所 本益比、股價淨值比"]],
      }));
    } else out.push(card({ name: "獲利品質", value: "未取得", say: "沒有季報損益資料。", subs: [isNum(C.roe) ? `推估 ROE ${fmt(C.roe, 1)}%` : ""], info: [["來源", "公開資訊觀測站"]] }));

    /* 3 估值 */
    {
      const has = isNum(mr.pct);
      const peerTxt = C.peerOk && isNum(pr[main]) ? `同業中位數 ${fmt(pr[main])}${RU[main]}（${C.useList ? `報告同業名單 ${pr.n} 家` : `${esc(C.d.info.ind)} ${main === "pe" ? pr.peN : pr.n} 家`}）` : "同業不足 5 家，不顯示中位數";
      const say = has ? `${pctSentence(C, main)}；${peerTxt}。` : `歷史不足一年，暫不計百分位；目前 ${fmt(mr.now)}${RU[main]}，${peerTxt}。`;
      const extra = `<p class="sc-sub">${C.useList ? `${DEMO_TAG} ${peerTxt}；官方產業別中位數 ${fmt(C.indPeers[main])}${RU[main]}（${main === "pe" ? C.indPeers.peN : C.indPeers.n} 家）` : peerTxt}</p>
        <p class="sc-sub">${C.down ? `下檔試算：約 ${fint(C.down.px)} 元（距現價 ${sgn(C.down.gap)}%）${C.down.volatile ? "；期間內倍數變動很大，僅供參考" : ""}` : "下檔試算：資料不足，不顯示"}</p>
        ${C.trap.hit ? `<p class="sc-sub"><span class="warn-tag">警訊</span> 估值在自己歷史的低檔，但獲利指標轉弱</p>` : ""}`;
      out.push(card({
        name: "估值", warn: C.trap.hit, value: has ? `第 ${fmt(mr.pct, 0)} 百分位` : `${fmt(mr.now)}${RU[main]}`, unit: `${RN[main]} ${fmt(mr.now)}${RU[main]}・主要參考`,
        say, extra, moreLabel: "同業與下檔試算",
        info: [["主尺", `${RN[main]}（${esc(C.mainWhy)}）`], ["計算式", "百分位＝期間內數值 ≤ 今天的天數比例；同業中位數排除 ETF 與本股，本益比只納入 > 0 者；下檔試算見「分析」分頁的估值區塊"],
          ["期間", C.valDays ? periodTxt(C) : "無評價資料"], ["來源", `證交所 每日本益比、股價淨值比、殖利率${C.useList ? "；同業名單為樣板示意資料" : ""}`]],
      }));
    }
    /* 4 股利 */
    {
      const dy = C.valNow.dy;
      out.push(card({
        name: "股利", value: isNum(dy) && dy > 0 ? `${fmt(dy)}%` : "–", unit: "殖利率（交易所公布）",
        say: isNum(dy) && dy > 0 ? `以現價計算，過去一年配息約等於 ${fmt(dy)}% 的利息。` : "近年未配現金股利。",
        subs: ["配息率：股利年度與盈餘年度的對應還在確認，暫不顯示"],
        info: [["計算式", "殖利率直接用交易所公布值；配息率＝同一盈餘年度現金股利合計 ÷ 該年全年 EPS（確認資料語意前不上線）"], ["期間", `${C.date} 交易所公布值`], ["來源", "證交所；股利明細：公開資訊觀測站"]],
      }));
    }
    /* 5 下一個驗證點 */
    {
      const n = C.checks[0];
      const w = C.demo && C.demo.watch.find((x) => x.metric === "revYoY");
      const cur = g.latest ? `${sgn(g.latest.v)}%` : "未取得";
      const look = n.rev ? (w ? `看年增是否連 ${w.months} 個月 ${w.op} ${w.value}%（報告列的檢查條件；目前 ${cur}）` : `看月營收年增是否延續（目前 ${cur}）`) : n.meaning || "看單季 EPS 與營益率";
      const nx = C.checks[1];
      out.push(card({
        name: "下一個驗證點", value: md(n.date), unit: `最晚 ${md(n.date)} 前`,
        say: `最晚 ${md(n.date)} 前公布 ${esc(n.event)}：${look}。`,
        subs: [nx ? `再下一個：${md(nx.date)} ${esc(nx.event)}${nx.kind === "report" ? " " + DEMO_TAG : ""}` : ""],
        info: [["日期規則", "月營收每月 10 日前；季報 Q1 5/15、Q2 8/14、Q3 11/14、年報 3/31（金融保險業只列月營收）；報告 watch 有日期的事件較近時優先顯示"], ["要看的數字", w ? "報告 watch 的門檻（此處為樣板示意資料）" : "月營收年增是否延續"], ["來源", "法定公布期限；研究報告 watch"]],
      }));
    }
    return `<section class="cards" aria-label="首屏狀態卡">${out.join("")}</section>`;
  }

  function flagsHTML(C) {
    return `<details class="fold card" id="riskbox"><summary>自動風險旗標：${C.flagN} 項觸發（${C.flags.filter((f) => f.on === null).length} 項資料不足無法判斷）</summary>
      <ul class="flags">${C.flags.map((f) => `<li>${stTag(f.on)}<span><b>${esc(f.t)}</b>　${esc(f.v)}<span class="cond">觸發條件：${esc(f.c)}</span></span></li>`).join("")}</ul>
      <p class="small muted" style="margin:6px 0 0">風險不是叫你不要買，而是告訴你哪個數字變了，就該重新想一次。</p></details>`;
  }

  function oneLineGrowth(C) {
    const r = C.R[C.main];
    const a = isNum(r.pct) ? `${RN[C.main]}在自身歷史第 ${fmt(r.pct, 0)} 百分位` : `${RN[C.main]}歷史不足一年，暫不計百分位`;
    const b = C.g.dir ? { up: "營收近 3 個月正在加速", down: "營收近 3 個月正在放緩", flat: "營收近 3 個月和過去一年平均相近", rebound: "營收近 3 個月從低基期回升" }[C.g.dir] : "營收方向資料累積中";
    return `${a}；${b}。`;
  }

  function rulerBox(C, key) {
    const r = C.R[key], u = RU[key];
    let bar;
    if (isNum(r.pct)) {
      const pos = Math.max(0, Math.min(100, r.pct));
      const align = pos < 18 ? "left:0" : pos > 82 ? "right:0" : `left:${pos}%;transform:translateX(-50%)`;
      bar = `<div class="pb-wrap" role="img" aria-label="${RN[key]}目前第 ${fmt(r.pct, 0)} 百分位">
        <div class="pb-track"><div class="pb-mid" style="left:20%;width:60%"></div></div>
        ${[20, 50, 80].map((p) => `<div class="pb-tick" style="left:${p}%"></div><div class="pb-tl" style="left:${p}%">${p}%｜${fmt(r["p" + p])}${u.trim()}</div>`).join("")}
        <div class="pb-now" style="left:${pos}%"></div><div class="pb-nl" style="${align}">目前 ${fmt(r.now)}${u.trim()}・第 ${fmt(r.pct, 0)} 百分位</div></div>`;
    } else bar = `<p class="muted small">歷史不足一年（目前 ${r.n} 日），暫不計百分位。</p>`;
    return `<div class="ruler${key === C.main ? " main" : ""}">
      <div class="ruler-h"><b>${RN[key]}</b>${key === C.main ? `<span class="main-tag">主要參考</span>` : ""}<span class="now">${fmt(r.now)}${u}</span>
        ${key === "dy" && !C.dyRuler ? `<span class="small muted">（近 3 年每年配息無法確認：股利資料只有 ${C.divYears.length} 年，不列為加看尺）</span>` : ""}</div>
      ${bar}<p>${pctSentence(C, key)}。</p></div>`;
  }

  function consensusTable(C) {
    const cs = C.demo.consensus;
    return `<div class="tw"><table><thead><tr><th class="l">年度</th><th>EPS 低</th><th>EPS 高</th><th>家數</th><th>預估本益比（現價 ÷ EPS）</th></tr></thead><tbody>
      ${cs.eps.map((e) => `<tr><td class="l">${e.year}</td><td class="num">${fmt(e.low)}</td><td class="num">${fmt(e.high)}</td><td class="num">${e.n}</td><td class="num">${fmt(C.close / e.high, 1)}～${fmt(C.close / e.low, 1)} 倍</td></tr>`).join("")}
      </tbody></table></div><p class="small" style="margin:4px 0 0">外資目標價區間 ${fint(cs.target.low)}～${fint(cs.target.high)} 元（${esc(cs.source)}，${esc(cs.date)}）。</p>`;
  }

  function scenarioBand(C) {
    const sc = C.demo.scenarios.map((s) => ({ ...s, px: s.eps * s.pe }));
    const all = sc.map((s) => s.px).concat(C.close);
    const lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.08;
    const pos = (v) => ((v - (lo - pad)) / (hi - lo + 2 * pad)) * 100;
    const lab = (p, c2, html) => `<div class="scen-lab ${c2}" style="${p < 15 ? `left:${p}%;transform:translateX(-8px)` : p > 85 ? `right:${100 - p}%;transform:translateX(8px);text-align:right` : `left:${p}%;transform:translateX(-50%);text-align:center`}">${html}</div>`;
    return `<div class="scen-wrap" role="img" aria-label="情境價格帶"><div class="scen-track"></div>
        ${sc.map((s) => `<div class="scen-dot" style="left:${pos(s.px)}%"></div>${lab(pos(s.px), "top", `${s.name}<br><b>${fint(s.px)}</b>`)}`).join("")}
        <div class="scen-dot cur" style="left:${pos(C.close)}%"></div>${lab(pos(C.close), "bot", `現價<br><b>${fint(C.close)}</b>`)}</div>
      <div class="tw"><table><thead><tr><th class="l">情境</th><th>EPS</th><th>本益比</th><th>網站算出的價格</th><th class="l wrap">假設</th></tr></thead><tbody>
        ${sc.map((s) => `<tr><td class="l">${s.name}${s._rep ? " " + REP_TAG("報告文字") : ""}</td><td class="num">${fmt(s.eps)}（${s.epsYear}）</td><td class="num">${s.pe} 倍</td><td class="num">${fint(s.px)}</td><td class="wrap">${esc(s.basis)}</td></tr>`).join("")}
      </tbody></table></div>`;
  }

  /* 「分析」分頁：取代原「價位參考」 */
  function valuationHTML(C) {
    const R = C.R, t = C.trap;
    const order = [C.main, ...["pe", "pb", "dy"].filter((x) => x !== C.main)];
    const priceRow = (key, base, baseTxt) => {
      const r = R[key];
      if (!isNum(r.pct) || !isNum(base)) return `<tr><td class="l">${RN[key]}</td><td class="l" colspan="4">資料不足</td></tr>`;
      if (key === "dy") return `<tr><td class="l">殖利率</td><td class="l wrap">${baseTxt}</td><td class="num">${fint(base / (r.p20 / 100))}</td><td class="num">${fint(base / (r.p50 / 100))}</td><td class="num">${fint(base / (r.p80 / 100))}</td></tr>`;
      return `<tr><td class="l">${RN[key]}</td><td class="l wrap">${baseTxt}</td><td class="num">${fint(base * r.p20)}</td><td class="num">${fint(base * r.p50)}</td><td class="num">${fint(base * r.p80)}</td></tr>`;
    };
    const dps = isNum(C.valNow.dy) ? (C.close * C.valNow.dy) / 100 : null;
    const pRow = (r, c2, opm, opmL) => `<tr class="${c2 || ""}"><td class="l">${r.code ? `<a class="code" href="#/stock/${r.code}">${esc(r.code)}</a> ` : ""}${esc(r.name)}</td><td class="num">${fmt(r.pe)}</td><td class="num">${fmt(r.pb)}</td><td class="num">${isNum(r.dy) ? fmt(r.dy) + "%" : "–"}</td><td class="num">${isNum(r.revYoY) ? sgn(r.revYoY) + "%" : "–"}</td><td class="num">${isNum(opm) ? fmt(opm, 1) + "%" : `<span class="muted">未取得</span>`}${opmL ? `<span class="muted small">（${esc(opmL)}）</span>` : ""}</td></tr>`;
    const implied = C.main === "pe" && isNum(R.pe.p50) ? C.close / R.pe.p50 : null;
    const demo = C.demo;
    const downTxt = C.down ? `<p>情境試算：約 <b class="num">${fint(C.down.px)}</b> 元（距現價 ${sgn(C.down.gap)}%）。假設：${esc(C.down.f)}；資料期間 ${periodTxt(C)}。一次只用一個悲觀假設，不是目標價。</p>
        ${C.down.volatile ? `<p class="hint">⚠ 期間內${RN[C.down.key]}變動很大：80 百分位（${fmt(R[C.down.key].p80)} 倍）是 20 百分位（${fmt(R[C.down.key].p20)} 倍）的 ${fmt(C.down.spread, 1)} 倍，中位數可能已不代表現在的評價水準，這個試算結果只能當作極端情境參考。</p>` : ""}` : "<p>資料不足，不顯示。</p>";
    return `<section class="facet" id="valbox">
      <h2>③ 估值<span class="kind">自動${demo ? "＋報告" : ""}</span></h2>
      <p class="lead">主尺：<b>${RN[C.main]}</b>（${esc(C.mainWhy)}）。三把尺都顯示，主尺放第一個。期間：${C.valDays ? periodTxt(C) : "無評價資料"}。</p>
      <p><b>${oneLineGrowth(C)}</b></p>
      <div class="rulers">${order.map((k) => rulerBox(C, k)).join("")}</div>
      <details class="fold"><summary>主尺怎麼選的（依序判斷，第一個符合就採用）</summary>
        <ul class="facts small">
          <li>虧損型（近四季 EPS ≤ 0 或本益比空白）：${C.type === "loss" ? "符合" : `不符合（近四季 EPS ${fmt(C.eps4)} 元、本益比 ${fmt(C.valNow.pe)}）`}</li>
          <li>金融保險業：${C.isFin ? "符合" : "不符合"}</li>
          <li>景氣循環型 (a)：近 24 個月年增率中年減占比 ${C.cyc.negN != null ? `${C.cyc.negN}/${C.cyc.n}＝${fmt(C.cyc.negShare, 0)}%（門檻 ≥ 25%）` : "資料不足"}，且標準差 ${C.cyc.sd != null ? `${fmt(C.cyc.sd, 1)} 個百分點（門檻 ≥ 20）` : "資料不足"} → ${C.cyc.a ? "符合" : "不符合"}</li>
          <li>景氣循環型 (b)：近 12 季單季 EPS 曾由正轉負 → ${C.cyc.b ? "符合" : "不符合"}</li>
          <li>其他 → 主尺用本益比</li>
        </ul></details>
      <h3>20／50／80 百分位對應股價</h3>
      <div class="tw"><table><thead><tr><th class="l">尺</th><th class="l wrap">乘數基礎</th><th>20 百分位</th><th>50 百分位</th><th>80 百分位</th></tr></thead><tbody>
        ${priceRow("pe", C.eps4 > 0 ? C.eps4 : null, `近四季 EPS ${fmt(C.eps4)} 元`)}
        ${priceRow("pb", C.bvps, `每股淨值 ${fmt(C.bvps, 1)} 元（推估）`)}
        ${priceRow("dy", dps, `現金股利約 ${fmt(dps)} 元（現價 × 殖利率，推估）；殖利率越高對應股價越低`)}
      </tbody></table></div>
      <p class="small muted">技術面參考：年線（MA240）${fmt(C.ma240)} 元，近一年最高 ${fmt(C.hi1)}／最低 ${fmt(C.lo1)} 元。其他均線在「K 線」分頁。</p>
      <h3>同業比較</h3>
      <div class="tw"><table><thead><tr><th class="l">公司</th><th>本益比</th><th>股價淨值比</th><th>殖利率</th><th>營收年增</th><th>營益率</th></tr></thead><tbody>
        ${pRow(C.st, "hl", C.sq && C.sq.opm, C.sq && (C.sq.mode === "cum" ? "今年累計" : "單季"))}
        ${C.peerRows.map((r) => pRow(r, "", r.opm, r.opmLabel)).join("")}
        ${C.useList ? pRow({ name: `報告同業名單中位數（${C.listPeers.n} 家）`, pe: C.listPeers.pe, pb: C.listPeers.pb, dy: C.listPeers.dy, revYoY: C.listPeers.rev }, "med", C.listPeers.opm) : ""}
        ${C.indPeers.n >= 5 ? pRow({ name: `${C.d.info.ind}中位數（${C.indPeers.n} 家，本益比 ${C.indPeers.peN} 家）`, pe: C.indPeers.pe, pb: C.indPeers.pb, dy: C.indPeers.dy, revYoY: C.indPeers.rev }, "med", null) : `<tr><td class="l" colspan="6">同產業不足 5 家，不顯示中位數</td></tr>`}
      </tbody></table></div>
      <p class="small muted">${C.useList ? `同業名單 ${demo.peers.codes.join("、")}（${esc(demo.peers.note)}）為${DEMO_TAG}，正式版來自報告 <code>data.peers</code>；各家數字是真實資料。` : ""}證交所產業分類較粗；官方產業別的營益率總表未提供，顯示「未取得」。依成交值排序的原同業表在「公司資料」分頁。</p>
      <h3>價值陷阱檢查</h3>
      <p>前提：主尺百分位 ≤ 30。目前${RN[C.main]}${isNum(R[C.main].pct) ? `第 ${fmt(R[C.main].pct, 0)} 百分位` : "未計百分位"} → <b>${t.pre === null ? "無法判斷" : t.pre ? "前提成立，檢查下列項目" : "前提不成立，不觸發"}</b>。</p>
      <ul class="flags">${t.items.map((x) => `<li>${stTag(x.on, "成立", "不成立")}<span>${esc(x.t)}<span class="cond">${esc(x.v)}</span></span></li>`).join("")}</ul>
      ${t.hit ? `<p><span class="warn-tag">警訊</span> 估值在自己歷史的低檔，但${t.items.filter((x) => x.on).map((x) => x.t).join("、")}；低估值可能是因為獲利還沒反映營收轉弱。</p>` : ""}
      <h3>情境試算（下檔）</h3>${downTxt}
      ${demo ? `<h3>市場在期待什麼（報告 consensus、scenarios）</h3>
      ${demoBox(`${implied ? `<p style="margin:0 0 6px">現價大約已反映每年 EPS <b class="num">${fmt(implied, 1)}</b> 元（現價 ÷ 本益比中位數 ${fmt(R.pe.p50)} 倍）；市場對 ${demo.consensus.eps[0].year} 的預估是 ${fmt(demo.consensus.eps[0].low)}～${fmt(demo.consensus.eps[0].high)} 元（${esc(demo.consensus.source)}，${esc(demo.consensus.date)}）。</p>` : ""}
        ${consensusTable(C)}
        <h3 style="margin-top:14px">估值情境（價格由網站計算＝EPS × 本益比）</h3>${scenarioBand(C)}
        <p class="small muted" style="margin:4px 0 0">保守、樂觀的 EPS 與本益比、外資預估都取自報告內文；基準情境是示意數字。不顯示 PEG。</p>`)}` : ""}
      ${plain("百分位只說明「現在和自己過去比」的位置，不代表股價該漲或該跌；高成長公司的本益比本來就可能長期偏高，要搭配成長一起看。")}
      ${ask(["現在的倍數，是因為獲利變好，還是股價跑在獲利前面？", "如果明年獲利只達到保守情境，現在的價格還說得過去嗎？", "同業的倍數比較低，是因為它們成長比較慢嗎？"])}
      <p class="muted small">資料日 ${esc(C.date)}，每日更新；非投資建議。</p>
    </section>`;
  }

  /* 「分析」分頁：報告 data 區塊（示意）＋各面向 */
  function reportBlocksHTML(C) {
    const demo = C.demo;
    if (!demo) return "";
    const myRev = C.g.latest && C.g.latest.v, indRev = C.indPeers.rev, plRev = C.listPeers.rev;
    const fc = (v, u = "%") => (isNum(v) ? `${fmt(v, 1)}${u}` : `<span class="muted">未取得</span>`);
    const legal = C.checks.filter((x) => x.within);
    return `
    <h2>報告重點整理 <span class="muted small">（正式版由報告的 <code>data</code> 區塊與段落提供）</span></h2>
    <section class="facet"><h2>① 商業模式<span class="kind">報告</span></h2>
      <h3>產業鏈位置（半導體：上游 IC 設計／IP → 中游晶圓代工 → 下游封測）</h3>
      <div class="chain">${demo.chain.items.map(([t, s], i) => `<div class="${i === demo.chain.at ? "here" : ""}"><b>${esc(t)}${i === demo.chain.at ? "・公司在這裡" : ""}</b>${esc(s)}</div>`).join("")}</div>
      <h3>營收結構（mix）</h3>
      ${demoBox(`<p class="small muted" style="margin:0">正式版讀報告 <code>data.mix</code>；這裡的 58／37／5 與年增率取自報告內文。</p>
        <div class="official">${Charts.render({ type: "pie", title: `${demo.mix.period} 營收結構（依${demo.mix.basis}）`, unit: "%", labels: demo.mix.items.map((x) => x.name), values: demo.mix.items.map((x) => x.pct), source: demo.mix.source })}
        ${Charts.render({ type: "hbar", title: `${demo.mix.period} 各產品線營收年增率`, unit: "%", labels: demo.mix.yoy.map((x) => x.name), values: demo.mix.yoy.map((x) => x.pct), source: demo.mix.source })}</div>`)}
      ${plain(demo.plain)}
      ${ask(["營收最大的那塊在成長還是萎縮？", "最大客戶走掉會怎樣？", "公司能不能自己決定售價？"])}</section>

    <section class="facet"><h2>② 財務體質（fin）<span class="kind">報告</span></h2>
      ${demoBox(`<div class="tw"><table><thead><tr><th class="l">季度</th><th>毛利率</th><th>營益率</th><th>財報 ROE</th><th>負債比</th><th>營業現金流</th><th>資本支出</th></tr></thead><tbody>
        ${demo.fin.rows.map((r) => `<tr><td class="l num">${r.period}${r._rep ? " " + REP_TAG("報告文字") : ""}</td><td class="num">${fc(r.grossMargin)}</td><td class="num">${fc(r.opMargin)}</td><td class="num">${fc(r.roe)}</td><td class="num">${fc(r.debtRatio)}</td><td class="num">${fc(r.ocf, " 億")}</td><td class="num">${fc(r.capex, " 億")}</td></tr>`).join("")}
        </tbody></table></div>
        ${Charts.render({ type: "line", title: "毛利率走勢", unit: "%", labels: demo.fin.rows.map((r) => r.period), values: demo.fin.rows.map((r) => r.grossMargin), source: demo.fin.source })}
        <p class="small muted" style="margin:4px 0 0">只有 2026Q3 的毛利率 46.3%、營益率 16.1% 取自報告文字；其他季度與欄位是示意數字，<b>不是真實財報</b>。查不到的欄位正式版顯示「未取得」。</p>`)}
      ${ask(["賺的錢有沒有變成現金（營業現金流跟不跟得上淨利）？", "資本支出會不會吃掉現金？"])}</section>

    <section class="facet"><h2>④ 未來發展與驗證點<span class="kind">自動＋報告</span></h2>
      <p>營收加速度 <b>${sgn(C.g.accel)} 個百分點</b>（近 3 個月年增平均 ${sgn(C.g.avg3)}%，${C.g.baseLabel || ""} ${sgn(C.g.base)}%）。</p>
      <h3>下一個驗證點清單（未來 3 個月）</h3>
      <div class="tw"><table><thead><tr><th class="l">日期</th><th class="l">事件</th><th class="l wrap">看什麼</th><th class="l">來源</th></tr></thead><tbody>
        ${legal.map((x) => `<tr><td class="l num">最晚 ${md(x.date)} 前</td><td class="l">${esc(x.event)}</td><td class="wrap">${x.meaning ? esc(x.meaning) : x.rev ? `月營收年增是否延續（目前 ${sgn(myRev)}%）` : "單季 EPS、營益率"}</td><td class="l">${x.kind === "report" ? DEMO_TAG : "法定期限"}</td></tr>`).join("")}</tbody></table></div>
      <h3>報告的觀察條件（watch）</h3>
      ${demoBox(`<ul class="facts" style="margin:0">${demo.watch.map((w) => `<li>${w.metric === "event" ? `${md(w.date)} ${esc(w.event)}：${esc(w.meaning)}` : `月營收年增 ${w.op} ${w.value}% 連 ${w.months} 個月：${esc(w.meaning)}（目前 ${sgn(myRev)}%）`}</li>`).join("")}</ul>`)}
      ${ask(["公司說的計畫，有沒有開始出現在月營收？", "下一個能驗證的日期是哪天？"])}</section>

    <section class="facet"><h2>⑤ 產業成長空間<span class="kind">自動＋報告</span></h2>
      <div class="tw"><table><thead><tr><th class="l">比較對象</th><th>家數</th><th>${esc(C.g.latest.ym)} 營收年增中位數</th><th class="l">本公司 ${sgn(myRev)}%</th></tr></thead><tbody>
        <tr><td class="l">${esc(C.d.info.ind)}（官方產業別）</td><td class="num">${C.indPeers.revN}</td><td class="num">${sgn(indRev)}%</td><td class="l">${myRev >= indRev ? "跑贏" : "跑輸"} ${fmt(Math.abs(myRev - indRev), 1)} 個百分點</td></tr>
        <tr><td class="l">報告同業名單 ${DEMO_TAG}</td><td class="num">${C.listPeers.revN}</td><td class="num">${sgn(plRev)}%</td><td class="l">${myRev >= plRev ? "跑贏" : "跑輸"} ${fmt(Math.abs(myRev - plRev), 1)} 個百分點</td></tr></tbody></table></div>
      <p class="small muted">用中位數、不用合計，避免被大公司綁架；證交所產業分類較粗。</p>
      <ul class="facts">${demo.industry.map((x) => `<li>${esc(x)} ${REP_TAG()}</li>`).join("")}</ul>
      ${demoBox(`<p style="margin:0"><b>景氣位置：</b>${esc(demo.cycleNote)}<br><span class="small muted">正式版由報告文字提供並附理由；不畫景氣四象限，也不寫擇時語句。</span></p>`)}
      ${ask(["產業在長大，公司是在搶市占，還是在掉隊？"])}</section>

    <section class="facet"><h2>⑥ 風險<span class="kind">自動＋報告</span></h2>
      <div class="tw"><table><thead><tr><th class="l">報告的風險 ${REP_TAG()}</th><th class="l wrap">怎麼觀察 ${DEMO_TAG}</th></tr></thead><tbody>
        ${demo.risks.map((r) => `<tr><td class="l"><b>${esc(r.t)}</b></td><td class="wrap">${esc(r.watch)}</td></tr>`).join("")}</tbody></table></div>
      <h3>看法失效條件 ${REP_TAG()}</h3><ul class="facts">${demo.invalid.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <p class="small muted">自動風險旗標見頁首 5 張卡下方。</p>
      ${plain("風險不是叫你不要買，而是告訴你哪個數字變了，就該重新想一次。")}
      ${ask(["這些風險裡，哪一個發生的機率最高？", "看法失效條件裡，有沒有哪一條已經接近了？"])}</section>`;
  }

  /* 「財務」分頁：新指標＋說明 */
  function finHTML(C) {
    const d = C.d, sq = C.sq;
    const yoy = C.yoy.slice(-24);
    const parts = [];
    if (yoy.length >= 3) {
      const ma3 = yoy.map((x, i) => (i >= 2 ? avg(yoy.slice(i - 2, i + 1).map((z) => z.v)) : null));
      parts.push(comboChart({ title: "月營收年增率與 3 個月移動平均", unit: "%", labels: yoy.map((x) => x.ym.slice(2).replace("-", "/")), bars: { name: "月營收年增率", values: yoy.map((x) => x.v) }, line: { name: "3 個月移動平均", values: ma3 }, source: "公開資訊觀測站 月營收" }));
    }
    const qrev = {};
    (d.rev || []).forEach((r) => { const key = `${r[0].slice(0, 4)}Q${Math.ceil(+r[0].slice(5) / 3)}`; (qrev[key] = qrev[key] || []).push(r[1]); });
    const qs = Object.entries(qrev).filter(([, a]) => a.length === 3 && a.every(isNum)).map(([q, a]) => [q, a.reduce((s, v) => s + v, 0)]);
    if (qs.length >= 2) parts.push(Charts.render({ type: "bar", title: "單季營收", unit: "億元", labels: qs.map((x) => x[0]), values: qs.map((x) => +(x[1] / 1e5).toFixed(1)), source: "公開資訊觀測站 月營收（每季 3 個月加總）" }));
    const roeM = {};
    (d.val || []).forEach((v) => { if (isNum(v[1]) && v[1] > 0 && isNum(v[3])) roeM[v[0].slice(0, 7)] = (v[3] / v[1]) * 100; });
    const rk = Object.keys(roeM);
    if (rk.length >= 3) parts.push(Charts.render({ type: "line", title: "推估 ROE 走勢（每月最後一個交易日）", unit: "%", labels: rk.map((x) => x.slice(2).replace("-", "/")), values: rk.map((x) => +roeM[x].toFixed(1)), source: "證交所 股價淨值比 ÷ 本益比（推估）" }));
    parts.push(`<div class="ph"><b>單季營業利益率、營業利益 vs 稅後淨利</b>資料累積中（有累計損益的季數目前 ${C.epsCumN} 期）。回補 12 季後畫成「單季營收柱＋營益率折線」與「營業利益 vs 稅後淨利」雙線圖。</div>`);
    return `<section class="facet">
      <h2>② 財務與獲利：新指標<span class="kind">自動</span></h2>
      <p class="lead">看什麼 → 白話 → 你可以問自己。只談財務事實，不放估值、不打分數。</p>
      <ul class="facts">
        ${sq ? `<li><b>營業利益率</b> ${fmt(sq.opm, 1)}%、<b>淨利率</b> ${fmt(sq.npm, 1)}%（${sq.mode === "cum" ? esc(sq.label) + "；缺上一季累計，暫時無法拆出單季" : esc(sq.period) + " 單季"}）${C.demo ? `。報告寫 Q3 單季營益率 16.1% ${REP_TAG()}` : ""}。</li>
        <li><b>稅後淨利 ÷ 營業利益</b> ${isNum(sq.ratio) ? fmt(sq.ratio) + "，" + (sq.ratio > 1.3 ? "業外貢獻大，可能含一次性收益" : "獲利以本業為主") : "本業虧損，不計算"}。</li>` : `<li>季報損益資料不足，營益率、淨利率暫時無法計算。</li>`}
        <li><b>推估 ROE</b> ${isNum(C.roe) ? `${fmt(C.roe, 1)}%（股價淨值比 ${fmt(C.valNow.pb)} ÷ 本益比 ${fmt(C.valNow.pe)}）` : "本益比空白或 ≤ 0，不計算"}；<b>每股淨值</b>約 ${isNum(C.bvps) ? fmt(C.bvps, 1) + " 元（收盤 ÷ 股價淨值比，推估）" : "未取得"}。</li>
        ${isNum(C.g.accel) ? `<li><b>營收加速度</b> ${sgn(C.g.accel)} 個百分點（近 3 個月年增平均 ${sgn(C.g.avg3)}% − ${C.g.baseLabel} ${sgn(C.g.base)}%）；近 3 個月單月最高 ${sgn(C.g.hi3.v)}%、最低 ${sgn(C.g.lo3.v)}%。</li>` : ""}
      </ul>
      <div class="official">${parts.join("")}</div>
      ${plain(`${sq ? `營益率 ${fmt(sq.opm, 1)}%＝每賣 100 元本業賺 ${fmt(sq.opm, 1)} 元。` : ""}${isNum(C.roe) ? `推估 ROE ${fmt(C.roe, 0)}%＝股東每投入 100 元，一年約幫你賺 ${fmt(C.roe, 0)} 元（經驗上 15% 以上算不錯，但要看能不能持續）。` : ""}`)}
      ${ask(["營收成長，營益率有沒有跟著升？", "賺的錢是本業還是業外？"])}
    </section>`;
  }

  /* 「籌碼」分頁：取代偏多／偏空評分的事實描述 */
  function chipFactsHTML(C) {
    const rel = C.rel;
    return `<h4>相對大盤與法人方向（事實）</h4><ul>
      ${rel ? `<li><b>近 60 日</b>：股價 ${sgn(rel.r)}%、加權指數 ${sgn(rel.m)}%，股價相對加權指數 ${sgn(rel.rel)}%（${esc(rel.from)}～${esc(C.date)}）。</li>` : "<li>相對大盤：資料不足 60 日。</li>"}
      <li><b>法人近 20 日方向：${C.instDir || "資料不足"}</b>（外資＋投信合計 ${sgn(C.inst20, 0)} 張，約占同期成交量 ${fmt(C.instShare, 1)}%；占比低於 3% 視為不明顯）。</li></ul>`;
  }

  function comboChart({ title, unit, labels, bars, line, source }) {
    const W = 640, H = 260, L = 46, Rr = 12, T = 14, B = 34;
    const all = bars.values.concat(line.values).filter(isNum);
    const nice = (v) => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => v / p <= s) * p; };
    const hi = nice(Math.max(...all, 0)), lo0 = Math.min(...all, 0), lo = lo0 < 0 ? -nice(-lo0) : 0;
    const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo || 1));
    const n = labels.length, bw = (W - L - Rr) / n;
    let g = "";
    for (let k = 0; k <= 4; k++) { const v = lo + ((hi - lo) * k) / 4; g += `<line x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}" class="cl-grid"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" class="cl-ax">${Math.round(v)}</text>`; }
    const step = Math.ceil(n / 8);
    labels.forEach((l, i) => { if (i % step === 0 || i === n - 1) g += `<text x="${L + bw * (i + 0.5)}" y="${H - 12}" text-anchor="middle" class="cl-ax">${esc(l)}</text>`; });
    let m = "";
    bars.values.forEach((v, i) => { if (!isNum(v)) return; const y0 = y(0), y1 = y(v); m += `<rect x="${L + bw * i + bw * 0.18}" y="${Math.min(y0, y1)}" width="${bw * 0.64}" height="${Math.max(1, Math.abs(y1 - y0))}" rx="2" fill="var(--s1)" opacity=".55"><title>${esc(labels[i])} ${esc(bars.name)}：${fmt(v, 1)}${unit}</title></rect>`; });
    m += `<line x1="${L}" x2="${W - Rr}" y1="${y(0)}" y2="${y(0)}" class="cl-zero"/>`;
    m += `<polyline points="${line.values.map((v, i) => (isNum(v) ? `${L + bw * (i + 0.5)},${y(v)}` : null)).filter(Boolean).join(" ")}" fill="none" stroke="var(--s2)" stroke-width="2.5" stroke-linejoin="round"/>`;
    return `<figure class="cl"><figcaption>${esc(title)}<span class="muted">（${esc(unit)}）</span></figcaption>
      <div class="cl-legend"><span><i style="background:var(--s1);opacity:.55"></i>${esc(bars.name)}</span><span><i style="background:var(--s2)"></i>${esc(line.name)}</span></div>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="cl-svg" role="img" aria-label="${esc(title)}">${g}${m}</svg>
      <div class="cl-src">資料來源：${esc(source)}</div>
      <details class="cl-table"><summary>查看數據表</summary><table><thead><tr><th class="l">月份</th><th>${esc(bars.name)}</th><th>${esc(line.name)}</th></tr></thead><tbody>
      ${labels.map((l, i) => `<tr><td class="l">${esc(l)}</td><td class="num">${fmt(bars.values[i], 1)}</td><td class="num">${fmt(line.values[i], 1)}</td></tr>`).join("")}</tbody></table></details></figure>`;
  }

  /* 報告內文：隱藏 data 區塊，並把舊版「買賣評估」段落換成說明（待報告改寫為「估值情境」） */
  function cleanReport(md) {
    let out = md.replace(/```data[\s\S]*?```\s*/g, "");
    out = out.replace(/\n## 買賣評估[\s\S]*?(?=\n## )/, "\n## 估值情境\n\n> 舊版報告的「買賣評估」段落（含價位區間）在新版不再顯示，排程會把這段改寫為保守／基準／樂觀三組估值情境。目前請看下方「③ 估值」與「報告重點整理」。\n\n");
    return out;
  }

  /* 主入口：算出公司頁要用的所有數字（ETF、指數或資料不足時回傳 null） */
  const cache = {};
  async function build(code, d, rows, rep) {
    if (cache[code]) return cache[code];
    if (!d || !d.info || /ETF|指數/.test(d.info.ind || "") || !/^\d{4}$/.test(code)) return null;
    const demo = null; // 正式版：報告 data 區塊上線前不顯示樣板示意資料
    const tx = await getJ("data/s/TAIEX.json").catch(() => null);
    const peerD = {};
    if (demo) await Promise.all(demo.peers.codes.map((c) => getJ(`data/s/${c}.json`).then((x) => { peerD[c] = x; }).catch(() => {})));
    const C = compute(code, d, rows, tx, peerD, rep, demo);
    cache[code] = C;
    return C;
  }

  window.Revamp = { build, badgeHTML, headExtraHTML, cardsHTML, flagsHTML, valuationHTML, reportBlocksHTML, finHTML, chipFactsHTML, cleanReport };
})();
