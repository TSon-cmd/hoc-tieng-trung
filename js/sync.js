// Đồng bộ tiến độ giữa máy tính và điện thoại qua một Gist bí mật trên tài khoản GitHub của anh Sơn.
// Mỗi lần đồng bộ: tải bản trên Gist -> GỘP với bản trong máy -> ghi lại cả hai nơi. Gộp chứ không ghi đè,
// nên học ở máy nào cũng không mất. Mã truy cập (token) chỉ lưu trong trình duyệt của từng máy.
import * as db from './db.js';

const CONFIG_KEY = 'sync-config';     // localStorage: { token, gistId, lastSync, login }
const FILE = 'hoc-tieng-trung-sync.json';
const DESCRIPTION = 'Học tiếng Trung: tiến độ đồng bộ giữa các máy (đừng xóa)';
const LOCAL_ONLY = ['settings', 'lastBackup']; // cài đặt hiển thị, lần tải file sao lưu: riêng từng máy

export const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=' + encodeURIComponent('Học tiếng Trung - đồng bộ');

export function syncConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) ?? null; } catch { return null; }
}
function saveConfig(cfg) {
  try { cfg ? localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)) : localStorage.removeItem(CONFIG_KEY); } catch { /* chế độ riêng tư */ }
}
const emit = (detail) => window.dispatchEvent(new CustomEvent('sync-status', { detail }));

async function gh(path, { token = syncConfig()?.token, method = 'GET', body } = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    method, cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body && JSON.stringify(body),
  });
  if (res.status === 401) throw new Error('Mã truy cập GitHub không đúng hoặc đã hết hạn. Tạo mã mới rồi kết nối lại.');
  if (res.status === 404) throw new Error('Không tìm thấy dữ liệu đồng bộ trên GitHub (mã thiếu quyền "gist" hoặc Gist đã bị xóa).');
  if (!res.ok) throw new Error(`GitHub báo lỗi ${res.status}.`);
  return res.json();
}

// ---- Gộp hai bản tiến độ ----
const time = (x) => (x ? new Date(x).getTime() : 0);

// Thẻ ôn nhiều hơn / gần đây hơn là bản mới hơn
function newerCard(a, b) {
  if (!a) return b;
  if (!b) return a;
  const d = (b.card.reps ?? 0) - (a.card.reps ?? 0) || time(b.card.last_review) - time(a.card.last_review);
  const win = d > 0 ? b : a;
  return { ...win, introducedAt: [a.introducedAt, b.introducedAt].filter(Boolean).sort()[0] ?? win.introducedAt };
}

function mergeLessons(a = {}, b = {}) {
  const out = { ...a };
  for (const [id, y] of Object.entries(b)) {
    const x = out[id];
    out[id] = !x ? y : {
      ...x, ...y,
      best: Math.max(x.best ?? 0, y.best ?? 0),
      attempts: Math.max(x.attempts ?? 0, y.attempts ?? 0),
      passedAt: [x.passedAt, y.passedAt].filter(Boolean).sort()[0] ?? null,
      placed: !!(x.placed || y.placed) || undefined,
    };
  }
  return out;
}

export function merge(local, remote) {
  const cards = new Map(local.cards.map((c) => [c.id, c]));
  for (const c of remote.cards) cards.set(c.id, newerCard(cards.get(c.id), c));

  const reviews = new Map();
  for (const r of [...local.reviews, ...remote.reviews]) {
    const { seq, ...rest } = r; // seq do IndexedDB tự đánh, mỗi máy một kiểu
    reviews.set(`${r.itemId}|${r.at}|${r.rating}|${r.state}`, rest);
  }

  const lm = local.meta, rm = remote.meta;
  const meta = { ...rm, ...lm };
  meta.days = [...new Set([...(lm.days ?? []), ...(rm.days ?? [])])].sort();
  meta.lessons = mergeLessons(lm.lessons, rm.lessons);
  meta.levelTests = [...new Map([...(rm.levelTests ?? []), ...(lm.levelTests ?? [])].map((t) => [t.at, t])).values()]
    .sort((x, y) => time(x.at) - time(y.at)).slice(-30);
  meta.pinyinMiss = { ...rm.pinyinMiss };
  for (const [k, v] of Object.entries(lm.pinyinMiss ?? {})) meta.pinyinMiss[k] = Math.max(v, meta.pinyinMiss[k] ?? 0);
  for (const k of LOCAL_ONLY) delete meta[k];

  return {
    cards: [...cards.values()].sort((x, y) => (x.id < y.id ? -1 : 1)),
    reviews: [...reviews.values()].sort((x, y) => time(x.at) - time(y.at) || (x.itemId < y.itemId ? -1 : 1)),
    meta,
  };
}

