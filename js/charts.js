/* ============================================================
 * AGNIVEER VAYU CBT — LIGHTWEIGHT SVG CHARTS (no dependencies)
 * ============================================================ */

const Charts = (() => {

  function svgEl(w, h) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img">`;
  }

  function lineChart(points, opts) {
    /* points: [{x label, y}] */
    opts = opts || {};
    const W = opts.width || 560, H = opts.height || 200;
    const pad = { l: 34, r: 12, t: 14, b: 24 };
    if (!points.length) return `${svgEl(W, H)}<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="#8a97a8" font-size="12">No data yet</text></svg>`;
    const maxY = Math.max(opts.max || 0, ...points.map(p => p.y), 1);
    const minY = Math.min(opts.min || 0, ...points.map(p => p.y), 0);
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const X = i => pad.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
    const Y = v => pad.t + ih - ((v - minY) / (maxY - minY || 1)) * ih;
    let out = svgEl(W, H);
    // gridlines
    for (let g = 0; g <= 3; g++) {
      const v = minY + ((maxY - minY) / 3) * g;
      out += `<line x1="${pad.l}" y1="${Y(v)}" x2="${W - pad.r}" y2="${Y(v)}" stroke="#e5eaf1" stroke-width="1"/>`;
      out += `<text x="${pad.l - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="10" fill="#7d8b9d">${Math.round(v * 10) / 10}</text>`;
    }
    // area + line
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
    const area = path + ` L${X(points.length - 1).toFixed(1)},${Y(minY)} L${X(0).toFixed(1)},${Y(minY)} Z`;
    out += `<path d="${area}" fill="${opts.color || '#3b6fb6'}18"/>`;
    out += `<path d="${path}" fill="none" stroke="${opts.color || '#3b6fb6'}" stroke-width="2.2" stroke-linejoin="round"/>`;
    points.forEach((p, i) => {
      out += `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3.2" fill="#fff" stroke="${opts.color || '#3b6fb6'}" stroke-width="2"/>`;
      if (points.length <= 12) {
        out += `<text x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9" fill="#7d8b9d">${AVUtil.esc(String(p.x)).slice(0, 8)}</text>`;
      }
    });
    if (points.length > 12) {
      out += `<text x="${pad.l}" y="${H - 8}" font-size="9" fill="#7d8b9d">${AVUtil.esc(String(points[0].x))}</text>`;
      out += `<text x="${W - pad.r}" y="${H - 8}" text-anchor="end" font-size="9" fill="#7d8b9d">${AVUtil.esc(String(points[points.length - 1].x))}</text>`;
    }
    return out + '</svg>';
  }

  function barChart(items, opts) {
    /* items: [{label, value, max, color, valueLabel}] */
    opts = opts || {};
    const W = opts.width || 560, rowH = opts.rowH || 34, pad = { l: 130, r: 60, t: 6, b: 6 };
    const H = pad.t + pad.b + items.length * rowH;
    let out = svgEl(W, H);
    const max = Math.max(1, ...items.map(i => i.max || i.value));
    items.forEach((it, i) => {
      const y = pad.t + i * rowH + rowH / 2;
      const bw = Math.max(2, ((it.value) / max) * (W - pad.l - pad.r));
      out += `<text x="${pad.l - 8}" y="${y + 4}" text-anchor="end" font-size="11.5" fill="#3c4a5c">${AVUtil.esc(String(it.label)).slice(0, 20)}</text>`;
      out += `<rect x="${pad.l}" y="${y - 9}" width="${W - pad.l - pad.r}" height="18" rx="3" fill="#eef1f6"/>`;
      out += `<rect x="${pad.l}" y="${y - 9}" width="${bw}" height="18" rx="3" fill="${it.color || '#3b6fb6'}"/>`;
      out += `<text x="${pad.l + bw + 6}" y="${y + 4}" font-size="11" fill="#3c4a5c" font-weight="600">${AVUtil.esc(it.valueLabel != null ? String(it.valueLabel) : String(it.value))}</text>`;
    });
    return out + '</svg>';
  }

  function donut(parts, opts) {
    /* parts: [{label, value, color}] */
    opts = opts || {};
    const size = opts.size || 150, r = size / 2 - 12, cx = size / 2, cy = size / 2;
    const total = parts.reduce((a, p) => a + p.value, 0) || 1;
    let angle = -Math.PI / 2;
    let out = svgEl(size, size);
    out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#eef1f6" stroke-width="18"/>`;
    parts.forEach(p => {
      if (!p.value) return;
      const a2 = angle + (p.value / total) * Math.PI * 2;
      const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
      const large = (a2 - angle) > Math.PI ? 1 : 0;
      out += `<path d="M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}" fill="none" stroke="${p.color}" stroke-width="18"/>`;
      angle = a2;
    });
    if (opts.center) {
      out += `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="20" font-weight="700" fill="#26334a">${AVUtil.esc(opts.center)}</text>`;
      out += `<text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="10" fill="#7d8b9d">${AVUtil.esc(opts.centerSub || '')}</text>`;
    }
    return out + '</svg>';
  }

  function legend(parts) {
    return `<div class="chart-legend">${parts.map(p =>
      `<span class="chip"><i style="background:${p.color}"></i>${AVUtil.esc(p.label)} <b>${p.valueLabel != null ? p.valueLabel : p.value}</b></span>`
    ).join('')}</div>`;
  }

  return { lineChart, barChart, donut, legend };
})();
