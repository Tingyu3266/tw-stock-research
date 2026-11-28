/* 我的持股（只存在這台瀏覽器）、股票比較、產業熱力圖、同業比較
 * 依賴 app.js 的共用函式：S, $, $$, esc, fmt, fint, signed, cls, isNum, yi, getJSON, mkChart, css, ratingCls, parseHash, setQuery
 */
"use strict";

/* ============================================================ 持股資料（localStorage） */
const PF_KEY = "tw-portfolio-v1";
function pfLoad() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(PF_KEY) || "null"); } catch {}
  if (!p || !Array.isArray(p.tx)) p = { tx: [], cash: 0, set: { disc: 1, minFee: 20 }, tgt: {} };
  p.set = Object.assign({ disc: 1, minFee: 20 }, p.set || {});
  p.tgt = p.tgt || {};
  return p;
}
function pfSave(p) { try { localStorage.setItem(PF_KEY, JSON.stringify(p)); return true; } catch { return false; } }
const FEE_RATE = 0.001425;
function calcFee(p, amount) { return Math.max(p.set.minFee, Math.round(amount * FEE_RATE * p.set.disc)); }
function calcTax(code, amount) { return Math.round(amount * (code.startsWith("00") ? 0.001 : 0.003)); }

/* 平均成本法計算持股與已實現損益 */
function pfHoldings(p) {
  const h = {};
  let realized = 0;
  [...p.tx].sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id)).forEach((t) => {
    const x = h[t.code] || (h[t.code] = { code: t.code, sh: 0, cost: 0, realized: 0, firstDate: t.date });
    const amt = t.price * t.shares;
    if (t.side === "buy") { x.sh += t.shares; x.cost += amt + (t.fee || 0); }
    else {
      const avg = x.sh ? x.cost / x.sh : 0, n = Math.min(t.shares, x.sh);
      const r = amt - (t.fee || 0) - (t.tax || 0) - avg * n;
      x.realized += r; realized += r; x.cost -= avg * n; x.sh -= n;
    }
  });
  const list = Object.values(h).filter((x) => x.sh > 0).map((x) => {
    const st = S.byCode[x.code] || {};
    const price = st.c ?? x.cost / x.sh;
    const mv = price * x.sh;
    return { ...x, st, name: st.name || x.code, ind: st.ind || "其他", avg: x.cost / x.sh, price, mv, pnl: mv - x.cost, pnlPct: (mv / x.cost - 1) * 100, today: isNum(st.chg) ? st.chg * x.sh : 0 };
  }).sort((a, b) => b.mv - a.mv);
  return { list, realized, closed: Object.values(h).filter((x) => x.sh <= 0 && x.realized) };
}

/* 依指標推估：籌碼分數（與籌碼頁同樣的思路，用篩選表的欄位） */
function chipScoreIdx(r) {
  let s = 0;
  const vol5 = (r.v || 0) * 5, inst = (r.f5 || 0) + (r.t5 || 0);
  if (vol5 && Math.abs(inst) / vol5 > 0.03) s += inst > 0 ? 1 : -1;
  if (Math.abs(r.fS || 0) >= 3) s += r.fS > 0 ? 1 : -1;
  if (Math.abs(r.tS || 0) >= 3) s += r.tS > 0 ? 1 : -1;
  if (isNum(r.mb5) && r.mb5 > 0 && inst < 0) s -= 1;
  if (isNum(r.mb5) && r.mb5 < 0 && inst > 0) s += 1;
  if (isNum(r.b1000w) && Math.abs(r.b1000w) >= 0.2) s += r.b1000w > 0 ? 1 : -1;
  return s;
}
const chipTxt = (s) => (s >= 2 ? '<span class="badge bull">偏多</span>' : s <= -2 ? '<span class="badge bear">偏空</span>' : '<span class="badge neutral">中性</span>');
function latestReport(code) { return S.reports.find((r) => r.code === code); }
function zoneOfReport(rep, price) {
  if (!rep || !price) return null;
  if (rep.sell && price >= rep.sell[0]) return { t: price >= rep.sell[1] ? "超過賣出區" : "在賣出區", c: "bear" };
  if (rep.buy && price <= rep.buy[1]) return { t: price < rep.buy[0] ? "低於買進區" : "在買進區", c: "bull" };
  if (rep.buy || rep.sell) return { t: "介於買賣區間", c: "neutral" };
  return null;
}
function annualDiv(code) {
  // 取最近一個股利年度的現金股利加總（季配息會合計）
  const d = S.detail[code];
  return d && d.div && d.div.length ? d.div.filter((x) => x[0] === d.div[0][0]).reduce((s, x) => s + (x[2] || 0), 0) : null;
}

