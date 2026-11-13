// Bộ icon SVG nét mảnh (24×24, nét 1.75, màu theo chữ) — thay cho emoji để mọi máy hiển thị giống nhau
const P = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9.5h-13z',
  pencil: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  play: 'M8 5.5v13l10.5-6.5z',
  wave: 'M3 15c2-6 4-6 6 0s4 6 6 0 4-6 6 0',
  flame: 'M12 21c-4 0-7-2.8-7-6.6 0-3.3 2.3-5.4 3.6-7 .4 1.6 1.4 2.8 2.4 3.2C11 7 12.5 4.5 14.5 3c.2 3 1.7 4.6 3 6.3A7.6 7.6 0 0 1 19 14.4C19 18.2 16 21 12 21z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 12.01V12',
  book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5',
  chart: 'M5 20V11M12 20V5M19 20v-6M3 20.5h18',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  back: 'M19 12H5M11 6l-6 6 6 6',
  alert: 'M12 4 2.5 20h19zM12 10v4.5M12 17.5v.01',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z',
  mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6',
  stop: 'M7 7h10v10H7z',
  repeat: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4',
  award: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.5 14 7 22l5-3 5 3-1.5-8',
  chevron: 'M6 9l6 6 6-6',
  close: 'M6 6l12 12M18 6L6 18',
};

export const icon = (name, cls = '') =>
  `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[name]}"/></svg>`;

// Vòng tròn phần trăm cho màn tổng kết (SVG, 120px)
export function ring(pct, label = '') {
  const r = 52, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, Math.round(pct)));
  return `<figure class="ring" role="img" aria-label="${v}%${label ? ' ' + label : ''}">
    <svg viewBox="0 0 120 120"><circle class="ring-track" cx="60" cy="60" r="${r}"/>
      ${v ? `<circle class="ring-fill" cx="60" cy="60" r="${r}" stroke-dasharray="${(c * v) / 100} ${c}" transform="rotate(-90 60 60)"/>` : ''}</svg>
    <figcaption><b>${v}%</b>${label ? `<span>${label}</span>` : ''}</figcaption>
  </figure>`;
}

// Đường cong cao độ của thanh điệu, thang 5 mức (Chao): 1 = 55, 2 = 35, 3 = 214, 4 = 51
const CONTOUR = { 1: [5, 5], 2: [3, 5], 3: [2, 1, 4], 4: [5, 1] };
export function toneContour(t) {
  const pts = CONTOUR[t];
  const y = (lv) => 58 - (lv - 1) * 12;
  const step = 80 / (pts.length - 1);
  const d = pts.map((lv, k) => `${k ? 'L' : 'M'}${8 + k * step} ${y(lv)}`).join(' ');
  const grid = [1, 2, 3, 4, 5].map((lv) => `<line x1="4" x2="92" y1="${y(lv)}" y2="${y(lv)}"/>`).join('');
  return `<svg class="contour" viewBox="0 0 96 64" aria-hidden="true"><g class="contour-grid">${grid}</g>
    <path class="contour-line" d="${t === 3 ? `M8 ${y(2)} Q44 80 88 ${y(4)}` : d}"/></svg>`;  // thanh 3: xuống đáy (mức 1) rồi lên mức 4

}
