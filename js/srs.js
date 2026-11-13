import { fsrs, generatorParameters, createEmptyCard, Rating, State } from '../vendor/ts-fsrs.mjs';

export { Rating, State };

const scheduler = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: true }));

export const RATINGS = [
  { rating: Rating.Again, label: 'Quên', key: '1', cls: 'again' },
  { rating: Rating.Hard, label: 'Khó', key: '2', cls: 'hard' },
  { rating: Rating.Good, label: 'Được', key: '3', cls: 'good' },
  { rating: Rating.Easy, label: 'Dễ', key: '4', cls: 'easy' },
];

export const newCard = (now = new Date()) => createEmptyCard(now);

// Thẻ đọc từ IndexedDB/backup có thể mang ngày dạng chuỗi; ts-fsrs tự chuyển
export const next = (card, rating, now = new Date()) => scheduler.next(card, now, rating);

export function preview(card, now = new Date()) {
  const p = scheduler.repeat(card, now);
  return Object.fromEntries(RATINGS.map(({ rating }) => [rating, formatInterval(p[rating].card.due - now)]));
}

export function formatInterval(ms) {
  const min = ms / 60000;
  if (min < 1) return '<1 phút';
  if (min < 60) return `${Math.round(min)} phút`;
  const h = min / 60;
  if (h < 24) return `${Math.round(h)} giờ`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)} ngày`;
  if (d < 365) return `${Math.round(d / 30)} tháng`;
  return `${(d / 365).toFixed(1)} năm`;
}