/* ============================================================ 我的持股頁 */
async function pagePortfolio(_, q) {
  const p = pfLoad();
  const H = pfHoldings(p);
  // 載入持股的明細（股利、K 線）
  await Promise.all(H.list.map((x) => (S.detail[x.code] ? null : getJSON(`data/s/${x.code}.json`).then((d) => (S.detail[x.code] = d)).catch(() => null))));
  const tot = H.list.reduce((s, x) => s + x.mv, 0), cost = H.list.reduce((s, x) => s + x.cost, 0);
  const unreal = tot - cost, today = H.list.reduce((s, x) => s + x.today, 0);
  const divInc = H.list.reduce((s, x) => { const a = annualDiv(x.code); return s + (a ? a * x.sh : 0); }, 0);
  const all = tot + (p.cash || 0);
  const tile = (label, val, sub = "") => `<div class="card stat"><div class="label">${label}</div><div class="value">${val}</div>${sub ? `<div class="small">${sub}</div>` : ""}</div>`;
  const pre = q.get("add") || "";

  app.innerHTML = `
    <h1>我的持股</h1>
    <p class="sub">記錄買賣、看配置、做持倉健檢。🔒 資料只存在<b>這台裝置的瀏覽器</b>，不會上傳到 GitHub 或任何伺服器；換裝置請用下方「匯出／匯入」。</p>
    ${H.list.length ? `
    <div class="grid cols-4">
      ${tile("總資產（市值＋現金）", fint(all), `股票 ${fint(tot)}・現金 ${fint(p.cash || 0)}`)}
      ${tile("未實現損益", signed(unreal, 0), `報酬率 ${signed(cost ? (unreal / cost) * 100 : null, 2, "%")}・成本 ${fint(cost)}`)}
      ${tile("今日損益", signed(today, 0), `約 ${signed(tot - today ? (today / (tot - today)) * 100 : null, 2, "%")}`)}
      ${tile("已實現損益（累計）", signed(H.realized, 0), `預估年股利 ${fint(divInc)} 元・殖利率 ${tot ? fmt((divInc / tot) * 100) : "–"}%`)}
    </div>
    <div class="official" style="margin-top:14px">${pfPies(H.list, p.cash)}</div>
    <div class="card" style="margin-top:14px"><h3>持股市值走勢 vs 淨投入金額</h3>
      <div class="legend"><span><i style="background:${css("--s1")}"></i>股票市值</span><span><i style="background:${css("--muted")}"></i>淨投入（買進金額－賣出金額）</span><span class="muted">兩條線的差距＝累計損益（含已實現）</span></div>
      <div class="chart sm" id="pfh"></div></div>
    <h2>持股明細</h2>
    <div class="tbl-wrap"><table><thead><tr><th class="l">股票</th><th>張數</th><th>均價</th><th>現價</th><th>市值</th><th>占股票%</th><th>損益</th><th>報酬率</th><th>今日</th><th>本益比位置</th><th>籌碼</th><th>報告買賣區</th><th class="l">我的停利／停損</th></tr></thead>
      <tbody>${H.list.map((x) => {
        const rep = latestReport(x.code), z = zoneOfReport(rep, x.price), tg = p.tgt[x.code] || {};
        const hit = tg.tp && x.price >= tg.tp ? '<span class="badge bear">已達停利</span>' : tg.sl && x.price <= tg.sl ? '<span class="badge bull">已達停損</span>' : "";
        return `<tr><td class="l"><a class="code" href="#/stock/${x.code}">${x.code}</a> ${esc(x.name)}</td>
          <td class="num">${fmt(x.sh / 1000, x.sh % 1000 ? 3 : 0)}</td><td class="num">${fmt(x.avg)}</td><td class="num ${cls(x.st.pct)}">${fmt(x.price)}</td>
          <td class="num">${fint(x.mv)}</td><td class="num">${fmt((x.mv / tot) * 100, 1)}%</td><td>${signed(x.pnl, 0)}</td><td>${signed(x.pnlPct, 2, "%")}</td><td>${signed(x.today, 0)}</td>
          <td>${x.st.zone == null ? "–" : `<span class="badge ${ZONE_TXT[x.st.zone][1]}">${ZONE_TXT[x.st.zone][0]}</span>`}</td>
          <td>${x.st.code ? chipTxt(chipScoreIdx(x.st)) : "–"}</td>
          <td>${z ? `<span class="badge ${z.c}" title="買 ${rep.buy ? rep.buy.join("～") : "–"}／賣 ${rep.sell ? rep.sell.join("～") : "–"}">${z.t}</span>` : `<span class="muted small">${rep ? "報告未給區間" : "尚無報告"}</span>`}</td>
          <td class="l"><input class="tg" data-c="${x.code}" data-k="tp" type="number" step="any" placeholder="停利" value="${tg.tp ?? ""}"> <input class="tg" data-c="${x.code}" data-k="sl" type="number" step="any" placeholder="停損" value="${tg.sl ?? ""}"> ${hit}</td></tr>`;
      }).join("")}</tbody></table></div>
    ${pfAnalysis(H.list, tot, p)}` : `<div class="card empty">還沒有持股紀錄。用下面的表單記第一筆買進吧！</div>`}

    <h2>記一筆交易</h2>
    <form class="card filters" id="txf">
      <div class="field"><label>股票（代號或名稱）</label><input id="tx-code" list="stocklist" required value="${esc(pre)}" placeholder="2330"></div>
      <datalist id="stocklist">${S.rows.map((r) => `<option value="${r.code}">${esc(r.name)}</option>`).join("")}</datalist>
      <div class="field"><label>買／賣</label><select id="tx-side"><option value="buy">買進</option><option value="sell">賣出</option></select></div>
      <div class="field"><label>日期</label><input id="tx-date" type="date" required></div>
      <div class="field"><label>成交價</label><input id="tx-price" type="number" step="any" min="0" required></div>
      <div class="field"><label>數量</label><div class="range"><input id="tx-qty" type="number" step="any" min="0" required><select id="tx-unit"><option value="1000">張</option><option value="1">股</option></select></div></div>
      <div class="field"><label>手續費（自動，可改）</label><input id="tx-fee" type="number" step="1" min="0"></div>
      <div class="field"><label>證交稅（賣出自動）</label><input id="tx-tax" type="number" step="1" min="0"></div>
      <div class="field"><label>備註</label><input id="tx-note" maxlength="60" placeholder="為什麼買？"></div>
      <div class="field"><label>&nbsp;</label><button class="btn primary">新增交易</button></div>
    </form>

    <div class="layout-2" style="margin-top:18px">
      <div>
        <h2 style="margin-top:0">交易紀錄（${p.tx.length} 筆）</h2>
        <div class="tbl-wrap"><table><thead><tr><th class="l">日期</th><th class="l">股票</th><th>買賣</th><th>價格</th><th>股數</th><th>手續費</th><th>稅</th><th class="l">備註</th><th></th></tr></thead>
          <tbody>${[...p.tx].sort((a, b) => b.date.localeCompare(a.date)).map((t) => `<tr><td class="l num">${t.date}</td><td class="l"><a href="#/stock/${t.code}">${t.code}</a> ${esc(S.byCode[t.code]?.name || "")}</td>
            <td>${t.side === "buy" ? '<span class="up">買</span>' : '<span class="down">賣</span>'}</td><td class="num">${fmt(t.price)}</td><td class="num">${fint(t.shares)}</td><td class="num">${fint(t.fee)}</td><td class="num">${fint(t.tax)}</td><td class="l small">${esc(t.note || "")}</td>
            <td><button class="btn sm" data-del="${t.id}">刪除</button></td></tr>`).join("") || `<tr><td colspan="9" class="empty">尚無交易</td></tr>`}</tbody></table></div>
        ${H.closed.length ? `<p class="small muted">已出清：${H.closed.map((x) => `${x.code} ${signed(x.realized, 0)}`).join("、")}</p>` : ""}
      </div>
      <aside class="grid" style="align-content:start">
        <div class="card"><h3>現金與設定</h3>
          <div class="field"><label>現金（元，用於計算資產配置）</label><input id="pf-cash" type="number" step="1" value="${p.cash || 0}"></div>
          <div class="field" style="margin-top:8px"><label>手續費折扣（例：2.8 折填 0.28）</label><input id="pf-disc" type="number" step="0.01" min="0" max="1" value="${p.set.disc}"></div>
          <div class="field" style="margin-top:8px"><label>最低手續費（元）</label><input id="pf-min" type="number" step="1" min="0" value="${p.set.minFee}"></div>
        </div>
        <div class="card"><h3>備份與搬移</h3>
          <p class="small muted">換手機或換電腦時，先在這裡匯出，再到新裝置匯入。</p>
          <div class="chips"><button class="btn sm" id="pf-exp">匯出備份 (.json)</button><button class="btn sm" id="pf-csv">匯出交易 (.csv)</button>
          <label class="btn sm">匯入備份<input type="file" id="pf-imp" accept=".json" hidden></label><button class="btn sm" id="pf-clear">清空全部</button></div>
        </div>
      </aside>
    </div>`;

  if ($("#pfh")) pfHistoryChart(p);
  // 表單預設與自動計算
  const todayStr = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  $("#tx-date").value = todayStr;
  const code = () => { const v = $("#tx-code").value.trim(); return S.byCode[v] ? v : (S.rows.find((r) => r.name === v) || {}).code || v; };
  const recalc = () => {
    const c = code(), pr = +$("#tx-price").value, sh = +$("#tx-qty").value * +$("#tx-unit").value;
    if (!$("#tx-price").value && S.byCode[c]) $("#tx-price").value = S.byCode[c].c;
    const amt = (+$("#tx-price").value || 0) * sh;
    if (amt) { $("#tx-fee").value = calcFee(p, amt); $("#tx-tax").value = $("#tx-side").value === "sell" ? calcTax(c, amt) : 0; }
  };
  ["tx-code", "tx-price", "tx-qty", "tx-unit", "tx-side"].forEach((id) => $("#" + id).addEventListener("change", recalc));
  if (pre && S.byCode[pre]) $("#tx-price").value = S.byCode[pre].c;
  $("#txf").addEventListener("submit", (e) => {
    e.preventDefault();
    const c = code();
    if (!S.byCode[c]) { alert("找不到這檔股票：" + c); return; }
    const sh = Math.round(+$("#tx-qty").value * +$("#tx-unit").value);
    const side = $("#tx-side").value;
    if (side === "sell") { const have = (pfHoldings(p).list.find((x) => x.code === c) || {}).sh || 0; if (sh > have) { alert(`目前只持有 ${fint(have)} 股，無法賣出 ${fint(sh)} 股`); return; } }
    p.tx.push({ id: Date.now().toString(36), code: c, side, date: $("#tx-date").value, price: +$("#tx-price").value, shares: sh, fee: +$("#tx-fee").value || 0, tax: +$("#tx-tax").value || 0, note: $("#tx-note").value.trim() });
    if (!pfSave(p)) alert("這個瀏覽器不允許儲存資料（可能是無痕模式）");
    setQuery(new URLSearchParams());
    pagePortfolio([], new URLSearchParams());
  });
  $$("[data-del]").forEach((b) => b.addEventListener("click", () => { if (!confirm("刪除這筆交易？")) return; p.tx = p.tx.filter((t) => t.id !== b.dataset.del); pfSave(p); pagePortfolio([], q); }));
  $$(".tg").forEach((i) => i.addEventListener("change", () => { const t = p.tgt[i.dataset.c] || (p.tgt[i.dataset.c] = {}); t[i.dataset.k] = i.value === "" ? null : +i.value; pfSave(p); pagePortfolio([], q); }));
  const setNum = (id, f) => $(id).addEventListener("change", (e) => { f(+e.target.value || 0); pfSave(p); pagePortfolio([], q); });
  setNum("#pf-cash", (v) => (p.cash = v)); setNum("#pf-disc", (v) => (p.set.disc = Math.min(1, Math.max(0, v)))); setNum("#pf-min", (v) => (p.set.minFee = v));
  const dl = (name, text, type) => { const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text], { type })), download: name }); a.click(); URL.revokeObjectURL(a.href); };
  $("#pf-exp").addEventListener("click", () => dl(`我的持股備份_${todayStr}.json`, JSON.stringify(p, null, 1), "application/json"));
  $("#pf-csv").addEventListener("click", () => dl(`交易紀錄_${todayStr}.csv`, "﻿日期,代號,名稱,買賣,價格,股數,手續費,證交稅,備註\n" + p.tx.map((t) => [t.date, t.code, S.byCode[t.code]?.name || "", t.side === "buy" ? "買" : "賣", t.price, t.shares, t.fee, t.tax, `"${(t.note || "").replace(/"/g, '""')}"`].join(",")).join("\n"), "text/csv"));
  $("#pf-imp").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const d = JSON.parse(await f.text()); if (!Array.isArray(d.tx)) throw new Error("格式不對"); if (!confirm(`匯入 ${d.tx.length} 筆交易，會取代目前的資料，確定？`)) return; pfSave(d); pagePortfolio([], q); }
    catch (err) { alert("匯入失敗：" + err.message); }
  });
  $("#pf-clear").addEventListener("click", () => { if (confirm("確定清空所有持股與交易紀錄？（建議先匯出備份）")) { pfSave({ tx: [], cash: 0, set: p.set, tgt: {} }); pagePortfolio([], q); } });
}

