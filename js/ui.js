import { playWord, speak } from './audio.js';
import { makeQuestion, play as playQuestion, record } from './drill.js';
import { runQuiz } from './quiz.js';
import { pinyinMode } from './store.js';
import { icon } from './icons.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const SPEAKER = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';

export const speakerBtn = (action, label = 'Nghe') =>
  `<button class="icon-btn" data-action="${action}" title="${label}" aria-label="${label}">${SPEAKER}</button>`;

// Mặt sau thẻ / màn giới thiệu từ mới. Chế độ pinyin: pinyin là chữ chính, chữ Hán nhỏ bên dưới
export function wordDetails(w) {
  const ex = w.example;
  const py = pinyinMode();
  return `
    ${py ? `<div class="pinyin-big">${esc(w.pinyin)} ${speakerBtn('play-word')}</div><div class="hanzi-sm">${esc(w.hanzi)}</div>`
      : `<div class="hanzi">${esc(w.hanzi)}</div>
         <div class="pinyin-row"><span class="pinyin">${esc(w.pinyin)}</span>${speakerBtn('play-word')}</div>`}
    <div class="meaning">${esc(w.vi ?? w.en)}</div>
    ${ex ? `<div class="example">
      ${py ? `<div class="ex-zh ex-py-main">${esc(ex.pinyin)} ${speakerBtn('play-example', 'Nghe câu ví dụ')}</div>
              <div class="ex-py">${esc(ex.zh)}</div>`
        : `<div class="ex-zh">${esc(ex.zh)} ${speakerBtn('play-example', 'Nghe câu ví dụ')}</div>
           <div class="ex-py">${esc(ex.pinyin)}</div>`}
      <div class="ex-vi">${esc(ex.vi)}</div>
    </div>` : ''}
    ${w.note ? `<div class="note">${icon('bulb', 'sm')}<span>${esc(pinyinMode() ? w.notePy ?? w.note : w.note)}</span></div>` : ''}`;
}

// Mặt sau thẻ mẫu câu
export function sentenceDetails(s) {
  return pinyinMode() ? `
    <div class="sent-zh sent-py">${esc(s.pinyin)} ${speakerBtn('play-word')}</div>
    <div class="hanzi-sm">${esc(s.zh)}</div>
    <div class="meaning">${esc(s.vi)}</div>` : `
    <div class="sent-zh">${esc(s.zh)} ${speakerBtn('play-word')}</div>
    <div class="pinyin">${esc(s.pinyin)}</div>
    <div class="meaning">${esc(s.vi)}</div>`;
}

export const playItem = (item, { quiet = false } = {}) =>
  (item.type === 'sentence' ? speak(item.zh, { quiet }) : playWord(item));

export function bindWordAudio(root, getItem) {
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]')?.dataset.action;
    const item = getItem();
    if (!item) return;
    if (a === 'play-word') playItem(item);
    if (a === 'play-example' && item.example) speak(item.example.zh);
  });
}

// Chạy một loạt câu hỏi nghe pinyin; xong thì gọi onDone({ correct, total })
export function runDrill(root, { total, onDone, doneLabel = 'Tiếp tục' }) {
  return runQuiz(root, {
    total, onDone, doneLabel,
    next: () => {
      const q = makeQuestion();
      return { kind: 'choice', prompt: q.prompt, play: () => playQuestion(q), options: q.options, drill: q };
    },
    onAnswer: (q, ok) => record(q.drill, ok),
  });
}
