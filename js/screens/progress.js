// Tiến độ: mốc trong brief, thói quen học, tỷ lệ nhớ theo tuần, mức thuộc từ, thẻ hay quên, các lần kiểm tra trình độ
import { state, streak, dayKey, mastery, weakCards, lessonProgress, MASTERED_DAYS } from '../store.js';
import { State } from '../srs.js';
import * as db from '../db.js';
import { playWord, speak, stop } from '../audio.js';
import { esc, SPEAKER } from '../ui.js';
import { icon } from '../icons.js';

const MILESTONES = [['Tháng 1', 100, 10], ['Tháng 3', 250, 30], ['Tháng 6', 500, 60], ['Tháng 12', 1000, 120]];
const RETENTION_TARGET = 0.85;
const DAYS_TARGET = 0.8;
const WEEKS = 8;
const HEAT_WEEKS = 12;

const pct = (x) => `${Math.round(x * 100)}%`;
const fmtDay = (d) => d.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });

function weekStart(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // tuần bắt đầu từ thứ Hai
  return x;
}

// WEEKS tuần gần nhất, cũ -> mới
function lastWeeks(n = WEEKS) {
  const cur = weekStart(new Date());
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(cur);
    d.setDate(d.getDate() - 7 * (n - 1 - i));
    return d;
  });
}
const weekIndex = (weeks, date) => {
  const t = weekStart(date).getTime();
  return weeks.findIndex((w) => w.getTime() === t);
};

// Biểu đồ cột một chuỗi số liệu. Chạm/rê vào cột để xem số.
function barChart(items, { max, target, targetLabel, label }) {
  const W = 320, H = 150, top = 14, bottom = 22, left = 4;
  const ph = H - top - bottom;
  const slot = (W - left) / items.length;
  const bw = Math.min(26, slot - 6);
  const y = (v) => top + ph - (v / max) * ph;
  const bars = items.map((it, i) => {
    const x = left + i * slot + (slot - bw) / 2;
    const h = it.value == null ? 0 : Math.max((it.value / max) * ph, it.value > 0 ? 3 : 0);
    const r = Math.min(4, h / 2);
    const path = h ? `M${x},${top + ph} v${-(h - r)} q0,${-r} ${r},${-r} h${bw - 2 * r} q${r},0 ${r},${r} v${h - r} z` : '';
    return `<g class="bar-g" data-tip="${esc(it.tip)}" tabindex="0" aria-label="${esc(it.tip)}">
      <rect x="${left + i * slot}" y="${top}" width="${slot}" height="${ph}" fill="transparent"/>
      ${path ? `<path d="${path}" class="bar-mark${it.current ? ' cur' : ''}"/>` : `<line x1="${x}" x2="${x + bw}" y1="${top + ph - 1}" y2="${top + ph - 1}" class="bar-empty"/>`}
      <text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" class="axis-t">${esc(it.label)}</text>
    </g>`;
  }).join('');
  const tl = target != null ? `<line x1="${left}" x2="${W}" y1="${y(target)}" y2="${y(target)}" class="target-l"/>
    <text x="${W}" y="${y(target) - 4}" text-anchor="end" class="target-t">${esc(targetLabel)}</text>` : '';
  return `<figure class="chart">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
      <line x1="${left}" x2="${W}" y1="${top + ph}" y2="${top + ph}" class="base-l"/>${tl}${bars}
    </svg>
    <figcaption class="chart-tip muted small">Chạm vào cột để xem số liệu.</figcaption>
  </figure>`;
}

export function render(root) {
  root.innerHTML = '<p class="muted">Đang tính tiến độ…</p>';
  let alive = true;
  db.getAll('reviews').then((reviews) => alive && draw(root, reviews));
  return () => { alive = false; stop(); };
}