/* 每日持股市值與淨投入（用各檔的歷史收盤價重建） */
function pfHistoryChart(p) {
  const tx = [...p.tx].sort((a, b) => a.date.localeCompare(b.date));
  if (!tx.length) return;
  const start = tx[0].date, codes = [...new Set(tx.map((t) => t.code))];
  const close = {}, dates = new Set();
  codes.forEach((c) => { const d = S.detail[c]; if (!d) return; close[c] = {}; d.k.forEach((x) => { if (x[0] >= start) { close[c][x[0]] = x[4]; dates.add(x[0]); } }); });
  const ds = [...dates].sort();
  const sh = {}, last = {};
  let inv = 0, i = 0;
  const val = [], invs = [];
  ds.forEach((d) => {
    while (i < tx.length && tx[i].date <= d) {
      const t = tx[i++], amt = t.price * t.shares;
      sh[t.code] = (sh[t.code] || 0) + (t.side === "buy" ? t.shares : -t.shares);
      inv += t.side === "buy" ? amt + (t.fee || 0) : -(amt - (t.fee || 0) - (t.tax || 0));
    }
    let v = 0;
    codes.forEach((c) => { if (close[c] && close[c][d] != null) last[c] = close[c][d]; v += (sh[c] || 0) * (last[c] || 0); });
    val.push({ time: d, value: Math.round(v) }); invs.push({ time: d, value: Math.round(inv) });
  });
  const ch = mkChart($("#pfh"));
  ch.addLineSeries({ color: css("--muted"), lineWidth: 2, lineStyle: 2, priceLineVisible: false }).setData(invs);
  ch.addAreaSeries({ lineColor: css("--s1"), topColor: css("--s1") + "55", bottomColor: css("--s1") + "05", lineWidth: 2, priceLineVisible: false }).setData(val);
  ch.timeScale().fitContent();
}

