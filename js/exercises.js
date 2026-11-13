// Sinh bài tập cho một bài học từ từ vựng và mẫu câu của bài (và các bài trước làm phương án nhiễu)
import { state, pinyinMode } from './store.js';
import { playWord, speak, canSpeak } from './audio.js';
import { esc } from './ui.js';

const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function choices(correct, pool, n = 3) {
  const others = shuffle([...new Set(pool.filter((x) => x && x !== correct))]).slice(0, n);
  return shuffle([correct, ...others]).map((label) => ({ label, correct: label === correct }));
}

function context(lessonId) {
  const idx = state.lessonOrder.findIndex((l) => l.id === lessonId);
  const upto = state.lessonOrder.slice(0, idx + 1).map((l) => state.lessons[l.id]).filter(Boolean);
  const L = state.lessons[lessonId];
  const words = L.words.map((id) => state.byId.get(id));
  // Phương án nhiễu: từ của bài này + bài trước; thiếu thì lấy thêm từ danh sách chung
  const wordPool = [...new Set([...upto.flatMap((x) => x.words), ...state.words.slice(0, 40).map((w) => w.id)])]
    .map((id) => state.byId.get(id));
  const sentPool = upto.flatMap((x) => x.sentences);
  return { L, words, wordPool, sentPool };
}

// Chữ hiển thị trong câu hỏi: pinyin (mặc định, giai đoạn học giao tiếp) hoặc chữ Hán
const wordLabel = (w) => (pinyinMode() ? w.pinyin : w.hanzi);
const sentLabel = (s) => (pinyinMode() ? s.pinyin : s.zh);
const tokenLabels = (s) => (pinyinMode() && s.tokensPinyin ? s.tokensPinyin : s.tokens);
const bigWord = (w) => (pinyinMode() ? { big: esc(w.pinyin), bigClass: 'py' } : { big: esc(w.hanzi), bigClass: 'zh' });

const sentenceAfter = (s) => (pinyinMode()
  ? `<div class="ex-zh ex-py-main">${esc(s.pinyin)}</div><div class="ex-py">${esc(s.zh)}</div>`
  : `<div class="ex-zh">${esc(s.zh)}</div><div class="ex-py">${esc(s.pinyin)}</div>`) + `<div class="ex-vi">${esc(s.vi)}</div>`;
const wordAfter = (w) => `<b>${esc(w.hanzi)}</b> ${esc(w.pinyin)} · ${esc(w.vi)}`;

const GEN = {
  wordToVi: (w, c) => ({
    kind: 'choice', prompt: 'Từ này nghĩa là gì?', ...bigWord(w),
    play: () => playWord(w), options: choices(w.vi, c.wordPool.map((x) => x.vi)), after: wordAfter(w),
  }),
  viToWord: (w, c) => ({
    kind: 'choice', prompt: 'Chọn từ tiếng Trung đúng nghĩa:', big: esc(w.vi),
    options: choices(wordLabel(w), c.wordPool.map(wordLabel)), after: wordAfter(w),
  }),
  listenWord: (w, c) => w.audio && ({
    kind: 'choice', prompt: 'Nghe và chọn từ đúng:', play: () => playWord(w),
    options: choices(wordLabel(w), c.wordPool.map(wordLabel)), after: wordAfter(w),
  }),
  viToSentence: (s, c) => ({
    kind: 'choice', prompt: 'Câu nào đúng nghĩa này?', big: esc(s.vi),
    options: choices(sentLabel(s), c.sentPool.map(sentLabel)), after: sentenceAfter(s),
  }),
  order: (s) => s.tokens.length >= 3 && ({
    kind: 'order', prompt: 'Sắp xếp thành câu đúng:', big: esc(s.vi), tokens: s.tokens, display: tokenLabels(s),
    after: sentenceAfter(s),
  }),
  fill: (s, c) => {
    const known = new Set(c.wordPool.map((w) => w.hanzi));
    const slots = s.tokens.map((t, i) => [t, i]).filter(([t]) => known.has(t));
    if (s.tokens.length < 2 || !slots.length) return null;
    const [answer, at] = pick(slots);
    const labels = tokenLabels(s);
    const shown = labels.map((t, i) => (i === at ? '<span class="blank">＿＿</span>' : esc(t))).join(' ');
    // Phương án nhiễu bỏ chính từ đáp án (pinyin từ điển "bù" khác pinyin trong câu "bú" nhưng là một từ)
    const pool = c.words.concat(c.wordPool).filter((w) => w.hanzi !== answer).map(wordLabel);
    return {
      kind: 'choice', prompt: 'Điền từ còn thiếu:',
      big: `<div class="${pinyinMode() ? 'py' : 'zh'}">${shown}</div><div class="q-sub">${esc(s.vi)}</div>`,
      options: choices(labels[at], pool), after: sentenceAfter(s),
    };
  },
  listenSentence: (s, c) => canSpeak(s.zh) && ({
    kind: 'choice', prompt: 'Nghe câu và chọn nghĩa đúng:', play: () => speak(s.zh),
    options: choices(s.vi, c.sentPool.map((x) => x.vi)), after: sentenceAfter(s),
  }),
};

// Kỹ năng mà mỗi dạng câu hỏi đo, dùng cho bài kiểm tra trình độ
export const SKILLS = { vocab: 'Từ vựng', sentence: 'Câu & ngữ pháp', listen: 'Nghe hiểu', tone: 'Thanh điệu' };
const SKILL_OF = {
  wordToVi: 'vocab', viToWord: 'vocab', listenWord: 'listen',
  viToSentence: 'sentence', order: 'sentence', fill: 'sentence', listenSentence: 'listen',
};

const WORD_TYPES = ['wordToVi', 'viToWord', 'listenWord'];
const SENT_TYPES = ['order', 'viToSentence', 'fill', 'order', 'listenSentence'];

function make(types, item, c) {
  for (const t of shuffle(types)) {
    const q = GEN[t](item, c);
    if (q) return { ...q, skill: SKILL_OF[t] };
  }
  return { ...GEN.viToSentence(item, c), skill: 'sentence' };
}

// Luyện tập: mỗi từ và mỗi câu xuất hiện ít nhất một lần
export function practiceSet(lessonId) {
  const c = context(lessonId);
  const qs = [
    ...c.words.map((w) => () => make(WORD_TYPES, w, c)),
    ...c.L.sentences.map((s) => () => make(SENT_TYPES, s, c)),
  ];
  return shuffle(qs);
}

// Kiểm tra: 10 câu, nghiêng về mẫu câu (ghép câu, điền từ, chọn câu)
export function testSet(lessonId, total = 10) {
  const c = context(lessonId);
  const nSent = Math.min(c.L.sentences.length, Math.ceil(total * 0.6));
  const sents = shuffle(c.L.sentences).slice(0, nSent).map((s) => () => make(['order', 'fill', 'viToSentence'], s, c));
  const words = shuffle(c.words).slice(0, total - nSent).map((w) => () => make(['viToWord', 'wordToVi', 'listenWord'], w, c));
  return shuffle([...sents, ...words]);
}

// Kiểm tra trình độ: một nhóm câu hỏi đại diện cho một bài (1 từ + 2 mẫu câu)
export function levelSet(lessonId) {
  const c = context(lessonId);
  const words = shuffle(c.words).slice(0, 1).map((w) => () => make(WORD_TYPES, w, c));
  const sents = shuffle(c.L.sentences).slice(0, 2).map((s) => () => make(['order', 'fill', 'viToSentence', 'listenSentence'], s, c));
  return [...words, ...sents];
}
