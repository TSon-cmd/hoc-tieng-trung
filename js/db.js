// IndexedDB: cards (tiến độ từng từ), reviews (lịch sử đánh giá), meta (cài đặt, streak…)
const DB_NAME = 'hoc-tieng-trung';
const STORES = ['cards', 'reviews', 'meta'];
let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('cards', { keyPath: 'id' });
      db.createObjectStore('reviews', { keyPath: 'seq', autoIncrement: true });
      db.createObjectStore('meta');
    };
    req.onsuccess = () => {
      const db = req.result;
      // Tab khác cần nâng cấp/xóa DB: đóng kết nối để không chặn, lần sau mở lại
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const result = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const complete = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = tx.onabort = () => reject(tx.error);
});

async function store(name, mode = 'readonly') {
  return (await open()).transaction(name, mode).objectStore(name);
}

export async function getAll(name) {
  return result((await store(name)).getAll());
}

export async function getMetaAll() {
  const s = await store('meta');
  const [keys, values] = await Promise.all([result(s.getAllKeys()), result(s.getAll())]);
  return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
}

// Báo cho phần đồng bộ biết tiến độ vừa đổi (để đẩy lên máy kia)
const changed = (x) => { window.dispatchEvent(new Event('data-changed')); return x; };

export async function putMeta(key, value) {
  return changed(await result((await store('meta', 'readwrite')).put(value, key)));
}

export async function putCard(rec) {
  return changed(await result((await store('cards', 'readwrite')).put(rec)));
}

// Lưu thẻ + log đánh giá trong cùng một transaction để không lệch nhau
export async function saveReview(cardRec, review) {
  const tx = (await open()).transaction(['cards', 'reviews'], 'readwrite');
  tx.objectStore('cards').put(cardRec);
  tx.objectStore('reviews').add(review);
  return changed(await complete(tx));
}

export async function exportAll() {
  return { cards: await getAll('cards'), reviews: await getAll('reviews'), meta: await getMetaAll() };
}

export async function replaceAll({ cards, reviews, meta }) {
  const tx = (await open()).transaction(STORES, 'readwrite');
  STORES.forEach((n) => tx.objectStore(n).clear());
  cards.forEach((c) => tx.objectStore('cards').put(c));
  reviews.forEach((r) => tx.objectStore('reviews').put(r));
  Object.entries(meta).forEach(([k, v]) => tx.objectStore('meta').put(v, k));
  return complete(tx);
}