/* 圓餅圖：個股配置、產業配置 */
function pfPies(list, cash) {
  const fold = (pairs, n = 5) => {
    pairs.sort((a, b) => b[1] - a[1]);
    const top = pairs.slice(0, n), rest = pairs.slice(n).reduce((s, x) => s + x[1], 0);
    if (rest > 0) top.push(["其他", rest]);
    return top;
  };
  const tot = list.reduce((s, x) => s + x.mv, 0) + (cash || 0);
  const byStock = fold(list.map((x) => [`${x.code} ${x.name}`, x.mv]).concat(cash > 0 ? [["現金", cash]] : []));
  const ind = {};
  list.forEach((x) => (ind[x.ind] = (ind[x.ind] || 0) + x.mv));
  const byInd = fold(Object.entries(ind));
  const pct = (pairs) => pairs.map((x) => +((x[1] / tot) * 100).toFixed(1));
  const indTot = list.reduce((s, x) => s + x.mv, 0);
  return Charts.render({ type: "pie", title: "資產配置（依個股）", unit: "%", labels: byStock.map((x) => x[0]), values: pct(byStock), source: "依最新收盤價計算的市值" }) +
    Charts.render({ type: "pie", title: "產業配置（不含現金）", unit: "%", labels: byInd.map((x) => x[0]), values: byInd.map((x) => +((x[1] / indTot) * 100).toFixed(1)), source: "產業別：證交所／櫃買中心分類" });
}

/* 持倉健檢：規則式分析 */
function pfAnalysis(list, tot, p) {
  if (!list.length) return "";
  const w = list.map((x) => x.mv / tot);
  const hhi = w.reduce((s, x) => s + x * x, 0), effN = 1 / hhi;
  const ind = {};
  list.forEach((x) => (ind[x.ind] = (ind[x.ind] || 0) + x.mv / tot));
  const [topInd, topIndW] = Object.entries(ind).sort((a, b) => b[1] - a[1])[0];
  const pts = [], todo = [];
  let score = 100;

  // 1. 分散度
  const top = list[0], topW = top.mv / tot;
  pts.push(`<b>分散度</b>：持有 ${list.length} 檔，有效分散檔數約 ${fmt(effN, 1)} 檔（依權重計算）。最大持股 ${top.code} ${esc(top.name)} 占 ${fmt(topW * 100, 1)}%。`);
  if (topW > 0.4) { score -= 15; todo.push(`單一持股 ${esc(top.name)} 超過四成，股價一次大跌會明顯影響整體，可考慮降低比重或用新資金分散。`); }
  // 2. 產業集中
  pts.push(`<b>產業集中</b>：最大產業「${esc(topInd)}」占 ${fmt(topIndW * 100, 1)}%${Object.keys(ind).length > 1 ? `，共橫跨 ${Object.keys(ind).length} 個產業` : ""}。`);
  if (topIndW > 0.6 && list.length > 1) { score -= 10; todo.push(`超過六成資金在「${esc(topInd)}」，產業循環反轉時持股會一起下跌，可留意其他產業的機會。`); }
  // 3. 估值
  const exp = list.filter((x) => x.st.zone === 1), cheap = list.filter((x) => x.st.zone === -1);
  const expW = exp.reduce((s, x) => s + x.mv, 0) / tot;
  pts.push(`<b>估值</b>：${exp.length ? `${exp.map((x) => esc(x.name)).join("、")} 位於近一年本益比昂貴區（合計占 ${fmt(expW * 100, 1)}%）` : "沒有持股位於本益比昂貴區"}${cheap.length ? `；${cheap.map((x) => esc(x.name)).join("、")} 位於便宜區` : ""}。`);
  if (expW > 0.3) { score -= 10; todo.push("三成以上資金在本益比昂貴區，獲利若不如預期，修正幅度可能較大，可設好停利。"); }
  // 4. 趨勢
  const weak = list.filter((x) => isNum(x.st.ma60) && x.price < x.st.ma60), bear = list.filter((x) => x.st.bull === -1);
  pts.push(`<b>趨勢</b>：${weak.length ? `${weak.map((x) => esc(x.name)).join("、")} 跌破季線` : "所有持股都在季線之上"}${bear.length ? `；其中 ${bear.map((x) => esc(x.name)).join("、")} 均線呈空頭排列` : ""}。`);
  if (bear.length) { score -= 5 * bear.length; todo.push(`${bear.map((x) => esc(x.name)).join("、")} 均線空頭排列，代表中短期趨勢向下，檢查當初買進的理由是否還成立。`); }
  // 5. 籌碼
  const chipBad = list.filter((x) => x.st.code && chipScoreIdx(x.st) <= -2), chipGood = list.filter((x) => x.st.code && chipScoreIdx(x.st) >= 2);
  pts.push(`<b>籌碼</b>：${chipGood.length ? `${chipGood.map((x) => esc(x.name)).join("、")} 法人偏多` : "沒有籌碼明顯偏多的持股"}${chipBad.length ? `；${chipBad.map((x) => esc(x.name)).join("、")} 法人偏空` : ""}。`);
  if (chipBad.length) score -= 5 * chipBad.length;
  // 6. 基本面
  const revDown = list.filter((x) => isNum(x.st.revYoY) && x.st.revYoY < 0);
  pts.push(`<b>基本面</b>：${revDown.length ? `${revDown.map((x) => `${esc(x.name)}（${signed(x.st.revYoY, 1, "%")}）`).join("、")} 最新月營收年減` : "所有持股最新月營收都是年增"}。`);
  if (revDown.length) { score -= 5 * revDown.length; todo.push(`${revDown.map((x) => esc(x.name)).join("、")} 營收年減，追蹤下個月營收是否改善。`); }
  // 7. 報告買賣區 & 停利停損
  list.forEach((x) => {
    const z = zoneOfReport(latestReport(x.code), x.price);
    if (z && z.c === "bear") todo.push(`${esc(x.name)} 股價已${z.t.replace("在", "進入")}（研究報告的參考賣出區），可考慮分批獲利了結。`);
    if (z && z.c === "bull") todo.push(`${esc(x.name)} 股價${z.t}（研究報告的參考買進區），若看法不變可考慮分批加碼。`);
    const tg = p.tgt[x.code] || {};
    if (!tg.sl) todo.push(`${esc(x.name)} 還沒設停損價，建議先想好「跌到哪裡代表看錯」。`);
    if (x.pnlPct < -15) todo.push(`${esc(x.name)} 虧損 ${fmt(-x.pnlPct, 1)}%，重新檢視持有理由，避免越套越深。`);
  });
  score = Math.max(0, Math.min(100, score));
  const grade = score >= 85 ? ["健康", "bull"] : score >= 65 ? ["尚可", "neutral"] : ["需要注意", "bear"];
  return `<div class="card narrative"><h3>持倉健檢 <span class="badge ${grade[1]}" style="font-size:14px">${grade[0]}・${score} 分</span></h3>
    <h4>現況</h4><ul>${pts.map((x) => `<li>${x}</li>`).join("")}</ul>
    <h4>可以考慮的動作</h4>${todo.length ? `<ul>${todo.slice(0, 10).map((x) => `<li>${x}</li>`).join("")}</ul>` : "<p>目前沒有需要特別處理的地方。</p>"}
    <p class="muted small">依官方數據與研究報告自動判讀，每次打開都會用最新收盤價重算；分數只是提醒，不是投資建議。</p></div>`;
}

