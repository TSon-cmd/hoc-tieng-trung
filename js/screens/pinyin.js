import { state } from '../store.js';
import { INITIALS, INITIAL_TIPS, mark, split } from '../pinyin.js';
import { playSyllable, playWord, speak, stop } from '../audio.js';
import { esc, runDrill } from '../ui.js';
import { toneContour } from '../icons.js';

const TONES = [
  { t: 1, zh: '妈', desc: 'Cao và đều, giữ giọng ngang ở mức cao.', vn: 'Gần thanh ngang, nhưng cao hơn.' },
  { t: 2, zh: '麻', desc: 'Đi lên từ giữa lên cao.', vn: 'Gần dấu sắc.' },
  { t: 3, zh: '马', desc: 'Xuống thấp rồi vòng lên. Khi nói nhanh thường chỉ xuống thấp.', vn: 'Gần dấu hỏi.' },
  { t: 4, zh: '骂', desc: 'Rơi mạnh từ cao xuống thấp, dứt khoát.', vn: 'Giữa dấu huyền và dấu nặng.' },
];

const SANDHI = [
  { rule: 'Hai thanh 3 đi liền nhau: thanh 3 đầu đọc thành thanh 2.', ex: '你好', py: 'nǐ hǎo → ní hǎo' },
  { rule: '不 (bù) đứng trước thanh 4 đọc thành bú.', ex: '不是', py: 'bù shì → bú shì' },
  { rule: '一 (yī) trước thanh 4 đọc thành yí.', ex: '一个', py: 'yī gè → yí ge' },
  { rule: '一 (yī) trước thanh 1, 2, 3 đọc thành yì.', ex: '一百', py: 'yī bǎi → yì bǎi' },
];

const TABS = [['tones', 'Thanh điệu'], ['chart', 'Bảng âm tiết'], ['drill', 'Luyện nghe']];

export function render(root, params) {
  let tab = params.get('tab') ?? 'tones';
  let cleanup = null;

  root.innerHTML = `
    <section class="pinyin-page">
      <h1>Pinyin</h1>
      <div class="tabs">${TABS.map(([k, l]) => `<button class="tab" data-tab="${k}">${l}</button>`).join('')}</div>
      <div class="tab-body"></div>
    </section>`;
  const body = root.querySelector('.tab-body');

  function show(k) {
    cleanup?.();
    cleanup = null;
    body.onclick = null;
    tab = k;
    root.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === k));
    ({ tones, chart, drill })[k]();
  }

  function tones() {
    body.innerHTML = `
      <p>Tiếng Trung phổ thông có 4 thanh điệu và 1 thanh nhẹ. Cùng một âm "ma" nhưng khác thanh là khác nghĩa. Bấm để nghe:</p>
      <div class="tone-grid">${TONES.map((x) => `
        <button class="tone-card" data-syl="ma" data-tone="${x.t}">
          ${toneContour(x.t)}
          <span class="tone-py">${mark('ma', x.t)}</span>
          <span class="tone-zh">${x.zh}</span>
          <span class="tone-name">Thanh ${x.t}</span>
          <span class="tone-desc">${x.desc}</span>
          <span class="tone-vn">${x.vn}</span>
        </button>`).join('')}
      </div>
      <h3>Thanh nhẹ</h3>
      <p>Đọc ngắn và nhẹ, không có dấu. Thường gặp ở âm tiết thứ hai của từ.</p>
      <div class="chips">
        ${['妈妈 māma', '谢谢 xièxie', '朋友 péngyou', '我们 wǒmen'].map((s) => {
          const [zh, py] = s.split(' ');
          return `<button class="chip" data-word="${zh}">${zh} <span>${py}</span></button>`;
        }).join('')}
      </div>
      <h3>Quy tắc biến điệu</h3>
      <ul class="rules">${SANDHI.map((r) => `
        <li><span>${r.rule}</span>
          <button class="chip" data-speak="${r.ex}">${r.ex} <span>${r.py}</span></button></li>`).join('')}
      </ul>`;
  }

  function chart() {
    const groups = new Map();
    for (const key of state.syllables) {
      const base = key.slice(0, -1);
      if (base.startsWith('_')) continue;
      const [ini] = split(base);
      if (!groups.has(ini)) groups.set(ini, new Set());
      groups.get(ini).add(base);
    }
    const order = ['', ...INITIALS].filter((i) => groups.has(i));
    let current = 'b';

    body.innerHTML = `
      <p>Chọn thanh mẫu (phụ âm đầu), rồi bấm vào từng thanh để nghe.</p>
      <div class="initials">${order.map((i) => `<button class="chip" data-ini="${i}">${i || 'a, o, e…'}</button>`).join('')}</div>
      <div class="chart-body"></div>`;

    function showInitial(ini) {
      current = ini;
      body.querySelectorAll('[data-ini]').forEach((b) => b.classList.toggle('active', b.dataset.ini === ini));
      const bases = [...groups.get(ini)].sort((a, b) => a.length - b.length || a.localeCompare(b));
      body.querySelector('.chart-body').innerHTML = `
        <p class="tip"><b>${ini || 'Không có thanh mẫu'}</b>: ${esc(INITIAL_TIPS[ini] ?? '')}</p>
        <table class="syl-table"><tbody>${bases.map((b) => `
          <tr><th>${mark(b, 0)}</th>${[1, 2, 3, 4].map((t) => state.syllables.has(b + t)
            ? `<td><button class="syl" data-syl="${b}" data-tone="${t}">${mark(b, t)}</button></td>`
            : '<td></td>').join('')}</tr>`).join('')}
        </tbody></table>`;
    }
    body.onclick = (e) => {
      const b = e.target.closest('[data-ini]');
      if (b) showInitial(b.dataset.ini);
    };
    showInitial(groups.has(current) ? current : order[0]);
  }

  function drill() {
    const start = () => {
      cleanup = runDrill(body, {
        total: 10,
        doneLabel: 'Xem kết quả',
        onDone: ({ correct, total }) => {
          cleanup?.();
          cleanup = null;
          body.innerHTML = `
            <div class="summary">
              <h2>${correct}/${total} câu đúng</h2>
              <p class="muted">Những âm bạn nghe sai sẽ xuất hiện nhiều hơn ở các lần luyện sau.</p>
              <button class="btn primary" data-action="again">Luyện tiếp 10 câu</button>
            </div>`;
        },
      });
    };
    body.onclick = (e) => {
      if (e.target.closest('[data-action="again"]')) start();
    };
    start();
  }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) return show(t.dataset.tab);
    const syl = e.target.closest('[data-syl]');
    if (syl) return playSyllable(syl.dataset.syl, syl.dataset.tone);
    const w = e.target.closest('[data-word]');
    if (w) return playWord({ hanzi: w.dataset.word, audio: true });
    const sp = e.target.closest('[data-speak]');
    if (sp) speak(sp.dataset.speak);
  });

  show(tab);
  return () => { cleanup?.(); stop(); };
}