function draw(root, reviews) {
  const recs = [...state.cards.values()];
  const items = recs.map((c) => ({ rec: c, item: state.byId.get(c.id), level: mastery(c) }));
  const count = (type, level) => items.filter((x) => x.item.type === type && (!level || x.level === level)).length;
  const words = count('word'), sents = count('sentence');
  const wordsMastered = count('word', 'mastered');

  // ---- Mốc & dự báo ----
  const nextMs = MILESTONES.find(([, w, s]) => words < w || sents < s);
  const reachedMs = MILESTONES.filter(([, w, s]) => words >= w && sents >= s).at(-1);
  const since = Date.now() - 14 * 864e5;
  const recentWords = recs.filter((c) => state.byId.get(c.id).type === 'word' && new Date(c.introducedAt) >= since).length;
  const pace = recentWords / 14; // từ mới mỗi ngày, tính trên 14 ngày gần nhất
  let forecast = '';
  if (nextMs) {
    const left = Math.max(0, nextMs[1] - words);
    if (!left) forecast = 'Đủ số từ rồi, chỉ còn thiếu mẫu câu.';
    else if (pace > 0) {
      const eta = new Date(Date.now() + Math.ceil(left / pace) * 864e5);
      forecast = `Với nhịp hiện tại (~${pace.toFixed(1)} từ/ngày trong 14 ngày qua), bạn sẽ đạt mốc vào khoảng <b>${eta.toLocaleDateString('vi-VN')}</b>.`;
    } else forecast = 'Chưa có từ mới trong 14 ngày qua. Học tiếp bài trong lộ trình để tiến tới mốc.';
  }
  const msBar = (have, need, unit) => `
    <div class="ms-row"><span>${unit}</span>
      <span class="lv-meter"><span style="width:${Math.min(100, (have / need) * 100)}%"></span></span>
      <b>${have}/${need}</b></div>`;

  // ---- Thói quen: ngày học ----
  const days = new Set(state.meta.days ?? []);
  const now = new Date();
  const monthDays = now.getDate();
  const studiedMonth = [...days].filter((d) => d.startsWith(dayKey(now).slice(0, 7))).length;
  const heatStart = weekStart(now);
  heatStart.setDate(heatStart.getDate() - 7 * (HEAT_WEEKS - 1));
  const cells = [];
  for (let d = new Date(heatStart); d <= now; d.setDate(d.getDate() + 1)) {
    const k = dayKey(d);
    cells.push(`<span class="hm ${days.has(k) ? 'on' : ''} ${k === dayKey(now) ? 'today' : ''}" title="${fmtDay(d)}${days.has(k) ? ': có học' : ''}"></span>`);
  }
  const studied12 = cells.filter((c) => c.includes('hm on')).length;

  // ---- Tỷ lệ nhớ & khối lượng ôn theo tuần ----
  const weeks = lastWeeks();
  const ret = weeks.map(() => [0, 0]);
  const vol = weeks.map(() => 0);
  for (const r of reviews) {
    const i = weekIndex(weeks, new Date(r.at));
    if (i < 0) continue;
    vol[i]++;
    if (r.state === State.Review) { ret[i][1]++; if (r.rating !== 1) ret[i][0]++; } // chỉ tính lần ôn thẻ đã thuộc, không tính lúc mới học
  }
  const wkLabel = (w) => fmtDay(w);
  const retChart = barChart(weeks.map((w, i) => ({
    label: wkLabel(w), value: ret[i][1] ? ret[i][0] / ret[i][1] : null, current: i === weeks.length - 1,
    tip: ret[i][1] ? `Tuần từ ${fmtDay(w)}: nhớ ${ret[i][0]}/${ret[i][1]} thẻ (${pct(ret[i][0] / ret[i][1])})` : `Tuần từ ${fmtDay(w)}: chưa có lượt ôn thẻ cũ`,
  })), { max: 1, target: RETENTION_TARGET, targetLabel: 'Mục tiêu 85%', label: 'Tỷ lệ nhớ theo tuần' });
  const volChart = barChart(weeks.map((w, i) => ({
    label: wkLabel(w), value: vol[i], current: i === weeks.length - 1, tip: `Tuần từ ${fmtDay(w)}: ${vol[i]} lượt ôn`,
  })), { max: Math.max(10, ...vol), label: 'Số lượt ôn theo tuần' });
  const thisWeek = ret.at(-1), lastWeek = ret.at(-2);
  const retAll = ret.reduce((a, [c, t]) => [a[0] + c, a[1] + t], [0, 0]);

  // ---- Mức thuộc ----
  const LEVELS = [['learning', 'Đang học'], ['remembering', 'Đang nhớ'], ['mastered', 'Đã thuộc']];
  const masteryBar = (type, title) => {
    const total = count(type);
    if (!total) return '';
    return `<div class="mastery">
      <div class="mastery-head"><b>${title}</b><span class="muted small">${total}</span></div>
      <div class="stack">${LEVELS.map(([k, l]) => {
        const n = count(type, k);
        return n ? `<span class="seg ${k}" style="flex:${n}" title="${l}: ${n}"></span>` : '';
      }).join('')}</div>
      <div class="legend">${LEVELS.map(([k, l]) => `<span><i class="sw ${k}"></i>${l} <b>${count(type, k)}</b></span>`).join('')}</div>
    </div>`;
  };

  // ---- Thẻ hay quên ----
  const weak = weakCards();

  // ---- Kiểm tra trình độ ----
  const tests = state.meta.levelTests ?? [];
  const testChart = tests.length >= 2 ? barChart(tests.slice(-8).map((t, i, arr) => ({
    label: fmtDay(new Date(t.at)), value: t.words, current: i === arr.length - 1, tip: `${fmtDay(new Date(t.at))}: ~${t.words} từ, ${t.sentences} câu, thanh điệu ${t.tone[1] ? pct(t.tone[0] / t.tone[1]) : '–'}`,
  })), { max: Math.max(50, ...tests.map((t) => t.words)), label: 'Số từ ước tính qua các lần kiểm tra' }) : '';

  const passed = state.lessonOrder.filter((l) => lessonProgress(l.id)?.passedAt).length;

  root.innerHTML = `
    <section class="progress-page">
      <h1>Tiến độ</h1>
      <div class="stats">
        <div class="stat"><b>${streak()}</b><span>${icon('flame', 'sm')} ngày liên tiếp</span></div>
        <div class="stat"><b>${wordsMastered}</b><span>từ đã thuộc</span></div>
        <div class="stat"><b>${thisWeek[1] ? pct(thisWeek[0] / thisWeek[1]) : '–'}</b><span>tỷ lệ nhớ tuần này${
          thisWeek[1] && lastWeek[1] ? ` <i class="${thisWeek[0] / thisWeek[1] >= lastWeek[0] / lastWeek[1] ? 'up' : 'down'}">${thisWeek[0] / thisWeek[1] >= lastWeek[0] / lastWeek[1] ? '▲' : '▼'} so với tuần trước</i>` : ''}</span></div>
        <div class="stat"><b>${passed}/${state.lessonOrder.length}</b><span>bài đã qua</span></div>
      </div>

      <h2 class="section-title">Mốc 12 tháng</h2>
      <div class="panel">
        <p>${reachedMs ? `✓ Đã đạt mốc <b>${reachedMs[0]}</b>.` : 'Chưa đạt mốc đầu tiên.'}
          ${nextMs ? `Mốc tiếp theo: <b>${nextMs[0]}</b>.` : 'Đã đạt mọi mốc trong kế hoạch!'}</p>
        ${nextMs ? msBar(words, nextMs[1], 'Từ vựng') + msBar(sents, nextMs[2], 'Mẫu câu') : ''}
        ${forecast ? `<p class="muted small">${forecast}</p>` : ''}
        <p class="muted small">Tính theo từ và câu đã đưa vào lịch ôn. Trong đó <b>${wordsMastered}</b> từ đã thuộc vững (nhớ được từ ${MASTERED_DAYS} ngày trở lên).</p>
      </div>

      <h2 class="section-title">Thói quen học</h2>
      <div class="panel">
        <p>Tháng này học <b>${studiedMonth}/${monthDays}</b> ngày (${pct(studiedMonth / monthDays)}).
          ${studiedMonth / monthDays >= DAYS_TARGET ? '✓ Đạt mục tiêu 80% số ngày.' : `Mục tiêu: 80% số ngày, tức ít nhất ${Math.ceil(monthDays * DAYS_TARGET)} ngày tính đến hôm nay.`}</p>
        <div class="heatmap" style="--weeks:${HEAT_WEEKS}" role="img" aria-label="Lịch học ${HEAT_WEEKS} tuần gần nhất: ${studied12} ngày có học">${cells.join('')}</div>
        <div class="legend"><span><i class="sw hm-off"></i>Không học</span><span><i class="sw hm-on"></i>Có học</span><span class="muted">${HEAT_WEEKS} tuần gần nhất · mỗi cột là một tuần (T2 → CN)</span></div>
      </div>

      <h2 class="section-title">Tỷ lệ nhớ theo tuần</h2>
      <div class="panel">
        ${retAll[1] ? retChart : ''}
        <p class="muted small">${retAll[1] ? `${WEEKS} tuần qua: nhớ ${retAll[0]}/${retAll[1]} lần ôn (${pct(retAll[0] / retAll[1])}). ` : 'Chưa có dữ liệu: tỷ lệ nhớ chỉ tính khi ôn lại thẻ đã học từ trước (không tính lần đầu học). '}
          Mục tiêu trong brief là từ 85% trở lên. ${retAll[1] && retAll[0] / retAll[1] < RETENTION_TARGET ? 'Dưới mục tiêu: nên ôn đều hằng ngày, đừng để thẻ dồn, và ôn thêm các thẻ hay quên bên dưới.' : ''}</p>
      </div>

      <h2 class="section-title">Khối lượng ôn tập</h2>
      <div class="panel">${volChart}</div>

      ${words || sents ? `<h2 class="section-title">Mức độ thuộc</h2>
      <div class="panel">${masteryBar('word', 'Từ vựng')}${masteryBar('sentence', 'Mẫu câu')}
        <p class="muted small"><b>Đang học</b>: mới gặp hoặc vừa quên. <b>Đang nhớ</b>: ôn đúng lịch. <b>Đã thuộc</b>: nhớ được từ ${MASTERED_DAYS} ngày trở lên.</p></div>` : ''}

      <h2 class="section-title">Thẻ hay quên</h2>
      <div class="panel">
        ${weak.length ? `
          <div class="weak-list">${weak.map((c) => {
            const it = state.byId.get(c.id);
            return `<div class="weak">
              <button class="icon-btn sm" data-play="${esc(c.id)}" aria-label="Nghe">${SPEAKER}</button>
              <span><span class="zh">${esc(it.type === 'sentence' ? it.zh : it.hanzi)}</span><br>
                <span class="muted small">${esc(it.type === 'sentence' ? it.vi : `${it.pinyin} · ${it.vi}`)}</span></span>
              <span class="lapses" title="Số lần quên">✗${c.card.lapses}</span>
            </div>`;
          }).join('')}</div>
          <a class="btn primary wide" href="#/session?weak=1">Ôn ngay ${weak.length} thẻ này</a>`
        : '<p class="muted">Chưa có thẻ nào bị quên. Tuyệt!</p>'}
      </div>

      <h2 class="section-title">Trình độ qua các lần kiểm tra</h2>
      <div class="panel">
        ${testChart || `<p class="muted">${tests.length ? 'Mới có 1 lần kiểm tra.' : 'Chưa kiểm tra lần nào.'} Làm kiểm tra trình độ mỗi tháng để thấy đường tiến bộ.</p>`}
        <a class="btn wide" href="#/level">Kiểm tra trình độ</a>
      </div>
    </section>`;

  root.addEventListener('click', (e) => {
    const p = e.target.closest('[data-play]');
    if (p) {
      const it = state.byId.get(p.dataset.play);
      return it.type === 'sentence' ? speak(it.zh) : playWord(it);
    }
    const g = e.target.closest('.bar-g');
    if (g) g.closest('.chart').querySelector('.chart-tip').textContent = g.dataset.tip;
  });
  root.addEventListener('pointerover', (e) => {
    const g = e.target.closest('.bar-g');
    if (g) g.closest('.chart').querySelector('.chart-tip').textContent = g.dataset.tip;
  });
}
