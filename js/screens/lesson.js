// Một bài học: Từ vựng -> Ngữ pháp -> Mẫu câu -> Luyện tập -> Kiểm tra
import { state, isUnlocked, lessonProgress, saveLessonResult, currentLesson, PASS_RATE, pinyinMode } from '../store.js';
import { playWord, speak, stop } from '../audio.js';
import { esc, SPEAKER } from '../ui.js';
import { runQuiz } from '../quiz.js';
import { practiceSet, testSet } from '../exercises.js';
import { runShadow } from '../shadow.js';
import { icon, ring } from '../icons.js';

// "✗ … → ✓ …" trong mục Lỗi hay gặp: tô đỏ/xanh
const marks = (html) => html.replace(/✗/g, '<span class="m-bad">✗</span>').replace(/✓/g, '<span class="m-good">✓</span>');

const TABS = [['vocab', 'Từ vựng'], ['grammar', 'Ngữ pháp'], ['sentences', 'Mẫu câu'], ['practice', 'Luyện tập'], ['test', 'Kiểm tra']];

const speakBtn = (text) => `<button class="icon-btn sm" data-speak="${esc(text)}" title="Nghe" aria-label="Nghe">${SPEAKER}</button>`;

export function render(root, params) {
  const id = params.get('id');
  const meta = state.lessonOrder.find((l) => l.id === id);
  const L = state.lessons[id];
  const num = state.lessonOrder.filter((l) => l.stage === meta?.stage).findIndex((l) => l.id === id) + 1;

  if (!meta) { root.innerHTML = '<p>Không tìm thấy bài học. <a href="#/">Về lộ trình</a></p>'; return; }
  // Chế độ pinyin: lời giảng dùng bản pinyin, từ/câu lấy pinyin làm chữ chính, chữ Hán nhỏ bên dưới
  const P = pinyinMode();
  const g$ = (g, k) => (P && g.py ? g.py[k] : g[k]);
  const pair = (zh, py) => (P
    ? `<span class="py-main">${esc(py)}</span><br><span class="zh muted">${esc(zh)}</span>`
    : `<span class="zh">${esc(zh)}</span><br><span class="muted">${esc(py)}</span>`);
  const head = `
    <a href="#/" class="back">${icon('back', 'sm')} Lộ trình</a>
    <p class="eyebrow">${esc(state.stages.find((s) => s.id === meta.stage).title)} · Bài ${num}</p>
    <h1 class="lesson-title"><span class="lt-zh ${P ? '' : 'zh'}">${esc(P ? meta.py ?? meta.zh : meta.zh)}</span>${esc(meta.title)}</h1>`;
  if (!L) {
    root.innerHTML = `<section class="lesson">${head}<p class="warn">Bài này đang được soạn. Học xong các bài trước nhé!</p></section>`;
    return;
  }
  if (!isUnlocked(id)) {
    const cur = currentLesson();
    root.innerHTML = `<section class="lesson">${head}
      <p class="warn">${icon('lock')}<span>Bài này sẽ mở khi bạn qua bài kiểm tra của bài trước (đạt từ ${PASS_RATE * 100}%).</span></p>
      ${cur ? `<a class="btn primary" href="#/lesson?id=${cur.id}">Học bài hiện tại: ${esc(cur.title)}</a>` : ''}</section>`;
    return;
  }

  let cleanup = null;
  const words = L.words.map((w) => state.byId.get(w));
  const prog = lessonProgress(id);

  root.innerHTML = `
    <section class="lesson">
      ${head}
      <p class="goal">${icon('target')}<span>${esc(P ? L.goalPy ?? L.goal : L.goal)}</span></p>
      ${prog?.passedAt ? `<p class="done-badge">${icon('check', 'sm')} Đã qua bài · điểm cao nhất ${Math.round(prog.best * 100)}%</p>` : ''}
      <div class="tabs lesson-tabs">${TABS.map(([k, l], i) => `<button class="tab" data-tab="${k}"><b>${i + 1}</b><span>${l}</span></button>`).join('')}</div>
      <div class="tab-body"></div>
    </section>`;
  const body = root.querySelector('.tab-body');

  const nextBtn = (k, label) => `<div class="actions"><button class="btn primary wide" data-tab="${k}">${label} ${icon('arrow')}</button></div>`;

  function show(k) {
    cleanup?.();
    cleanup = null;
    stop();
    root.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === k));
    ({ vocab, grammar, sentences, practice, test })[k]();
    if (k !== 'practice' && k !== 'test') root.querySelector('.tabs').scrollIntoView({ block: 'nearest' });
  }

  function vocab() {
    body.innerHTML = `
      <p class="muted">${words.length} ${L.review ? 'từ trọng tâm cần ôn lại' : 'từ mới'}. Bấm vào từ để nghe, đọc to theo.</p>
      <div class="vocab-list">${words.map((w) => `
        <div class="vocab-card">
          <div class="v-head">
            <button class="v-word" data-word="${w.id}">
              <span class="v-hanzi ${P ? 'v-py' : ''}">${esc(P ? w.pinyin : w.hanzi)}</span>
              <span class="v-sub ${P ? 'zh' : 'pinyin'}">${esc(P ? w.hanzi : w.pinyin)}</span>
            </button>
            <button class="icon-btn" data-word="${w.id}" aria-label="Nghe">${SPEAKER}</button>
          </div>
          <div class="v-vi">${esc(w.vi)}</div>
          ${w.example ? `<div class="v-ex"><div>${pair(w.example.zh, w.example.pinyin)}<br><i>${esc(w.example.vi)}</i></div>${speakBtn(w.example.zh)}</div>` : ''}
          ${w.note ? `<div class="note">${icon('bulb', 'sm')}<span>${esc(P ? w.notePy ?? w.note : w.note)}</span></div>` : ''}
        </div>`).join('')}
      </div>
      ${nextBtn('grammar', 'Sang phần Ngữ pháp')}`;
  }

  function grammar() {
    body.innerHTML = L.grammar.map((g, i) => `
      <article class="grammar">
        <h3><span class="g-num">${i + 1}</span> ${esc(g$(g, 'title'))}</h3>
        <div class="formula ${P ? 'f-py' : ''}">${esc(g$(g, 'formula'))}</div>
        <ul class="points">${g$(g, 'points').map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
        <div class="compare"><b class="callout-label"><span class="vi-block">VI</span> So với tiếng Việt</b><p>${esc(g$(g, 'compare'))}</p></div>
        <div class="examples"><b>Ví dụ</b>${g.examples.map(([zh, py, vi]) => `
          <div class="g-ex"><div>${pair(zh, py)}<br><i>${esc(vi)}</i></div>${speakBtn(zh)}</div>`).join('')}
        </div>
        <div class="mistakes"><b class="callout-label">${icon('alert')} Lỗi hay gặp</b><ul>${g$(g, 'mistakes').map((m) => `<li>${marks(esc(m))}</li>`).join('')}</ul></div>
      </article>`).join('') + nextBtn('sentences', 'Sang phần Mẫu câu');
  }

  function shadow() {
    cleanup?.();
    cleanup = runShadow(body, L.sentences, {
      doneLabel: 'xem kết quả',
      onDone: ({ good, total }) => {
        cleanup?.();
        cleanup = null;
        body.innerHTML = `
          <div class="summary">
            ${ring((good / total) * 100, 'tự thấy giống')}
            <h2>Đọc theo mẫu: ${good}/${total} câu</h2>
            <p class="muted">Đọc to mỗi ngày giúp quen miệng với thanh điệu. Câu nào chưa giống, nghe mẫu thêm vài lần rồi đọc lại.</p>
            <div class="row center">
              <button class="btn" data-action="shadow">Đọc lại từ đầu</button>
              <button class="btn primary" data-tab="practice">Bắt đầu luyện tập ${icon('arrow')}</button>
            </div>
          </div>`;
      },
    });
  }

  function sentences() {
    body.innerHTML = `
      <p class="muted">Đọc to từng câu. Đây là những câu bạn sẽ ghép lại trong phần luyện tập.</p>
      <button class="btn primary wide sh-start" data-action="shadow">${icon('mic')} Luyện đọc theo mẫu (${L.sentences.length} câu): nghe, ghi âm, so sánh</button>
      <div class="sent-list">${L.sentences.map((s) => `
        <div class="sent-card"><div>${P
          ? `<div class="py-main big">${esc(s.pinyin)}</div><div class="zh muted">${esc(s.zh)}</div>`
          : `<div class="zh big">${esc(s.zh)}</div><div class="pinyin-sm">${esc(s.pinyin)}</div>`}<div>${esc(s.vi)}</div></div>${speakBtn(s.zh)}</div>`).join('')}
      </div>
      ${nextBtn('practice', 'Bắt đầu luyện tập')}`;
  }

  function practice() {
    const set = practiceSet(id);
    cleanup = runQuiz(body, {
      total: set.length, label: 'Bài tập', next: (i) => set[i](), doneLabel: 'Xem kết quả',
      onDone: ({ correct, total }) => {
        cleanup?.();
        cleanup = null;
        body.innerHTML = `
          <div class="summary">
            ${ring((correct / total) * 100, 'luyện tập')}
            <h2>Luyện tập: ${correct}/${total} câu đúng</h2>
            <p class="muted">${correct / total >= PASS_RATE ? 'Tốt lắm! Sẵn sàng làm bài kiểm tra.' : 'Nên xem lại ngữ pháp và mẫu câu, hoặc luyện thêm một lượt.'}</p>
            <div class="row center">
              <button class="btn" data-tab="practice">Luyện lại</button>
              <button class="btn primary" data-tab="test">Làm bài kiểm tra ${icon('arrow')}</button>
            </div>
          </div>`;
      },
    });
  }

  function test() {
    const set = testSet(id, L.review ? 16 : 10);
    cleanup = runQuiz(body, {
      total: set.length, label: 'Kiểm tra', next: (i) => set[i](), doneLabel: 'Nộp bài',
      onDone: async ({ correct, total }) => {
        cleanup?.();
        cleanup = null;
        const passed = await saveLessonResult(id, correct / total);
        const nxt = state.lessonOrder[state.lessonOrder.findIndex((l) => l.id === id) + 1];
        body.innerHTML = passed ? `
          <div class="summary">
            ${ring((correct / total) * 100, 'đã qua bài')}
            <h2>Qua bài! ${correct}/${total} câu đúng</h2>
            <p>Từ vựng và mẫu câu của bài đã được đưa vào lịch ôn tập hằng ngày.</p>
            ${nxt ? `<a class="btn primary wide" href="#/lesson?id=${nxt.id}">Bài tiếp: ${esc(P ? nxt.py ?? nxt.zh : nxt.zh)} · ${esc(nxt.title)} ${icon('arrow')}</a>` : ''}
            <a class="btn wide" href="#/">Về lộ trình</a>
          </div>` : `
          <div class="summary">
            ${ring((correct / total) * 100, `cần ${PASS_RATE * 100}%`)}
            <h2>${correct}/${total} câu đúng</h2>
            <p>Cần đúng từ ${Math.ceil(total * PASS_RATE)}/${total} câu để qua bài. Xem lại phần còn yếu rồi thử lại nhé.</p>
            <div class="row center">
              <button class="btn" data-tab="grammar">Xem lại ngữ pháp</button>
              <button class="btn primary" data-tab="test">Làm lại bài kiểm tra</button>
            </div>
          </div>`;
      },
    });
  }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) return show(t.dataset.tab);
    const w = e.target.closest('[data-word]');
    if (w) return playWord(state.byId.get(w.dataset.word));
    const sp = e.target.closest('[data-speak]');
    if (sp) return speak(sp.dataset.speak);
    if (e.target.closest('[data-action="shadow"]')) shadow();
  });

  show(params.get('tab') ?? 'vocab');
  return () => { cleanup?.(); stop(); };
}
