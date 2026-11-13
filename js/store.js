import * as db from './db.js';
import { newCard, next, State } from './srs.js';
import { setSpeechFiles } from './audio.js';

// script: chữ dùng trong bài tập, kiểm tra và ôn thẻ — 'pinyin' (giai đoạn học giao tiếp) hoặc 'hanzi'
export const DEFAULT_SETTINGS = { pinyinPerSession: 10, script: 'pinyin' };
// Thẻ đang học (học lại) có hạn trong khoảng này thì được hỏi lại ngay trong phiên
export const REQUEUE_MS = 30 * 60 * 1000;
export const PASS_RATE = 0.8;

export const state = {
  words: [], topics: {},
  stages: [], lessons: {}, lessonOrder: [],   // lessonOrder: mọi bài theo thứ tự lộ trình
  byId: new Map(),               // id -> từ ({type:'word'}) hoặc câu ({type:'sentence'})
  syllables: new Set(),          // "ma1", "lv3"…
  cards: new Map(),              // id -> { id, card, introducedAt }
  meta: {},
};

export const dayKey = (d = new Date()) => d.toLocaleDateString('sv-SE'); // YYYY-MM-DD theo giờ máy

export async function init() {
  const [words, lessons, syl, speech, cards, meta] = await Promise.all([
    fetch('data/words.json').then((r) => r.json()),
    fetch('data/lessons.json').then((r) => r.json()),
    fetch('data/syllables.json').then((r) => r.json()),
    fetch('data/speech.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    db.getAll('cards'),
    db.getMetaAll(),
  ]);
  setSpeechFiles(speech);
  state.words = words.words.map((w) => ({ ...w, type: 'word' }));
  state.topics = words.topics;
  state.stages = lessons.stages;
  state.lessons = lessons.lessons;
  state.lessonOrder = lessons.stages.flatMap((s) => s.lessons.map((l) => ({ ...l, stage: s.id })));
  state.byId = new Map(state.words.map((w) => [w.id, w]));
  for (const L of Object.values(state.lessons)) {
    for (const s of L.sentences) state.byId.set(s.id, { ...s, type: 'sentence', lesson: L.id });
  }
  state.syllables = new Set(syl.syllables);
  state.cards = new Map(cards.filter((c) => state.byId.has(c.id)).map((c) => [c.id, c]));
  state.meta = meta;
  navigator.storage?.persist?.(); // xin trình duyệt không tự xóa dữ liệu
}

export const settings = () => ({ ...DEFAULT_SETTINGS, ...state.meta.settings });
export const pinyinMode = () => settings().script !== 'hanzi';

export async function setMeta(key, value) {
  state.meta[key] = value;
  await db.putMeta(key, value);
}

// ---- Lộ trình ----
export const lessonProgress = (id) => state.meta.lessons?.[id] ?? null;

// Bài mở khi là bài đầu tiên hoặc bài liền trước đã qua kiểm tra
export function isUnlocked(id) {
  const i = state.lessonOrder.findIndex((l) => l.id === id);
  return i === 0 || (i > 0 && !!lessonProgress(state.lessonOrder[i - 1].id)?.passedAt);
}

// Bài cần học tiếp: bài đầu tiên chưa qua
export const currentLesson = () => state.lessonOrder.find((l) => !lessonProgress(l.id)?.passedAt) ?? null;

export async function saveLessonResult(id, score) {
  const all = { ...(state.meta.lessons ?? {}) };
  const prev = all[id] ?? {};
  const passed = score >= PASS_RATE;
  all[id] = {
    ...prev,
    best: Math.max(prev.best ?? 0, score),
    attempts: (prev.attempts ?? 0) + 1,
    passedAt: prev.passedAt ?? (passed ? new Date().toISOString() : null),
  };
  await setMeta('lessons', all);
  if (passed) {
    const L = state.lessons[id];
    for (const itemId of [...L.words, ...L.sentences.map((s) => s.id)]) {
      if (!state.cards.has(itemId)) await introduce(itemId);
    }
  }
  await markStudied();
  return passed;
}

// ---- Kiểm tra trình độ ----
export const PLACE_PER_DAY = 20; // thẻ của bài "đã nắm" được rải dần vào lịch ôn, mỗi ngày tối đa chừng này

export async function saveLevelTest(result) {
  await setMeta('levelTests', [...(state.meta.levelTests ?? []), result].slice(-30));
  await markStudied();
}

// Đánh dấu các bài đã nắm qua bài kiểm tra trình độ: mở khóa bài sau, đưa từ và câu vào lịch ôn (rải theo ngày)
export async function placeLessons(scores) {
  const all = { ...(state.meta.lessons ?? {}) };
  const ids = [];
  for (const [id, score] of Object.entries(scores)) {
    if (all[id]?.passedAt) continue;
    all[id] = { ...all[id], best: Math.max(all[id]?.best ?? 0, score), passedAt: new Date().toISOString(), placed: true };
    const L = state.lessons[id];
    ids.push(...L.words, ...L.sentences.map((s) => s.id));
  }
  await setMeta('lessons', all);
  const fresh = [...new Set(ids)].filter((x) => !state.cards.has(x));
  for (const [n, itemId] of fresh.entries()) {
    const due = new Date();
    due.setDate(due.getDate() + Math.floor(n / PLACE_PER_DAY));
    if (n >= PLACE_PER_DAY) due.setHours(0, 0, 0, 0);
    await introduce(itemId, due);
  }
  return fresh.length;
}

// ---- Thẻ ôn tập ----
export function dueCards(now = new Date()) {
  return [...state.cards.values()]
    .filter((c) => new Date(c.card.due) <= now)
    .sort((a, b) => new Date(a.card.due) - new Date(b.card.due));
}

export function dueBefore(date) {
  return [...state.cards.values()].filter((c) => new Date(c.card.due) < date).length;
}

export async function introduce(id, due = new Date()) {
  const rec = { id, card: newCard(due), introducedAt: new Date().toISOString() };
  state.cards.set(id, rec);
  await db.putCard(rec);
  return rec;
}

export async function review(id, rating, now = new Date()) {
  const rec = state.cards.get(id);
  const before = rec.card.state;
  const { card } = next(rec.card, rating, now);
  const updated = { ...rec, card };
  state.cards.set(id, updated);
  await db.saveReview(updated, { itemId: id, rating, state: before, at: now.toISOString() });
  await markStudied();
  return updated;
}

export const isNew = (rec) => rec.card.state === State.New;

// ---- Tiến độ ----
export const MASTERED_DAYS = 21; // độ bền trí nhớ (stability FSRS) từ 21 ngày trở lên thì tính là đã thuộc

// learning: mới / đang học / học lại · remembering: đang nhớ · mastered: đã thuộc
export function mastery(rec) {
  if (rec.card.state !== State.Review) return 'learning';
  return rec.card.stability >= MASTERED_DAYS ? 'mastered' : 'remembering';
}

// Thẻ hay quên nhất (theo số lần quên), để ôn thêm
export const weakCards = (n = 12) => [...state.cards.values()]
  .filter((c) => c.card.lapses > 0)
  .sort((a, b) => b.card.lapses - a.card.lapses || a.card.stability - b.card.stability)
  .slice(0, n);

export async function markStudied() {
  const days = state.meta.days ?? [];
  if (!days.includes(dayKey())) await setMeta('days', [...days, dayKey()]);
}

export function streak() {
  const days = new Set(state.meta.days ?? []);
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1); // hôm nay chưa học thì streak tính đến hôm qua
  let n = 0;
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export async function reload() {
  await init();
}
