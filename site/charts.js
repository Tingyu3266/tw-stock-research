/* 報告內的圖表：把 ```chart JSON``` 區塊與官方數據畫成 SVG（不依賴外部函式庫）
 *
 * 規格（JSON）：
 *   type:   "pie"（占比，最多 6 塊，超過自動改橫條）| "bar"（直條，可多組）| "hbar"（橫條）| "line"（折線）| "timeline"（時間軸）
 *   title:  標題        unit: 單位，例如 "%"、"億元"
 *   labels: ["A","B"]   values: [1,2]          （單一數列）
 *   series: [{name:"2024", values:[...]}, ...] （多組數列，與 labels 對應，最多 4 組）
 *   items:  [{when:"2026 Q2", what:"..."}]      （timeline 用）
 *   source: 資料來源與日期（必填，會顯示在圖下方）
 */
"use strict";
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const NS = 'xmlns="http://www.w3.org/2000/svg"';
  const nf = (v, d) => (typeof v === "number" && isFinite(v) ? v.toLocaleString("zh-TW", { maximumFractionDigits: d ?? (Math.abs(v) >= 100 ? 0 : 2) }) : "–");
  const S = (i) => `var(--s${(i % 8) + 1})`;

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const m = v / p;
    const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    return steps.find((s) => m <= s) * p;
  }
  function seriesOf(spec) {
    if (Array.isArray(spec.series) && spec.series.length) return spec.series.slice(0, 4).map((s) => ({ name: s.name, values: s.values.map(Number) }));
    return [{ name: spec.title || "", values: (spec.values || []).map(Number) }];
  }
  function legend(ss) {
    if (ss.length < 2) return "";
    return `<div class="cl-legend">${ss.map((s, i) => `<span><i style="background:${S(i)}"></i>${esc(s.name)}</span>`).join("")}</div>`;
  }
  function dataTable(spec, ss) {
    const labels = spec.labels || [];
    return `<details class="cl-table"><summary>查看數據表</summary><table><thead><tr><th class="l">項目</th>${ss.map((s) => `<th>${esc(s.name || spec.unit || "數值")}</th>`).join("")}</tr></thead>
      <tbody>${labels.map((l, i) => `<tr><td class="l">${esc(l)}</td>${ss.map((s) => `<td class="num">${nf(s.values[i])}</td>`).join("")}</tr>`).join("")}</tbody></table></details>`;
  }

  /* ---------- 圓環圖（占比） */
  function pie(spec) {
    const labels = spec.labels || [], vals = (spec.values || []).map(Number);
    const total = vals.reduce((a, b) => a + (b > 0 ? b : 0), 0) || 1;
    const R = 80, r = 50, cx = 100, cy = 100;
    let a0 = -Math.PI / 2, paths = "";
    vals.forEach((v, i) => {
      if (!(v > 0)) return;
      const a1 = a0 + (v / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rad, ang) => `${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)}`;
      const d = v >= total ? `M${cx},${cy - R}A${R},${R} 0 1 1 ${cx - 0.01},${cy - R}L${cx - 0.01},${cy - r}A${r},${r} 0 1 0 ${cx},${cy - r}Z`
        : `M${p(R, a0)}A${R},${R} 0 ${large} 1 ${p(R, a1)}L${p(r, a1)}A${r},${r} 0 ${large} 0 ${p(r, a0)}Z`;
      paths += `<path d="${d}" fill="${S(i)}" stroke="var(--panel)" stroke-width="2"><title>${esc(labels[i])}：${nf(v)}${esc(spec.unit || "")}（${nf((v / total) * 100, 1)}%）</title></path>`;
      a0 = a1;
    });
    const leg = labels.map((l, i) => `<li><i style="background:${S(i)}"></i><span>${esc(l)}</span><b class="num">${nf(vals[i])}${esc(spec.unit || "")}</b></li>`).join("");
    return `<div class="cl-pie"><svg ${NS} viewBox="0 0 200 200" role="img" aria-label="${esc(spec.title)}">${paths}</svg><ul class="cl-pie-leg">${leg}</ul></div>`;
  }

  /* ---------- 橫條 */
  function hbar(spec) {
    const ss = seriesOf(spec), labels = spec.labels || [];
    const vals = ss[0].values, fin = vals.filter(isFinite);
    const hasNeg = fin.some((v) => v < 0);
    const max = niceMax(Math.max(...fin.map(Math.abs), 0));
    return `<div class="cl-hbar">${labels.map((l, i) => {
      const v = vals[i];
      let bar;
      if (!hasNeg) {
        const w = isFinite(v) && v > 0 ? (v / max) * 100 : 0;
        bar = `<span class="cl-fill" style="width:${w}%;background:${S(0)}"></span>`;
      } else {
        // 有負值：以中線為 0，正值往右（紅）、負值往左（綠）
        const w = isFinite(v) ? (Math.abs(v) / max) * 50 : 0;
        bar = `<span class="cl-mid"></span><span class="cl-fill" style="position:absolute;top:0;${v >= 0 ? "left:50%" : "right:50%"};width:${w}%;background:${v >= 0 ? "var(--up)" : "var(--down)"};border-radius:${v >= 0 ? "0 4px 4px 0" : "4px 0 0 4px"}"></span>`;
      }
      return `<div class="cl-row" title="${esc(l)}：${nf(v)}${esc(spec.unit || "")}"><span class="cl-lab">${esc(l)}</span><span class="cl-track"${hasNeg ? ' style="position:relative"' : ""}>${bar}</span><b class="num">${nf(v)}${esc(spec.unit || "")}</b></div>`;
    }).join("")}</div>`;
  }

  /* ---------- 直條 / 折線（同一套座標） */
  function axisChart(spec, kind) {
    const ss = seriesOf(spec), labels = spec.labels || [];
    const W = 640, H = 260, L = 52, Rr = 12, T = 14, B = 34;
    const all = ss.flatMap((s) => s.values).filter(isFinite);
    let hi = Math.max(...all, 0), lo = Math.min(...all, 0);
    if (kind === "line" && lo > 0) lo = Math.min(...all) * 0.9;
    hi = niceMax(hi); if (lo < 0) lo = -niceMax(-lo);
    const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo || 1));
    const n = labels.length, bw = (W - L - Rr) / Math.max(n, 1);
    let g = "";
    for (let k = 0; k <= 4; k++) {
      const v = lo + ((hi - lo) * k) / 4, yy = y(v);
      g += `<line x1="${L}" x2="${W - Rr}" y1="${yy}" y2="${yy}" class="cl-grid"/><text x="${L - 6}" y="${yy + 4}" text-anchor="end" class="cl-ax">${nf(v)}</text>`;
    }
    const step = Math.ceil(n / 12);
    labels.forEach((l, i) => { if (i % step === 0 || i === n - 1) g += `<text x="${L + bw * (i + 0.5)}" y="${H - 12}" text-anchor="middle" class="cl-ax">${esc(l)}</text>`; });
    let marks = "";
    if (kind === "bar") {
      const gap = 2, inner = Math.max(2, Math.min(28, (bw * 0.7 - gap * (ss.length - 1)) / ss.length));
      ss.forEach((s, si) => s.values.forEach((v, i) => {
        if (!isFinite(v)) return;
        const x = L + bw * (i + 0.5) - (inner * ss.length + gap * (ss.length - 1)) / 2 + si * (inner + gap);
        const y0 = y(0), y1 = y(v), top = Math.min(y0, y1), h = Math.max(1, Math.abs(y1 - y0));
        const fill = spec.signed ? (v >= 0 ? "var(--up)" : "var(--down)") : S(si);
        marks += `<rect x="${x}" y="${top}" width="${inner}" height="${h}" rx="${Math.min(4, inner / 2)}" fill="${fill}"><title>${esc(labels[i])} ${esc(s.name)}：${nf(v)}${esc(spec.unit || "")}</title></rect>`;
      }));
      if (lo < 0) marks += `<line x1="${L}" x2="${W - Rr}" y1="${y(0)}" y2="${y(0)}" class="cl-zero"/>`;
    } else {
      ss.forEach((s, si) => {
        const pts = s.values.map((v, i) => (isFinite(v) ? [L + bw * (i + 0.5), y(v)] : null)).filter(Boolean);
        marks += `<polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${S(si)}" stroke-width="2" stroke-linejoin="round"/>`;
        s.values.forEach((v, i) => { if (isFinite(v)) marks += `<circle cx="${L + bw * (i + 0.5)}" cy="${y(v)}" r="${n > 30 ? 0 : 3}" fill="${S(si)}"/><rect x="${L + bw * i}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent"><title>${esc(labels[i])} ${esc(s.name)}：${nf(v)}${esc(spec.unit || "")}</title></rect>`; });
      });
    }
    return `${legend(ss)}<svg ${NS} viewBox="0 0 ${W} ${H}" class="cl-svg" role="img" aria-label="${esc(spec.title)}">${g}${marks}</svg>`;
  }

  function timeline(spec) {
    return `<ol class="cl-tl">${(spec.items || []).map((it) => `<li><b>${esc(it.when)}</b><span>${esc(it.what)}</span></li>`).join("")}</ol>`;
  }

  function render(spec) {
    let type = spec.type;
    if (type === "pie" && (spec.labels || []).length > 6) type = "hbar";
    const body = type === "pie" ? pie(spec) : type === "hbar" ? hbar(spec) : type === "timeline" ? timeline(spec)
      : axisChart(spec, type === "line" ? "line" : "bar");
    const table = type === "timeline" ? "" : dataTable(spec, seriesOf(spec));
    return `<figure class="cl">${spec.title ? `<figcaption>${esc(spec.title)}${spec.unit ? `<span class="muted">（${esc(spec.unit)}）</span>` : ""}</figcaption>` : ""}
      ${body}${spec.source ? `<div class="cl-src">資料來源：${esc(spec.source)}</div>` : ""}${table}</figure>`;
  }

  /* 把文章內 <pre><code class="language-chart"> 換成圖表 */
  function hydrate(root) {
    root.querySelectorAll("pre > code.language-chart").forEach((code) => {
      let html;
      try { html = render(JSON.parse(code.textContent)); }
      catch (e) { html = `<div class="cl-err">圖表格式錯誤：${esc(e.message)}</div>`; }
      const div = document.createElement("div");
      div.innerHTML = html;
      code.parentElement.replaceWith(div.firstElementChild || div);
    });
  }

  window.Charts = { render, hydrate };
})();