/* ============================================================ 股票比較 */
async function pageCompare(_, q) {
  let codes = (q.get("c") || "").split(",").filter((c) => S.byCode[c]).slice(0, 5);
  const range = q.get("r") || "250";
  app.innerHTML = `
    <h1>股票比較</h1><p class="sub">最多 5 檔，比較同期報酬與關鍵指標。可從公司頁的「同業比較」一鍵帶入。</p>
    <div class="card">
      <form class="chips" id="cmpf" style="align-items:center">
        ${codes.map((c) => `<span class="tag on">${c} ${esc(S.byCode[c].name)} <button type="button" class="ma-x" data-rm="${c}" style="color:#fff">×</button></span>`).join("")}
        ${codes.length < 5 ? `<input id="cmp-in" list="stocklist2" placeholder="輸入代號或名稱" style="padding:5px 9px;border:1px solid var(--line);border-radius:7px;background:var(--panel2)"><datalist id="stocklist2">${S.rows.map((r) => `<option value="${r.code}">${esc(r.name)}</option>`).join("")}</datalist><button class="btn sm">加入</button>` : ""}
      </form>
      <div class="seg" id="cmpr" style="margin-top:10px">${[["60", "3個月"], ["120", "6個月"], ["250", "1年"], ["500", "2年"]].map(([v, t]) => `<button data-r="${v}" class="${v === range ? "on" : ""}">${t}</button>`).join("")}</div>
    </div>
    <div id="cmpbody">${codes.length ? '<div class="empty">載入中…</div>' : '<div class="card empty">先加入要比較的股票</div>'}</div>`;
  const go = (cs, r = range) => { const nq = new URLSearchParams(); if (cs.length) nq.set("c", cs.join(",")); if (r !== "250") nq.set("r", r); location.hash = "#/compare" + (nq.toString() ? "?" + nq : ""); };
  $("#cmpf").addEventListener("submit", (e) => { e.preventDefault(); const v = $("#cmp-in").value.trim(); const c = S.byCode[v] ? v : (S.rows.find((r) => r.name === v) || {}).code; if (c && !codes.includes(c)) go([...codes, c]); });
  $$("[data-rm]").forEach((b) => b.addEventListener("click", () => go(codes.filter((c) => c !== b.dataset.rm))));
  $$("#cmpr button").forEach((b) => b.addEventListener("click", () => go(codes, b.dataset.r)));
  if (!codes.length) return;
  const ds = await Promise.all(codes.map((c) => S.detail[c] || getJSON(`data/s/${c}.json`).then((d) => (S.detail[c] = d))));
  const n = +range;
  const colors = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"].map((v) => css(v.slice(4, -1)));
  const rows = [["收盤", (r) => fmt(r.c)], ["今日", (r) => signed(r.pct, 2, "%")], ["一年漲跌", (r) => signed(r.r240, 1, "%")], ["本益比", (r) => fmt(r.pe)], ["本益比位置", (r) => (r.zone == null ? "–" : `<span class="badge ${ZONE_TXT[r.zone][1]}">${ZONE_TXT[r.zone][0]}</span>`)],
    ["股價淨值比", (r) => fmt(r.pb)], ["殖利率", (r) => fmt(r.dy) + "%"], ["近四季 EPS", (r) => fmt(r.eps4)], ["營收年增", (r) => signed(r.revYoY, 1, "%")], ["均線排列", (r) => (r.bull === 1 ? '<span class="up">多頭</span>' : r.bull === -1 ? '<span class="down">空頭</span>' : "糾結")],
    ["外資 5 日（張）", (r) => signed(r.f5, 0)], ["投信 5 日（張）", (r) => signed(r.t5, 0)], ["籌碼判讀", (r) => chipTxt(chipScoreIdx(r))], ["千張大戶", (r) => fmt(r.b1000) + "%"],
    ["最新報告", (r) => { const rp = latestReport(r.code); return rp ? `<a href="#/stock/${r.code}">${esc(rp.rating)}・${rp.date}</a>` : "–"; }]];
  $("#cmpbody").innerHTML = `<div class="card" style="margin-top:14px"><h3>同期報酬率（%）</h3><div class="legend">${codes.map((c, i) => `<span><i style="background:${colors[i]}"></i>${c} ${esc(S.byCode[c].name)}</span>`).join("")}</div><div class="chart" id="cmpc"></div></div>
    <h2>指標比較</h2><div class="tbl-wrap"><table><thead><tr><th class="l">項目</th>${codes.map((c) => `<th><a href="#/stock/${c}">${c} ${esc(S.byCode[c].name)}</a></th>`).join("")}</tr></thead>
    <tbody>${rows.map(([k, f]) => `<tr><td class="l">${k}</td>${codes.map((c) => `<td>${f(S.byCode[c])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const ch = mkChart($("#cmpc"));
  ch.applyOptions({ localization: { locale: "zh-TW", priceFormatter: (v) => v.toFixed(1) + "%" } });
  ds.forEach((d, i) => {
    const k = d.k.slice(-n);
    if (!k.length) return;
    const b = k[0][4];
    ch.addLineSeries({ color: colors[i], lineWidth: 2, priceLineVisible: false }).setData(k.map((x) => ({ time: x[0], value: +((x[4] / b - 1) * 100).toFixed(2) })));
  });
  ch.timeScale().fitContent();
}

/* ============================================================ 首頁產業熱力圖 */
function industryHeatmap() {
  const g = {};
  S.rows.forEach((r) => { if (isNum(r.pct) && r.v && r.mkt !== "指數" && !r.ind.includes("ETF")) (g[r.ind] = g[r.ind] || []).push(r); });
  const list = Object.entries(g).filter(([, rs]) => rs.length >= 3).map(([ind, rs]) => {
    const tv = rs.reduce((s, r) => s + r.c * r.v, 0);
    const avg = rs.reduce((s, r) => s + r.pct * r.c * r.v, 0) / (tv || 1); // 成交值加權
    return { ind, avg, n: rs.length, tv, top: rs.sort((a, b) => b.c * b.v - a.c * a.v)[0] };
  }).sort((a, b) => b.tv - a.tv);
  const color = (v) => { const a = Math.min(1, Math.abs(v) / 3); return v >= 0 ? `color-mix(in srgb, var(--up) ${Math.round(15 + a * 70)}%, var(--panel))` : `color-mix(in srgb, var(--down) ${Math.round(15 + a * 70)}%, var(--panel))`; };
  const maxTv = list[0]?.tv || 1;
  return `<div class="heat">${list.map((x) => `<a class="heat-cell" href="#/screener?ind=${encodeURIComponent(x.ind)}&sort=pct" style="background:${color(x.avg)};grid-column:span ${x.tv / maxTv > 0.25 ? 2 : 1}" title="${esc(x.ind)}：成交值加權平均 ${x.avg.toFixed(2)}%，${x.n} 檔">
    <b>${esc(x.ind)}</b><span class="num">${x.avg >= 0 ? "+" : ""}${x.avg.toFixed(2)}%</span><small>${esc(x.top.name)} ${x.top.pct >= 0 ? "+" : ""}${x.top.pct.toFixed(1)}%</small></a>`).join("")}</div>`;
}
function homePortfolioCard() {
  const p = pfLoad();
  if (!p.tx.length) return `<div class="card stat"><div class="label">我的持股</div><div class="value" style="font-size:16px">還沒有紀錄</div><a class="small" href="#/portfolio">開始記錄 →</a></div>`;
  const H = pfHoldings(p);
  const tot = H.list.reduce((s, x) => s + x.mv, 0), cost = H.list.reduce((s, x) => s + x.cost, 0), today = H.list.reduce((s, x) => s + x.today, 0);
  return `<div class="card stat"><div class="label">我的持股市值（${H.list.length} 檔）</div><div class="value">${fint(tot)}</div><div class="small">今日 ${signed(today, 0)}・未實現 ${signed(tot - cost, 0)} <a href="#/portfolio">→</a></div></div>`;
}

/* ============================================================ 研究請求（開 GitHub issue） */
const REPO = "Tingyu3266/tw-stock-research";
function researchRequestUrl(code, name) {
  const title = `研究請求：${code} ${name}`;
  const body = `請 Claude 研究 ${code} ${name}。\n\n（由網站「請 Claude 研究這檔」按鈕建立；每日 20:00 的排程會優先處理，完成後自動關閉這個 issue。這個 repo 是公開的，請不要在這裡寫個人資訊。）`;
  return `https://github.com/${REPO}/issues/new?labels=research&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

/* ============================================================ 研究績效 */
const pct = (v) => (isNum(v) ? signed(v, 1, "%") : '<span class="muted">–</span>');
function perfStrip(r) {
  const p = r.perf;
  if (!p) return "";
  const cell = (k, v, t) => `<div><span class="k">${k}</span><span class="v">${pct(v)}</span>${isNum(t) ? `<span class="muted small">大盤 ${pct(t)}</span>` : ""}</div>`;
  return `<div class="card perf-strip"><b>這篇報告之後的表現</b>（基準：${esc(p.baseDate)} 收盤 ${fmt(p.base)}，已過 ${p.days} 個交易日）
    <div class="kinfo">${cell("1 週", p.r5, p.t5)}${cell("1 個月", p.r20, p.t20)}${cell("3 個月", p.r60, p.t60)}${cell("至今", p.now, p.tnow)}${cell("期間最高", p.maxUp)}${cell("期間最低", p.maxDn)}
    ${p.hitBuy != null ? `<div><span class="k">碰到買進區</span><span class="v">${p.hitBuy ? "✅ 有" : "還沒有"}</span></div>` : ""}${p.hitSell != null ? `<div><span class="k">碰到賣出區</span><span class="v">${p.hitSell ? "✅ 有" : "還沒有"}</span></div>` : ""}</div></div>`;
}
function pageTrack() {
  const rs = S.reports.filter((r) => r.perf);
  const avg = (f) => { const xs = rs.map((r) => r.perf[f]).filter(isNum); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
  const hit = (rating, f) => { const xs = rs.filter((r) => r.rating === rating && isNum(r.perf[f])); if (!xs.length) return null; const ok = xs.filter((r) => (rating === "看空" ? r.perf[f] < 0 : r.perf[f] > 0)).length; return [ok, xs.length]; };
  const hitTxt = (h) => (h ? `${h[0]} / ${h[1]}（${Math.round((h[0] / h[1]) * 100)}%）` : "–");
  const tile = (l, v, s = "") => `<div class="card stat"><div class="label">${l}</div><div class="value">${v}</div>${s ? `<div class="small muted">${s}</div>` : ""}</div>`;
  app.innerHTML = `<h1>研究績效</h1>
    <p class="sub">每篇報告發布後的實際股價表現，用來檢驗分析可不可信。以發布日（或之後第一個交易日）收盤價為基準，並和同期加權指數比較。資料每天自動更新。</p>
    <div class="grid cols-4">
      ${tile("已追蹤報告", rs.length, "需要至少 1 個交易日才開始計算")}
      ${tile("平均 1 個月報酬", pct(avg("r20")), `同期大盤 ${pct(avg("t20"))}`)}
      ${tile("「看多」準確率（1 個月）", hitTxt(hit("看多", "r20")), "1 個月後股價高於發布日")}
      ${tile("「看空」準確率（1 個月）", hitTxt(hit("看空", "r20")), "1 個月後股價低於發布日")}
    </div>
    <h2>每篇報告</h2>
    <div class="tbl-wrap"><table><thead><tr><th class="l">日期</th><th class="l">股票</th><th>評等</th><th>基準價</th><th>1 週</th><th>1 個月</th><th>3 個月</th><th>至今</th><th>同期大盤</th><th>超額報酬</th><th>買進區</th><th>賣出區</th></tr></thead>
    <tbody>${rs.map((r) => { const p = r.perf, ex = isNum(p.now) && isNum(p.tnow) ? p.now - p.tnow : null; return `<tr>
      <td class="l num">${esc(r.date)}</td><td class="l"><a href="#/stock/${r.code}?r=${encodeURIComponent(r.id)}">${esc(r.code)} ${esc(r.name)}</a></td>
      <td><span class="badge ${ratingCls(r.rating)}">${esc(r.rating)}</span></td><td class="num">${fmt(p.base)}</td>
      <td>${pct(p.r5)}</td><td>${pct(p.r20)}</td><td>${pct(p.r60)}</td><td>${pct(p.now)}</td><td>${pct(p.tnow)}</td><td>${pct(ex)}</td>
      <td>${p.hitBuy == null ? "–" : p.hitBuy ? "✅" : "—"}</td><td>${p.hitSell == null ? "–" : p.hitSell ? "✅" : "—"}</td></tr>`; }).join("") || `<tr><td colspan="12" class="empty">報告發布後隔一個交易日就會開始追蹤</td></tr>`}</tbody></table></div>
    <p class="muted small">「準確率」只看方向，不代表投資建議的好壞；樣本少時參考價值有限。</p>`;
}

/* ============================================================ 盤前快報 */
const SIGNAL = { "積極逢低承接": ["bull", 4], "小額分批佈局": ["bull", 3], "觀望暫緩投入": ["neutral", 2], "保守減碼避險": ["bear", 1] };
const sigBadge = (s) => `<span class="badge ${(SIGNAL[s] || ["neutral"])[0]}" style="font-size:14px">${esc(s || "未提供")}</span>`;
function homeBriefCard() {
  const b = (S.briefs || [])[0];
  if (!b) return "";
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  return `<a class="card brief-card" href="#/brief/${b.date}">
    <div class="rep-meta"><b>🌅 盤前快報</b><span class="num">${b.date}${b.date === today ? "（今天）" : ""}</span>${sigBadge(b.signal)}</div>
    <div class="title">${esc(b.title)}</div><div class="muted small">${esc(b.summary)}</div></a>`;
}
function pageBriefs() {
  const bs = S.briefs || [];
  const hist = bs.slice(0, 30).reverse();
  app.innerHTML = `<h1>盤前快報</h1><p class="sub">每個平日 08:20 自動產生：隔夜美股、利空預警、台股開盤風向、今晚預告、今日資金投入燈號。</p>
    ${hist.length > 1 ? `<div class="card"><h3>近 30 天燈號</h3><div class="sig-strip">${hist.map((b) => `<a href="#/brief/${b.date}" class="sig s${(SIGNAL[b.signal] || [0, 0])[1]}" title="${b.date} ${esc(b.signal)}"><span>${b.date.slice(5)}</span></a>`).join("")}</div>
      <div class="legend">${Object.keys(SIGNAL).map((k) => `<span><i class="sig s${SIGNAL[k][1]}" style="display:inline-block;width:12px;height:12px"></i>${k}</span>`).join("")}</div></div>` : ""}
    <div class="grid cols-3" style="margin-top:14px">${bs.map((b) => `<a class="card rep-card" href="#/brief/${b.date}"><div class="rep-meta"><span class="num">${b.date}</span>${sigBadge(b.signal)}</div><div class="title">${esc(b.title)}</div><div class="muted small">${esc(b.summary)}</div></a>`).join("") || `<div class="card empty">還沒有快報，明天 08:20 會產生第一篇。</div>`}</div>`;
}
async function pageBrief(parts) {
  const date = parts[1];
  const bs = S.briefs || [], i = bs.findIndex((b) => b.date === date), b = bs[i];
  if (!b) { app.innerHTML = `<div class="card empty">找不到 ${esc(date)} 的快報</div>`; return; }
  const txt = await fetch(`briefs/${date}.md`).then((x) => x.text());
  const html = DOMPurify.sanitize(marked.parse(txt.replace(/^﻿?---[\s\S]*?\n---\s*\n?/, "")));
  const prev = bs[i + 1], next = bs[i - 1];
  app.innerHTML = `<p class="small"><a href="#/briefs">← 盤前快報</a></p>
    <div class="rep-meta"><span class="num">${b.date}</span>${sigBadge(b.signal)}</div><h1>${esc(b.title)}</h1><p class="sub">${esc(b.summary)}</p>
    <nav class="brief-toc" id="brief-toc"></nav>
    <article class="card md brief" id="md">${html}</article>
    <div class="toolbar">${prev ? `<a class="btn sm" href="#/brief/${prev.date}">← ${prev.date}</a>` : "<span></span>"}${next ? `<a class="btn sm" href="#/brief/${next.date}">${next.date} →</a>` : ""}</div>`;
  briefEnhance($("#md"), b.signal);
  Charts.hydrate($("#md"));
}
/* 快報排版：燈號框上色、表格數字靠右與漲跌上色、段落目錄 */
function briefEnhance(root, signal) {
  const tone = (SIGNAL[signal] || ["neutral"])[0];
  root.querySelectorAll("blockquote").forEach((q) => { if (q.textContent.includes("燈號")) q.classList.add("sig-box", tone); });
  root.querySelectorAll("table").forEach((t) => {
    t.querySelectorAll("tbody td:not(:first-child)").forEach((td) => {
      const s = td.textContent.trim();
      if (/^[+\-−▲▼]?\s*[\d,.]+/.test(s)) td.classList.add("n");
      if (/^(\+|▲)\s*\d/.test(s)) td.classList.add("up");
      else if (/^(-|−|▼)\s*\d/.test(s)) td.classList.add("down");
    });
  });
  const heads = [...root.querySelectorAll("h2")];
  const toc = $("#brief-toc");
  if (toc && heads.length > 2) {
    toc.innerHTML = heads.map((h, i) => `<button type="button" class="chip" data-i="${i}">${esc(h.textContent.replace(/^[一二三四五六七八九十]、/, "").replace(/（.*$/, "").replace(/^(.{4,}?)與.*$/, "$1").slice(0, 8))}</button>`).join("");
    toc.onclick = (e) => { const i = e.target.dataset?.i; if (i != null) heads[i].scrollIntoView({ behavior: "smooth", block: "start" }); };
  }
}

/* ============================================================ 首頁提醒：持股停利停損、研究報告買賣區 */
function homeAlerts() {
  const items = [];
  const p = pfLoad();
  const held = new Set();
  pfHoldings(p).list.forEach((x) => {
    held.add(x.code);
    const tg = p.tgt[x.code] || {};
    if (tg.tp && x.price >= tg.tp) items.push(["bear", `${x.name} 已達你設的停利價 ${fmt(tg.tp)}（現價 ${fmt(x.price)}）`, x.code]);
    if (tg.sl && x.price <= tg.sl) items.push(["bull", `${x.name} 已跌到你設的停損價 ${fmt(tg.sl)}（現價 ${fmt(x.price)}）`, x.code]);
  });
  const seen = new Set();
  S.reports.forEach((r) => {
    if (seen.has(r.code)) return;
    seen.add(r.code);
    const st = S.byCode[r.code];
    const z = st && zoneOfReport(r, st.c);
    if (z && z.c !== "neutral") items.push([z.c, `${st.name} ${z.t}（研究報告：買 ${r.buy ? r.buy.join("～") : "–"}／賣 ${r.sell ? r.sell.join("～") : "–"}，現價 ${fmt(st.c)}）${held.has(r.code) ? "・你有持股" : ""}`, r.code]);
  });
  if (!items.length) return "";
  return `<h2>提醒</h2><div class="card"><ul class="alerts">${items.map(([c, t, code]) => `<li><span class="badge ${c}">${c === "bull" ? "買進區／停損" : "賣出區／停利"}</span> <a href="#/stock/${code}">${esc(t)}</a></li>`).join("")}</ul></div>`;
}

/* ============================================================ 公司頁：同業比較 */
function peersTable(code) {
  const me = S.byCode[code];
  const peers = S.rows.filter((r) => r.ind === me.ind && r.code !== code && r.v).sort((a, b) => b.c * b.v - a.c * a.v).slice(0, 7);
  if (!peers.length) return "";
  const all = [me, ...peers];
  return `<h2>同業比較（${esc(me.ind)}，依成交值）</h2>
    <div class="tbl-wrap"><table><thead><tr><th class="l">股票</th><th>收盤</th><th>今日</th><th>本益比</th><th>位置</th><th>殖利率</th><th>近四季EPS</th><th>營收年增</th><th>一年漲跌</th><th>外資5日</th></tr></thead>
    <tbody>${all.map((r) => `<tr${r.code === code ? ' style="background:var(--accent-soft)"' : ""}><td class="l"><a class="code" href="#/stock/${r.code}">${r.code}</a> ${esc(r.name)}</td><td class="num">${fmt(r.c)}</td><td>${signed(r.pct, 2)}</td><td class="num">${fmt(r.pe)}</td>
      <td>${r.zone == null ? "–" : `<span class="badge ${ZONE_TXT[r.zone][1]}">${ZONE_TXT[r.zone][0]}</span>`}</td><td class="num">${fmt(r.dy)}</td><td class="num">${fmt(r.eps4)}</td><td>${signed(r.revYoY, 1)}</td><td>${signed(r.r240, 1)}</td><td>${signed(r.f5, 0)}</td></tr>`).join("")}</tbody></table></div>
    <p><a class="btn sm" href="#/compare?c=${[code, ...peers.slice(0, 4).map((r) => r.code)].join(",")}">把前 5 檔放進「股票比較」→</a></p>`;
}
