// Ôn tập hằng ngày: thẻ đến hạn (từ + mẫu câu) -> Thanh điệu -> Tổng kết
// Chế độ 5 phút (?quick=1, cho ngày bận): chỉ ôn tối đa QUICK_CARDS thẻ đến hạn để giữ streak
import { state, settings, dueCards, weakCards, review, streak, dueBefore, REQUEUE_MS, markStudied, pinyinMode } from '../store.js';
import { RATINGS, Rating, preview } from '../srs.js';
import { stop } from '../audio.js';
import { esc, wordDetails, sentenceDetails, bindWordAudio, playItem, runDrill } from '../ui.js';
import { runShadow } from '../shadow.js';
import { icon, ring } from '../icons.js';

export const QUICK_CARDS = 15; // ~20 giây mỗi thẻ ≈ 5 phút
const QUICK_DRILL = 5;         // không có thẻ đến hạn thì làm vài câu thanh điệu để vẫn giữ streak
const SPEAK_SENTENCES = 3;     // số câu đọc to theo mẫu mỗi phiên

export function render(root, params) {
  const quick = !!params.get('quick');
  // ?weak=1: ôn thêm các thẻ hay quên (từ màn Tiến độ), kể cả khi chưa đến hạn
  const cards = params.get('weak') ? weakCards() : dueCards();
  const s = {
    phase: null, queue: (quick ? cards.slice(0, QUICK_CARDS) : cards).map((c) => c.id), current: null, flipped: false,
    stats: { reviewed: 0, remembered: 0, drill: null }, firstSeen: new Set(),
  };
  const cleanups = [];
  // Đọc to theo mẫu: vài câu đã học, chọn ngẫu nhiên (chỉ phiên đầy đủ, khi đã học ít nhất một bài)
  const speakItems = quick ? [] : [...state.cards.keys()]
    .map((id) => state.byId.get(id)).filter((it) => it?.type === 'sentence')
    .sort(() => Math.random() - 0.5).slice(0, SPEAK_SENTENCES);
  const STEPS = !quick ? [['review', 'Ôn tập'], ['drill', 'Thanh điệu'], ...(speakItems.length ? [['speak', 'Đọc to']] : []), ['summary', 'Tổng kết']]
    : s.queue.length ? [['review', 'Ôn nhanh 5 phút'], ['summary', 'Tổng kết']]
    : [['drill', 'Thanh điệu'], ['summary', 'Tổng kết']];

  root.innerHTML = `
    <div class="session">
      <div class="steps">${STEPS.map(([k, l]) => `<span class="step" data-step="${k}">${l}</span>`).join('')}
        <a href="#/" class="exit" title="Thoát (tiến độ đã được lưu)" aria-label="Thoát">${icon('close')}</a></div>
      <div class="stage"></div>
    </div>`;
  const stage = root.querySelector('.stage');
  bindWordAudio(stage, () => state.byId.get(s.current));

  function setPhase(p) {
    s.phase = p;
    const cur = STEPS.findIndex(([k]) => k === p);
    root.querySelectorAll('.step').forEach((el, idx) => {
      el.classList.toggle('active', idx === cur);
      el.classList.toggle('done', idx < cur);
    });
  }

  // ---- Ôn thẻ ----
  function showCard() {
    if (!s.queue.length) return quick && s.stats.reviewed ? showSummary() : startDrill();
    s.current = s.queue[0];
    s.flipped = false;
    const item = state.byId.get(s.current);
    const front = item.type === 'sentence'
      ? `<p class="muted">Nói câu này bằng tiếng Trung:</p><div class="sent-vi">${esc(item.vi)}</div>`
      : pinyinMode()
        ? `<div class="pinyin-big">${esc(item.pinyin)}</div><p class="muted">Nhớ lại nghĩa của từ, rồi lật thẻ.</p>`
        : `<div class="hanzi">${esc(item.hanzi)}</div><p class="muted">Nhớ lại cách đọc và nghĩa, rồi lật thẻ.</p>`;
    stage.innerHTML = `
      <div class="card front">
        <div class="progress-text">Còn ${s.queue.length} thẻ</div>
        ${front}
      </div>
      <div class="actions"><button class="btn primary wide" data-action="flip">Lật thẻ <kbd>Space</kbd></button></div>`;
  }

  function flip() {
    if (s.flipped || !s.current) return;
    s.flipped = true;
    const item = state.byId.get(s.current);
    const iv = preview(state.cards.get(s.current).card);
    stage.innerHTML = `
      <div class="card back">${item.type === 'sentence' ? sentenceDetails(item) : wordDetails(item)}</div>
      <div class="ratings">${RATINGS.map((r) => `
        <button class="rate ${r.cls}" data-rate="${r.rating}">
          <span>${r.label}</span><small>${iv[r.rating]}</small><kbd>${r.key}</kbd>
        </button>`).join('')}</div>`;
    playItem(item, { quiet: true });
  }

  async function rate(rating) {
    if (!s.flipped) return;
    s.flipped = false;
    const id = s.queue.shift();
    if (!s.firstSeen.has(id)) {
      s.firstSeen.add(id);
      s.stats.reviewed++;
      if (rating !== Rating.Again) s.stats.remembered++;
    }
    const rec = await review(id, rating);
    if (new Date(rec.card.due) - Date.now() < REQUEUE_MS) s.queue.push(id);
    showCard();
  }

  // ---- Thanh điệu ----
  function startDrill() {
    setPhase('drill');
    s.current = null;
    cleanups.push(runDrill(stage, {
      total: quick ? QUICK_DRILL : settings().pinyinPerSession,
      doneLabel: 'Xem tổng kết',
      onDone: async (score) => { s.stats.drill = score; await markStudied(); startSpeak(); },
    }));
  }

  // ---- Đọc to theo mẫu ----
  function startSpeak() {
    cleanups.splice(0).forEach((f) => f());
    if (!speakItems.length) return showSummary();
    setPhase('speak');
    cleanups.push(runShadow(stage, speakItems, {
      doneLabel: 'tổng kết',
      onDone: (score) => { s.stats.speak = score; showSummary(); },
    }));
  }

  // ---- Tổng kết ----
  function showSummary() {
    setPhase('summary');
    cleanups.splice(0).forEach((f) => f());
    const { reviewed, remembered, drill, speak } = s.stats;
    const endOfTomorrow = new Date();
    endOfTomorrow.setHours(48, 0, 0, 0);
    stage.innerHTML = `
      <div class="summary">
        ${reviewed ? ring((remembered / reviewed) * 100, 'tỷ lệ nhớ') : ''}
        <h2>${quick ? 'Xong 5 phút, đã giữ streak!' : 'Xong phiên ôn tập!'}</h2>
        ${quick && dueCards().length ? `<p class="muted">Còn ${dueCards().length} thẻ đến hạn, ôn tiếp khi rảnh nhé.</p>` : ''}
        <div class="stats">
          <div class="stat"><b>${streak()}</b><span>ngày liên tiếp</span></div>
          <div class="stat"><b>${reviewed}</b><span>thẻ đã ôn</span></div>
          <div class="stat"><b>${reviewed ? Math.round((remembered / reviewed) * 100) + '%' : '–'}</b><span>tỷ lệ nhớ</span></div>
          <div class="stat"><b>${drill ? `${drill.correct}/${drill.total}` : '–'}</b><span>thanh điệu</span></div>
          ${speak ? `<div class="stat"><b>${speak.good}/${speak.total}</b><span>câu đọc to</span></div>` : ''}
          <div class="stat"><b>${dueBefore(endOfTomorrow)}</b><span>thẻ ôn ngày mai</span></div>
        </div>
        <a href="#/" class="btn primary wide">Về lộ trình</a>
      </div>`;
  }

  // ---- Sự kiện ----
  stage.addEventListener('click', (e) => {
    const r = e.target.closest('[data-rate]');
    if (r) return rate(Number(r.dataset.rate));
    if (e.target.closest('[data-action="flip"]')) flip();
  });
  const onKey = (e) => {
    if (e.repeat || s.phase !== 'review') return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
    else if (/^[1-4]$/.test(e.key)) rate(Number(e.key));
  };
  document.addEventListener('keydown', onKey);

  setPhase('review');
  showCard();
  return () => {
    stop();
    cleanups.forEach((f) => f());
    document.removeEventListener('keydown', onKey);
  };
}
