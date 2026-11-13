import { state } from '../store.js';
import { State, formatInterval } from '../srs.js';
import { playWord } from '../audio.js';
import { esc } from '../ui.js';

function status(rec) {
  if (!rec) return ['new', 'Chưa học'];
  const { card } = rec;
  const ms = new Date(card.due) - Date.now();
  if (ms <= 0) return ['due', 'Đến hạn ôn'];
  if (card.state === State.Review) return ['review', `Ôn sau ${formatInterval(ms)}`];
  return ['learning', 'Đang học'];
}

const row = (w) => {
  const [cls, label] = status(state.cards.get(w.id));
  return `<button class="word-row" data-id="${w.id}">
    <span class="w-hanzi">${esc(w.hanzi)}</span>
    <span class="w-main"><span class="w-py">${esc(w.pinyin)}</span><span class="w-vi">${esc(w.vi ?? w.en)}</span></span>
    <span class="badge ${cls}">${label}</span>
  </button>`;
};

export function render(root) {
  const inLessons = new Set();
  const groups = [];
  for (const l of state.lessonOrder) {
    const L = state.lessons[l.id];
    if (!L) continue;
    groups.push([`Bài: ${l.zh} ${l.title}`, L.words.map((id) => state.byId.get(id))]);
    L.words.forEach((id) => inLessons.add(id));
  }
  const rest = state.words.filter((w) => !inLessons.has(w.id));
  for (const [k, name] of Object.entries(state.topics)) {
    const list = rest.filter((w) => w.topic === k);
    if (list.length) groups.push([`Chưa vào bài · ${name}`, list]);
  }
  const learned = state.words.filter((w) => state.cards.has(w.id)).length;

  root.innerHTML = `
    <section class="words-page">
      <h1>Từ vựng</h1>
      <p class="muted">${learned}/${state.words.length} từ đã học. Bấm vào một từ để nghe.</p>
      ${groups.map(([name, list]) => `<h3>${esc(name)}</h3><div class="word-list">${list.map(row).join('')}</div>`).join('')}
    </section>`;
  root.addEventListener('click', (e) => {
    const r = e.target.closest('[data-id]');
    if (r) playWord(state.byId.get(r.dataset.id));
  });
}
