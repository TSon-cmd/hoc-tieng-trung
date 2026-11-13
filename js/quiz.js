// Bộ chạy câu hỏi dùng chung: trắc nghiệm (choice) và sắp xếp từ thành câu (order).
// Câu hỏi:
//   { kind: 'choice', prompt, big?, bigClass?, play?, options: [{ label, sub?, correct }], after? }
//   { kind: 'order', prompt, big?, play?, tokens: [...], display?: [...], after? }
//   (display: chữ hiện trên từng cụm, ví dụ pinyin; tokens vẫn dùng để chấm)
import { esc, SPEAKER } from './ui.js';
import { icon } from './icons.js';

const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);

// next(i) trả về câu hỏi thứ i (null = dừng sớm); onAnswer(q, ok) được gọi sau mỗi câu.
// total = Infinity: không biết trước số câu (bài kiểm tra trình độ). allowSkip: có nút "Không biết".
export function runQuiz(root, { total, next, onAnswer, onDone, doneLabel = 'Tiếp tục', label = 'Câu', allowSkip = false }) {
  let i = 0, correct = 0, q, answered, picked;

  function show() {
    q = next(i);
    if (!q) return onDone({ correct, total: i });
    answered = false;
    picked = [];
    root.innerHTML = `
      <div class="quiz">
        <div class="progress-text">${label} ${i + 1}${Number.isFinite(total) ? `/${total}` : ''}</div>
        ${Number.isFinite(total) ? `<div class="bar"><span style="width:${(i / total) * 100}%"></span></div>` : ''}
        <p class="prompt">${q.prompt}</p>
        ${q.big ? `<div class="q-big ${q.bigClass ?? ''}">${q.big}</div>` : ''}
        ${q.play ? `<button class="big-play" data-action="replay">${SPEAKER}<span>Nghe lại <kbd>R</kbd></span></button>` : ''}
        <div class="q-body"></div>
        ${allowSkip ? `<button class="btn skip" data-action="skip">Không biết ${icon('arrow', 'sm')}</button>` : ''}
        <div class="feedback" aria-live="polite"></div>
      </div>`;
    q.kind === 'order' ? renderOrder() : renderChoice();
    q.play?.();
  }

  function renderChoice() {
    root.querySelector('.q-body').innerHTML = `
      <div class="options ${q.options.some((o) => o.label.length > 8) ? 'long' : ''}">
        ${q.options.map((o, k) => `<button class="option" data-opt="${k}">
          <span class="opt-label">${esc(o.label)}</span>${o.sub ? `<span class="opt-sub">${esc(o.sub)}</span>` : ''}<kbd>${k + 1}</kbd>
        </button>`).join('')}
      </div>`;
  }

  function renderOrder() {
    // Xáo lại nếu tình cờ ra đúng thứ tự câu (câu 3 từ có 1/6 khả năng)
    for (let n = 0; !q.bank || (n < 10 && q.bank.map((b) => b.t).join('') === q.tokens.join('')); n++) {
      q.bank = shuffle(q.tokens.map((t, k) => ({ t, k })));
    }
    const used = new Set(picked.map((p) => p.k));
    const label = (b) => esc(q.display?.[b.k] ?? b.t);
    const cls = q.display ? 'token py' : 'token';
    root.querySelector('.q-body').innerHTML = `
      <div class="answer-line">${picked.map((p, n) => `<button class="${cls} in" data-pick="${n}">${label(p)}</button>`).join('')
        || '<span class="muted">Bấm các từ bên dưới theo đúng thứ tự</span>'}</div>
      <div class="bank">${q.bank.map((b, n) => `<button class="${cls}" data-bank="${n}" ${used.has(b.k) ? 'disabled' : ''}>${label(b)}</button>`).join('')}</div>
      <button class="btn primary wide" data-action="check" ${picked.length === q.tokens.length ? '' : 'disabled'}>Kiểm tra <kbd>Enter</kbd></button>`;
  }

  async function finish(ok, rightHtml) {
    answered = true;
    root.querySelector('[data-action="skip"]')?.remove();
    if (ok) correct++;
    root.querySelector('.feedback').innerHTML = `
      <p class="${ok ? 'ok' : 'bad'}">${ok ? `${icon('check')} Chính xác!` : `${icon('x')} Chưa đúng. Đáp án: <b>${rightHtml}</b>`}</p>
      ${q.after ? `<div class="after">${q.after}</div>` : ''}
      <button class="btn primary" data-action="next">${i + 1 < total ? 'Câu tiếp' : doneLabel} <kbd>Enter</kbd></button>`;
    if (!ok) q.play?.();
    await onAnswer?.(q, ok);
  }

  function choose(k) {
    if (answered || q.kind !== 'choice' || !q.options[k]) return;
    const ok = q.options[k].correct;
    root.querySelectorAll('.option').forEach((b, idx) => {
      b.disabled = true;
      if (q.options[idx].correct) b.classList.add('correct');
      else if (idx === k) b.classList.add('wrong');
    });
    finish(ok, esc(q.options.find((o) => o.correct).label));
  }

  function check() {
    if (answered || q.kind !== 'order' || picked.length !== q.tokens.length) return;
    const ok = picked.map((p) => p.t).join('') === q.tokens.join('');
    root.querySelectorAll('.token, [data-action="check"]').forEach((b) => { b.disabled = true; });
    root.querySelector('.answer-line').classList.add(ok ? 'correct' : 'wrong');
    finish(ok, esc((q.display ?? q.tokens).join(' ')));
  }

  function skip() {
    if (answered) return;
    root.querySelectorAll('.option, .token, [data-action="check"]').forEach((b) => { b.disabled = true; });
    finish(false, esc(q.kind === 'order' ? (q.display ?? q.tokens).join(' ') : q.options.find((o) => o.correct).label));
  }

  function nextQ() {
    if (!answered) return;
    if (++i < total) show();
    else onDone({ correct, total });
  }

  const onClick = (e) => {
    const opt = e.target.closest('[data-opt]');
    if (opt) return choose(Number(opt.dataset.opt));
    const bank = e.target.closest('[data-bank]');
    if (bank && !answered) { picked.push(q.bank[Number(bank.dataset.bank)]); return renderOrder(); }
    const pick = e.target.closest('[data-pick]');
    if (pick && !answered) { picked.splice(Number(pick.dataset.pick), 1); return renderOrder(); }
    const a = e.target.closest('[data-action]')?.dataset.action;
    if (a === 'replay') q.play?.();
    if (a === 'check') check();
    if (a === 'skip') skip();
    if (a === 'next') nextQ();
  };
  const onKey = (e) => {
    if (e.target.closest('input, textarea, select') || e.repeat) return;
    if (/^[1-4]$/.test(e.key)) choose(Number(e.key) - 1);
    else if ((e.key === 'r' || e.key === 'R') && q.play) q.play();
    else if (e.key === 'Enter') {
      if (e.target.closest('button')) return; // để click của nút xử lý
      answered ? nextQ() : check();
    } else if (e.key === 'Backspace' && q.kind === 'order' && !answered && picked.length) {
      picked.pop();
      renderOrder();
    }
  };
  root.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  show();
  return () => { root.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); };
}
