// Câu hỏi luyện nghe pinyin: nghe chọn thanh điệu, hoặc nghe chọn âm tiết giữa các âm dễ nhầm
import { state, setMeta } from './store.js';
import { parse, mark, confusables } from './pinyin.js';
import { playSyllable } from './audio.js';

const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);

// Âm tiết lấy từ chính bộ từ vựng, chỉ giữ thanh 1-4 có file thu
export function pool() {
  const seen = new Map();
  for (const w of state.words) {
    for (const s of parse(w.pinyinNumeric)) {
      const key = s.base + s.tone;
      if (s.tone <= 4 && state.syllables.has(key)) seen.set(key, s);
    }
  }
  return [...seen.values()];
}

function pickWeighted(items, misses) {
  const weights = items.map((s) => 1 + 2 * (misses[s.base + s.tone] ?? 0));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) if ((r -= weights[i]) < 0) return items[i];
  return items[items.length - 1];
}

export function makeQuestion(items = pool()) {
  const target = pickWeighted(items, state.meta.pinyinMiss ?? {});
  const exists = (b) => [1, 2, 3, 4].some((t) => state.syllables.has(b + t));
  const alts = confusables(target.base, exists);

  if (alts.length && Math.random() < 0.5) {
    const bases = shuffle([target.base, ...shuffle(alts).slice(0, 3)]);
    return {
      type: 'syllable', prompt: 'Bạn nghe thấy âm tiết nào?', target,
      options: bases.map((b) => ({ label: mark(b, target.tone), correct: b === target.base })),
    };
  }
  return {
    type: 'tone', prompt: 'Âm tiết này mang thanh mấy?', target,
    options: [1, 2, 3, 4].map((t) => ({ label: mark(target.base, t), sub: `Thanh ${t}`, correct: t === target.tone })),
  };
}

export const play = (q) => playSyllable(q.target.base, q.target.tone);

// Sai thì tăng trọng số để âm đó xuất hiện nhiều hơn; đúng thì giảm dần
export async function record(q, correct) {
  const misses = { ...(state.meta.pinyinMiss ?? {}) };
  const key = q.target.base + q.target.tone;
  misses[key] = correct ? Math.max(0, (misses[key] ?? 0) - 1) : (misses[key] ?? 0) + 1;
  if (!misses[key]) delete misses[key];
  await setMeta('pinyinMiss', misses);
}