// Dạng chuẩn để so sánh hai bản có khác nhau không
const normalize = (d) => JSON.stringify(merge(d, { cards: [], reviews: [], meta: {} }), (k, v) =>
  (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));

async function readRemote() {
  const g = await gh(`/gists/${syncConfig().gistId}`);
  const f = g.files?.[FILE];
  if (!f) return null;
  // File lớn hơn ~1 MB thì API cắt bớt, phải tải bản đầy đủ
  const text = f.truncated ? await (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content;
  const data = JSON.parse(text);
  return { cards: data.cards ?? [], reviews: data.reviews ?? [], meta: data.meta ?? {} };
}

const payload = (d) => JSON.stringify({ format: 'hoc-tieng-trung-sync', version: 1, savedAt: new Date().toISOString(), ...d });

// ---- Kết nối / ngắt ----
export async function connect(token) {
  token = token.trim();
  const user = await gh('/user', { token });
  // Máy thứ hai: tìm Gist mà máy đầu đã tạo; máy đầu: tạo mới
  const gists = await gh('/gists?per_page=100', { token });
  let gist = gists.find((g) => g.files?.[FILE]);
  if (!gist) {
    const local = merge(await db.exportAll(), { cards: [], reviews: [], meta: {} });
    gist = await gh('/gists', { token, method: 'POST', body: { description: DESCRIPTION, public: false, files: { [FILE]: { content: payload(local) } } } });
  }
  saveConfig({ token, gistId: gist.id, login: user.login, lastSync: null });
  return syncNow();
}

export function disconnect() { saveConfig(null); emit({ state: 'off' }); }

// ---- Đồng bộ ----
let running = null;
// Trả về { changedLocal } — true nếu tiến độ trong máy vừa nhận thêm dữ liệu từ máy kia (cần tải lại màn hình)
export function syncNow() {
  if (!syncConfig()) return Promise.resolve({ changedLocal: false });
  if (!navigator.onLine) return Promise.resolve({ changedLocal: false, offline: true });
  running ??= (async () => {
    emit({ state: 'syncing' });
    try {
      // Đọc bản trong máy SAU khi đã tải xong bản trên mạng: thẻ vừa ôn trong lúc chờ mạng không bị ghi đè
      const remote = await readRemote();
      const local = await db.exportAll();
      const merged = remote ? merge(local, remote) : merge(local, { cards: [], reviews: [], meta: {} });
      const mergedKey = normalize(merged);
      const changedLocal = mergedKey !== normalize(local);
      if (changedLocal) {
        const keep = Object.fromEntries(LOCAL_ONLY.filter((k) => k in local.meta).map((k) => [k, local.meta[k]]));
        await db.replaceAll({ ...merged, meta: { ...merged.meta, ...keep } });
      }
      if (!remote || mergedKey !== normalize(remote)) {
        await gh(`/gists/${syncConfig().gistId}`, { method: 'PATCH', body: { files: { [FILE]: { content: payload(merged) } } } });
      }
      saveConfig({ ...syncConfig(), lastSync: new Date().toISOString(), error: null });
      emit({ state: 'ok', changedLocal });
      return { changedLocal };
    } catch (err) {
      if (syncConfig()) saveConfig({ ...syncConfig(), error: err.message });
      emit({ state: 'error', message: err.message });
      throw err;
    }
  })().finally(() => { running = null; });
  return running;
}

// Tự đồng bộ: vài giây sau mỗi lần học (gom nhiều thay đổi thành một lần gửi), khi rời app, khi quay lại app
export function startAutoSync({ onRemoteChange }) {
  let timer;
  const run = () => syncNow().then((r) => r.changedLocal && onRemoteChange()).catch(() => {});
  window.addEventListener('data-changed', () => {
    if (!syncConfig()) return;
    clearTimeout(timer);
    timer = setTimeout(run, 15000);
  });
  document.addEventListener('visibilitychange', () => {
    if (!syncConfig()) return;
    clearTimeout(timer);
    if (document.visibilityState === 'hidden') { syncNow().catch(() => {}); return; }
    const last = time(syncConfig().lastSync);
    if (Date.now() - last > 60_000) run();
  });
  window.addEventListener('online', run);
  return run();
}
